/*
 * Ids and block numbering (the rest of the cheap global pass).
 *
 * Ids: PreTeXt's scheme, which we must match for deep-link and phase-2
 * state stability — an element without xml:id is identified as
 * `<nearest labeled ancestor's id>-<i>-<j>-...`, the 1-based indices of the
 * element-child path from that ancestor.
 *
 * Numbers: every "numbered block" (activity, project, figure, table,
 * listing, note, exercise) shares ONE serial counter per section-level
 * division, prefixed with the section number — Activity 2.1.9 and Figure
 * 2.1.5 count each other. Subsections are numbered separately.
 */

import type { Division } from './book.ts';
import { type XmlElement, elements, xmlId } from './xml.ts';

const idCache = new WeakMap<XmlElement, string>();

export function elementId(el: XmlElement): string {
  const cached = idCache.get(el);
  if (cached) return cached;
  // A Runestone @label works like xml:id for id derivation: the activity
  // article renders as id="<label>" and its descendants' auto-ids hang off
  // it (statement paras like "asgn_order-1-1").
  const own = xmlId(el) ?? el.attributes.label;
  if (own) {
    idCache.set(el, own);
    return own;
  }
  const parent = el.parent;
  if (!(parent instanceof Object) || parent.constructor.name === 'XmlDocument') {
    return 'root';
  }
  const p = parent as XmlElement;
  const index = elements(p).indexOf(el) + 1;
  const id = `${elementId(p)}-${index}`;
  idCache.set(el, id);
  return id;
}

export const NUMBERED_BLOCKS = new Set([
  'activity',
  'project',
  'exercise',
  'figure',
  'table',
  'listing',
  'note',
]);

const numbers = new WeakMap<XmlElement, string>();

export function blockNumber(el: XmlElement): string | undefined {
  return numbers.get(el);
}

/** Walk a section-level division assigning serial numbers to its blocks. */
export function numberBlocks(division: Division): void {
  // Unnumbered page divisions still number their blocks: preface blocks
  // count as "0.0.N", a chapter introduction's as "<chapter>.0.N".
  let prefix = division.number;
  if (!prefix) {
    let chapter: typeof division.parent = division.parent;
    while (chapter && chapter.kind !== 'chapter') chapter = chapter.parent;
    prefix = chapter?.number ? `${chapter.number}.0` : '0.0';
  }
  let serial = 0;
  const walk = (el: XmlElement): void => {
    for (const c of elements(el)) {
      if (NUMBERED_BLOCKS.has(c.name)) {
        serial += 1;
        numbers.set(c, `${prefix}.${serial}`);
        // Blocks don't nest their own numbered blocks in this book
        // (figures inside activities render unnumbered on Runestone), but
        // walking in keeps us honest if they do.
        walk(c);
      } else {
        walk(c);
      }
    }
  };
  walk(division.el);
}
