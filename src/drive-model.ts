import type { MemoCategory } from './types'
export type CloudMemoRow = {
  id: string; section: string; display_number: number; sort_order: number; category_number: number
  title: string; title_color: string; meaning: string; steps: unknown; marked: string
  deleted: boolean; created_at: string; updated_at: string
}
export type DriveEvent = { format: 'kotoba-drive-event'; version: 1; mutationId: string; rows: CloudMemoRow[]; categories: MemoCategory[] | null }
export type RemoteEvent = { id: string; createdTime: string; event: DriveEvent }
export function validateEvent(value: unknown): DriveEvent {
  const v = value as DriveEvent
  if (!v || v.format !== 'kotoba-drive-event' || v.version !== 1 || typeof v.mutationId !== 'string' || !Array.isArray(v.rows) || (v.categories !== null && !Array.isArray(v.categories))) throw Error('Google Driveの同期データ形式が不正です。')
  const integer = (n: unknown) => Number.isInteger(n) && Number(n) > 0
  for (const r of v.rows) {
    if (!r || typeof r.id !== 'string' || !r.id || typeof r.title !== 'string' || r.title.length > 255 || typeof r.meaning !== 'string' || r.meaning.length > 2000 || !['daily', 'pc-linux'].includes(r.section) || !integer(r.display_number) || !integer(r.sort_order) || !integer(r.category_number) || !['black','red','blue','green','gray'].includes(r.title_color) || !Array.isArray(r.steps) || r.steps.length > 10 || typeof r.deleted !== 'boolean' || !['','★'].includes(r.marked) || !Number.isFinite(Date.parse(r.updated_at)) || !Number.isFinite(Date.parse(r.created_at))) throw Error('Google Driveのメモが壊れています。')
    for (const step of r.steps) if (!step || typeof step.id !== 'string' || typeof step.description !== 'string' || step.description.length > 2000 || typeof step.imageDataUrl !== 'string' || (step.imageDataUrl && !/^data:image\/(?:png|jpe?g|webp);base64,/.test(step.imageDataUrl))) throw Error('Google Driveの手順データが壊れています。')
  }
  if (v.categories && (v.categories.length > 10 || v.categories.some(c => !c || !integer(c.number) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 20) || new Set(v.categories.map(c=>c.number)).size !== v.categories.length || new Set(v.categories.map(c=>c.name)).size !== v.categories.length)) throw Error('Google Driveのカテゴリが壊れています。')
  return v
}
// Immutable events avoid overwriting an entire database file on two devices.
// Order by the server's creation time, then ID for a stable tie-break.
export function foldEvents(events: RemoteEvent[]) {
  const rows = new Map<string, CloudMemoRow>()
  let categories: MemoCategory[] = []
  let categoryRevision = 0
  for (const { event, createdTime } of [...events].sort((a,b)=>a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id))) {
    validateEvent(event)
    for (const row of event.rows) rows.set(row.id, { ...row, updated_at: createdTime })
    if (event.categories !== null) { categories = event.categories; categoryRevision += 1 }
  }
  return { rows: [...rows.values()], categories, categoryRevision, versions: Object.fromEntries([...rows.values()].map(row=>[row.id,row.updated_at])) }
}
