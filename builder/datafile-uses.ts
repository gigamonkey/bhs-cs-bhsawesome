/*
 * Print the live book's activecode datafile usage as JSON on stdout:
 *
 *     { "<label>": ["file", ...], ... }
 *
 * Consumed by extract-datafiles.py (which turns the non-jar entries into
 * book-tests/<label>.datafiles manifests for the monorepo jar). This walks
 * the assembled source model — main.ptx and its includes — so dead legacy
 * trees are excluded and no rendered pages are involved.
 */

import { config } from './bhsawesome.ts';
import { loadBook } from './src/book.ts';
import { setConfig } from './src/config.ts';
import { attr, elements, type XmlElement } from './src/xml.ts';

setConfig(config);
const book = loadBook(config.mainPtx);

const uses: Record<string, string[]> = {};

function componentLabel(el: XmlElement): string | undefined {
  for (let e: XmlElement | undefined = el; e; e = e.parent as XmlElement | undefined) {
    const label = attr(e, 'label');
    if (label) return label;
  }
  return undefined;
}

function walk(el: XmlElement): void {
  if (el.name === 'program') {
    const datafile = attr(el, 'datafile');
    if (datafile) {
      const label = componentLabel(el);
      if (!label) {
        console.error(`WARN: <program> with datafile="${datafile}" has no label in scope`);
      } else {
        uses[label] = datafile.split(',').map((f) => f.trim()).filter(Boolean);
      }
    }
  }
  for (const c of elements(el)) walk(c);
}

walk(book.bookEl);
console.log(JSON.stringify(uses, null, 1));
