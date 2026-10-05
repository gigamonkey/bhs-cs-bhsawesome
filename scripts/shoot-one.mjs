/*
 * Ad-hoc page shooter: like shoot.mjs but for arbitrary pages by path, for
 * verifying changes on pages outside the fixed shot set.
 *
 * Usage: node scripts/shoot-one.mjs <book> <outdir> <page-path> [page-path ...]
 *   page-path is the page's URL path under the book's base (e.g.
 *   introduction/intro-to-java, or '' for the contents page); the shot is
 *   named with slashes flattened to '-' (compare with compare.mjs).
 */
import { chromium } from 'playwright';
import { loadBook } from './lib/book.ts';
import { startServer } from './lib/site-server.mjs';

const { config, rest } = await loadBook(process.argv.slice(2), 'usage: node scripts/shoot-one.mjs <book> <outdir> <page-path>...');
const [outDir, ...pages] = rest;
if (!outDir) {
  console.error('usage: node scripts/shoot-one.mjs <book> <outdir> <page-path>...');
  process.exit(1);
}
const { server, base } = await startServer(config);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
for (const p of pages) {
  const clean = p.replace(/^\/+|\/+$/g, '');
  await page.goto(`${base}${config.base}/${clean ? `${clean}/` : ''}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${clean ? clean.replaceAll('/', '-') : 'contents'}.png`, fullPage: true });
  console.log(p);
}
await browser.close();
server.close();
