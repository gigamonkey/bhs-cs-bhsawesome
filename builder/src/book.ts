/*
 * The book model — the "cheap global pass" of the bespoke build
 * (plans/rehost-bhsawesome.md 3a): assemble the xi:include tree, assign
 * PreTeXt-compatible ids and numbers, and enumerate the pages (chunk level
 * 2: every chapter-level child — introduction, section — is a page; the
 * chapter page is a linked summary).
 *
 * Id scheme (must match PreTeXt so deep links and phase-2 exercise state
 * survive the build swap): an element without xml:id gets
 * `<nearest labeled ancestor's id>-<path>` where path is its 1-based index
 * among the parent's ELEMENT children (title included), repeated per level.
 */

import { getConfig } from './config.ts';
import { type XmlElement, attr, child, elements, loadXml, textContent, xmlId } from './xml.ts';

export type Division = {
  el: XmlElement;
  kind: 'book' | 'frontmatter' | 'preface' | 'chapter' | 'introduction' | 'conclusion' | 'section' | 'subsection' | 'page';
  id: string;
  title: string;
  number: string | null; // "2", "2.1", "2.1.3"; null = unnumbered
  // The extensionless URL path if this division starts a page — its
  // ancestor page-divisions' ids joined with '/' (e.g. "introduction",
  // "introduction/intro-to-java"). urls.ts turns it into the served URL
  // and the on-disk <path>/index.html.
  page: string | null;
  parent: Division | null;
  children: Division[];
};

export type Book = {
  root: XmlElement; // <pretext>
  bookEl: XmlElement; // <book>
  title: string;
  divisions: Division; // the book division tree
  pages: Division[]; // in book order (page-starting divisions)
  byId: Map<string, { division: Division; pageOf: Division }>;
  // EVERY xml:id'd element (figures, activities, ...) -> its element and
  // the page it renders on; divisions appear here too.
  labels: Map<string, { el: XmlElement; pageOf: Division }>;
};

const DIVISION_KINDS = new Set(['frontmatter', 'preface', 'chapter', 'introduction', 'section', 'subsection', 'page']);

/** Assign the PreTeXt positional auto-id. */
export function autoId(el: XmlElement, parentId: string): string {
  const parent = el.parent;
  if (!(parent instanceof Object) || !('children' in parent)) return parentId;
  const sibs = elements(parent as XmlElement);
  const index = sibs.indexOf(el) + 1;
  return `${parentId}-${index}`;
}

export function idOf(el: XmlElement, parentId: string): string {
  return xmlId(el) ?? autoId(el, parentId);
}

export function titleOf(el: XmlElement): string {
  const t = child(el, 'title');
  return t ? textContent(t).replace(/\s+/g, ' ').trim() : '';
}

export function loadBook(mainPtx: string): Book {
  const root = loadXml(mainPtx);
  const bookEl = child(root, 'book');
  if (!bookEl) throw new Error('no <book> in main.ptx');

  const bookDiv: Division = {
    el: bookEl,
    kind: 'book',
    id: xmlId(bookEl) ?? 'book',
    title: titleOf(bookEl),
    number: null,
    page: null,
    parent: null,
    children: [],
  };

  let chapterNum = 0;
  const walk = (el: XmlElement, parent: Division, numberPrefix: string | null): void => {
    for (const c of elements(el)) {
      if (!DIVISION_KINDS.has(c.name)) continue;
      const kind = c.name as Division['kind'];
      const id = idOf(c, parent.id);
      let number: string | null = null;
      if (kind === 'chapter') {
        chapterNum += 1;
        number = String(chapterNum);
      } else if (kind === 'section' || kind === 'subsection' || kind === 'page') {
        const numberedSibs = parent.children.filter((d) => d.kind === kind && d.number !== null);
        number = numberPrefix === null ? null : `${numberPrefix}.${numberedSibs.length + 1}`;
      }
      const division: Division = {
        el: c,
        kind,
        id,
        title: titleOf(c),
        number,
        page: null,
        parent,
        children: [],
      };
      parent.children.push(division);
      walk(c, division, number ?? (kind === 'frontmatter' || kind === 'preface' ? null : numberPrefix));
    }
  };
  walk(bookEl, bookDiv, null);

  // Chunking (config.chunkDepth, default 2): frontmatter + its children
  // and every division at or above the chunk depth start pages; deeper
  // divisions render inline. At the default depth of 2, chapters and every
  // chapter-level child (introduction, section) are pages and subsections
  // are inline; at 3 (e.g. BJC's unit/lab/page) the third level is pages
  // too. A division's introduction NEVER starts a page — our schema
  // (restoring the pre-PreTeXt-2.47 shape) renders it ON the division's
  // own page (frontmatter's under the book title, a chapter's on its
  // contents page).
  const chunkDepth = getConfig().chunkDepth ?? 2;
  const pages: Division[] = [];
  const assignPages = (d: Division): void => {
    const depth = divisionDepth(d);
    // Subsections are always in-page headings, whatever their depth (a
    // book-level page's h2 chunks sit at depth 2 under chunkDepth 3).
    const startsPage =
      (d.kind === 'frontmatter' || (depth <= chunkDepth && d.kind !== 'book')) &&
      d.kind !== 'introduction' &&
      d.kind !== 'subsection';
    if (startsPage) {
      // Nested under the closest ancestor page (sections under their
      // chapter, prefaces under frontmatter); chapters and frontmatter
      // hang off the root. The URL segment is @slug when present, else
      // the xml:id — BJC's labs share slugs (every unit has a lab-1)
      // while xml:ids stay globally unique.
      const segment = attr(d.el, 'slug') ?? d.id;
      d.page = d.parent?.page ? `${d.parent.page}/${segment}` : segment;
      pages.push(d);
    }
    for (const c of d.children) assignPages(c);
  };
  assignPages(bookDiv);

  const byId = new Map<string, { division: Division; pageOf: Division }>();
  const index = (d: Division, pageOf: Division): void => {
    const owner = d.page ? d : pageOf;
    byId.set(d.id, { division: d, pageOf: owner });
    for (const c of d.children) index(c, owner);
  };
  index(bookDiv, bookDiv);

  // Every labeled element, attributed to the page it renders on.
  const elToDivision = new Map<XmlElement, Division>();
  const collectEls = (d: Division): void => {
    elToDivision.set(d.el, d);
    for (const c of d.children) collectEls(c);
  };
  collectEls(bookDiv);

  const labels = new Map<string, { el: XmlElement; pageOf: Division }>();
  const walkLabels = (el: XmlElement, pageOf: Division): void => {
    const division = elToDivision.get(el);
    const cur = division?.page ? division : pageOf;
    const id = xmlId(el);
    if (id !== undefined) labels.set(id, { el, pageOf: cur });
    for (const c of elements(el)) walkLabels(c, cur);
  };
  walkLabels(bookEl, bookDiv);

  return { root, bookEl, title: bookDiv.title, divisions: bookDiv, pages, byId, labels };
}

function divisionDepth(d: Division): number {
  let depth = 0;
  let cur: Division | null = d;
  while (cur && cur.kind !== 'book') {
    depth += 1;
    cur = cur.parent;
  }
  return depth;
}
