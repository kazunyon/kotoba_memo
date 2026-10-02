import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const guide = require('../desktop/setup-guide.js')
const { diagram } = require('../desktop/setup-diagram.js')

test('wizard commands use only validated user projects and exact safe URLs', () => {
  const state = { project: 'my-kotoba-project', origin: 'https://my-kotoba.example' }
  assert.equal(guide.steps.length, 12)
  assert.ok(guide.command('prepare', state).includes('remote get-url origin'))
  assert.ok(guide.command('prepare', state).includes('prepare my-kotoba-project'))
  assert.equal(guide.command('finish', { project: 'x;echo bad' }), '')
  assert.equal(guide.command('finish', state).includes('client-secret'), false)
  assert.equal(guide.project('$(whoami)'), false)
  assert.equal(guide.origin('https://user:password@my-kotoba.example'), '')
  assert.equal(guide.extractOrigin('準備できました。\nアプリURL: https://my-kotoba.example\n次へ'), state.origin)
  assert.equal(guide.extractOrigin('Service URL: https://numbered-alias.example\nApplication URL: https://my-kotoba.example\nReady: https://my-kotoba.example'), state.origin)
  const callback = guide.steps.find(step => step.id === 'callback')
  assert.equal(guide.snippet(callback, state), state.origin + '/auth/callback')
  assert.equal(guide.link(callback, state), 'https://console.cloud.google.com/auth/clients?project=my-kotoba-project')
})
test('every wizard card has an offline printable diagram and recovery returns to the relevant step', () => {
  for (const step of guide.steps) {
    assert.ok(step.title); assert.ok(step.action); assert.ok(step.lines.length)
    assert.match(diagram(step.diagram), /実際の画面とは表示が異なる/)
    assert.equal(diagram(step.diagram).includes('http://console'), false)
  }
  assert.equal(guide.diagnose('RATE_LIMIT_EXCEEDED').step, 'prepare')
  assert.equal(guide.diagnose('PERMISSION_DENIED').step, 'prepare')
  assert.equal(guide.diagnose('Missing secret version').step, 'credentials')
  assert.equal(guide.diagnose('BILLING_DISABLED').step, 'billing')
  assert.equal(guide.diagnose('unrecognized error').step, undefined)
})
