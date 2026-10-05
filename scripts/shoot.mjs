#!/usr/bin/env node
/*
 * Screenshot harness: serve a built book over local HTTP and full-page
 * screenshot its shot list (<book>/shots.mjs — a fixed page set, including
 * JS-injected states), for before/after pixel comparison with compare.mjs
 * when touching the CSS or the emitters.
 *
 * External requests (YouTube embeds) are aborted for determinism — the book
 * itself loads nothing third-party.
 *
 * Usage:
 *   node scripts/shoot.mjs <book> shots/before [shot-name ...]   # before a change
 *   ...make the change, node scripts/build.ts <book>...
 *   node scripts/shoot.mjs <book> shots/after
 *   node scripts/compare.mjs shots/before shots/after
 *
 * Run it twice against the SAME build to measure async-render noise before
 * trusting a before/after diff.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadBook } from './lib/book.ts';
import { startServer } from './lib/site-server.mjs';

const { config, bookDir, rest } = await loadBook(
  process.argv.slice(2),
  'usage: node scripts/shoot.mjs <book> <outdir> [shot-name ...]',
);
const outDir = rest[0];
if (!outDir) {
  console.error('usage: node scripts/shoot.mjs <book> <outdir> [shot-name ...]');
  process.exit(1);
}
const only = new Set(rest.slice(1));

const shotsFile = path.join(bookDir, 'shots.mjs');
if (!fs.existsSync(shotsFile)) {
  console.error(`${bookDir} has no shots.mjs (export const SHOTS = [{ name, page, action? }, ...])`);
  process.exit(2);
}
const { SHOTS } = await import(pathToFileURL(shotsFile).href);

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

const { server, base } = await startServer(config);
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
    await page.goto(`${base}${config.base}/${shot.page}`, { waitUntil: 'networkidle', timeout: 30000 });
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
