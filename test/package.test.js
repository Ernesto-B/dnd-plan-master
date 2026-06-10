const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const pkg = require('../package.json');

test('package metadata includes a node test script and Electron bundle inputs', () => {
  assert.match(pkg.scripts.test, /node\s+--test/);
  assert.equal(pkg.main, 'electron/main.js');

  for (const entry of [
    'assets/**/*',
    'electron/**/*',
    'public/**/*',
    'dist-client/**/*',
    'src/**/*',
    'data/*.seed.json',
    'package.json',
  ]) {
    assert.ok(
      pkg.build.files.includes(entry),
      `Expected electron-builder to include ${entry}.`,
    );
  }

  for (const relativePath of [
    'electron/main.js',
    'electron/preload.js',
    'assets/icons/icon.png',
    'client/index.html',
  ]) {
    assert.ok(
      fs.existsSync(path.join(projectRoot, relativePath)),
      `Expected ${relativePath} to exist.`,
    );
  }
});
