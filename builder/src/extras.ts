/*
 * The non-division outputs: contents/backmatter/index pages, the redirect,
 * standalone video pages, xref knowl pages, exercises.json, and the lunr
 * search corpus (plans/rehost-bhsawesome.md 3a global features).
 */

import fs from 'node:fs';
import path from 'node:path';
import lunr from 'lunr';
import type { Book, Division } from './book.ts';
import { escapeHtml, h } from './html.ts';
import { NUMBERED_BLOCKS, blockNumber, elementId } from './ids.ts';
import { type Ctx, emitElement, isInteractive, smartQuotes } from './prose.ts';
import { type XmlElement, child, elements, isElement, textContent, xmlId } from './xml.ts';

const CHROME = fs.readFileSync(path.join(import.meta.dirname, '..', 'chrome.html'), 'utf8');
const CHROME_HEAD = CHROME.slice(0, CHROME.indexOf('</head>'));

// -- contents / backmatter / redirect ----------------------------------------

function summaryLi(href: string, number: string | null, title: string): string {
  const label = [
    number ? h('span', { class: 'codenumber' }, escapeHtml(number)) : '',
    h('span', { class: 'title' }, escapeHtml(title)),
  ]
    .filter(Boolean)
    .join(' ');
  return h('li', {}, h('a', { href, class: 'internal' }, label));
}

export function contentsPageContent(book: Book): string {
  const items = book.divisions.children.map((d) =>
    summaryLi(d.page as string, d.number, d.title || (d.kind === 'frontmatter' ? 'Front Matter' : d.title)),
  );
  items.push(summaryLi('backmatter.html', null, 'Back Matter'));
  return h(
    'section',
    { class: 'book', id: book.divisions.id },
    h('h1', { class: 'heading ptx-toc-heading' }, 'Contents'),
    h('nav', { class: 'summary-links' }, h('ul', {}, items.join('\n'))),
  );
}

export function backmatterContent(book: Book, ctx: Ctx): string {
  // The index and the colophon get their own pages; any OTHER backmatter
  // child renders inline here through the normal emitters (warning if
  // unknown).
  const backmatter = elements(book.bookEl).find((c) => c.name === 'backmatter');
  const inner: string[] = [];
  const links: string[] = [];
  for (const c of backmatter ? elements(backmatter) : []) {
    if (c.name === 'index') links.push(summaryLi('book-index.html', null, 'Index'));
    else if (c.name === 'colophon') links.push(summaryLi('colophon.html', null, 'Colophon'));
    else inner.push(emitElement(c, ctx));
  }
  return h(
    'section',
    { class: 'backmatter', id: 'backmatter' },
    h('h1', { class: 'heading ptx-backmatter-heading' }, 'Back Matter'),
    h('nav', { class: 'summary-links' }, h('ul', {}, links.join('\n'))),
    inner.join('\n'),
  );
}

/** The colophon's own page (linked under Back Matter in the ToC). */
export function colophonContent(book: Book, ctx: Ctx): string {
  const backmatter = elements(book.bookEl).find((c) => c.name === 'backmatter');
  const colophon = backmatter && elements(backmatter).find((c) => c.name === 'colophon');
  if (!colophon) return '';
  return h(
    'section',
    { class: 'colophon', id: elementId(colophon) },
    h('h1', { class: 'heading' }, h('span', { class: 'type' }, 'Colophon')),
    elements(colophon)
      .map((e) => emitElement(e, ctx))
      .join('\n'),
  );
}

