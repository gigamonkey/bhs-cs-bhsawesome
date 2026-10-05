/*
 * Print a book's activecode datafile usage as JSON on stdout:
 *
 *     node scripts/datafile-uses.ts <book>
 *     { "<label>": ["file", ...], ... }
 *
 * Consumed by extract-datafiles.py (which turns the non-jar entries into
 * book-tests/<label>.datafiles manifests for the monorepo jar). This walks
 * the assembled source model — main.ptx and its includes — so dead legacy
 * trees are excluded and no rendered pages are involved.
 */

import { loadBook as loadBookModel } from '../builder/src/book.ts';
import { setConfig } from '../builder/src/config.ts';
import { attr, elements, type XmlElement } from '../builder/src/xml.ts';
import { loadBook } from './lib/book.ts';

const { config } = await loadBook(process.argv.slice(2), 'usage: node scripts/datafile-uses.ts <book>');
setConfig(config);
const book = loadBookModel(config.mainPtx);

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
