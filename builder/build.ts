/*
 * The bespoke book build (plans/rehost-bhsawesome.md phase 3).
 *
 *     node builder/build.ts [--only <page.html>...]
 *
 * Emits pages into build/site/. During the prototype stage this coexists
 * with the PreTeXt pipeline (output/build/html + land.py -> build/out);
 * builder/diff.ts compares the two.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadBook } from './src/book.ts';
import { numberBlocks } from './src/ids.ts';
import { makeCtx, renderPage } from './src/page.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'build', 'site');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set(args.slice(onlyIdx + 1));

const started = performance.now();
const book = loadBook(path.join(ROOT, 'pretext', 'main.ptx'));

// Numbering pass: every numbered page-division gets its block counter.
for (const page of book.pages) numberBlocks(page);

fs.mkdirSync(OUT, { recursive: true });
const warnings = new Map<string, number>();
let emitted = 0;
for (const division of book.pages) {
  if (!division.page || (only && !only.has(division.page))) continue;
  const warn = (msg: string) => {
    const key = `${division.page}: ${msg}`;
    warnings.set(key, (warnings.get(key) ?? 0) + 1);
  };
  const ctx = makeCtx(book, division.page, warn);
  fs.writeFileSync(path.join(OUT, division.page), renderPage(division, ctx, book));
  emitted += 1;
}

for (const [msg, n] of warnings) console.log(`WARN ${msg}${n > 1 ? ` (x${n})` : ''}`);
console.log(
  `emitted ${emitted} page(s) in ${Math.round(performance.now() - started)}ms (${warnings.size} distinct warnings)`,
);
