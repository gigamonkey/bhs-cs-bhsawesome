/*
 * Page assembly: division content rendering + the (deliberately simple)
 * page chrome. The chrome replaces PreTeXt's theme machinery; the content
 * area keeps PreTeXt's class vocabulary (see prose.ts).
 */

import type { Book, Division } from './book.ts';
import { emitComponent } from './components.ts';
import { escapeHtml, h } from './html.ts';
import { elementId } from './ids.ts';
import { type Ctx, emitChildren, emitElement, headingSpans, isInteractive } from './prose.ts';
import { type XmlElement, elements } from './xml.ts';

const DIVISION_KINDS = new Set(['introduction', 'section', 'subsection', 'conclusion']);

export function makeCtx(book: Book, page: string, warn: (msg: string) => void): Ctx {
  return { book, page, headingLevel: 1, olMarkers: new Map(), emitComponent, warn };
}

/** The content area of one page. */
export function pageContent(division: Division, ctx: Ctx): string {
  if (division.kind === 'chapter') return chapterSummaryPage(division, ctx);
  if (division.kind === 'frontmatter') return frontmatterPage(division, ctx);
  return divisionSection(division, ctx, 1, true);
}

/** Frontmatter page: book title/subtitle + links to the frontmatter pages. */
function frontmatterPage(d: Division, ctx: Ctx): string {
  const subtitle = ctx.book.bookEl.children.find(
    (c) => c instanceof Object && 'name' in c && (c as XmlElement).name === 'subtitle',
  );
  const heading = h(
    'h1',
    { class: 'heading' },
    h('span', { class: 'title' }, escapeHtml(ctx.book.title)),
    subtitle ? h('span', { class: 'subtitle' }, escapeHtml(titleText(subtitle as XmlElement))) : '',
  );
  return h(
    'section',
    { class: 'frontmatter', id: d.id },
    heading,
    summaryLinks(d),
    autopermalinkFor(d.id, 'Front Matter'),
  );
}

const KIND_LABELS: Record<string, string> = {
  chapter: 'Chapter',
  section: 'Section',
  subsection: 'Subsection',
  introduction: 'Introduction',
  preface: 'Preface',
};

function divisionSection(d: Division, ctx: Ctx, level: number, isPageRoot: boolean): string {
  // Inline introductions/conclusions are anonymous — no heading (only the
  // chapter-level introduction PAGE gets one).
  const headingless = (d.kind === 'introduction' || d.kind === 'conclusion') && !isPageRoot;
  const titleEl = d.el.children.find((c) => c instanceof Object && 'name' in c && c.name === 'title');
  const titleHtml = titleEl ? emitChildren(titleEl as XmlElement, ctx).replace(/\s+/g, ' ').trim() : escapeHtml(d.title);
  const heading = headingless
    ? ''
    : h(
        `h${Math.min(6, level)}`,
        { class: `heading${d.title ? ' hide-type' : ''}` },
        d.kind === 'introduction' && !d.title
          ? h('span', { class: 'type' }, 'Introduction')
          : headingSpans(KIND_LABELS[d.kind] ?? d.kind, d.number, titleHtml, ctx),
      );
  const inner: string[] = [heading];
  const subCtx: Ctx = { ...ctx, headingLevel: level };
  for (const c of elements(d.el)) {
    if (c.name === 'title') continue;
    const childDivision = d.children.find((cd) => cd.el === c);
    if (childDivision) {
      if (childDivision.page && !isPageRoot) continue; // separate page
      if (childDivision.page && isPageRoot) continue;
      inner.push(divisionSection(childDivision, ctx, level + 1, false));
    } else if (DIVISION_KINDS.has(c.name)) {
      // introduction/conclusion at section level render inline as
      // anonymous sub-divisions.
      inner.push(h('section', { class: c.name, id: elementId(c) }, blocksOf(c, subCtx)));
    } else {
      inner.push(isInteractive(c) ? ctx.emitComponent(c, subCtx) : emitElement(c, subCtx));
    }
  }
  return h('section', { class: d.kind === 'subsection' ? 'subsection' : d.kind, id: d.id }, inner.join('\n'));
}

function blocksOf(el: XmlElement, ctx: Ctx): string {
  return elements(el)
    .filter((c) => c.name !== 'title')
    .map((c) => (isInteractive(c) ? ctx.emitComponent(c, ctx) : emitElement(c, ctx)))
    .join('\n');
}

function summaryLinks(d: Division): string {
  const items = d.children
    .filter((c) => c.page)
    .map((c) =>
      h(
        'li',
        {},
        h(
          'a',
          { href: c.page as string, class: 'internal' },
          h(
            'span',
            { class: 'title' },
            c.number ? `${escapeHtml(c.number)} ${escapeHtml(c.title)}` : escapeHtml(c.title || 'Introduction'),
          ),
        ),
      ),
    )
    .join('\n');
  return h('nav', { class: 'summary-links' }, h('ul', {}, items));
}

function titleText(el: XmlElement): string {
  let out = '';
  for (const c of el.children) {
    if ('text' in c) out += (c as { text: string }).text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function autopermalinkFor(id: string, description: string): string {
  return h(
    'div',
    { class: 'autopermalink', 'aria-hidden': 'true', 'data-description': description },
    h(
      'a',
      {
        tabindex: '-1',
        href: `#${id}`,
        title: `Copy heading and permalink for ${description}`,
        'aria-label': `Copy heading and permalink for ${description}`,
      },
      '🔗',
    ),
  );
}

/** Chapter page: heading + linked summary of its page-children. */
function chapterSummaryPage(d: Division, ctx: Ctx): string {
  const heading = h(
    'h1',
    { class: 'heading hide-type' },
    headingSpans('Chapter', d.number, escapeHtml(d.title), ctx),
  );
  return h('section', { class: 'chapter', id: d.id }, heading, summaryLinks(d));
}

// -- Chrome ------------------------------------------------------------------

export function renderPage(division: Division, ctx: Ctx, book: Book): string {
  const content = pageContent(division, ctx);
  const title = division.title || book.title;
  const prev = neighbor(book, division, -1);
  const next = neighbor(book, division, +1);
  const nav = h(
    'nav',
    { class: 'ptx-navbar', id: 'ptx-navbar' },
    prev ? h('a', { class: 'previous-button button', href: prev.page as string }, 'Prev') : '',
    h('a', { class: 'up-button button', href: 'index.html' }, 'Top'),
    next ? h('a', { class: 'next-button button', href: next.page as string }, 'Next') : '',
  );
  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - ${escapeHtml(book.title)}</title>
<link rel="stylesheet" type="text/css" href="_static/bhs-book.css">
<link rel="stylesheet" type="text/css" href="external/_static/css/custom.css">
</head>
<body class="pretext book">
<header class="ptx-masthead" id="ptx-masthead">
<div class="ptx-banner"><div class="title-container"><h1 class="heading"><a href="index.html"><span class="title">${escapeHtml(book.title)}</span></a></h1></div></div>
</header>
${nav}
<div class="ptx-page">
<main class="ptx-main">
<div id="ptx-content" class="ptx-content">
${content}
</div>
</main>
</div>
</body>
</html>
`;
}

function neighbor(book: Book, d: Division, delta: number): Division | null {
  const i = book.pages.indexOf(d);
  if (i === -1) return null;
  return book.pages[i + delta] ?? null;
}
