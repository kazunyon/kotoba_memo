const { app, BrowserWindow, ipcMain, session, shell, dialog, clipboard, Menu } = require('electron')
const { createServer } = require('node:http')
const { randomBytes, createHash } = require('node:crypto')
const { readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')
const { normalizeOrigin } = require('./origin.cjs')
const guide = require('./setup-guide.js')
let window, origin = '', profile, activeLogin
const manualWindows = new Set()
const settingsFile = () => path.join(app.getPath('userData'), 'connection.json')
const progressFile = () => path.join(app.getPath('userData'), 'setup-progress.json')
const setupUrl = () => require('node:url').pathToFileURL(path.join(__dirname, 'setup.html')).href
function trusted(event, setup = false) {
  const sender = event.senderFrame?.url
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || (setup ? sender !== setupUrl() : !origin || new URL(sender).origin !== origin)) throw Error('この画面からは操作できません。')
}
async function loadConnection(value) {
  origin = normalizeOrigin(value)
  profile = session.fromPartition('persist:kotoba-' + createHash('sha256').update(origin).digest('hex'))
  const response = await profile.fetch(origin + '/api/config', { credentials: 'omit', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw Error('接続先の設定を確認できません。')
  const config = await response.json()
  if (!config.configured || config.origin !== origin || !config.clientId) throw Error('ことばメモの設置先URLとGoogle設定を確認してください。')
  await writeFile(settingsFile(), JSON.stringify({ origin }), { mode: 0o600 })
  createWindow(profile)
  await window.loadURL(origin)
}
function createWindow(ses) {
  const old = window
  window = new BrowserWindow({ width: 1100, height: 850, minWidth: 420, webPreferences: { ...(ses ? { session: ses } : { partition: 'kotoba-setup' }), preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } })
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== setupUrl() && (!origin || new URL(url).origin !== origin)) { event.preventDefault(); external(url) }
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'media'))
  old?.destroy()
}
function external(value) { try { const url = new URL(value); if (url.protocol === 'https:') void shell.openExternal(url.href) } catch { /* ignore unsafe links */ } }
async function setup() { createWindow(); await window.loadFile(path.join(__dirname, 'setup.html')) }
function safeProgress(value) {
  if (!value || value.version !== 1 || !Number.isInteger(value.index) || value.index < 0 || value.index >= guide.steps.length) throw Error('進み具合を保存できません。')
  return { version: 1, index: value.index, project: guide.project(value.project || '') ? value.project : '', origin: guide.origin(value.origin || ''), completed: Array.isArray(value.completed) ? value.completed.filter(id => guide.steps.some(step => step.id === id)) : [] }
}
async function showManual(value = {}) {
  const manual = new BrowserWindow({ parent: window, width: 950, height: 850, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  const contents = manual.webContents
  manualWindows.add(contents)
  manual.on('closed', () => manualWindows.delete(contents))
  manual.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  manual.webContents.on('will-navigate', event => event.preventDefault())
  await manual.loadFile(path.join(__dirname, 'setup-manual.html'), { query: { project: guide.project(value.project || '') ? value.project : '', origin: guide.origin(value.origin || '') } })
}
async function login() {
  if (activeLogin) throw Error('ログイン中です。ブラウザでアカウントを選んでください。')
  const verifier = randomBytes(32).toString('base64url')
  const proof = createHash('sha256').update(verifier).digest('base64url')
  const targetOrigin = origin, targetProfile = profile
  await new Promise((resolve, reject) => {
    let timer, complete = false
    const done = error => { if (complete) return; complete = true; clearTimeout(timer); server.close(); activeLogin = null; error ? reject(error) : resolve() }
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (req.method !== 'GET' || url.pathname !== '/callback' || req.headers.host !== '127.0.0.1:' + server.address().port || !url.searchParams.get('ticket')) { res.writeHead(404); res.end(); return }
      try {
        const response = await targetProfile.fetch(targetOrigin + '/api/desktop/exchange', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Origin: targetOrigin }, body: JSON.stringify({ ticket: url.searchParams.get('ticket'), verifier }), signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw Error('ログインの確認に失敗しました。もう一度お試しください。')
        const check = await targetProfile.fetch(targetOrigin + '/api/session', { credentials: 'include' })
        if (!(await check.json()).account) throw Error('ログイン状態を保存できません。')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'" })
        res.end('<meta charset="utf-8"><title>ことばメモ</title><h1>ログインできました</h1><p>ことばメモのPC画面へ戻り、アカウントを確認してください。このタブは閉じられます。</p>')
        window.show(); window.focus(); done()
      } catch (error) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('ログインを確認できません。PCアプリからやり直してください。'); done(error) }
    })
    activeLogin = () => done(Error('ログインが中止されました。'))
    server.once('error', done)
    server.listen(0, '127.0.0.1', () => {
      timer = setTimeout(() => done(Error('ログインの期限が切れました。')), 300000)
      const params = new URLSearchParams({ desktop: `http://127.0.0.1:${server.address().port}/callback`, challenge: proof })
      shell.openExternal(targetOrigin + '/auth/login?' + params).catch(done)
    })
  })
}
ipcMain.handle('kotoba:connect', async (event, value) => { trusted(event, true); await loadConnection(value) })
ipcMain.handle('kotoba:progress-load', async event => {
  trusted(event, true)
  try { return safeProgress(JSON.parse(await readFile(progressFile(), 'utf8'))) } catch { return null }
})
ipcMain.handle('kotoba:progress-save', async (event, value) => { trusted(event, true); await writeFile(progressFile(), JSON.stringify(safeProgress(value)), { mode: 0o600 }) })
ipcMain.handle('kotoba:copy', async (event, text) => { trusted(event, true); if (typeof text !== 'string' || text.length > 16000) throw Error('コピーする内容を確認してください。'); clipboard.writeText(text) })
ipcMain.handle('kotoba:open-page', async (event, value) => {
  trusted(event, true)
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'console.cloud.google.com' || url.username || url.password) throw Error('Google Cloudのページだけを開けます。')
  await shell.openExternal(url.href)
})
ipcMain.handle('kotoba:manual', async (event, value) => { trusted(event, true); await showManual(value) })
ipcMain.handle('kotoba:print', async event => {
  if (!manualWindows.has(event.sender) || event.senderFrame !== event.sender.mainFrame) throw Error('印刷画面から操作してください。')
  return new Promise((resolve, reject) => event.sender.print({ printBackground: true }, (success, reason) => { if (success || reason === 'cancelled') resolve(); else reject(Error('印刷できませんでした。')) }))
})
ipcMain.handle('kotoba:login', async event => { trusted(event); await login() })
ipcMain.handle('kotoba:change', async event => {
  trusted(event)
  const answer = await dialog.showMessageBox(window, { type: 'question', buttons: ['戻る', '接続先を変更'], defaultId: 0, cancelId: 0, message: '接続先を変更しますか？', detail: '先に必要なメモをバックアップしてください。この端末のログイン状態と保存データを削除します。Google Driveのメモは削除しません。' })
  if (answer.response !== 1) return
  activeLogin?.()
  await profile.clearStorageData(); await profile.clearCache()
  await writeFile(settingsFile(), '{}')
  origin = ''; profile = null; await setup()
})
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { window?.show(); window?.focus() })
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
      { label: 'ヘルプ', submenu: [
        { label: '初回設定ガイドを開く', click: async () => {
          const answer = await dialog.showMessageBox(window, { buttons: ['戻る', 'ガイドを開く'], cancelId: 0, defaultId: 0, message: '初回設定ガイドを開きます。編集中のメモは先に保存してください。' })
          if (answer.response === 1) { activeLogin?.(); await setup() }
        } },
        { label: '図解マニュアル・印刷', click: async () => { let value = {}; try { value = safeProgress(JSON.parse(await readFile(progressFile(), 'utf8'))) } catch { /* no progress yet */ } await showManual(value) } }
      ] }
    ]))
    try { const saved = JSON.parse(await readFile(settingsFile(), 'utf8')); if (saved.origin) { await loadConnection(saved.origin); return } } catch { /* first run or unavailable deployment */ }
    origin = ''; await setup()
  }).catch(error => { dialog.showErrorBox('ことばメモ', error.message); app.quit() })
  app.on('window-all-closed', () => { activeLogin?.(); app.quit() })
}
