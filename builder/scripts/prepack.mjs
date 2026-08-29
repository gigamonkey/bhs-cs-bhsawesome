/*
 * npm prepack hook: build dist/ and point the STAGED package.json at it, so
 * the published tarball is a normal compiled-JS npm package while the repo's
 * package.json keeps exports -> src/*.ts for buildless in-repo consumption
 * (Node refuses to type-strip under real node_modules, so publishing TS
 * source would strand registry consumers). postpack.mjs restores the
 * original package.json; both run automatically for `npm pack` and
 * `npm publish`, so manual and CI publishes behave identically. (The
 * pattern is bhs-cs's bhs-content/scripts/prepack.mjs.)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(pkgDir, 'package.json');
const backupPath = path.join(pkgDir, 'package.json.orig');

fs.rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: pkgDir, stdio: 'inherit' });

if (!fs.existsSync(path.join(pkgDir, 'dist', 'index.js'))) {
  throw new Error('prepack: dist/index.js missing — build failed?');
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
fs.writeFileSync(backupPath, `${JSON.stringify(pkg, null, 2)}\n`);

pkg.main = './dist/index.js';
pkg.types = './dist/index.d.ts';
pkg.exports = Object.fromEntries(
  Object.entries(pkg.exports).map(([sub, target]) => [
    sub,
    String(target)
      .replace(/^\.\/src\//, './dist/')
      .replace(/\.ts$/, '.js'),
  ]),
);
pkg.files = ['dist'];
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('prepack: staged package.json at dist/');