export function redirectPage(): string {
  const metas = CHROME_HEAD.match(/<meta (?:property|name)="(?:og|book|twitter)[^>]*>/g) ?? [];
  return `<!DOCTYPE html>
<html>
<head xmlns:og="http://ogp.me/ns#" xmlns:book="https://ogp.me/ns/book#">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta http-equiv="refresh" content="0; URL='bhsawesome.html'">
${metas.join('\n')}
</head>
<body>
</body>
</html>
`;
}

// -- the index page (from <idx> elements) ------------------------------------

type IndexEntry = { heading: string; sub: string | null; page: string; type: string; number: string | null; title: string };

export function collectIndexEntries(book: Book): IndexEntry[] {
  const out: IndexEntry[] = [];
  // Track the nearest enclosing DIVISION (subsections included — index
  // links are subsection-granular; auto-id'd subsections count) and the
  // nearest page.
  const elToDivision = new Map<XmlElement, Division>();
  const collectDivs = (d: Division): void => {
    // Introductions/conclusions attribute their entries to the parent.
    if (d.kind !== 'introduction' && d.kind !== 'conclusion') elToDivision.set(d.el, d);
    for (const c of d.children) collectDivs(c);
  };
  collectDivs(book.divisions);
  const walk = (el: XmlElement, division: Division, page: Division): void => {
    for (const c of elements(el)) {
      const d = elToDivision.get(c);
      const curDiv = d ?? division;
      const curPage = curDiv.page ? curDiv : page;
      if (c.name === 'idx') {
        const hs = elements(c, 'h');
        const clean = (s: string) => smartQuotes(s.replace(/\s+/g, ' ').trim());
        const heading = clean(hs.length ? textContent(hs[0]) : textContent(c));
        const sub = hs.length > 1 ? clean(textContent(hs[1])) : null;
        out.push({
          heading,
          sub,
          page: curDiv.page ?? `${curPage.page}#${curDiv.id}`,
          type: curDiv.kind.charAt(0).toUpperCase() + curDiv.kind.slice(1),
          number: curDiv.number,
          title: curDiv.title,
        });
      } else {
        walk(c, curDiv, curPage);
      }
    }
  };
  walk(book.bookEl, book.divisions, book.divisions);
  return out;
}

export function bookIndexContent(book: Book): string {
  const entries = collectIndexEntries(book);
  // Group: heading -> sub -> links, alphabetical (symbols first, then
  // digits, then letters case-insensitively).
  const sortKey = (s: string) => s.toLowerCase();
  const byHeading = new Map<string, Map<string, IndexEntry[]>>();
  for (const e of entries) {
    const subs = byHeading.get(e.heading) ?? new Map<string, IndexEntry[]>();
    const list = subs.get(e.sub ?? '') ?? [];
    list.push(e);
    subs.set(e.sub ?? '', list);
    byHeading.set(e.heading, subs);
  }
  // Plain ASCII order on the folded key ("!" < "2" < "<" < "=" < ">" < a-z),
  // matching PreTeXt's grouping.
  const asciiCmp = (a: string, b: string) =>
    sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : a < b ? -1 : a > b ? 1 : 0;
  const headings = [...byHeading.keys()].sort(asciiCmp);
  const letters: string[] = [];
  let currentLetter = '';
  let letterItems: string[] = [];
  const flush = () => {
    if (currentLetter !== '' && letterItems.length) {
      letters.push(
        h('div', { class: 'indexletter', id: `indexletter-${currentLetter}` }, letterItems.join('\n')),
      );
    }
    letterItems = [];
  };
  // One indexknowl span holds ALL of an item's links, space-separated.
  const knowlLinks = (list: IndexEntry[]): string =>
    h(
      'span',
      { class: 'indexknowl' },
      ' ',
      list
        .map((e) =>
          h(
            'a',
            {
              href: e.page,
              class: 'internal',
              title: e.number ? `${e.type} ${e.number}: ${e.title}` : e.title || e.type,
            },
            escapeHtml(e.type),
          ),
        )
        .join(' '),
    );
  for (const heading of headings) {
    const letter = sortKey(heading).charAt(0);
    if (letter !== currentLetter) {
      flush();
      currentLetter = letter;
    }
    const subs = byHeading.get(heading) as Map<string, IndexEntry[]>;
    const top = subs.get('') ?? [];
    if (subs.size === 1 && top.length) {
      letterItems.push(h('div', { class: 'indexitem' }, escapeHtml(heading), knowlLinks(top)));
    } else {
      letterItems.push(h('div', { class: 'indexitem' }, escapeHtml(heading), top.length ? knowlLinks(top) : ''));
      for (const sub of [...subs.keys()].filter((s) => s !== '').sort(asciiCmp)) {
        letterItems.push(
          h('div', { class: 'subindexitem' }, escapeHtml(sub), knowlLinks(subs.get(sub) as IndexEntry[])),
        );
      }
    }
  }
  flush();
  return h(
    'section',
    { class: 'index', id: 'book-index' },
    `<h1 class="heading hide-type">\n<span class="type">Index</span> <span class="codenumber"></span> <span class="title">Index</span>\n</h1>`,
    letters.join('\n'),
  );
}

// -- standalone video pages ---------------------------------------------------

export function videoPage(label: string, youtube: string): string {
  return `${CHROME_HEAD}</head>
<body class="pretext book">
<div class="ptx-page"><main class="ptx-main"><div id="ptx-content">
<div style="text-align: center;">Reloading this page will reset a start location</div>
<div class="video-box" style="width: 100%;padding-top: 56.25%;"><iframe allowfullscreen="" src="https://www.youtube-nocookie.com/embed/${escapeHtml(youtube)}?&amp;modestbranding=1&amp;rel=0&amp;autoplay=1" id="${escapeHtml(label)}"></iframe></div>
</div></main></div>
</body>
</html>
`;
}

export function collectVideos(book: Book): { label: string; youtube: string }[] {
  const out: { label: string; youtube: string }[] = [];
  const walk = (el: XmlElement): void => {
    for (const c of elements(el)) {
      if (c.name === 'video' && c.attributes.youtube) {
        out.push({ label: c.attributes.label ?? elementId(c), youtube: c.attributes.youtube });
      }
      walk(c);
    }
  };
  walk(book.bookEl);
  return out;
}

// -- exercises.json -----------------------------------------------------------
//
// Derived from the EMITTED pages (the same way land.py derived it from the
// landed PreTeXt pages): Runestone components by data-component, converted
// activecode widgets by their container.

const EXERCISE_TYPES = new Set([
  'activecode',
  'parsons',
  'hparsons',
  'multiplechoice',
  'clickablearea',
  'fillintheblank',
  'dragndrop',
  'shortanswer',
]);

const COMPONENT_TAG_RE = /<\w+[^>]*data-component="([a-z-]+)"[^>]*>/g;
const WIDGET_RE = /<div class="bhs-book-exercise" id="([^"]+)" data-testclass="([^"]+)"/g;
const ID_RE = /id="([^"]*)"/;

