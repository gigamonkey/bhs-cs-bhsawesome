#!/usr/bin/env node
/*
 * Class census for the CSS cleanup (bhs-cs plans/bhsawesome-css-cleanup.md).
 *
 * Regenerates migration-tools/class-audit.md from the built site, book.css,
 * and the shipped JS/CSS. Fully mechanical: hand judgments live in the
 * OVERRIDES and NOTES maps below so a re-run after each cleanup step is
 * idempotent and the doc tracks the burn-down.
 *
 * Evidence collected per class name:
 *   - count in static HTML (build/site pages + knowl pages, plus class
 *     attributes inside toc.js's injected-HTML strings)
 *   - number of selectors in builder/book.css mentioning it
 *   - string-literal hits in the shipped JS (vendored pretext scripts, the
 *     Runestone bundles + lazy chunks, the bhs-cs client bundle) and in the
 *     Runestone stylesheets
 *
 * JS evidence is string-literal-scoped (we search inside quoted strings
 * only), which cuts identifier noise from minified bundles — but a hit
 * still only means "this bundle mentions the name somewhere", so generic
 * names (title, type, button, ...) carry a ⚠ and need human judgment
 * before anyone touches them.
 *
 * Usage: node migration-tools/census.mjs   (run after node builder/build.ts)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'build', 'site');
const OUT = path.join(import.meta.dirname, 'class-audit.md');

// The bhs-cs monorepo checkout (for the client bundle the book pages load
// at /js/bhsawesome.js). Sibling checkout by default; override with BHS_CS.
const BHS_CS = process.env.BHS_CS ?? path.join(ROOT, '..', 'bhs-cs');

// ---------------------------------------------------------------------------
// Hand judgments. OVERRIDES pins a class to a classification (with a note);
// NOTES annotates without reclassifying. Keep these in sync with the
// cleanup steps as they land.
// ---------------------------------------------------------------------------

const OVERRIDES = new Map([
  // rs-<label> ids and data-testclass values are identity, not classes —
  // they never show up here, but the hook classes for our client do:
  ['bhs-book-exercise', ['ours-js-hook', 'book-exercise.ts builds the editor UI on this']],
  ['bhs-book-starter', ['ours-js-hook', 'starter-code textarea read by book-exercise.ts']],
  // Evidence hand-checked 2026-08-09:
  ['para', ['live-ours', 'renegotiable despite the hits: rs-css is ONE rule (`.multiplechoice_section label>.para{display:inline}` in prefix-919 — compensate with a `label>p` rule); pretext-core only *generates* `.para` divs in knowl-error markup; read-aloud has bare `p` in its CONTAINER_SELECTOR (its `div.para` entry is dead legacy) — segmentation + math speech verified live 2026-08-09 via PTXReadAloud.collect(); the 56-bundle hit is Portuguese prose ("para resolver")']],
  ['code-inline', ['live-ours', 'renegotiable: the rs-css hit is one prefix-580 rule (`.datafile_caption code.code-inline{...}`) over markup WE emit — recreate as `.datafile_caption code` in book.css at step 4']],
]);

const NOTES = new Map([
  ['tex2jax_ignore', 'step 3 target: MathJax runtime is gone; zero CSS, zero JS'],
  ['keyword', 'stays: real distinction (<k> keywords vs plain <c>) — but also a Prism token name'],
  ['figure-like', 'read-aloud checks this name when deciding how to read a block — smoke read-aloud at step 6'],
  ['project-like', 'read-aloud checks this name — smoke read-aloud at step 6'],
  ['image-box', 'pretext-core magnifier attach list (".image-box, .sbsrow, figure, li, ...") — step 8 must keep the magnifier working'],
  ['sbspanel', 'pretext-core references ".sbspanel" — check the code path before touching sidebyside markup'],
  ['heading-divison-mark', 'step 5 target: zero CSS rules (note inherited typo)'],
  ['heading-divison-mark__space', 'step 5 target: zero CSS rules'],
  ['heading-divison-mark__period', 'step 5 target: zero CSS rules'],
  ['space', 'step 5 target: wrapper around a literal space'],
  ['period', 'step 5 target: wrapper around a literal period'],
  ['autopermalink', 'step 9: slim or client-inject; pretext-core owns the behavior'],
  ['ol-marker-1', 'step 7 target: per-page marker registry'],
  ['ol-marker-2', 'step 7 target: per-page marker registry'],
  ['dark-mode', 'set on :root by pretext-core theme toggle'],
  ['language-java', 'census blind spot: consumed via `code[class*=language-]` ATTRIBUTE selectors (Prism theme rules) — not dead'],
  ['language-text', 'consumed via `code[class*=language-]` attribute selectors — not dead'],
  ['xref', 'knowl behavior keys on [data-knowl], not this class — verify, then fold into the step-6 family'],
  ['punctuation', 'Prism token with no styling rule — inherits default; step 11 decides trim-vs-style'],
  ['function', 'Prism token with no styling rule'],
  ['class-name', 'Prism token with no styling rule'],
  ['activity', 'step 6: the surviving name of the `activity project-like` pair'],
  ['project', 'step 6: the surviving name of the `project project-like` pair'],
  ['listing', 'step 6: the surviving name of the `listing figure-like` pair'],
]);

// Runestone component vocabulary by shape: frozen (plan ground-rule 1)
// even when no bundle string-literal happens to mention the exact name.
const FROZEN_PATTERNS = [
  /_section$/, /^ac_/, /^parsons/, /^hparsons/, /^hp_/, /^ptx-runestone/,
  /^runestone/, /^cd_/, /^pytutor/i, /^codelens/, /^fillintheblank$/,
  /^datafile/, /^clickable/, /^cardsort/, /^draggable/,
];

// Names common enough that a string-literal hit in a minified bundle is
// weak evidence: classification falls back to HTML/CSS presence and the
// row gets a ⚠.
const GENERIC = new Set([
  'active', 'button', 'code', 'comment', 'contained', 'content', 'controls',
  'copied', 'decimal', 'disabled', 'disc', 'external', 'function', 'header',
  'heading', 'hidden', 'icon', 'internal', 'keyword', 'label', 'left',
  'middle', 'name', 'number', 'open', 'operator', 'period', 'punctuation',
  'right', 'runestone', 'space', 'string', 'text', 'time', 'title', 'top',
  'type', 'visible',
]);

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

function walk(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// -- static HTML classes (class="..." attributes; \s before `class` keeps
// data-testclass="book:..." from matching) --
const htmlCounts = new Map();
function countHtmlClasses(text) {
  for (const m of text.matchAll(/\sclass="([^"]+)"/g)) {
    for (const name of m[1].split(/\s+/)) {
      if (name) htmlCounts.set(name, (htmlCounts.get(name) ?? 0) + 1);
    }
  }
}
const htmlFiles = walk(SITE, '.html').filter((p) => !p.includes(`${path.sep}_static${path.sep}`));
for (const f of htmlFiles) countHtmlClasses(fs.readFileSync(f, 'utf8'));

// toc.js injects the sidebar ToC markup: its class attributes are
// effectively more static HTML.
const tocJsClasses = new Set();
{
  const toc = fs.readFileSync(path.join(SITE, 'toc.js'), 'utf8');
  for (const m of toc.matchAll(/class=\\?"([^"\\]+)\\?"/g)) {
    for (const name of m[1].split(/\s+/)) {
      if (!name) continue;
      tocJsClasses.add(name);
      htmlCounts.set(name, (htmlCounts.get(name) ?? 0) + 1);
    }
  }
}

// -- CSS selector classes --
// Walks rule preludes only (declarations, comments, url(...) never reach
// class extraction). Counts individual comma-separated selectors.
function selectorClassCounts(css) {
  const counts = new Map();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let buf = '';
  for (const ch of stripped) {
    if (ch === '{') {
      const prelude = buf.trim();
      if (prelude && !prelude.startsWith('@')) {
        for (const sel of prelude.split(',')) {
          const seen = new Set();
          for (const m of sel.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) seen.add(m[1]);
          for (const name of seen) counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
      buf = '';
    } else if (ch === '}' || ch === ';') {
      buf = '';
    } else {
      buf += ch;
    }
  }
  return counts;
}

const bookCssCounts = selectorClassCounts(
  fs.readFileSync(path.join(ROOT, 'builder', 'book.css'), 'utf8'),
);

// Runestone stylesheets: any class they style is component-internal
// vocabulary (frozen until phase 7).
const runestoneCssNames = new Set();
for (const f of walk(path.join(SITE, '_static'), '.css')) {
  for (const name of selectorClassCounts(fs.readFileSync(f, 'utf8')).keys()) {
    runestoneCssNames.add(name);
  }
}

// -- JS string-literal hits --
function stringLiterals(js) {
  // Good-enough literal extraction from minified code: quoted runs without
  // unescaped closers. Backticks too (template chunks).
  const out = [];
  for (const m of js.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out.join('\n');
}

const JS_GROUPS = {
  'pretext-js': [
    path.join(SITE, '_static', 'pretext', 'js', 'dist', 'pretext-core.js'),
    path.join(SITE, '_static', 'pretext', 'js', 'dist', 'pretext-read-aloud.js'),
    path.join(SITE, '_static', 'pretext', 'js', 'dist', 'pretext_search.js'),
  ],
  'runestone-js': fs
    .readdirSync(path.join(SITE, '_static'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('lunr.min.js'))
    .map((f) => path.join(SITE, '_static', f)),
  'client-js': [path.join(BHS_CS, 'website', 'public', 'js', 'bhsawesome.js')],
};

const jsLiterals = {}; // group -> [{file, text}]
for (const [group, files] of Object.entries(JS_GROUPS)) {
  jsLiterals[group] = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn(`warning: ${f} missing — ${group} evidence incomplete`);
      continue;
    }
    jsLiterals[group].push({ file: path.basename(f), text: stringLiterals(fs.readFileSync(f, 'utf8')) });
  }
}

function jsHits(name) {
  const re = new RegExp(`(?<![\\w$-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$-])`);
  const hits = {};
  for (const [group, entries] of Object.entries(jsLiterals)) {
    const files = entries.filter((e) => re.test(e.text)).map((e) => e.file);
    if (files.length) hits[group] = files;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const allNames = new Set([...htmlCounts.keys(), ...bookCssCounts.keys()]);
const rows = [];
for (const name of [...allNames].sort()) {
  const html = htmlCounts.get(name) ?? 0;
  const css = bookCssCounts.get(name) ?? 0;
  const hits = jsHits(name);
  const rsCss = runestoneCssNames.has(name);
  const generic = GENERIC.has(name);

  let cls;
  let why = '';
  const override = OVERRIDES.get(name);
  if (override) {
    [cls, why] = override;
  } else if (FROZEN_PATTERNS.some((p) => p.test(name))) {
    cls = 'frozen-runestone';
    why = 'by name pattern (component vocabulary)';
  } else if (!generic && (hits['runestone-js'] || rsCss)) {
    cls = 'frozen-runestone';
  } else if (!generic && hits['pretext-js']) {
    cls = 'frozen-pretext-js';
  } else if (!generic && (hits['client-js'] || tocJsClasses.has(name))) {
    cls = 'ours-js-hook';
  } else if (html && css) {
    cls = 'live-ours';
  } else if (css) {
    cls = 'dead-css';
  } else {
    cls = 'dead-html';
  }

  const evidence = [];
  if (rsCss) evidence.push('rs-css');
  for (const [group, files] of Object.entries(hits)) {
    evidence.push(`${group}(${files.map((f) => f.replace(/\..*\.(bundle\.)?js$/, '')).join(',')})`);
  }
  if (tocJsClasses.has(name)) evidence.push('toc.js');
  rows.push({
    name,
    html,
    css,
    cls,
    generic: generic && evidence.length > 0,
    evidence: evidence.join(' '),
    note: why || NOTES.get(name) || '',
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const ORDER = ['live-ours', 'dead-css', 'dead-html', 'ours-js-hook', 'frozen-pretext-js', 'frozen-runestone'];
const DESCRIPTIONS = {
  'live-ours': 'In our HTML and our CSS, no JS consumer found: **ours to renegotiate.**',
  'dead-css':
    'In book.css only — no static HTML, no JS string mentions it. Candidates for the step-1 purge. (A name a script *constructs* would evade the string scan; the shot harness is the backstop.)',
  'dead-html': 'Emitted but unstyled and unconsumed: drop from the emitters.',
  'ours-js-hook': 'Consumed by our own JS (toc.js, the bhs-cs client): change only with a coordinated edit.',
  'frozen-pretext-js': 'Mentioned by the vendored pretext scripts: keep the name, or prove the code path dead.',
  'frozen-runestone': 'Mentioned by the Runestone bundles or their stylesheets: frozen until phase 7.',
};

const lines = [];
lines.push('# Class audit — the CSS-cleanup ledger');
lines.push('');
lines.push('Generated by `node migration-tools/census.mjs` (hand judgments live in');
lines.push('that script’s OVERRIDES/NOTES maps — edit there, not here). Re-run after');
lines.push('each cleanup step; the burn-down shows up in the counts below.');
lines.push('');
lines.push('| classification | classes |');
lines.push('|---|---|');
for (const cls of ORDER) {
  lines.push(`| ${cls} | ${rows.filter((r) => r.cls === cls).length} |`);
}
lines.push(`| **total** | **${rows.length}** |`);
lines.push('');
lines.push('`html` = occurrences in the built pages (knowls and toc.js-injected');
lines.push('markup included); `css` = selectors in book.css mentioning the class.');
lines.push('⚠ = generic name whose JS-bundle mentions are weak evidence — classified');
lines.push('by HTML/CSS presence; verify by hand before touching.');
lines.push('');
for (const cls of ORDER) {
  const group = rows.filter((r) => r.cls === cls);
  if (!group.length) continue;
  lines.push(`## ${cls} (${group.length})`);
  lines.push('');
  lines.push(DESCRIPTIONS[cls]);
  lines.push('');
  lines.push('| class | html | css | evidence | notes |');
  lines.push('|---|---:|---:|---|---|');
  for (const r of group) {
    lines.push(
      `| \`${r.name}\`${r.generic ? ' ⚠' : ''} | ${r.html} | ${r.css} | ${r.evidence} | ${r.note} |`,
    );
  }
  lines.push('');
}

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${rows.length} classes`);
for (const cls of ORDER) {
  console.log(`  ${cls}: ${rows.filter((r) => r.cls === cls).length}`);
}
