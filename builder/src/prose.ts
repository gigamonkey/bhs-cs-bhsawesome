/*
 * Prose emitters: ptx elements → semantic HTML5 wearing what's left of
 * PreTeXt's content-area class vocabulary (the cleanup plan — bhs-cs
 * plans/bhsawesome-css-cleanup.md — is renegotiating it class by class;
 * paragraphs are plain <p>, blocks wear one semantic class each).
 *
 * Interactive components (activities with programs/choices/blocks/...) are
 * NOT handled here — emitComponent in components.ts owns them; during the
 * prose-prototype stage it emits a placeholder the diff harness skips.
 */

import type { Book } from './book.ts';
import { highlight } from './highlight.ts';
import { type Attrs, escapeHtml, h, voidEl } from './html.ts';
import { NUMBERED_BLOCKS, blockNumber, elementId } from './ids.ts';
import { renderMath } from './math.ts';
import { type XmlElement, elements, isElement, isText, textContent } from './xml.ts';

export type Ctx = {
  book: Book;
  page: string; // filename of the page being emitted
  headingLevel: number; // current division's heading level
  // false inside component answers/feedback, where paras render bare.
  permalinks?: boolean;
  emitComponent: (el: XmlElement, ctx: Ctx) => string;
  warn: (msg: string) => void;
};

// Component-bearing blocks: activity/project/exercise whose body is an
// interactive payload rather than prose. Detection: contains one of the
// interactive payload elements.
const INTERACTIVE_PAYLOADS = new Set(['choices', 'blocks', 'areas', 'cardsort', 'fillin', 'response', 'matches', 'datafile']);

export function isInteractive(el: XmlElement): boolean {
  if (!['activity', 'project', 'exercise'].includes(el.name)) return false;
  // A display <program> (no @interactive) is ordinary prose — e.g. the
  // trace-this-loop activities whose only "payload" is a code listing.
  const scan = (e: XmlElement): boolean =>
    e.children.some(
      (c) =>
        isElement(c) &&
        (INTERACTIVE_PAYLOADS.has(c.name) ||
          (c.name === 'program' && c.attributes.interactive !== undefined) ||
          scan(c)),
    );
  return scan(el);
}

// Block-xref targets that need knowl pages emitted (filled during page
// emission, consumed by build.ts).
export const knowlTargets = new Set<string>();

