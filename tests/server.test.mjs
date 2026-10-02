import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createApp } from '../server/app.mjs'
import { createSealer, challenge, desktopTarget, driveTarget } from '../server/security.mjs'
import originModule from '../desktop/origin.cjs'
import { qrMatrix, qrSvg } from '../server/qr.mjs'

const key = randomBytes(32).toString('base64')
test('smartphone QR matches an independently generated version 6-L byte-mode reference', () => {
  const matrix = qrMatrix('https://kotoba-123456789012.asia-northeast1.run.app')
  // Compared with reportlab.graphics.barcode.qrencoder, fixed mask 0.
  assert.equal(createHash('sha256').update(JSON.stringify(matrix)).digest('hex'), 'f44282d38adbb6709c89740a16ee2621be439fa046409d226c6d22ab754cda8e')
  assert.match(qrSvg('https://my-own.example'), /viewBox="0 0 49 49"/)
  assert.throws(() => qrMatrix('a'.repeat(135)))
})
test('encrypted sessions reject tampering, expiry, other deployments and purposes', () => {
  let now = 1
  const a = createSealer(key, 'https://a.example', () => now)
  const token = a.seal('session', { secret: 'never expose' }, 100)
  assert.equal(token.includes('never expose'), false)
  assert.deepEqual(a.open('session', token), { secret: 'never expose' })
  assert.equal(a.open('state', token), null)
  assert.equal(createSealer(key, 'https://b.example').open('session', token), null)
  assert.equal(a.open('session', token.slice(0, -5) + 'AAAAA'), null)
  now = 101; assert.equal(a.open('session', token), null)
})
test('desktop targets and Drive proxy cannot select arbitrary endpoints', () => {
  assert.equal(desktopTarget('http://127.0.0.1:54321/callback'), 'http://127.0.0.1:54321/callback')
  for (const url of ['https://evil.example/callback', 'http://localhost:54321/callback', 'http://127.0.0.1:80/callback', 'http://user@127.0.0.1:54321/callback', 'http://127.0.0.1:54321/callback?next=x']) assert.equal(desktopTarget(url), null)
  assert.ok(driveTarget('/drive/v3/files?spaces=appDataFolder', 'GET'))
  assert.equal(driveTarget('/drive/v3/files?spaces=drive', 'GET'), null)
  assert.equal(driveTarget('//evil.example/drive/v3/files?spaces=appDataFolder', 'GET'), null)
  assert.equal(driveTarget('/drive/v3/files/abc', 'DELETE'), null)
  assert.equal(originModule.normalizeOrigin(' https://my-own.example/ '), 'https://my-own.example')
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/another-app', 'file:///tmp/app']) assert.throws(() => originModule.normalizeOrigin(url))
})
test('browser and desktop OAuth, CSRF and account isolation through real HTTP endpoints', async t => {
  const env = { APP_ORIGIN: 'http://localhost:8080', GOOGLE_CLIENT_ID: 'own-client', GOOGLE_CLIENT_SECRET: 'own-secret', SESSION_KEY: key }
  const requests = []
  const google = async (url, init) => {
    requests.push({ url, init })
    if (url.endsWith('/token')) {
      const params = new URLSearchParams(init.body)
      assert.equal(params.get('client_secret'), 'own-secret')
      if (params.get('grant_type') === 'authorization_code') {
        assert.ok(params.get('code_verifier'))
        return Response.json({ access_token: 'access-A', refresh_token: 'refresh-A', scope: 'openid email https://www.googleapis.com/auth/drive.appdata' })
      }
      return Response.json({ access_token: 'access-A', expires_in: 3600 })
    }
    if (url.endsWith('/userinfo')) return Response.json({ sub: 'A', email: 'person-a@example.test', email_verified: true })
    assert.equal(init.headers.Authorization, 'Bearer access-A')
    return Response.json({ files: [] })
  }
  const server = createApp(env, google)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = 'http://127.0.0.1:' + server.address().port
  const call = (path, init) => fetch(base + path, { redirect: 'manual', ...init })
  const config = await (await call('/api/config')).json()
  assert.equal(config.clientId, 'own-client'); assert.equal(JSON.stringify(config).includes('own-secret'), false)
  assert.equal((await call('/api/drive/drive/v3/files?spaces=appDataFolder')).status, 401)
  const start = await call('/auth/login')
  const authorization = new URL(start.headers.get('location'))
  assert.equal(authorization.searchParams.get('client_id'), 'own-client')
  assert.equal(authorization.searchParams.get('prompt'), 'consent select_account')
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
  const stateCookie = start.headers.get('set-cookie').split(';')[0]
  assert.equal((await call('/auth/callback?code=valid&state=wrong', { headers: { Cookie: stateCookie } })).status, 400)
  const callback = await call('/auth/callback?code=valid&state=' + authorization.searchParams.get('state'), { headers: { Cookie: stateCookie } })
  assert.equal(callback.status, 302)
  const cookies = callback.headers.getSetCookie()
  const sessionCookie = cookies.find(x => x.startsWith('kotoba-session=')).split(';')[0]
  assert.ok(cookies.some(x => x.includes('HttpOnly') && x.includes('SameSite=Lax')))
  const session = await (await call('/api/session', { headers: { Cookie: sessionCookie } })).json()
  assert.deepEqual(session.account, { id: 'A', email: 'person-a@example.test' })
  assert.equal(JSON.stringify(session).includes('refresh-A'), false)
  const headers = { Cookie: sessionCookie, 'X-Kotoba-Account': 'A', 'X-Kotoba-CSRF': session.csrf, Origin: env.APP_ORIGIN }
  assert.equal((await call('/api/drive/drive/v3/files?spaces=appDataFolder', { headers: { ...headers, 'X-Kotoba-Account': 'B' } })).status, 403)
  assert.equal((await call('/api/drive/drive/v3/files?spaces=appDataFolder', { headers })).status, 200)
  assert.equal((await call('/api/drive/drive/v3/files?spaces=drive', { headers })).status, 400)
  assert.equal((await call('/api/logout', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } })).status, 403)
  const logout = await call('/api/logout', { method: 'POST', headers })
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await (await call('/api/session')).json()).account, null)
  const verifier = randomBytes(32).toString('base64url')
  const desktopStart = await call('/auth/login?' + new URLSearchParams({ desktop: 'http://127.0.0.1:54321/callback', challenge: challenge(verifier) }))
  const desktopState = new URL(desktopStart.headers.get('location')).searchParams.get('state')
  const desktopCallback = await call('/auth/callback?code=desktop&state=' + desktopState, { headers: { Cookie: desktopStart.headers.get('set-cookie').split(';')[0] } })
  const ticket = new URL(desktopCallback.headers.get('location')).searchParams.get('ticket')
  assert.equal(desktopCallback.headers.getSetCookie().some(x => x.startsWith('kotoba-session=')), false)
  const exchange = proof => call('/api/desktop/exchange', { method: 'POST', headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, verifier: proof }) })
  assert.equal((await exchange('wrong')).status, 403)
  const exchanged = await exchange(verifier)
  assert.equal(exchanged.status, 200); assert.ok(exchanged.headers.get('set-cookie').startsWith('kotoba-session='))
  assert.equal((await call('/auth/login?desktop=https://evil.example/callback&challenge=' + challenge(verifier))).status, 400)
})
