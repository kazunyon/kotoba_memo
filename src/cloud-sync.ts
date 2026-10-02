import { getAccount, hasGoogleAccess, getProfileNamespace } from './google-auth'
import { appendDriveEvent, generateDriveId, readDriveEvents } from './google-drive'
import { foldEvents, type CloudMemoRow, type DriveEvent, type RemoteEvent } from './drive-model'
import type { MemoCategory } from './types'
export type { CloudMemoRow } from './drive-model'
type PendingMemo = { row: CloudMemoRow; expected: string | null }
type Batch = { event: DriveEvent; fileId: string | null }
type Snapshot = {
  rows: CloudMemoRow[]; categories: MemoCategory[]; versions: Record<string, string>; categoryRevision: number
  pending: PendingMemo[]; pendingCategories: { items: MemoCategory[]; expected: number } | null
  batch: Batch | null; events: Record<string, RemoteEvent>; conflict: boolean; error: string
}
export type CloudSyncStatus = { pending: number; conflict: boolean; error: string; offline: boolean; categoryRevision: number }
const empty = (): Snapshot => ({ rows: [], categories: [], versions: {}, categoryRevision: 0, pending: [], pendingCategories: null, batch: null, events: {}, conflict: false, error: '' })
let currentStatus: CloudSyncStatus = { pending: 0, conflict: false, error: '', offline: !navigator.onLine, categoryRevision: 0 }
let openPromise: Promise<IDBDatabase> | null = null
let chain: Promise<unknown> = Promise.resolve()
function database() {
  if (!openPromise) openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kotoba-google-cache-v1', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('profiles') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { openPromise = null; reject(Error('端末へ保存できません。ブラウザの保存設定を確認してください。')) }
    request.onblocked = () => { openPromise = null; reject(Error('ほかのことばメモ画面を閉じて、開き直してください。')) }
  })
  return openPromise
}
async function read(key: string): Promise<Snapshot> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('profiles').objectStore('profiles').get(key)
    request.onsuccess = () => resolve(request.result ?? empty())
    request.onerror = () => reject(Error('端末の保存データを読み込めません。'))
  })
}
async function write(key: string, state: Snapshot) {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('profiles', 'readwrite')
    transaction.objectStore('profiles').put(state, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(Error('端末への保存に失敗しました。空き容量を確認してください。'))
  })
}
function announce(state: Snapshot, accountId: string) {
  if (getAccount()?.id !== accountId) return
  currentStatus = { pending: state.pending.length + (state.pendingCategories ? 1 : 0), conflict: state.conflict, error: state.error, offline: !navigator.onLine, categoryRevision: state.categoryRevision }
  window.dispatchEvent(new Event('kotoba-sync-status'))
}
export const getCloudSyncStatus = () => currentStatus
export function resetCloudSyncStatus() { currentStatus = { pending: 0, conflict: false, error: '', offline: !navigator.onLine, categoryRevision: 0 }; window.dispatchEvent(new Event('kotoba-sync-status')) }
function context() {
  const account = getAccount()
  if (!account) return null
  return { key: getProfileNamespace() + ':' + account.id, accountId: account.id }
}
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const locked = async (): Promise<T> => navigator.locks ? await navigator.locks.request('kotoba-google-cache-v1', work) : await work()
  const task = chain.then(locked, locked); chain = task.catch(() => undefined); return task
}
function overlay(state: Snapshot) {
  const remote = foldEvents(Object.values(state.events))
  const ids = new Set(state.pending.map(p=>p.row.id))
  state.rows = [...state.pending.map(p=>p.row), ...remote.rows.filter(row=>!ids.has(row.id))]
  state.versions = remote.versions
  state.categories = state.pendingCategories?.items ?? remote.categories
  state.categoryRevision = remote.categoryRevision
}
async function pull(ctx: NonNullable<ReturnType<typeof context>>, state: Snapshot) {
  state.events = await readDriveEvents(ctx.accountId, state.events); overlay(state)
}
async function flush(ctx: NonNullable<ReturnType<typeof context>>, state: Snapshot) {
  if (!navigator.onLine) { announce(state, ctx.accountId); return }
  if (!hasGoogleAccess()) { state.error = 'Googleに再接続すると同期を再開します。変更はこの端末に保存できます。'; await write(ctx.key,state); announce(state,ctx.accountId); return }
  try {
    await pull(ctx,state)
    // If the previous upload succeeded but its response was lost, acknowledge
    // that exact event before comparing base versions or attempting a retry.
    if (state.batch && Object.values(state.events).some(item=>item.event.mutationId === state.batch!.event.mutationId)) {
      acknowledge(state); await write(ctx.key,state)
    }
    if (state.conflict) { await write(ctx.key,state); announce(state,ctx.accountId); return }
    if (!state.batch) {
      const changed = state.pending.some(p => (state.versions[p.row.id] ?? null) !== p.expected)
        || Boolean(state.pendingCategories && state.pendingCategories.expected !== state.categoryRevision)
      if (changed) { state.conflict = true; throw Error('別の端末でも変更されています。先にバックアップし、どちらの内容を使うか選んでください。') }
      if (state.pending.length || state.pendingCategories) {
        state.batch = { fileId: null, event: { format: 'kotoba-drive-event', version: 1, mutationId: crypto.randomUUID(), rows: state.pending.map(p=>p.row), categories: state.pendingCategories?.items ?? null } }
        await write(ctx.key,state)
      }
    }
    if (state.batch) {
      if (!state.batch.fileId) { state.batch.fileId = await generateDriveId(ctx.accountId); await write(ctx.key,state) }
      await appendDriveEvent(ctx.accountId,state.batch.event,state.batch.fileId)
      await pull(ctx,state)
      if (!Object.values(state.events).some(item=>item.event.mutationId === state.batch!.event.mutationId)) throw Error('Google Driveの保存結果を確認中です。次回の同期で再確認します。')
      acknowledge(state)
    }
    state.error = ''; await write(ctx.key,state)
  } catch (error) { state.error = error instanceof Error ? error.message : 'Google Driveとの同期に失敗しました。未送信データは端末に残っています。'; await write(ctx.key,state) }
  announce(state,ctx.accountId)
}
function acknowledge(state: Snapshot) {
  const batch = state.batch
  if (batch) {
    const remote = foldEvents(Object.values(state.events))
    state.pending = state.pending.filter(p => {
      const sent = batch.event.rows.find(row=>row.id === p.row.id)
      if (!sent) return true
      if (JSON.stringify(sent) === JSON.stringify(p.row)) return false
      p.expected = remote.versions[p.row.id] ?? null
      return true
    })
    if (batch.event.categories !== null && state.pendingCategories) {
      if (JSON.stringify(batch.event.categories) === JSON.stringify(state.pendingCategories.items)) state.pendingCategories = null
      else state.pendingCategories.expected = remote.categoryRevision
    }
  }
  state.batch = null; state.conflict = false; overlay(state)
}
let loading: { accountId: string; task: Promise<Snapshot> } | null = null
export async function loadCloudData(): Promise<Snapshot> {
  const ctx = context(); if (!ctx) return empty()
  if (loading?.accountId === ctx.accountId) return loading.task
  const task = serialized(async () => { const state = await read(ctx.key); await flush(ctx,state); return state })
  loading = { accountId: ctx.accountId, task }
  try { return await task } finally { if (loading?.task === task) loading = null }
}
export async function queueCloudMemos(rows: CloudMemoRow[], expectations?: Record<string, string | null>) {
  const ctx = context(); if (!ctx) throw Error('先にGoogleでログインしてください。')
  return serialized(async () => {
    const state = await read(ctx.key)
    if (state.conflict) throw Error('先に、別端末との変更の競合を解決してください。')
    for (const row of rows) {
      const previous = state.pending.find(p=>p.row.id === row.id)
      state.pending = [...state.pending.filter(p=>p.row.id !== row.id), { row, expected: previous ? previous.expected : expectations && Object.prototype.hasOwnProperty.call(expectations,row.id) ? expectations[row.id] : state.versions[row.id] ?? null }]
    }
    overlay(state); await write(ctx.key,state); announce(state,ctx.accountId); await flush(ctx,state); if (getAccount()?.id !== ctx.accountId) throw Error('ログインする人が変わりました。データを読み直してください。'); return state.rows
  })
}
export async function queueCloudCategories(items: MemoCategory[], expectedRevision?: number) {
  const ctx = context(); if (!ctx) throw Error('先にGoogleでログインしてください。')
  return serialized(async () => {
    const state = await read(ctx.key)
    if (state.conflict) throw Error('先に、別端末との変更の競合を解決してください。')
    state.pendingCategories = { items, expected: state.pendingCategories?.expected ?? expectedRevision ?? state.categoryRevision }
    overlay(state); await write(ctx.key,state); announce(state,ctx.accountId); await flush(ctx,state); if (getAccount()?.id !== ctx.accountId) throw Error('ログインする人が変わりました。データを読み直してください。'); return state.categories
  })
}
export async function resolveCloudConflict(choice: 'remote' | 'local') {
  const ctx = context(); if (!ctx) throw Error('先にGoogleでログインしてください。')
  return serialized(async () => {
    if (!navigator.onLine || !hasGoogleAccess()) throw Error('Googleに再接続し、通信できる状態で選び直してください。')
    const state = await read(ctx.key); await pull(ctx,state)
    if (choice === 'remote') { state.pending = []; state.pendingCategories = null; state.batch = null; acknowledge(state); state.error = ''; await write(ctx.key,state); announce(state,ctx.accountId); return }
    for (const p of state.pending) p.expected = state.versions[p.row.id] ?? null
    if (state.pendingCategories) state.pendingCategories.expected = state.categoryRevision
    state.conflict = false; state.error = ''; state.batch = null
    await write(ctx.key,state); await flush(ctx,state)
  })
}

export async function clearCloudCache(accountId: string) {
  const key = getProfileNamespace() + ':' + accountId
  await serialized(async () => {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('profiles', 'readwrite')
      transaction.objectStore('profiles').delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () => reject(Error('端末のデータを削除できませんでした。'))
    })
    resetCloudSyncStatus()
  })
}
