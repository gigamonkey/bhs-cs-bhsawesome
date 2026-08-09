/*
 * Page assembly against the extracted chrome template (builder/chrome.html
 * — the landed PreTeXt chrome with slots, land.py's transforms baked in).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Book, Division } from './book.ts';
import { escapeHtml, h } from './html.ts';

const TEMPLATE = fs.readFileSync(path.join(import.meta.dirname, '..', 'chrome.html'), 'utf8');

const ICON = (code: string) =>
  `<span class="icon material-symbols-outlined" aria-hidden="true">${code}</span>`;

function navAnchor(
  cls: 'previous-button' | 'up-button' | 'next-button',
  target: string | null,
  label: string,
  title: string,
  icon: string,
  iconAfter: boolean,
): string {
  const name = `<span class="name">${label}</span>`;
  const inner = iconAfter ? `${name}${ICON(icon)}` : `${ICON(icon)}${name}`;
  if (!target) return `<span class="${cls} button disabled">${inner}</span>`;
  return `<a class="${cls} button" href="${target}" title="${title}">${inner}</a>`;
}

export function treeButtons(prev: string | null, up: string | null, next: string | null): string {
  return (
    navAnchor('previous-button', prev, 'Prev', 'Previous', '&#xe5cb;', false) +
    navAnchor('up-button', up, 'Up', 'Up', '&#xe5ce;', false) +
    navAnchor('next-button', next, 'Next', 'Next', '&#xe5cc;', true)
  );
}

export type PageNav = { prev: string | null; up: string | null; next: string | null };

export function renderChrome(
  book: Book,
  page: string,
  title: string,
  content: string,
  nav: PageNav,
): string {
  const buttons = treeButtons(nav.prev, nav.up, nav.next);
  return TEMPLATE.replace('{{TITLE}}', escapeHtml(title))
    .replace('{{TREEBUTTONS}}', () => buttons)
    .replace('{{TREEBUTTONS_FOOTER}}', () => buttons)
    .replace('{{CONTENT}}', () => content);
}

/** prev/up/next for a division page from the book-order page sequence. */
export function navFor(book: Book, sequence: string[], page: string, upOf: Map<string, string | null>): PageNav {
  const i = sequence.indexOf(page);
  return {
    prev: i > 0 ? sequence[i - 1] : null,
    next: i >= 0 && i < sequence.length - 1 ? sequence[i + 1] : null,
    up: upOf.get(page) ?? null,
  };
}
