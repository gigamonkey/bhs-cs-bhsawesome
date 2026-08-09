#!/usr/bin/env node
/*
 * Visible-text parity check (the phase-4 pattern): extracts the rendered
 * text of every built page, one digest line per file, so an emitter change
 * can prove it didn't alter what the book SAYS.
 *
 * Usage:
 *   node migration-tools/text-parity.mjs > /tmp/text-before.txt
 *   ...change emitters, node builder/build.ts...
 *   node migration-tools/text-parity.mjs > /tmp/text-after.txt
 *   diff /tmp/text-before.txt /tmp/text-after.txt
 *
 * Extraction is tag-stripping (scripts/styles dropped, entities decoded,
 * whitespace collapsed) — crude as a renderer but exact as a comparator
 * between two near-identical trees.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.join(import.meta.dirname, '..', 'build', 'site');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, ' ') // starter code, not prose
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    // Tag boundaries become spaces above, so dissolving an inline wrapper
    // around punctuation ("2.1.5<span>.</span>" -> "2.1.5.") would read
    // as a text change when the rendering is identical. Normalize space
    // before punctuation away.
    .replace(/ ([.,;:!?])/g, '$1')
    .trim();
}

for (const f of walk(SITE).sort()) {
  const text = visibleText(fs.readFileSync(f, 'utf8'));
  const digest = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  console.log(`${digest}  ${path.relative(SITE, f)}`);
}
