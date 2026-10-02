import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const config = require('../desktop/package.json');
const { verifyEntries } = require('../desktop/verify-package.cjs');

test('desktop packaging includes every wizard and manual asset', () => {
  const assets = readdirSync(new URL('../desktop/', import.meta.url)).filter(name => name.startsWith('setup'));
  for (const asset of assets) assert.ok(config.build.files.includes(asset), `Missing ${asset}`);
  assert.equal(config.build.afterPack, './verify-package.cjs');
});

test('packaged archive verification rejects missing guide and manual files', () => {
  const entries = config.build.files.map(file => '/' + file);
  assert.doesNotThrow(() => verifyEntries(entries));
  for (const file of ['setup-guide.js', 'setup-diagram.js', 'setup-manual.html']) {
    assert.throws(() => verifyEntries(entries.filter(entry => entry !== '/' + file)), /missing required files/);
  }
});
