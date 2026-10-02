const fs = require('node:fs');
const path = require('node:path');

function verifyEntries(entries) {
  const files = new Set(entries.map(entry => entry.replace(/^[/\\]+/, '').replaceAll('\\', '/')));
  const required = require('./package.json').build.files;
  const missing = required.filter(file => !files.has(file));
  if (missing.length) throw new Error(`Desktop package is missing required files: ${missing.join(', ')}`);
}

module.exports = async function afterPack(context) {
  const archive = path.join(context.appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(archive)) throw new Error(`Desktop archive not found: ${archive}`);
  const builderRoot = path.dirname(require.resolve('app-builder-lib'));
  const asar = require(require.resolve('@electron/asar', { paths: [builderRoot] }));
  verifyEntries(asar.listPackage(archive));
};
module.exports.verifyEntries = verifyEntries;
