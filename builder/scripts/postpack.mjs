/*
 * npm postpack hook: restore the repo's package.json (exports -> src/*.ts)
 * from the backup prepack.mjs wrote. If a pack fails between the two hooks,
 * restore by hand: mv package.json.orig package.json (or git checkout).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupPath = path.join(pkgDir, 'package.json.orig');

if (fs.existsSync(backupPath)) {
  fs.renameSync(backupPath, path.join(pkgDir, 'package.json'));
  console.log('postpack: package.json restored');
}