export function autopermalink(id: string, description: string): string {
  // A span, not a div: permalinks live inside <p> now (phase 4), where a
  // div would auto-close the paragraph. The CSS is class-based throughout.
  return h(
    'span',
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

/*
 * Heading markup: only the pieces the CSS actually addresses get spans —
 * .type (hide-type hides it), .codenumber, .title. Separator spaces and
 * periods are plain text (the PreTeXt span wrappers around them had no
 * styling and no consumers).
 */

/**
 * Block headings ("Activity 2.1.7. Variable declarations."): period after
 * the number, title with a period appended (unless it ends in punctuation).
 * `titleHtml` is pre-rendered markup (titles can contain <c> etc).
 */
export function blockHeadingSpans(type: string, number: string | null, titleHtml: string | null): string {
  const parts = [h('span', { class: 'type' }, escapeHtml(type))];
  if (number) {
    parts.push(' ', h('span', { class: 'codenumber' }, escapeHtml(number)));
  }
  parts.push('.');
  if (titleHtml) {
    const t = /[.?!]$/.test(titleHtml) ? titleHtml : `${titleHtml}.`;
    parts.push(' ', h('span', { class: 'title' }, t));
  }
  return parts.join('');
}

/**
 * Figcaption headings keep the period inside the codenumber span and end
 * with a separating space: `Figure <span>2.1.5.</span> `.
 */
export function figcaptionHeading(type: string, number: string | null): string {
  const parts = [h('span', { class: 'type' }, escapeHtml(type))];
  if (number) {
    parts.push(' ', h('span', { class: 'codenumber' }, escapeHtml(number), '.'));
  } else {
    parts.push('.');
  }
  parts.push(' ');
  return parts.join('');
}

/** The "Type N Title" division-heading spans. */
export function headingSpans(type: string | null, number: string | null, title: string | null, ctx: Ctx): string {
  const parts: string[] = [];
  if (type) parts.push(h('span', { class: 'type' }, escapeHtml(type)));
  if (type && number) parts.push(' ');
  if (number) parts.push(h('span', { class: 'codenumber' }, escapeHtml(number)));
  if (title !== null) {
    if (parts.length) parts.push(' ');
    parts.push(h('span', { class: 'title' }, title));
  } else {
    parts.push('.');
  }
  return parts.join('');
}

/*
 * PreTeXt smart-quotes straight quotes in prose text (code contexts
 * excluded — <c>, <pre>, <program> take textContent verbatim): an
 * apostrophe between word characters curls right; double quotes curl by
 * position.
 */
export function smartQuotes(text: string): string {
  // Narrow by observation: apostrophes after a word character curl
  // ("computer's" -> "computer’s", "strings'" -> "strings’"); straight
  // double quotes pass through untouched ("").
  return text.replace(/(\w)'/g, '$1’');
}

export function emitChildren(el: XmlElement, ctx: Ctx): string {
  let out = '';
  let pendingSkip = 0; // chars consumed from the next text node by <m>
  for (let i = 0; i < el.children.length; i++) {
    const c = el.children[i];
    if (isText(c)) {
      out += escapeHtml(smartQuotes(c.text.slice(pendingSkip)));
      pendingSkip = 0;
    } else if (isElement(c) && c.name === 'm') {
      // Sentence punctuation following math is pulled INTO the math
      // (`x\text{.}`) so it can't wrap onto its own line; the TeX then
      // prerenders to a self-contained inline SVG (builder/src/math.ts).
      let math = textContent(c);
      const next = el.children[i + 1];
      if (isText(next)) {
        const punct = next.text.match(/^[.,;:!?]+/)?.[0];
        if (punct) {
          math += `\\text{${punct}}`;
          pendingSkip = punct.length;
        }
      }
      out += renderMath(math, textContent(c));
    } else if (isElement(c)) {
      out += emitElement(c, ctx);
    }
  }
  return out;
}

/** Children that are elements only (block context: whitespace between blocks dropped). */
export function emitBlocks(el: XmlElement, ctx: Ctx): string {
  let out = '';
  for (const c of el.children) {
    if (isElement(c)) out += emitElement(c, ctx);
    else if (isText(c) && c.text.trim() !== '') {
      ctx.warn(`stray text in block context <${el.name}>: ${JSON.stringify(c.text.trim().slice(0, 40))}`);
    }
  }
  return out;
}

const BLOCK_TYPE_NAMES: Record<string, string> = {
  activity: 'Activity',
  project: 'Project',
  exercise: 'Activity',
  figure: 'Figure',
  table: 'Table',
  listing: 'Listing',
  note: 'Note',
  video: 'Video',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function emitElement(el: XmlElement, ctx: Ctx): string {
  // Standalone components outside activity wrappers: <datafile> displays
  // and bare interactive <program>s (run-only demos, embedded codelens).
  if (el.name === 'datafile') return ctx.emitComponent(el, ctx);
  if (el.name === 'program' && el.attributes.interactive) return ctx.emitComponent(el, ctx);
  if (isInteractive(el)) return ctx.emitComponent(el, ctx);
  const emitter = EMITTERS[el.name];
  if (!emitter) {
    ctx.warn(`unhandled element <${el.name}>`);
    return '';
  }
  return emitter(el, ctx);
}

/** Collapse whitespace runs — but never inside <pre>/<textarea> bodies. */
export const trimText = (s: string) =>
  s
    .split(/(<pre[\s\S]*?<\/pre>|<textarea[\s\S]*?<\/textarea>)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\s+/g, ' ')))
    .join('');

type Emitter = (el: XmlElement, ctx: Ctx) => string;

const EMITTERS: Record<string, Emitter> = {
  title: () => '', // consumed by the enclosing division/block emitter

  p: (el, ctx) => {
    const id = elementId(el);
    // Real paragraphs (phase 4): the source guarantees inline-only
    // content — block children live as siblings now. Warn if one sneaks
    // back in (a browser would silently auto-close the <p> around it).
    const block = el.children.find(
      (c) => isElement(c) && ['ul', 'ol', 'dl', 'program', 'pre', 'console', 'blockquote', 'image', 'tabular'].includes(c.name),
    );
    if (block && isElement(block)) ctx.warn(`<p> contains block <${block.name}> — move it out to a sibling`);
    // No class: paragraphs are plain <p>, styled by element; the few
    // script-generated paragraphs opt out in book.css (the
    // runestone_caption exception).
    return h(
      'p',
      { id },
      trimText(emitChildren(el, ctx)).trim(),
      ctx.permalinks === false ? '' : autopermalink(id, 'Paragraph'),
    );
  },

  // -- inline ----------------------------------------------------------------
  // Verbatim: no smart quotes inside code.
  // Inline code is a bare <code>; book.css styles the element (with the
  // highlighted-listing and parsons contexts opted out by class).
  c: (el) => h('code', {}, escapeHtml(trimText(textContent(el)).trim())),
  // Our schema: <k> marks a language KEYWORD, as distinct from general
  // inline code — same rendering as <c> plus the keyword class.
  k: (el) => h('code', { class: 'keyword' }, escapeHtml(trimText(textContent(el)).trim())),
  term: (el, ctx) => h('dfn', { class: 'terminology' }, trimText(emitChildren(el, ctx))),
  em: (el, ctx) => h('em', { class: 'emphasis' }, trimText(emitChildren(el, ctx))),
  // Our schema: <strong> is real bold emphasis (PreTeXt silently dropped
  // it; the browser's native strong rendering is the styling).
  strong: (el, ctx) => h('strong', {}, trimText(emitChildren(el, ctx))),
  pubtitle: (el, ctx) => h('cite', {}, trimText(emitChildren(el, ctx))),
  title_reference: (el, ctx) => h('cite', {}, trimText(emitChildren(el, ctx))),
  // docutils-conversion leftovers: <reference> is an external link,
  // <target> its invisible anchor definition.
  reference: (el, ctx) =>
    h('a', { class: 'external', href: el.attributes.refuri ?? '', target: '_blank' }, trimText(emitChildren(el, ctx))),
  target: () => '',
  url: (el, ctx) => {
    const href = el.attributes.href ?? '';
    const label = el.children.length ? trimText(emitChildren(el, ctx)) : escapeHtml(el.attributes.visual ?? href);
    return h('a', { class: 'external', href, target: '_blank' }, label);
  },
  // Math prerenders at build time (builder/src/math.ts) — no MathJax runtime.
  m: (el) => renderMath(textContent(el)),
  idx: () => '', // index machinery; the index page reads these in its own pass
  xref: (el, ctx) => {
    const ref = el.attributes.ref ?? '';
    const division = ctx.book.byId.get(ref);
    if (division) {
      const d = division.division;
      const typeName = d.kind === 'frontmatter' ? 'Front Matter' : capitalize(d.kind);
      // PreTeXt's default xref text for divisions: "Chapter 8 Classes"
      // (type, number, title), "Type N: Title" in the tooltip; the href is
      // bare when the target starts its page. Unnumbered divisions whose
      // title IS the type ("Preface") don't repeat it; @text="title"
      // renders the bare title.
      const text =
        el.attributes.text === 'title'
          ? d.title || typeName
          : [typeName, d.number, d.title === typeName ? null : d.title].filter(Boolean).join(' ');
      const href = d.page ?? `${division.pageOf.page}#${ref}`;
      const tooltip = d.number ? `${typeName} ${d.number}: ${d.title}` : d.title || typeName;
      return h('a', { href, class: 'internal', title: tooltip }, escapeHtml(text));
    }
    const label = ctx.book.labels.get(ref);
    if (!label) {
      // A dangling ref is a source bug: warn in the build log and leave a
      // visible marker in the page.
      ctx.warn(`xref to unknown id ${ref}`);
      return h('span', { class: 'xref-error' }, escapeHtml(`[missing xref: ${ref}]`));
    }
    // Block targets render as knowl popups (with an href fallback); the
    // knowl page itself is emitted at the end of the build.
    knowlTargets.add(ref);
    const typeName = BLOCK_TYPE_NAMES[label.el.name] ?? capitalize(label.el.name);
    const number = blockNumber(label.el);
    const titleEl = label.el.children.find((c) => isElement(c) && c.name === 'title') as
      | XmlElement
      | undefined;
    const blockTitle =
      el.attributes.text === 'type-global' || !titleEl
        ? null
        : textContent(titleEl).replace(/\s+/g, ' ').trim();
    const text = [typeName, number, blockTitle].filter(Boolean).join(' ');
    return h(
      'a',
      {
        href: `${label.pageOf.page}#${ref}`,
        class: 'xref',
        'data-knowl': `./knowl/xref/${ref}.html`,
        'data-reveal-label': 'Reveal',
        'data-close-label': 'Close',
        title: text,
      },
      escapeHtml(text),
    );
  },

  // -- lists -----------------------------------------------------------------
  // Bare elements: ols are the UA default (ol@type passes through for
  // lettered AP-style parts); book.css keeps every ul nesting level disc
  // via `.ptx-content ul`. PreTeXt's @marker is retired (it existed to
  // strip the period off five lists).
  ul: (el, ctx) => {
    if (el.attributes.marker !== undefined) {
      ctx.warn(`<ul marker="${el.attributes.marker}"> — @marker is retired; markers are always disc`);
    }
    return h('ul', { id: elementId(el) }, emitBlocks(el, ctx));
  },
  ol: (el, ctx) => {
    if (el.attributes.marker !== undefined) {
      ctx.warn(`<ol marker="${el.attributes.marker}"> — @marker is retired; use @type for lettered lists`);
    }
    return h('ol', { type: el.attributes.type, id: elementId(el) }, emitBlocks(el, ctx));
  },
  li: (el, ctx) => {
    // A list item is block context if it contains p's, inline otherwise.
    const hasBlocks = el.children.some((c) => isElement(c) && ['p', 'ul', 'ol', 'program', 'pre', 'figure'].includes(c.name));
    const id = elementId(el);
    // Bare (inline) item content gets wrapped in a derived para. Ordered
    // lists number their items' permalink descriptions ("Item 1").
    const body = hasBlocks
      ? emitBlocks(el, ctx)
      : h('p', { id: `p-derived-${id}` }, trimText(emitChildren(el, ctx)).trim());
    const parent = el.parent as XmlElement | undefined;
    let desc = 'Item';
    if (parent && 'name' in parent && parent.name === 'ol') {
      desc = `Item ${elements(parent, 'li').indexOf(el) + 1}`;
    }
    return h('li', { id }, body, autopermalink(id, desc));
  },
  dl: (el, ctx) =>
    h(
      'dl',
      {},
      elements(el, 'li')
        .map((li) => {
          const title = li.children.find((c) => isElement(c) && c.name === 'title') as
            | XmlElement
            | undefined;
          const body = li.children
            .filter((c): c is XmlElement => isElement(c) && c.name !== 'title')
            .map((c) => emitElement(c, ctx))
            .join('');
          return (
            h('dt', {}, title ? trimText(emitChildren(title, ctx)).trim() : '') + h('dd', {}, body)
          );
        })
        .join(''),
    ),

  // -- figures / images / video ---------------------------------------------
  figure: (el, ctx) => {
    const id = elementId(el);
    const number = blockNumber(el);
    const caption = el.children.find((c) => isElement(c) && c.name === 'caption') as XmlElement | undefined;
    const body = el.children
      .filter((c): c is XmlElement => isElement(c) && c.name !== 'caption')
      .map((c) => emitElement(c, ctx))
      .join('');
    // Captionless figures still get their numbered figcaption.
    const desc = number ? `Figure ${number}` : 'Figure';
    const figcaption = h(
      'figcaption',
      {},
      figcaptionHeading('Figure', number ?? null),
      caption ? trimText(emitChildren(caption, ctx)).trim() : '',
      ctx.permalinks === false ? '' : autopermalink(id, desc),
    );
    return h('figure', { class: 'figure', id }, body, figcaption);
  },
  image: (el, ctx) => {
    const source = el.attributes.source ?? '';
    const width = Number.parseFloat(el.attributes.width ?? '100');
    const margin = (100 - width) / 2;
    const desc = el.children.find((c) => isElement(c) && c.name === 'shortdescription') as XmlElement | undefined;
    const img = voidEl('img', {
      src: `external/${source}`,
      alt: desc ? trimText(textContent(desc)).trim() : undefined,
    });
    // Inside a sidebyside the PANEL controls the width; the image-box is
    // bare (the source @width is ignored there, as PreTeXt does).
    return inSidebyside(el)
      ? h('div', { class: 'image-box' }, img)
      : h(
          'div',
          { class: 'image-box', style: `width: ${width}%; margin-left: ${margin}%; margin-right: ${margin}%;` },
          img,
        );
  },
  shortdescription: () => '',
  video: (el) => {
    const yt = el.attributes.youtube ?? '';
    const id = el.attributes.label ? el.attributes.label : elementId(el);
    const width = Number.parseFloat(el.attributes.width ?? '100');
    const margin = (100 - width) / 2;
    return h(
      'div',
      {
        class: 'video-box',
        style: `width: ${width}%;padding-top: ${width * 0.5625}%; margin-left: ${margin}%; margin-right: ${margin}%;`,
      },
      h('iframe', {
        allowfullscreen: '',
        src: `https://www.youtube-nocookie.com/embed/${yt}?&modestbranding=1&rel=0`,
        id,
      }),
    );
  },

  // -- tables ----------------------------------------------------------------
  table: (el, ctx) => {
    const id = elementId(el);
    const number = blockNumber(el);
    const title = el.children.find((c) => isElement(c) && c.name === 'title') as XmlElement | undefined;
    const body = el.children
      .filter((c): c is XmlElement => isElement(c) && c.name !== 'title')
      .map((c) => emitElement(c, ctx))
      .join('');
    // Table captions render ABOVE the table (figure captions go below) —
    // except inside a sidebyside, where captions row below the panels.
    const figcaption = h(
      'figcaption',
      {},
      figcaptionHeading('Table', number ?? null),
      title ? trimText(emitChildren(title, ctx)).trim() : '',
    );
    const desc = number ? `Table ${number}` : 'Table';
    const figcaptionWithLink =
      ctx.permalinks === false
        ? figcaption
        : figcaption.replace('</figcaption>', `${autopermalink(id, desc)}</figcaption>`);
    return inSidebyside(el)
      ? h('figure', { class: 'table', id }, body, figcaptionWithLink)
      : h('figure', { class: 'table', id }, figcaptionWithLink, body);
  },
  // PreTeXt's tabular model: per-cell classes `<halign> <valign> bN rN lN
  // tN lines` where borders resolve cell > row/col > tabular; left borders
  // apply only to a row's first cell, top borders only to the first row.
  tabular: (el, ctx) => {
    const cols = elements(el, 'col');
    const rows = elements(el, 'row');
    const rowHeaders = el.attributes['row-headers'] === 'yes';
    const level = (v: string | undefined): number =>
      v === 'minor' ? 1 : v === 'medium' ? 2 : v === 'major' ? 3 : 0;
    const halignLetter = (v: string | undefined): string =>
      v === 'center' ? 'c' : v === 'right' ? 'r' : 'l';
    const valignLetter = (v: string | undefined): string =>
      v === 'top' ? 't' : v === 'bottom' ? 'b' : 'm';
    const trs = rows
      .map((row, ri) => {
        const headerRow = row.attributes.header === 'yes';
        const cells = elements(row, 'cell');
        const tds = cells
          .map((cell, ci) => {
            const col = cols[ci];
            const b = level(cell.attributes.bottom ?? row.attributes.bottom ?? el.attributes.bottom);
            const rBorder = level(cell.attributes.right ?? col?.attributes.right ?? el.attributes.right);
            const l = ci === 0 ? level(row.attributes.left ?? el.attributes.left) : 0;
            const t = ri === 0 ? level(col?.attributes.top ?? el.attributes.top) : 0;
            const ha = halignLetter(cell.attributes.halign ?? col?.attributes.halign ?? el.attributes.halign);
            const va = valignLetter(row.attributes.valign ?? el.attributes.valign);
            const cls = `${ha} ${va} b${b} r${rBorder} l${l} t${t} lines`;
            const tag = headerRow ? 'th' : rowHeaders && ci === 0 ? 'th' : 'td';
            const scope = headerRow ? 'col' : rowHeaders && ci === 0 ? 'row' : undefined;
            return h(tag, { ...(scope ? { scope } : {}), class: cls }, trimText(emitChildren(cell, ctx)).trim());
          })
          .join('\n');
        return h('tr', headerRow ? { class: 'header-horizontal' } : {}, tds);
      })
      .join('\n');
    return h(
      'div',
      { class: 'tabular-box' },
      h('table', { class: 'tabular' }, trs),
    );
  },
  row: () => '', // handled by tabular
  col: () => '',

  // -- blocks ----------------------------------------------------------------
  note: (el, ctx) => {
    const id = elementId(el);
    const number = blockNumber(el);
    const title = el.children.find((c) => isElement(c) && c.name === 'title') as XmlElement | undefined;
    const heading = h(
      `h${Math.min(6, ctx.headingLevel + 1)}`,
      { class: 'heading' },
      blockHeadingSpans('Note', number ?? null, title ? trimText(emitChildren(title, ctx)).trim() : null),
    );
    const body = el.children
      .filter((c): c is XmlElement => isElement(c) && c.name !== 'title')
      .map((c) => emitElement(c, ctx))
      .join('');
    return h('article', { class: 'note', id }, heading, body, autopermalink(id, number ? `Note ${number}` : 'Note'));
  },
  blockquote: (el, ctx) => h('blockquote', { class: 'blockquote', id: elementId(el) }, emitBlocks(el, ctx)),
  attribution: (el, ctx) =>
    h('cite', { class: 'attribution' }, `―${trimText(emitChildren(el, ctx)).trim()}`),

  // Solution/answer/hint render as inline <details> knowls.
  solution: (el, ctx) => knowlDetails('Solution', 'solution', el, ctx),
  answer: (el, ctx) => knowlDetails('Answer', 'answer', el, ctx),
  hint: (el, ctx) => knowlDetails('Hint', 'hint', el, ctx),

  // NON-interactive activities/projects/exercises (a prose statement,
  // maybe a display program, answer/solution knowls). Interactive ones
  // never reach the dispatch table (emitElement routes them to
  // emitComponent first).
  activity: (el, ctx) => proseActivity(el, ctx, 'Activity', 'activity'),
  project: (el, ctx) => proseActivity(el, ctx, 'Project', 'project'),
  exercise: (el, ctx) => proseActivity(el, ctx, 'Activity', 'exercise'),
  pre: (el) => preBlock(textContent(el)),
  listing: (el, ctx) => {
    const id = elementId(el);
    const number = blockNumber(el);
    const titleEl = el.children.find(
      (c) => isElement(c) && (c.name === 'title' || c.name === 'caption'),
    ) as XmlElement | undefined;
    const body = el.children
      .filter((c): c is XmlElement => isElement(c) && c.name !== 'title' && c.name !== 'caption')
      .map((c) => emitElement(c, ctx))
      .join('');
    const figcaption = h(
      'figcaption',
      {},
      figcaptionHeading('Listing', number ?? null),
      titleEl ? trimText(emitChildren(titleEl, ctx)).trim() : '',
    );
    // Caption ABOVE the code (like tables) — except inside a sidebyside,
    // where panel captions render in a row BELOW the panels.
    const desc = number ? `Listing ${number}` : 'Listing';
    const figcaptionWithLink =
      ctx.permalinks === false
        ? figcaption
        : figcaption.replace('</figcaption>', `${autopermalink(id, desc)}</figcaption>`);
    return inSidebyside(el)
      ? h('figure', { class: 'listing', id }, body, figcaptionWithLink)
      : h('figure', { class: 'listing', id }, figcaptionWithLink, body);
  },

  // Non-interactive <program> in prose (interactive ones route to
  // emitComponent before dispatch): the clipboardable code box,
  // syntax-highlighted at build time (builder/src/highlight.ts).
  program: (el, ctx) => {
    const code = el.children.find((c) => isElement(c) && c.name === 'code') as XmlElement | undefined;
    // An empty language attribute is a source bug: it slips past the
    // java default (empty isn't nullish) and emits class="language-".
    // Output-showing programs are language="text".
    if (el.attributes.language === '') ctx.warn('<program language=""> — use language="text" for output blocks');
    const lang = el.attributes.language ?? 'java';
    // No wrapper div: the pre scrolls itself, and pretext-core's clipboard
    // code re-wraps any .clipboardable at runtime to anchor its button.
    return h(
      'pre',
      { class: 'program clipboardable' },
      h('code', { class: `language-${lang}` }, `${highlight(dedent(textContent(code ?? el)), lang)}\n`),
    );
  },
  code: (el) => preBlock(dedent(textContent(el))),

  // -- layout ----------------------------------------------------------------
  // Sidebyside: a CSS-grid row of panels. Widths are % of the CONTAINER in
  // the source; the row spans (100 - margins), so grid-template-columns
  // rescales each width relative to that span (15 -> 12.5 when the row is
  // 120% wide) while the inter-panel gap stays unscaled — replicating
  // PreTeXt's arithmetic exactly, 15-significant-digit formatting and all.
  // Our schema (bhsawesome-next-steps.md phase 3): an image in the left
  // margin gutter beside block content — what the old `<sidebyside
  // widths="15% 100%" margins="-20% 0%">` + <image>/<stack> hack
  // expressed (the construct PreTeXt could only reach via errors). Emits
  // the same DOM with the fixed gutter geometry, so the theme CSS is
  // untouched. Attributes: source (under external/), description (alt
  // text). Children are the content blocks.
  gutterimage: (el, ctx) => {
    const img = voidEl('img', {
      src: `external/${el.attributes.source ?? ''}`,
      alt: el.attributes.description,
    });
    return h(
      'div',
      { class: 'sidebyside' },
      h(
        'div',
        {
          class: 'sbsrow',
          style:
            'margin-left:-20%;margin-right:0%;grid-template-columns:12.5% 83.3333333333333%;column-gap:5%;',
        },
        [
          h('div', { class: 'sbspanel sbspanel--top top', style: '' }, h('div', { class: 'image-box' }, img)),
          h('div', { class: 'sbspanel sbspanel--top top', style: '' }, emitBlocks(el, ctx)),
        ].join('\n'),
      ),
    );
  },

  sidebyside: (el, ctx) => {
    const panels = elements(el);
    const n = panels.length;
    const marginParts = (el.attributes.margins ?? '0% 0%').split(/\s+/).map((s) => Number.parseFloat(s));
    const [ml, mr] = marginParts.length >= 2 ? marginParts : [marginParts[0], marginParts[0]];
    const available = 100 - ml - mr;
    const widths = el.attributes.widths
      ? el.attributes.widths.split(/\s+/).map((s) => Number.parseFloat(s))
      : Array.from({ length: n }, () => available / n);
    const gap = n > 1 ? (available - widths.reduce((a, b) => a + b, 0)) / (n - 1) : 0;
    const fmt = (x: number) => String(Number(x.toPrecision(15)));
    const cols = widths.map((w) => `${fmt((w / available) * 100)}%`).join(' ');
    const valign = el.attributes.valign ?? 'top';
    const panelHtml = panels
      .map((p) =>
        h(
          'div',
          { class: `sbspanel sbspanel--${valign} ${valign}`, style: '' },
          p.name === 'stack' || p.name === 'container' ? emitBlocks(p, ctx) : emitElement(p, ctx),
        ),
      )
      .join('\n');
    return h(
      'div',
      { class: 'sidebyside' },
      h(
        'div',
        {
          class: 'sbsrow',
          style: `margin-left:${fmt(ml)}%;margin-right:${fmt(mr)}%;grid-template-columns:${cols};column-gap:${fmt(gap)}%;`,
        },
        panelHtml,
      ),
    );
  },

  // docutils leftover grouping element: pure passthrough (its @names is
  // referenced by a dead custom.css selector; PreTeXt drops it too).
  container: (el, ctx) => emitBlocks(el, ctx),

  // Fill-in-the-blank input (inside fillin payloads' statements). PreTeXt
  // emits the XML self-closing form and an id of "-<name>".
  fillin: (el) =>
    `<input type="${el.attributes.mode === 'number' ? 'number' : 'text'}" id="-${el.attributes.name ?? 'blank1'}"/>`,

  // Clickable-area marker (inside clickablearea payloads' clines/tables).
  area: (el) =>
    h(
      'span',
      { [el.attributes.correct === 'yes' ? 'data-correct' : 'data-incorrect']: '' },
      escapeHtml(smartQuotes(textContent(el)).trim()),
    ),

  // Prose-level exercise machinery for NON-interactive exercises.
  statement: (el, ctx) => emitBlocks(el, ctx),
  introduction: (el, ctx) => emitBlocks(el, ctx),
  conclusion: (el, ctx) => emitBlocks(el, ctx),
};

function proseActivity(el: XmlElement, ctx: Ctx, typeName: string, classes: string): string {
  const id = elementId(el);
  const number = blockNumber(el);
  const title = el.children.find((c) => isElement(c) && c.name === 'title') as XmlElement | undefined;
  const heading = h(
    `h${Math.min(6, ctx.headingLevel + 1)}`,
    { class: 'heading' },
    blockHeadingSpans(typeName, number ?? null, title ? trimText(emitChildren(title, ctx)).trim() : null),
  );
  const body = el.children
    .filter((c): c is XmlElement => isElement(c) && c.name !== 'title')
    .map((c) => emitElement(c, ctx))
    .join('');
  return h('article', { class: classes, id }, heading, body, autopermalink(id, number ? `${typeName} ${number}` : typeName));
}

function inSidebyside(el: XmlElement): boolean {
  for (let p = el.parent; p instanceof Object && 'name' in p; p = (p as XmlElement).parent) {
    if ((p as XmlElement).name === 'sidebyside') return true;
  }
  return false;
}

function knowlDetails(type: string, classes: string, el: XmlElement, ctx: Ctx): string {
  return h(
    'details',
    { class: 'knowl' },
    h(
      'summary',
      { class: 'knowl__link' },
      h('span', { class: 'type' }, type),
      '.',
    ),
    h('div', { class: `${classes} knowl__content` }, emitBlocks(el, ctx)),
  );
}

function preBlock(code: string): string {
  return h('pre', { class: 'code-block clipboardable' }, `${escapeHtml(dedent(code))}\n`);
}

export function dedent(text: string): string {
  const lines = text.replace(/^([ \t]*\n)+/, '').trimEnd().split('\n');
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}
