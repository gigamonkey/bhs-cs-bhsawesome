#!/usr/bin/env node
/*
 * Pixel-compare two shoot.mjs output directories.
 *
 * Usage:
 *   node migration-tools/compare.mjs shots/before shots/after [--diffs shots/diff]
 *
 * Reports per-shot differing-pixel counts; with --diffs, writes a diff PNG
 * for each differing shot. Height differences are padded (pad counts as
 * diff). Exits 1 if anything differs — the caller judges whether the diff
 * is intended (deliberate restyle), async-render noise (run shoot twice on
 * the same build to measure), or a regression.
 */

import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const [dirA, dirB] = process.argv.slice(2, 4);
const diffFlag = process.argv.indexOf('--diffs');
const diffDir = diffFlag > -1 ? process.argv[diffFlag + 1] : null;
if (!dirA || !dirB) {
  console.error('usage: node migration-tools/compare.mjs <dirA> <dirB> [--diffs <dir>]');
  process.exit(2);
}
if (diffDir) fs.mkdirSync(diffDir, { recursive: true });

function pad(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height, fill: true });
  // Magenta ground so padded (= size-mismatch) regions are unmissable.
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 0;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

const names = fs.readdirSync(dirA).filter((f) => f.endsWith('.png')).sort();
let differing = 0;
for (const name of names) {
  const fileB = path.join(dirB, name);
  if (!fs.existsSync(fileB)) {
    console.log(`${name}: MISSING in ${dirB}`);
    differing++;
    continue;
  }
  let a = PNG.sync.read(fs.readFileSync(path.join(dirA, name)));
  let b = PNG.sync.read(fs.readFileSync(fileB));
  const w = Math.max(a.width, b.width);
  const hgt = Math.max(a.height, b.height);
  const sized = a.width !== b.width || a.height !== b.height ? ' (size differs)' : '';
  a = pad(a, w, hgt);
  b = pad(b, w, hgt);
  const diff = diffDir ? new PNG({ width: w, height: hgt }) : null;
  const n = pixelmatch(a.data, b.data, diff?.data ?? null, w, hgt, { threshold: 0.05 });
  if (n === 0) {
    console.log(`${name}: identical`);
  } else {
    differing++;
    console.log(`${name}: ${n} px differ (${((100 * n) / (w * hgt)).toFixed(3)}%)${sized}`);
    if (diff) fs.writeFileSync(path.join(diffDir, name), PNG.sync.write(diff));
  }
}
for (const name of fs.readdirSync(dirB).filter((f) => f.endsWith('.png'))) {
  if (!fs.existsSync(path.join(dirA, name))) {
    console.log(`${name}: MISSING in ${dirA}`);
    differing++;
  }
}
console.log(differing ? `${differing}/${names.length} shots differ` : `all ${names.length} shots identical`);
process.exit(differing ? 1 : 0);
