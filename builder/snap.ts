/*
 * Component snapshot comparison: the landed PreTeXt pages (build/out) ARE
 * the snapshots. For every component instance (keyed by its rs-<id> /
 * data-component root), extract the enclosing ptx-runestone-container
 * subtree from both builds, normalize (attribute order, inter-tag
 * whitespace — pre/textarea contents preserved), and compare.
 *
 *     node builder/snap.ts [--type <kind>] [id...]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OURS = path.join(ROOT, 'build', 'site');
const THEIRS = path.join(ROOT, 'build', 'out', 'public', 'bhsawesome');

type Instance = { page: string; kind: string; html: string };

function balancedDiv(html: string, start: number): string {
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '<div' ? 1 : -1;
    if (depth === 0) return html.slice(start, start + (m.index ?? 0) + m[0].length);
  }
  throw new Error('unbalanced');
}

/** All component containers in a page: id -> subtree. */
function componentsIn(html: string, page: string): Map<string, Instance> {
  const out = new Map<string, Instance>();
  // Scripts can contain stray divs; drop them (none live inside payloads).
  const clean = html.replace(/<script[\s\S]*?<\/script>/g, '<!--script-->');
  for (const m of clean.matchAll(/<div class="ptx-runestone-container"[^>]*>/g)) {
    let sub: string;
    try {
      sub = balancedDiv(clean, m.index ?? 0);
    } catch {
      continue;
    }
    const idm = sub.match(/id="rs-([\w-]+)"/);
    if (!idm) continue;
    const kind =
      sub.match(/data-component="([\w-]+)"/)?.[1] ??
      (sub.includes('bhs-book-exercise') ? 'bhs-activecode' : 'unknown');
    out.set(idm[1], { page, kind, html: sub });
  }
  // Standalone datafiles sit outside ptx-runestone-container.
  for (const m of clean.matchAll(/<div class="runestone datafile">/g)) {
    const sub = balancedDiv(clean, m.index ?? 0);
    const idm = sub.match(/id="rs-([\w-]+)"/);
    if (idm) out.set(idm[1], { page, kind: 'datafile', html: sub });
  }
  return out;
}

function indexTree(dir: string): Map<string, Instance> {
  const out = new Map<string, Instance>();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    // Skip non-page files (knowls etc. have no ptx-content, harmless).
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const [id, inst] of componentsIn(html, f)) {
      if (!out.has(id)) out.set(id, inst);
    }
  }
  return out;
}

function sortTagAttrs(tag: string): string {
  const m = tag.match(/^<([\w-]+)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>$/);
  if (!m) return tag;
  const [, name, attrText, selfClose] = m;
  const attrs = [...attrText.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)]
    .map((a) => (a[2] === undefined ? a[1] : `${a[1]}="${a[2]}"`))
    .sort();
  return `<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClose}>`;
}

export function normalize(html: string): string {
  // Split out pre/textarea bodies so their whitespace survives.
  const parts = html.split(/(<(?:pre|textarea)\b[^>]*>[\s\S]*?<\/(?:pre|textarea)>)/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        const open = part.slice(0, part.indexOf('>') + 1);
        return sortTagAttrs(open) + part.slice(open.length);
      }
      return part
        .replace(/\s+/g, ' ')
        .replace(/> </g, '><')
        .replace(/<[^>]*>/g, (t) => (t.startsWith('</') || t.startsWith('<!') ? t : sortTagAttrs(t)))
        .trim();
    })
    .join('');
}

const args = process.argv.slice(2);
const typeIdx = args.indexOf('--type');
const wantType = typeIdx === -1 ? null : args[typeIdx + 1];
const wantIds = new Set(args.filter((a, i) => !a.startsWith('--') && i !== typeIdx + 1));

const ours = indexTree(OURS);
const theirs = indexTree(THEIRS);

const counts = new Map<string, { ok: number; bad: number; missing: number }>();
const tally = (kind: string, k: 'ok' | 'bad' | 'missing') => {
  const c = counts.get(kind) ?? { ok: 0, bad: 0, missing: 0 };
  c[k] += 1;
  counts.set(kind, c);
};

let shown = 0;
for (const [id, t] of theirs) {
  if (wantType && t.kind !== wantType) continue;
  if (wantIds.size && !wantIds.has(id)) continue;
  const o = ours.get(id);
  if (!o) {
    tally(t.kind, 'missing');
    if (shown < 5) console.log(`✖ ${id} (${t.kind}, ${t.page}): MISSING from our build`);
    shown += 1;
    continue;
  }
  const a = normalize(o.html);
  const b = normalize(t.html);
  if (a === b) {
    tally(t.kind, 'ok');
  } else {
    tally(t.kind, 'bad');
    if (shown < 5) {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      console.log(`✖ ${id} (${t.kind}, ${t.page}): differs at char ${i}`);
      console.log(`    ours:   ...${a.slice(Math.max(0, i - 60), i + 120)}`);
      console.log(`    theirs: ...${b.slice(Math.max(0, i - 60), i + 120)}`);
    }
    shown += 1;
  }
}

for (const [kind, c] of [...counts].sort()) {
  console.log(`${kind}: ${c.ok} ok, ${c.bad} differ, ${c.missing} missing`);
}
