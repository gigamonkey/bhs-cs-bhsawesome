/*
 * The bespoke book build (plans/rehost-bhsawesome.md phase 3).
 *
 *     node builder/build.ts [--only <page-path>...] [--no-assets]
 *
 * Emits the complete site into build/out/public/bhsawesome/ (SITE_DIR in
 * src/urls.ts — overlay-shaped, so push-content and the monorepo's dev-all
 * consume build/out directly with no staging step) — every page an index.html in
 * its own directory (plans/bhsawesome-index-html-urls.md; a --only key is
 * the page's URL path, e.g. `introduction/intro-to-java`, or `` for the
 * contents page): all division pages (chrome from builder/chrome.html), the
 * contents/backmatter/index pages, standalone video pages, xref knowl
 * pages, redirects.json (old flat page name -> new URL, served as 301s by
 * the web app), exercises.json, the lunr search corpus, and (unless
 * --no-assets) the external/, _static/, and generated/ asset trees.
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
  videoPage,
} from './src/extras.ts';
import { emitElement } from './src/prose.ts';
import { knowlTargets } from './src/prose.ts';
import { elementId } from './src/ids.ts';
import { fileFor, href, SITE_DIR } from './src/urls.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, SITE_DIR);

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set(args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')));
const withAssets = !args.includes('--no-assets');

const started = performance.now();
await initMath(); // the speech engine loads its locale async; emission is sync
const book = loadBook(path.join(ROOT, 'pretext', 'main.ptx'));
for (const page of book.pages) numberBlocks(page);

// Page directories share the site root with the asset trees; a division id
// (or the video/ namespace) colliding with one would silently interleave
// pages into an asset tree.
const RESERVED = new Set(['_static', 'external', 'generated', 'fonts', 'knowl', 'video']);
for (const d of book.pages) {
  const first = (d.page as string).split('/')[0];
  if (RESERVED.has(first)) throw new Error(`page path ${d.page} collides with reserved root entry ${first}`);
}

fs.mkdirSync(OUT, { recursive: true });
const warnings = new Map<string, number>();
const makeWarn = (page: string) => (msg: string) => {
  const key = `${page}: ${msg}`;
  warnings.set(key, (warnings.get(key) ?? 0) + 1);
};

// The book-order page sequence for prev/next, and each page's Up target
// ('' is the contents page at the site root).
const sequence = ['', ...book.pages.map((d) => d.page as string), 'backmatter', 'backmatter/book-index', 'backmatter/colophon'];
const upOf = new Map<string, string | null>();
upOf.set('', null);
for (const d of book.pages) {
  upOf.set(d.page as string, d.parent?.page ?? '');
}
upOf.set('backmatter', '');
upOf.set('backmatter/book-index', 'backmatter');
upOf.set('backmatter/colophon', 'backmatter');

const exercisesIndex: { file: string; title: string; exercises: object[] }[] = [];
let emitted = 0;

function writeSiteFile(rel: string, content: string): void {
  const target = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function writePage(page: string, title: string, content: string): void {
  if (only && !only.has(page)) return;
  writeSiteFile(fileFor(page), renderChrome(book, page, title, content, navFor(book, sequence, page, upOf)));
  emitted += 1;
}

// Division pages.
for (const division of book.pages) {
  const page = division.page as string;
  if (only && !only.has(page)) continue;
  const ctx = makeCtx(book, page, makeWarn(page));
  const content = pageContent(division, ctx);
  writePage(page, division.title || book.title, content);
  const exercises = pageExercises(content);
  if (exercises.length) exercisesIndex.push({ file: page, title: division.title || 'Introduction', exercises });
}

// Special pages ('' is the contents page — the site-root index.html).
writePage('', book.title, contentsPageContent(book));
writePage('backmatter', 'Back Matter', backmatterContent(book, makeCtx(book, 'backmatter', makeWarn('backmatter'))));
writePage('backmatter/book-index', 'Index', bookIndexContent(book));
writePage('backmatter/colophon', 'Colophon', colophonContent(book, makeCtx(book, 'backmatter/colophon', makeWarn('colophon'))));

// Standalone video pages.
const videos = collectVideos(book);
if (!only) {
  for (const v of videos) {
    writeSiteFile(fileFor(`video/${v.label}`), videoPage(v.label, v.youtube));
    emitted += 1;
  }
}

// Xref knowl pages (block targets referenced via data-knowl).
if (!only) {
  for (const id of knowlTargets) {
    const label = book.labels.get(id);
    if (!label) continue;
    const ctx = makeCtx(book, label.pageOf.page as string, makeWarn(`knowl/${id}`));
    const content = emitElement(label.el, ctx);
    writeSiteFile(
      path.join('knowl', 'xref', `${id}.html`),
      renderChrome(book, label.pageOf.page as string, book.title, content, { prev: null, up: null, next: null }),
    );
    emitted += 1;
  }
}

// redirects.json: every pre-directory-URLs flat page name -> its new URL.
// The web app serves these as 301s (plans/bhsawesome-index-html-urls.md
// phase 0), and the content repo's material-url rewrite reads the same map.
if (!only) {
  // index.html too: the old root was a meta-refresh stub at that name, so
  // links to it exist; send them to the clean root URL.
  const redirects: Record<string, string> = { 'bhsawesome.html': href(''), 'index.html': href('') };
  for (const d of book.pages) redirects[`${d.id}.html`] = href(d.page as string);
  redirects['backmatter.html'] = href('backmatter');
  redirects['book-index.html'] = href('backmatter/book-index');
  redirects['colophon.html'] = href('backmatter/colophon');
  for (const v of videos) redirects[`${v.label}.html`] = href(`video/${v.label}`);
  fs.writeFileSync(path.join(OUT, 'redirects.json'), JSON.stringify(redirects, null, 1));
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
// The permalink injector (css-cleanup step 9): permalink anchors are
// client-injected, not emitted — one static cacheable file.
fs.copyFileSync(path.join(ROOT, 'builder', 'permalinks.js'), path.join(OUT, 'permalinks.js'));
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
