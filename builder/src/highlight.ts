/*
 * Build-time syntax highlighting (phase 5, CDN elimination): Prism runs
 * here in Node, emitting the same .token spans the CDN runtime produced
 * (book.css keeps their colors), so the shipped site has no highlighting
 * runtime. Java is the book's only highlighted language.
 */

import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
import { escapeHtml } from './html.ts';

loadLanguages(['java']);

/** Code -> HTML: token spans for known languages, plain escape otherwise. */
export function highlight(code: string, lang: string): string {
  const grammar = Prism.languages[lang];
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, lang);
}
