#!/usr/bin/env node
/*
 * Keyword hygiene for the ptx source: <k> is the schema's "single Java
 * keyword" element (bhsawesome-next-steps.md phase 3), <c> is general
 * inline code.
 *
 *  1. Any <c> whose entire content is one Java keyword becomes <k>.
 *     (Only attribute-less, plain-text <c>; anything else is left alone.)
 *  2. Any <k> whose content is NOT exactly one Java keyword is reported
 *     as a violation (exit 1).
 *
 * Idempotent: a clean re-run converts nothing and reports nothing.
 *
 * Usage: node fix-keywords.mjs [--check]   (--check: report, don't write)
 */

import fs from 'node:fs';
import path from 'node:path';

// The reserved words of the Java language (JLS 3.9), including the
// unused const and goto. Deliberately NOT the literals true/false/null,
// which stay <c>.
const KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while',
]);

const check = process.argv.includes('--check');

function* ptxFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* ptxFiles(p);
    else if (e.name.endsWith('.ptx')) yield p;
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

let converted = 0;
const violations = [];
for (const file of ptxFiles('pretext')) {
  const text = fs.readFileSync(file, 'utf8');

  // 1. <c>keyword</c> -> <k>keyword</k> (plain-text content only —
  // [^<] refuses element content — with inner whitespace preserved).
  let fileCount = 0;
  const fixed = text.replace(/<c>(\s*)([^<\s]+)(\s*)<\/c>/g, (m, pre, word, post) =>
    KEYWORDS.has(word) ? (fileCount++, `<k>${pre}${word}${post}</k>`) : m,
  );
  if (fileCount) {
    converted += fileCount;
    console.log(`${path.relative('.', file)}: ${fileCount} <c> -> <k>`);
    if (!check) fs.writeFileSync(file, fixed);
  }

  // 2. Every <k> must hold exactly one Java keyword.
  const scan = check ? text : fixed;
  for (const m of scan.matchAll(/<k(?:\s[^>]*)?>([\s\S]*?)<\/k>/g)) {
    if (!KEYWORDS.has(m[1].trim())) {
      violations.push(`${path.relative('.', file)}:${lineOf(scan, m.index)}: <k>${m[1].trim()}</k>`);
    }
  }
}

console.log(`${converted} conversion(s)${check ? ' (--check: nothing written)' : ''}`);
if (violations.length) {
  console.error(`\n${violations.length} <k> element(s) not holding a single Java keyword:`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