export function pageExercises(html: string): { id: string; type: string; testClass?: string }[] {
  const found: [number, { id: string; type: string; testClass?: string }][] = [];
  for (const m of html.matchAll(COMPONENT_TAG_RE)) {
    if (!EXERCISE_TYPES.has(m[1])) continue;
    const idm = ID_RE.exec(m[0]);
    if (idm) found.push([m.index ?? 0, { id: idm[1], type: m[1] }]);
  }
  for (const m of html.matchAll(WIDGET_RE)) {
    const e: { id: string; type: string; testClass?: string } = { id: m[1], type: 'activecode' };
    if (!m[2].startsWith('book-run:')) e.testClass = m[2];
    found.push([m.index ?? 0, e]);
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a[0] - b[0])
    .filter(([, e]) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map(([, e]) => e);
}

// -- lunr search corpus -------------------------------------------------------

export function lunrIndexJs(book: Book): string {
  type Doc = { id: string; level: string; url: string; type: string; number: string; title: string; body: string };
  const docs: Doc[] = [];
  const flat = (el: XmlElement): string => ` ${textContent(el).replace(/\s+/g, ' ').trim()} `;
  const TYPE: Record<string, string> = {
    activity: 'Activity',
    project: 'Project',
    exercise: 'Activity',
    figure: 'Figure',
    table: 'Table',
    listing: 'Listing',
    note: 'Note',
  };
  for (const division of book.pages) {
    if (division.kind === 'frontmatter') continue;
    const kindLabel = division.kind.charAt(0).toUpperCase() + division.kind.slice(1);
    docs.push({
      id: division.id,
      level: '1',
      url: division.page as string,
      type: kindLabel,
      number: division.number ?? '',
      title: division.title || 'Introduction',
      body: flat(division.el),
    });
    const walk = (el: XmlElement): void => {
      for (const c of elements(el)) {
        if (division.children.some((d) => d.el === c && d.page)) continue;
        if (NUMBERED_BLOCKS.has(c.name)) {
          const id = elementId(c);
          const titleEl = child(c, 'title') ?? child(c, 'caption');
          const rawTitle = titleEl ? textContent(titleEl).replace(/\s+/g, ' ').trim() : '';
          const title = rawTitle && !/[.?!]$/.test(rawTitle) ? `${rawTitle}.` : rawTitle;
          docs.push({
            id,
            level: '2',
            url: `${division.page}#${id}`,
            type: TYPE[c.name] ?? 'Activity',
            number: blockNumber(c) ?? '',
            title: title || (TYPE[c.name] ?? ''),
            body: flat(c),
          });
        }
        walk(c);
      }
    };
    walk(division.el);
  }
  docs.push({
    id: 'book-index',
    level: '1',
    url: 'book-index.html',
    type: 'Index',
    number: '',
    title: 'Index',
    body: ' Index ',
  });
  // Prebuild the index HERE (phase 5): the browser was re-indexing the
  // whole corpus (var ptx_lunr_idx = lunr(...) over ptx_lunr_docs) on
  // EVERY page load. Now the serialized index ships and the page only
  // does lunr.Index.load() — parse, not re-index. ptx_lunr_docs still
  // ships (pretext_search.js reads it for result titles + clip text).
  // The field/ref/whitelist config must match what the search JS expects.
  const idx = lunr(function () {
    this.ref('id');
    this.field('title');
    this.field('body');
    this.metadataWhitelist = ['position'];
    for (const doc of docs) this.add(doc);
  });
  const json = docs.map((d) => JSON.stringify(d)).join(',\n');
  return `var ptx_lunr_search_style = "textbook";
var ptx_lunr_docs = [
${json}
]

var ptx_lunr_idx = lunr.Index.load(${JSON.stringify(idx)})
`;
}
