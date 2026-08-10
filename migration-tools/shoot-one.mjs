/*
 * Ad-hoc page shooter: like shoot.mjs but for arbitrary pages by path,
 * for verifying changes on pages outside the fixed shot set.
 *
 * Usage: node migration-tools/shoot-one.mjs <outdir> <page-path> [page-path ...]
 *   page-path is the page's URL path under /bhsawesome/ (e.g.
 *   introduction/intro-to-java, or '' for the contents page); the shot is
 *   named with slashes flattened to '-' (compare with compare.mjs).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const SITE = path.resolve('build/site');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = url === '/bhsawesome' ? '/' : url.startsWith('/bhsawesome/') ? url.slice('/bhsawesome'.length) : url;
  let file = path.join(SITE, rel === '/' ? 'index.html' : rel);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': t }).end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
for (const p of process.argv.slice(3)) {
  const clean = p.replace(/^\/+|\/+$/g, '');
  await page.goto(`http://127.0.0.1:${server.address().port}/bhsawesome/${clean ? `${clean}/` : ''}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${process.argv[2]}/${clean ? clean.replaceAll('/', '-') : 'contents'}.png`, fullPage: true });
  console.log(p);
}
await browser.close();
server.close();
