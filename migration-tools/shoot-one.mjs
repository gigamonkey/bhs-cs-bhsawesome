/*
 * Ad-hoc page shooter: like shoot.mjs but for arbitrary pages by name,
 * for verifying changes on pages outside the fixed shot set.
 *
 * Usage: node migration-tools/shoot-one.mjs <outdir> <page> [page ...]
 *   (page names without .html; compare with compare.mjs)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const SITE = path.resolve('build/site');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(SITE, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': t }).end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
for (const p of process.argv.slice(3)) {
  await page.goto(`http://127.0.0.1:${server.address().port}/${p}.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${process.argv[2]}/${p}.png`, fullPage: true });
  console.log(p);
}
await browser.close();
server.close();
