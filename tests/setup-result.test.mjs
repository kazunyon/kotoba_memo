import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseResult, checkConnection } = require('../desktop/setup-result.cjs');
const guide = require('../desktop/setup-guide.js');
const receipt = { version: 1, project: 'my-project', phase: 'prepare', origin: 'https://my-kotoba.a.run.app' };

test('result import picks the only canonical URL and rejects mismatched projects and origins', () => {
  assert.deepEqual(parseResult(JSON.stringify(receipt), { project: 'my-project' }), receipt);
  assert.throws(() => parseResult(JSON.stringify(receipt), { project: 'other-project' }), /プロジェクト/);
  assert.throws(() => parseResult(JSON.stringify(receipt), { origin: 'https://another.a.run.app' }), /設置先/);
  for (const origin of ['http://localhost', 'https://attacker.example', 'https://foo.run.app.evil.example', 'https://name:secret@foo.run.app', 'https://foo.run.app/path']) {
    assert.throws(() => parseResult(JSON.stringify({ ...receipt, origin })));
  }
  assert.throws(() => parseResult('wrong file'));
  assert.throws(() => parseResult('x'.repeat(4097)));
  assert.throws(() => parseResult(JSON.stringify({ ...receipt, phase: 'credentials' })));
});

test('finish checks the real config endpoint and rejects failed, unconfigured, or alias responses', async () => {
  const good = { configured: true, origin: receipt.origin, clientId: '123456-ownclient.apps.googleusercontent.com' };
  const request = async (url, options) => { assert.equal(url, receipt.origin + '/api/config'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); return { ok: true, json: async () => good }; };
  assert.deepEqual(await checkConnection(receipt.origin, request), { origin: receipt.origin, configured: true });
  for (const config of [{ ...good, configured: false }, { ...good, origin: 'https://alias.a.run.app' }, { ...good, clientId: '' }]) {
    await assert.rejects(checkConnection(receipt.origin, async () => ({ ok: true, json: async () => config })));
  }
  await assert.rejects(checkConnection(receipt.origin, async () => ({ ok: false })));
});

test('machine steps cannot be completed using the old manual checkbox state', () => {
  for (const id of ['prepare', 'address', 'credentials', 'finish']) {
    const step = guide.steps.find(step => step.id === id);
    assert.equal(step.confirm, undefined);
    assert.equal(guide.received(step, { origin: receipt.origin, completed: [id] }), false);
    assert.equal(guide.received(step, { origin: receipt.origin, verified: [step.receive] }), true);
  }
});
