#!/usr/bin/env node
/*
 * Screenshot harness for the CSS cleanup (bhs-cs plans/bhsawesome-css-cleanup.md).
 *
 * Serves build/site over local HTTP (plus /js/bhsawesome.js from the bhs-cs
 * checkout — sibling by default, override with BHS_CS; a minimal defer-loader
 * stub fills in if the bundle is missing) and full-page-screenshots a fixed
 * page set chosen so every class vocabulary the cleanup touches is covered,
 * including JS-injected states (dark mode, open knowl, search results, the
 * readability dialog, exposed permalinks).
 *
 * External requests (YouTube embeds) are aborted for determinism — the book
 * itself loads nothing third-party.
 *
 * Usage:
 *   node migration-tools/shoot.mjs shots/before        # before a change
 *   ...make the change, node builder/build.ts...
 *   node migration-tools/shoot.mjs shots/after
 *   node migration-tools/compare.mjs shots/before shots/after
 *
 * Run it twice against the SAME build to measure async-render noise before
 * trusting a before/after diff (the phase-5 pattern).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'build', 'site');
const BHS_CS = process.env.BHS_CS ?? path.join(ROOT, '..', 'bhs-cs');
const CLIENT_JS = path.join(BHS_CS, 'website', 'public', 'js', 'bhsawesome.js');

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node migration-tools/shoot.mjs <outdir> [shot-name ...]');
  process.exit(1);
}
const only = new Set(process.argv.slice(3));

// ---------------------------------------------------------------------------
// The shot list. One entry per (page, state); names are stable — compare.mjs
// matches on them. Keep every vocabulary the plan touches covered.
// ---------------------------------------------------------------------------

const SHOTS = [
  // Vocabulary coverage, default state:
  { name: 'variables', page: 'variables.html' }, // prose, fillin
  { name: 'boolean-manipulation', page: 'boolean-manipulation.html' }, // tabular-heavy
  { name: 'array-traversal', page: 'array-traversal.html' }, // gutterimage/sidebyside, datafile, MCQ, activecode
  { name: 'for-loops', page: 'for-loops.html' }, // parsons
  { name: 'intro-to-java', page: 'intro-to-java.html' }, // hparsons
  { name: 'assignment-statements', page: 'assignment-statements.html' }, // codelens
  { name: 'frq-practice', page: 'frq-practice.html' }, // clickable-area, short-answer, FRQ styling
  { name: 'arraylist-summary', page: 'arraylist-summary.html' }, // cardsort, MCQ
  { name: 'abstraction', page: 'abstraction.html' }, // journal/short-answer, book exercises
  { name: 'classes-chapter', page: 'classes.html' }, // chapter summary page
  { name: 'frontmatter', page: 'bhsawesome.html' }, // title page
  { name: 'book-index', page: 'book-index.html' }, // index backmatter
  { name: 'colophon', page: 'colophon.html' },
  { name: 'knowl-page', page: 'knowl/xref/complex-loop-trace-table.html' }, // bare knowl content

  // JS-injected states:
  { name: 'variables-dark', page: 'variables.html', action: 'dark' },
  { name: 'arraylist-summary-dark', page: 'arraylist-summary.html', action: 'dark' },
  { name: 'frq-practice-dark', page: 'frq-practice.html', action: 'dark' },
  { name: 'boolean-manipulation-dark', page: 'boolean-manipulation.html', action: 'dark' },
  { name: 'if-traps-knowl-open', page: 'if-traps.html', action: 'knowl' },
  { name: 'variables-search', page: 'variables.html', action: 'search' },
  { name: 'variables-readability', page: 'variables.html', action: 'readability' },
  { name: 'variables-permalinks', page: 'variables.html', action: 'permalinks' },
];

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
  '.map': 'application/json', '.jar': 'application/java-archive',
};

// If the built client bundle isn't around, the defer-loader is the only part
// the shots actually need: load the data-bhs-defer-src scripts in order.
const CLIENT_STUB = `(async () => {
  for (const s of document.querySelectorAll('script[data-bhs-defer-src]')) {
    await new Promise((done) => {
      const t = document.createElement('script');
      t.src = s.dataset.bhsDeferSrc;
      t.onload = done;
      t.onerror = done;
      document.head.append(t);
    });
  }
})();`;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/js/bhsawesome.js') {
      if (fs.existsSync(CLIENT_JS)) {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end(fs.readFileSync(CLIENT_JS));
      } else {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end(CLIENT_STUB);
      }
      return;
    }
    let file = path.join(SITE, url === '/' ? 'index.html' : url);
    if (!file.startsWith(SITE)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Actions (JS-injected states)
// ---------------------------------------------------------------------------

const ACTIONS = {
  async dark(page) {
    await page.click('#ptx-readability-options-button');
    await page.click('#ptx-readability-theme-dark');
    await page.click('#ptx-readability-options-close-button');
    await page.waitForTimeout(300);
  },
  async knowl(page) {
    await page.click('a[data-knowl]');
    // Wait out the expand: every image loaded and page height stable for
    // a sustained stretch (the knowl fetch + reflow settles late).
    await page.waitForFunction(
      () => {
        const imgs = [...document.images].every((i) => i.complete);
        const h = document.documentElement.scrollHeight;
        window.__hs = imgs && window.__h === h ? (window.__hs ?? 0) + 1 : 0;
        window.__h = h;
        return window.__hs >= 6;
      },
      { timeout: 15000, polling: 300 },
    ).catch(() => {});
    await page.waitForTimeout(500);
  },
  async search(page) {
    await page.click('#ptx-search-button');
    await page.fill('#ptx-search-terms', 'array');
    // Lazy index: stub globals answer immediately; the real index re-runs
    // the query when it lands. Wait for real results.
    await page.waitForFunction(
      () => document.querySelectorAll('.ptx-search-results li, .ptx-search-results a').length > 3,
      { timeout: 10000 },
    ).catch(() => {});
    await page.waitForTimeout(300);
  },
  async readability(page) {
    await page.click('#ptx-readability-options-button');
    await page.waitForTimeout(300);
  },
  async permalinks(page) {
    await page.click('#ptx-readability-options-button');
    await page.check('#ptx-readability-accessible-permalinks');
    await page.click('#ptx-readability-options-close-button');
    await page.waitForTimeout(300);
  },
};

// ---------------------------------------------------------------------------

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];
for (const shot of SHOTS) {
  if (only.size && !only.has(shot.name)) continue;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  // Determinism: the Runestone components shuffle cards/blocks/choices with
  // Math.random — replace it with a seeded PRNG (mulberry32) so every run
  // deals the same order.
  await page.addInitScript(() => {
    let s = 0x9e3779b9;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  // Determinism: nothing leaves localhost (YouTube iframes become blank).
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  try {
    await page.goto(`${base}/${shot.page}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000); // let the Runestone components settle
    if (shot.action) await ACTIONS[shot.action](page);
    await page.screenshot({ path: path.join(outDir, `${shot.name}.png`), fullPage: true });
    console.log(`  ${shot.name}`);
  } catch (e) {
    failures.push(shot.name);
    console.error(`  ${shot.name} FAILED: ${e.message.split('\n')[0]}`);
  }
  await context.close();
}
await browser.close();
server.close();
if (failures.length) {
  console.error(`${failures.length} shot(s) failed`);
  process.exit(1);
}
console.log(`wrote ${SHOTS.length && only.size ? only.size : SHOTS.length} shots to ${outDir}`);
