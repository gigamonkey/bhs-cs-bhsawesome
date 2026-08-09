/*
 * Runtime-DOM class census: loads the shot pages in Chromium, exercises the
 * stateful chrome (search, knowls, dialogs), and records every class present
 * in the live DOM. This is the backstop for the string scan's blind spot —
 * classes a script CONSTRUCTS at runtime (state classes like active/open/
 * copied, component internals) that never appear in the static HTML.
 *
 * Usage: node migration-tools/runtime-census.mjs
 * Writes migration-tools/shots/runtime-classes.txt (gitignored); check purge
 * candidates against it before deleting their rules.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const SITE = path.resolve('build/site');
const CLIENT = path.join(process.env.BHS_CS ?? path.resolve('..', 'bhs-cs'), 'website', 'public', 'js', 'bhsawesome.js');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = url === '/js/bhsawesome.js' ? CLIENT : path.join(SITE, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const pages = ['variables.html','boolean-manipulation.html','array-traversal.html','for-loops.html','intro-to-java.html','assignment-statements.html','frq-practice.html','arraylist-summary.html','abstraction.html','classes.html','bhsawesome.html','book-index.html','colophon.html','if-traps.html'];
const all = new Set();
const page = await browser.newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
for (const p of pages) {
  await page.goto(`${base}/${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // exercise the stateful chrome so state classes appear
  await page.click('#ptx-search-button', { timeout: 800 }).catch(() => {});
  await page.fill('#ptx-search-terms', 'array', { timeout: 800 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.click('#ptx-search-close', { timeout: 800 }).catch(() => {});
  await page.click('a[data-knowl]', { timeout: 800 }).catch(() => {});
  await page.click('#ptx-readability-options-button', { timeout: 800 }).catch(() => {});
  await page.waitForTimeout(800);
  const classes = await page.evaluate(() => {
    const s = new Set();
    for (const el of document.querySelectorAll('*')) {
      for (const c of el.classList) s.add(c);
    }
    return [...s];
  });
  for (const c of classes) all.add(c);
}
await browser.close(); server.close();
fs.writeFileSync('migration-tools/shots/runtime-classes.txt', [...all].sort().join('\n'));
console.log(`${all.size} distinct classes in the live DOM`);
