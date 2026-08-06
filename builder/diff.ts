/*
 * Text-content diff between the bespoke build (build/site) and the landed
 * PreTeXt truth (build/out/public/bhsawesome). The markup is intentionally
 * different; what must match is the READER-VISIBLE TEXT of the content
 * area. Interactive component payloads (.ptx-runestone-container subtrees)
 * are skipped on both sides until their emitters land (3c step 2).
 *
 *     node builder/diff.ts <page.html>...
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OURS = path.join(ROOT, 'build', 'site');
const THEIRS = path.join(ROOT, 'build', 'out', 'public', 'bhsawesome');

function contentRegion(html: string): string {
  const start = html.indexOf('id="ptx-content"');
  if (start === -1) throw new Error('no ptx-content');
  const open = html.lastIndexOf('<', start);
  return balanced(html, open);
}

/** The div starting at `start` through its balanced close. */
function balanced(html: string, start: number): string {
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (const m of html.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '<div' ? 1 : -1;
    if (depth === 0) return html.slice(start, start + (m.index ?? 0) + m[0].length);
  }
  throw new Error('unbalanced divs');
}

function stripSubtrees(html: string, marker: string): string {
  let out = html;
  for (;;) {
    const i = out.indexOf(marker);
    if (i === -1) return out;
    const open = out.lastIndexOf('<div', i);
    const block = balanced(out, open);
    out = out.slice(0, open) + out.slice(open + block.length);
  }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

const allow = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, 'diff-allow.json'), 'utf8'),
) as Record<string, string[]>;

/** Strip the element (article/div/section/figure) with the given id. */
function stripById(html: string, id: string): string {
  const i = html.indexOf(`id="${id}"`);
  if (i === -1) return html;
  const open = html.lastIndexOf('<', i);
  const tag = html.slice(open + 1, html.indexOf(' ', open));
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  let depth = 0;
  for (const m of html.slice(open).matchAll(re)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return html.slice(0, open) + html.slice(open + (m.index ?? 0) + m[0].length);
    }
  }
  return html;
}

function words(html: string, allowedIds: string[] = []): string[] {
  // Scripts can contain '<div' as text — strip them before any balancing.
  let s = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  s = contentRegion(s);
  for (const id of allowedIds) s = stripById(s, id);
  s = stripSubtrees(s, 'ptx-runestone-container');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));
  s = s.replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ');
  return s.split(/\s+/).filter((w) => w !== '' && w !== '🔗');
}

let failures = 0;
for (const page of process.argv.slice(2)) {
  let ours: string[];
  let theirs: string[];
  try {
    ours = words(fs.readFileSync(path.join(OURS, page), 'utf8'), allow[page] ?? []);
    theirs = words(fs.readFileSync(path.join(THEIRS, page), 'utf8'));
  } catch (e) {
    console.log(`✖ ${page}: ${e instanceof Error ? e.message : e}`);
    failures += 1;
    continue;
  }
  // Common prefix/suffix; report the divergent middle.
  let a = 0;
  while (a < ours.length && a < theirs.length && ours[a] === theirs[a]) a++;
  let b = 0;
  while (
    b < ours.length - a &&
    b < theirs.length - a &&
    ours[ours.length - 1 - b] === theirs[theirs.length - 1 - b]
  )
    b++;
  const oursMid = ours.slice(a, ours.length - b);
  const theirsMid = theirs.slice(a, theirs.length - b);
  if (oursMid.length === 0 && theirsMid.length === 0) {
    console.log(`✔ ${page} (${theirs.length} words)`);
  } else {
    failures += 1;
    console.log(`✖ ${page}: diverges after ${a} of ${theirs.length} words`);
    console.log(`    context: ...${theirs.slice(Math.max(0, a - 8), a).join(' ')}`);
    console.log(`    ours:   ${oursMid.slice(0, 30).join(' ') || '(nothing)'}`);
    console.log(`    theirs: ${theirsMid.slice(0, 30).join(' ') || '(nothing)'}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
