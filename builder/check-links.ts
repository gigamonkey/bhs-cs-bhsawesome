/*
 * Internal-link check over the emitted site (run after build.ts; CI runs it
 * before publishing). Every /bhsawesome/... href/src/data-knowl in every
 * emitted page must resolve inside the built site (SITE_DIR): a slashed URL to
 * <path>/index.html, anything else to a literal file. Relative refs are an
 * error by construction — the site's URLs are root-relative
 * (plans/bhsawesome-index-html-urls.md) — as is any bare-#fragment whose id
 * is missing from the page itself.
 *
 *     node builder/check-links.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { BASE, SITE_DIR } from './src/urls.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, SITE_DIR);

const REF_RE = /(?:href|src|data-knowl)="([^"]*)"/g;
const ID_RE = /id="([^"]*)"/g;

// Pre-existing broken images carried over from CSAwesome (the source
// references them but the assets tree never had them — they render broken
// in prod too). Tracked here so the gate stays red for NEW breakage;
// remove entries as the images are sourced or the references dropped.
const KNOWN_MISSING = new Set([
  `${BASE}/external/FreeResponse/Figures/frq4-data-grid1.png`,
  `${BASE}/external/FreeResponse/Figures/frq4-data-grid2.png`,
  `${BASE}/external/FreeResponse/Figures/frq4-sumorsamegame-table-b.png`,
]);

function* htmlFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(p);
    else if (entry.name.endsWith('.html')) yield p;
  }
}

const problems: string[] = [];
let checked = 0;

for (const file of htmlFiles(SITE)) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, 'utf8');
  const ids = new Set<string>();
  for (const m of html.matchAll(ID_RE)) ids.add(m[1]);
  for (const m of html.matchAll(REF_RE)) {
    const ref = m[1];
    if (/^(https?:)?\/\/|^mailto:|^data:/.test(ref)) continue; // external
    // Attribute-shaped strings inside inline <script> code (e.g.
    // '<a href="' + url + '"') aren't real refs.
    if (ref.includes(' ')) continue;
    if (KNOWN_MISSING.has(ref)) continue;
    checked += 1;
    if (ref.startsWith('#')) {
      if (ref !== '#' && !ids.has(ref.slice(1))) problems.push(`${rel}: missing in-page anchor ${ref}`);
      continue;
    }
    if (!ref.startsWith(`${BASE}/`) && ref !== `${BASE}/`) {
      // Root-relative refs outside the book (e.g. /js/bhsawesome.js) are
      // the web app's to serve; anything relative is a build bug.
      if (!ref.startsWith('/')) problems.push(`${rel}: relative ref ${ref}`);
      continue;
    }
    const target = ref.split('#')[0].split('?')[0];
    const sitePath = target.slice(BASE.length + 1).replace(/^\/+/, '');
    const fsPath = target.endsWith('/')
      ? path.join(SITE, sitePath, 'index.html')
      : path.join(SITE, sitePath);
    if (!fs.existsSync(fsPath)) problems.push(`${rel}: dead link ${ref}`);
  }
}

for (const p of problems) console.log(`BAD ${p}`);
console.log(`checked ${checked} refs; ${problems.length} problem(s)`);
if (problems.length) process.exit(1);
