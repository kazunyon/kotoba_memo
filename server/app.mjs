import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSealer, nonce, challenge, equal, desktopTarget, driveTarget } from './security.mjs'
import { qrSvg } from './qr.mjs'

const DAY = 86400000
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata'
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }
export function createApp(env = process.env, request = fetch) {
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:8080').origin
  if (!env.APP_ORIGIN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw Error('APP_ORIGIN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required')
  if (!origin.startsWith('https://') && !(new URL(origin).protocol === 'http:' && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname))) throw Error('APP_ORIGIN must use HTTPS (loopback is allowed for development)')
  const sealer = createSealer(env.SESSION_KEY, origin)
  const secure = origin.startsWith('https://')
  const cookieName = secure ? '__Host-kotoba-session' : 'kotoba-session'
  const stateName = secure ? '__Host-kotoba-state' : 'kotoba-state'
  const dist = resolve(env.DIST_DIR || fileURLToPath(new URL('../dist', import.meta.url)))
  // Only transient access tokens are cached. Sessions work across Cloud Run instances.
  const tokens = new Map()
  const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')))
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)) }
  const redirect = (res, target) => { res.writeHead(302, { Location: target }); res.end() }
  async function body(req, max = 20 * 1024 * 1024) {
    let size = 0; const chunks = []
    for await (const chunk of req) { size += chunk.length; if (size > max) throw Error('Request is too large'); chunks.push(chunk) }
    return Buffer.concat(chunks)
  }
  async function google(url, init) {
    const response = await request(url, { ...init, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error('Google authorization failed')
    return response.json()
  }
  const tokenRequest = fields => google('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...fields }) })
  async function access(session) {
    const key = challenge(session.refresh)
    const cached = tokens.get(key)
    if (cached?.expires > Date.now()) return cached.token
    const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refresh })
    if (!data.access_token) throw Error('Google authorization failed')
    if (tokens.size >= 1000) tokens.clear()
    tokens.set(key, { token: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 - 60000 })
    return data.access_token
  }
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    const url = new URL(req.url, origin)
    const jar = cookies(req)
    const session = sealer.open('session', jar[cookieName])
    const sameOrigin = req.headers.origin === origin
    try {
      if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, { configured: true, origin, clientId: env.GOOGLE_CLIENT_ID })
      if (url.pathname === '/api/qr' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(qrSvg(origin)); return
      }
      if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, session ? { account: session.account, csrf: session.csrf } : { account: null })
      if (url.pathname === '/auth/login' && req.method === 'GET') {
        const desktop = url.searchParams.get('desktop')
        const target = desktop ? desktopTarget(desktop) : null
        const proof = url.searchParams.get('challenge')
        if (desktop && (!target || !/^[A-Za-z0-9_-]{43}$/.test(proof || ''))) return json(res, 400, { error: 'Invalid desktop callback' })
        const verifier = nonce(); const state = nonce()
        res.setHeader('Set-Cookie', cookie(stateName, sealer.seal('state', { state, verifier, target, proof }, 600000), 600))
        const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: origin + '/auth/callback', response_type: 'code', scope: SCOPE, state, code_challenge: challenge(verifier), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account' })
        return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + params)
      }
      if (url.pathname === '/auth/callback' && req.method === 'GET') {
        const state = sealer.open('state', jar[stateName])
        res.setHeader('Set-Cookie', cookie(stateName, '', 0))
        if (!state || !equal(state.state, url.searchParams.get('state')) || !url.searchParams.get('code')) return json(res, 400, { error: 'ログインが中止されたか期限が切れました。アプリに戻り、もう一度ログインしてください。' })
        const data = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code'), code_verifier: state.verifier, redirect_uri: origin + '/auth/callback' })
        if (!data.refresh_token || !data.access_token || !data.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.appdata')) throw Error('Missing Drive permission')
        const identity = await google('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + data.access_token } })
        if (!identity.sub || !identity.email || !identity.email_verified) throw Error('Invalid identity')
        const next = { account: { id: identity.sub, email: identity.email }, refresh: data.refresh_token, csrf: nonce() }
        const sealed = sealer.seal('session', next, 7 * DAY)
        if (sealed.length > 3800) throw Error('Session is too large')
        if (state.target) {
          const callback = new URL(state.target)
          callback.searchParams.set('ticket', sealer.seal('desktop', { session: next, proof: state.proof }, 120000))
          return redirect(res, callback.href)
        }
        res.setHeader('Set-Cookie', [cookie(stateName, '', 0), cookie(cookieName, sealed, 7 * 86400)])
        return redirect(res, origin)
      }
      if (url.pathname === '/api/desktop/exchange' && req.method === 'POST') {
        if (!sameOrigin) return json(res, 403, { error: 'Invalid origin' })
        const data = JSON.parse((await body(req, 8192)).toString())
        const ticket = sealer.open('desktop', data.ticket)
        if (!ticket || typeof data.verifier !== 'string' || !equal(ticket.proof, challenge(data.verifier))) return json(res, 403, { error: 'Invalid desktop proof' })
        res.setHeader('Set-Cookie', cookie(cookieName, sealer.seal('session', ticket.session, 7 * DAY), 7 * 86400))
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        if (!sameOrigin || !session || !equal(req.headers['x-kotoba-csrf'], session.csrf)) return json(res, 403, { error: 'Invalid session' })
        tokens.delete(challenge(session.refresh))
        res.setHeader('Set-Cookie', cookie(cookieName, '', 0))
        return json(res, 200, { ok: true })
      }
      if (url.pathname.startsWith('/api/drive/')) {
        if (!session) return json(res, 401, { error: 'Googleに再接続してください。' })
        if (!equal(req.headers['x-kotoba-account'], session.account.id) || !equal(req.headers['x-kotoba-csrf'], session.csrf) || (req.method !== 'GET' && !sameOrigin)) return json(res, 403, { error: 'アカウントが変更されました。画面を開き直してください。' })
        const target = driveTarget(url.pathname.slice('/api/drive'.length) + url.search, req.method)
        if (!target) return json(res, 400, { error: 'Invalid Drive request' })
        let token
        try { token = await access(session) } catch { return json(res, 401, { error: 'Googleに再接続してください。' }) }
        const headers = { Authorization: 'Bearer ' + token }
        if (req.method === 'POST') {
          if (!/^multipart\/related; boundary=[A-Za-z0-9_-]+$/.test(req.headers['content-type'] || '')) return json(res, 400, { error: 'Invalid upload' })
          headers['Content-Type'] = req.headers['content-type']
        }
        const response = await request(target, { method: req.method, headers, ...(req.method === 'POST' ? { body: await body(req) } : {}), signal: AbortSignal.timeout(30000) })
        res.writeHead(response.status, { 'Content-Type': response.headers.get('Content-Type') || 'application/json' })
        res.end(Buffer.from(await response.arrayBuffer())); return
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return json(res, 404, { error: 'Not found' })
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
      const path = resolve(dist, '.' + decodeURIComponent(url.pathname))
      if (path !== dist && !path.startsWith(dist + sep)) return json(res, 403, { error: 'Invalid path' })
      let file = path === dist ? resolve(dist, 'index.html') : path
      let contents
      try { contents = await readFile(file) } catch {
        if (extname(file)) return json(res, 404, { error: 'Not found' })
        file = resolve(dist, 'index.html'); contents = await readFile(file)
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(contents)
    } catch { json(res, 502, { error: '処理できませんでした。Google設定・通信・データサイズを確認し、もう一度お試しください。' }) }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = process.env.BOOTSTRAP_ONLY === '1' ? createServer((_req, res) => { res.writeHead(503); res.end('Complete your own Google OAuth setup first.'); }) : createApp()
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Kotoba Memo server ready'))
}
