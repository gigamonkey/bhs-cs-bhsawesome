/*
 * The bespoke book build (plans/rehost-bhsawesome.md phase 3).
 *
 *     node builder/build.ts [--only <page.html>...] [--no-assets]
 *
 * Emits the complete site into build/site/: all division pages (chrome
 * from builder/chrome.html), the contents/backmatter/index pages, the
 * index.html redirect, standalone video pages, xref knowl pages,
 * exercises.json, the lunr search corpus, and (unless --no-assets) the
 * external/, _static/, and generated/ asset trees.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadBook } from './src/book.ts';
import { navFor, renderChrome } from './src/chrome.ts';
import { tocJs } from './src/toc.ts';
import { numberBlocks } from './src/ids.ts';
import { initMath } from './src/math.ts';
import { makeCtx, pageContent } from './src/page.ts';
import {
  backmatterContent,
  bookIndexContent,
  collectVideos,
  colophonContent,
  contentsPageContent,
  lunrIndexJs,
  pageExercises,
  redirectPage,
  videoPage,
} from './src/extras.ts';
import { emitElement } from './src/prose.ts';
import { knowlTargets } from './src/prose.ts';
import { elementId } from './src/ids.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'build', 'site');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set(args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')));
const withAssets = !args.includes('--no-assets');

const started = performance.now();
await initMath(); // the speech engine loads its locale async; emission is sync
const book = loadBook(path.join(ROOT, 'pretext', 'main.ptx'));
for (const page of book.pages) numberBlocks(page);

fs.mkdirSync(OUT, { recursive: true });
const warnings = new Map<string, number>();
const makeWarn = (page: string) => (msg: string) => {
  const key = `${page}: ${msg}`;
  warnings.set(key, (warnings.get(key) ?? 0) + 1);
};

// The book-order page sequence for prev/next, and each page's Up target.
const sequence = ['bhsawesome.html', ...book.pages.map((d) => d.page as string), 'backmatter.html', 'book-index.html', 'colophon.html'];
const upOf = new Map<string, string | null>();
upOf.set('bhsawesome.html', null);
for (const d of book.pages) {
  upOf.set(d.page as string, d.parent?.page ?? 'bhsawesome.html');
}
upOf.set('backmatter.html', 'bhsawesome.html');
upOf.set('book-index.html', 'backmatter.html');
upOf.set('colophon.html', 'backmatter.html');

const exercisesIndex: { file: string; title: string; exercises: object[] }[] = [];
let emitted = 0;

function writePage(file: string, title: string, content: string): void {
  if (only && !only.has(file)) return;
  fs.writeFileSync(path.join(OUT, file), renderChrome(book, file, title, content, navFor(book, sequence, file, upOf)));
  emitted += 1;
}

// Division pages.
for (const division of book.pages) {
  const file = division.page as string;
  if (only && !only.has(file)) continue;
  const ctx = makeCtx(book, file, makeWarn(file));
  const content = pageContent(division, ctx);
  writePage(file, division.title || book.title, content);
  const exercises = pageExercises(content);
  if (exercises.length) exercisesIndex.push({ file, title: division.title || 'Introduction', exercises });
}

// Special pages.
const specialCtx = makeCtx(book, 'bhsawesome.html', makeWarn('special'));
writePage('bhsawesome.html', book.title, contentsPageContent(book));
writePage('backmatter.html', 'Back Matter', backmatterContent(book, makeCtx(book, 'backmatter.html', makeWarn('backmatter'))));
writePage('book-index.html', 'Index', bookIndexContent(book));
writePage('colophon.html', 'Colophon', colophonContent(book, makeCtx(book, 'colophon.html', makeWarn('colophon'))));
if (!only) fs.writeFileSync(path.join(OUT, 'index.html'), redirectPage());

// Standalone video pages.
if (!only) {
  for (const v of collectVideos(book)) {
    fs.writeFileSync(path.join(OUT, `${v.label}.html`), videoPage(v.label, v.youtube));
    emitted += 1;
  }
}

// Xref knowl pages (block targets referenced via data-knowl).
if (!only) {
  fs.mkdirSync(path.join(OUT, 'knowl', 'xref'), { recursive: true });
  for (const id of knowlTargets) {
    const label = book.labels.get(id);
    if (!label) continue;
    const ctx = makeCtx(book, label.pageOf.page as string, makeWarn(`knowl/${id}`));
    const content = emitElement(label.el, ctx);
    fs.writeFileSync(
      path.join(OUT, 'knowl', 'xref', `${id}.html`),
      renderChrome(book, label.pageOf.page as string, book.title, content, { prev: null, up: null, next: null }),
    );
    emitted += 1;
  }
}

// exercises.json + search corpus.
if (!only) {
  fs.writeFileSync(
    path.join(OUT, 'exercises.json'),
    JSON.stringify({ book: 'bhsawesome', pages: exercisesIndex }, null, 1),
  );
  fs.writeFileSync(path.join(OUT, 'lunr-pretext-search-index.js'), lunrIndexJs(book));
}

// Assets: external/ (the source assets tree) plus the committed vendor/
// trees frozen from the last PreTeXt build: generated/ (just the 5
// CodeLens traces, which only the external pythontutor tracer service
// can regenerate; PreTeXt's qrcode/ and datafile/ outputs were
// unreferenced and are dropped) and _static/ (the Runestone webpack
// bundles minus their .map/.gz/AppleDouble freight, plus only the eight
// pretext/ theme+runtime files the chrome references — 7MB in place of
// PreTeXt's 34MB tree).
function copyTree(src: string, dst: string): number {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) n += copyTree(s, d);
    else {
      const st = fs.statSync(s);
      const dt = fs.existsSync(d) ? fs.statSync(d) : null;
      if (!dt || dt.mtimeMs < st.mtimeMs || dt.size !== st.size) {
        fs.copyFileSync(s, d);
        n += 1;
      }
    }
  }
  return n;
}

// The stylesheet is OURS (builder/book.css; see its header) — copied to
// the site root beside the pages, with the self-hosted font files it
// references under fonts/.
fs.copyFileSync(path.join(ROOT, 'builder', 'book.css'), path.join(OUT, 'book.css'));
// The shared ToC script (one cacheable file instead of inline ToC per page).
fs.writeFileSync(path.join(OUT, 'toc.js'), tocJs(book));
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'builder', 'fonts'))) {
  fs.copyFileSync(path.join(ROOT, 'builder', 'fonts', f), path.join(OUT, 'fonts', f));
}

if (withAssets && !only) {
  const copied =
    copyTree(path.join(ROOT, 'pretext', 'assets'), path.join(OUT, 'external')) +
    copyTree(path.join(ROOT, 'vendor', '_static'), path.join(OUT, '_static')) +
    copyTree(path.join(ROOT, 'vendor', 'generated'), path.join(OUT, 'generated'));
  if (copied) console.log(`assets: ${copied} file(s) copied`);
}

for (const [msg, n] of warnings) console.log(`WARN ${msg}${n > 1 ? ` (x${n})` : ''}`);
console.log(
  `emitted ${emitted} page(s) in ${Math.round(performance.now() - started)}ms (${warnings.size} distinct warnings)`,
);
