import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

test('server identity requires explicit confirmation and never opens another account cache', async () => {
  const source = ts.transpileModule(await readFile(new URL('../src/google-auth.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
  globalThis.window = new EventTarget()
  globalThis.BroadcastChannel = undefined
  let redirect = '', identity = { id: 'A', email: 'person-a@example.test' }, origin = 'https://my-own.example'
  globalThis.location = { origin, assign: path => { redirect = path } }
  globalThis.localStorage = { getItem: () => { throw Error('Must not read browser identity') } }
  const calls = []
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init })
    if (path === '/api/config') return Response.json({ configured: true, origin, clientId: 'own-client' })
    if (path === '/api/session') return Response.json({ account: identity, csrf: 'csrf-own' })
    if (path === '/api/logout') return Response.json({ ok: true })
    throw Error('Unexpected endpoint')
  }
  const auth = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  await auth.initializeGoogle()
  assert.equal(auth.getAccount(), null)
  assert.equal(auth.hasGoogleAccess(), false)
  assert.equal(auth.getPendingAccount().email, identity.email)
  auth.confirmGoogleAccount()
  assert.equal(auth.getAccount().id, 'A')
  assert.throws(() => auth.authHeaders('B'))
  assert.equal(auth.authHeaders('A')['X-Kotoba-CSRF'], 'csrf-own')
  assert.equal(auth.getProfileNamespace(), 'https://my-own.example:own-client')
  let cleared = false
  await auth.logoutGoogle(async () => { assert.equal(auth.getAccount(), null); cleared = true })
  assert.equal(cleared, true)
  assert.equal(auth.getAccount(), null)
  assert.equal(calls.find(call => call.path === '/api/logout').init.headers['X-Kotoba-CSRF'], 'csrf-own')
  await auth.loginGoogle(); assert.equal(redirect, '/auth/login')
  identity = { id: 'B', email: 'person-b@example.test' }
  await auth.initializeGoogle(); assert.equal(auth.getAccount(), null)
  auth.confirmGoogleAccount(); assert.equal(auth.getAccount().id, 'B')
  origin = 'https://other.example'
  await assert.rejects(() => auth.initializeGoogle())
  assert.equal(auth.getAccount(), null)
})
