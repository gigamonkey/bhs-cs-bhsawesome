/*
 * The XML slide-deck document type (the monorepo's plans/xml-slides.md): a
 * <deck> of <slide>s compiled into a self-contained reveal.js page. This is
 * the successor to the bhs-cs-content Lisp/Markup slides pipeline, and the
 * emitted HTML is DOM-equivalent to what that pipeline's slides-html
 * produced (the parity bar the migration was verified against).
 *
 * The module is deliberately ignorant of the content repo's layout: it
 * takes a deck file, an output file, and a default code language, and knows
 * nothing about materials/, subcats, or the overlay. See SLIDES-FORMAT.md
 * for the format itself.
 */

import fs from 'node:fs';
import path from 'node:path';

import { escapeAttr, escapeHtml } from '../html.ts';
import { type XmlElement, child, elements, isElement, isText, loadXml, textContent } from '../xml.ts';

export type SlideDeckConfig = {
  /** Absolute path to the deck source (slides.deck). */
  deckFile: string;
  /** Absolute path of the index.html to write. */
  outFile: string;
  /** Code-block language assumed when no `language` attribute is in scope. */
  defaultLanguage?: string;
};

export type DeckMeta = {
  title: string;
  courses: string[];
  grading: string;
};

/** The deck's metadata, read from the deck itself (there is no
 * metadata.yml: plans/xml-slides.md). */
export function deckMeta(deckFile: string): DeckMeta {
  const deck = loadDeck(deckFile);
  const title = child(deck, 'title');
  return {
    // The <title> IS the title, everywhere it's needed — the title slide,
    // the page head, and the materials index. A title-less deck falls back
    // to its directory name.
    title: title ? collapse(textContent(title)) : path.basename(path.dirname(deckFile)),
    courses: (deck.attributes.courses ?? '').split(/\s+/).filter(Boolean),
    grading: deck.attributes.grading ?? 'none',
  };
}

export function buildSlideDeck(config: SlideDeckConfig): void {
  const html = slideDeckHtml(loadDeck(config.deckFile), {
    deckDir: path.dirname(config.deckFile),
    defaultLanguage: config.defaultLanguage,
    deckFile: config.deckFile,
  });
  fs.mkdirSync(path.dirname(config.outFile), { recursive: true });
  fs.writeFileSync(config.outFile, html);
}

function loadDeck(deckFile: string): XmlElement {
  const root = loadXml(deckFile);
  if (root.name !== 'deck') throw new Error(`${deckFile}: root element is <${root.name}>, not <deck>`);
  return root;
}

// -- Page shell ---------------------------------------------------------------
//
// Byte-for-byte the shell the Lisp slides-html emitted (single quotes and
// all), so a converted deck's page differs from its golden only where the
// content differs.

const HEAD = `<!doctype html>
<html lang='en'>
    <head>
        <meta http-equiv='content-type' content='text/html; charset=UTF-8'>
        <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>
        <link rel='stylesheet' href='/reveal/dist/reset.css'>
        <link rel='stylesheet' href='/reveal/dist/reveal.css'>
        <link rel='stylesheet' href='/reveal/dist/theme/black.css'>
        <link rel='stylesheet' href='/reveal/dist/custom.css'>
        <link rel='stylesheet' href='/reveal/plugin/highlight/monokai.css'>
        <link rel='stylesheet' href='/css/bootstrap-icons.css'>
        <link rel='stylesheet' href='/css/logo.css'>
`;

const BODY_TOP = `    </head>
    <body>
        <div class='reveal'>
            <div class='footer logo'>
                <a id='slides-home' href='/'><i class='bi bi-house-fill'></i></a>
            </div>
            <div class='slides'>
`;

const TAIL = `            </div>
        </div>
        <script src='/reveal/dist/reveal.js'></script>
        <script src='/reveal/plugin/notes/notes.js'></script>
        <script src='/reveal/plugin/markdown/markdown.js'></script>
        <script src='/reveal/plugin/highlight/highlight.js'></script>
        <script id='MathJax-script' async src='https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'></script>
        <script>// More info about initialization & config:
            // - https://revealjs.com/initialization/
            // - https://revealjs.com/config/
            Reveal.initialize({
              hash: true,
              // Learn about plugins: https://revealjs.com/plugins/
              plugins: [ RevealMarkdown, RevealHighlight, RevealNotes ]
            });</script>
        <script>// Course-free home link: under /c/<course>/… go to the course
            // home; anywhere else (the /m/ preview) to the slides library.
            (function () {
              var m = location.pathname.match(/^\\/c\\/[\\w-]+/);
              document.getElementById('slides-home').href = m ? m[0] : '/m/slides/';
            })();</script>
    </body>
</html>
`;

// -- Emitter ------------------------------------------------------------------

type Ctx = {
  deckDir: string;
  language: string | undefined;
  file: string;
  /** Elements matched by enclosing fragments= XPath expressions. */
  fragmentSet?: Set<XmlElement>;
};

// The format's own attributes — consumed by the emitter, never copied onto
// the output element they appear on.
const FORMAT_ATTRS = new Set(['fragment', 'findex', 'fragments', 'language', 'class', 'level']);

export function slideDeckHtml(
  deck: XmlElement,
  opts: { deckDir: string; defaultLanguage?: string; deckFile?: string },
): string {
  let ctx: Ctx = {
    deckDir: opts.deckDir,
    language: deck.attributes.language ?? opts.defaultLanguage,
    file: opts.deckFile ?? path.join(opts.deckDir, 'slides.deck'),
  };
  // A deck-level fragments= applies deck-wide: <deck fragments="slide/p">
  // makes every slide's paragraphs fragments.
  ctx = withFragments(ctx, deck);

  const title = child(deck, 'title');
  const sections: string[] = [];

  // Content between <title> and the first <slide> shares the title slide.
  const leading: XmlElement[] = [];
  for (const el of elements(deck)) {
    if (el.name === 'title') continue;
    if (el.name === 'slide') break;
    leading.push(el);
  }
  if (title) {
    sections.push(section([heading(1, title, ctx), ...leading.map((el) => block(el, ctx, []))]));
  } else if (leading.length) {
    throw new Error(`${ctx.file}: deck content before the first <slide> needs a deck <title>`);
  }

  let seenSlide = false;
  for (const el of elements(deck)) {
    if (el.name === 'title') continue;
    if (el.name !== 'slide') {
      if (seenSlide) throw new Error(`${ctx.file}: <${el.name}> between slides — deck content goes before the first <slide>`);
      continue;
    }
    seenSlide = true;
    sections.push(renderSlide(el, ctx));
  }

  const headTitle = title ? collapse(textContent(title)) : null;
  // A custom.css next to the deck source is the deck's own stylesheet,
  // linked RELATIVE so it resolves at both the /m/ preview and the
  // /c/<course>/ URL (both serve the deck dir's files). It loads after the
  // shared stylesheet, so its rules win ties.
  const deckCss = fs.existsSync(path.join(opts.deckDir, 'custom.css'))
    ? "        <link rel='stylesheet' href='custom.css'>\n"
    : '';
  return (
    HEAD +
    deckCss +
    (headTitle !== null ? `        <title>${escapeHtml(headTitle)}</title>\n` : '') +
    BODY_TOP +
    sections.join('') +
    TAIL
  );
}

function renderSlide(slide: XmlElement, outer: Ctx): string {
  const ctx = withFragments(withLanguage(outer, slide), slide);
  const level = slide.attributes.level ? Number(slide.attributes.level) : 2;
  const parts: string[] = [];
  let first = true;
  for (const el of elements(slide)) {
    if (first && el.name === 'title') {
      parts.push(heading(level, el, ctx));
    } else {
      parts.push(block(el, ctx, []));
    }
    first = false;
  }
  return section(parts, `${classAttr(ownClasses(slide))}${styleAttr(slide)}`);
}

function section(parts: string[], attrs = ''): string {
  return `<section${attrs}>\n${parts.join('')}</section>\n`;
}

function heading(level: number, title: XmlElement, ctx: Ctx): string {
  // An empty <title/> is the deliberately blank heading (the old markup
  // decks' `** \empty{}` trick): the <empty> element keeps the h2's line
  // box so the slide's layout doesn't shift.
  const body = title.children.length ? inlineBlock(title, ctx) : '<empty></empty>';
  return `<h${level}${classAttr([...fragClasses(title, ctx), ...ownClasses(title)])}${styleAttr(title)}>${body}</h${level}>\n`;
}

/** Render a block-level element. `forced` is classes imposed by an enclosing
 * <fragments>. */
function block(el: XmlElement, ctx0: Ctx, forced: string[]): string {
  const ctx = withFragments(withLanguage(ctx0, el), el);
  const classes = [...forced, ...fragClasses(el, ctx), ...ownClasses(el)];
  switch (el.name) {
    case 'p':
      return `<p${classAttr(classes)}${findexAttr(el)}${styleAttr(el)}>${inlineBlock(el, ctx)}</p>\n`;
    case 'ul':
    case 'ol':
      return renderList(el, ctx, classes, []);
    case 'code':
      return renderCodeBlock(el, ctx, classes);
    case 'fragments':
      return renderFragments(el, ctx);
    case 'repl':
      return renderRepl(el, ctx);
    case 'table':
      return renderTable(el, ctx, classes);
    case 'html':
      return rawHtml(el, ctx);
    case 'notes':
      return `<aside class='notes'>\n${blockChildren(el, ctx)}</aside>\n`;
    case 'title':
      throw new Error(`${ctx.file}: <title> must be the first child of its <slide>`);
    default:
      // Everything else — div, span, blockquote, img, any HTML the format
      // doesn't model — passes through with its attributes.
      return passthrough(el, ctx, classes, 'block');
  }
}

function blockChildren(el: XmlElement, ctx: Ctx, forced: string[] = []): string {
  requireNoText(el, ctx);
  return elements(el)
    .map((c) => block(c, ctx, forced))
    .join('');
}

/** True when the element's content is block elements (vs inline content). */
const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'code', 'fragments', 'table', 'blockquote', 'div', 'html']);

function hasBlockContent(el: XmlElement): boolean {
  return elements(el).some((c) => BLOCK_TAGS.has(c.name));
}

function requireNoText(el: XmlElement, ctx: Ctx): void {
  for (const c of el.children) {
    if (isText(c) && c.text.trim() !== '') {
      throw new Error(`${ctx.file}: stray text ${JSON.stringify(c.text.trim().slice(0, 40))} in <${el.name}> — wrap it in <p>`);
    }
  }
}

// -- fragments ----------------------------------------------------------------

/*
 * <fragments>: each child element becomes a reveal fragment. Two special
 * cases, both inherited from the Lisp pipeline's fragmentize: a single
 * <ul>/<ol> child makes the ITEMS the fragments (so a whole list can't be
 * one fragment that way — use fragment="" on the list instead), and a
 * <table> child takes the class itself.
 */
function renderFragments(el: XmlElement, ctx: Ctx): string {
  requireNoText(el, ctx);
  const kids = elements(el);
  if (kids.length === 1 && (kids[0].name === 'ul' || kids[0].name === 'ol')) {
    const list = kids[0];
    return renderList(list, withLanguage(ctx, list), ownClasses(list), ['fragment']);
  }
  return kids.map((c) => block(c, ctx, ['fragment'])).join('');
}

function fragmentClasses(el: XmlElement): string[] {
  const f = el.attributes.fragment;
  if (f === undefined) return [];
  return f === '' ? ['fragment'] : ['fragment', ...f.split(/\s+/)];
}

/** The element's fragment classes: its own fragment= attribute plus
 * membership in an enclosing fragments= expression's matches. */
function fragClasses(el: XmlElement, ctx: Ctx): string[] {
  return [...(ctx.fragmentSet?.has(el) ? ['fragment'] : []), ...fragmentClasses(el)];
}

function findexAttr(el: XmlElement): string {
  const i = el.attributes.findex;
  return i === undefined ? '' : ` data-fragment-index='${escapeAttr(i)}'`;
}

/** Verbatim inline CSS — the escape hatch for one-off presentation the
 * format doesn't model. Prefer class= + the stylesheet; reach for this
 * last. */
function styleAttr(el: XmlElement): string {
  const v = el.attributes.style;
  return v === undefined ? '' : ` style='${escapeAttr(v)}'`;
}

// -- Lists --------------------------------------------------------------------

function renderList(list: XmlElement, ctx: Ctx, classes: string[], liForced: string[]): string {
  requireNoText(list, ctx);
  const items = elements(list)
    .map((li) => {
      if (li.name !== 'li') throw new Error(`${ctx.file}: <${li.name}> inside <${list.name}> — only <li> allowed`);
      const liClasses = [...liForced, ...fragClasses(li, ctx), ...ownClasses(li)];
      const liCtx = withFragments(withLanguage(ctx, li), li);
      const body = hasBlockContent(li)
        ? `\n${blockChildren(li, liCtx)}`
        : inlineBlock(li, liCtx);
      return `<li${classAttr(liClasses)}${findexAttr(li)}${styleAttr(li)}>${body}</li>\n`;
    })
    .join('');
  return `<${list.name}${classAttr(classes)}${findexAttr(list)}${styleAttr(list)}>\n${items}</${list.name}>\n`;
}

// -- Code blocks --------------------------------------------------------------

/*
 * <code> (block form; inline code is <c>): verbatim text -> reveal's
 * <pre><code data-trim data-noescape class='language-X'>. Line-highlight
 * steps ride in the text as {{hl:n[,n]}} markers at the ends of lines
 * (data-line-numbers steps, grouped by marker number), and a bare
 * {{linenumbers}} marker asks for plain always-on numbers — both exactly as
 * the Lisp pipeline defined them. The language comes from the nearest
 * language= attribute in scope (deck/slide/element) or the build's default;
 * there is no content sniffing.
 */
function renderCodeBlock(el: XmlElement, ctx: Ctx, classes: string[]): string {
  let text = codeText(el);
  let lineNumbers: string | undefined;
  const ln = /^\{\{linenumbers\}\}\n|[^\S\n]*\{\{linenumbers\}\}/m;
  if (ln.test(text)) {
    text = text.replace(new RegExp(ln, 'gm'), '');
    lineNumbers = '';
  }
  const { clean, highlights } = extractHighlights(text);
  if (highlights) lineNumbers = highlights;
  const lang = el.attributes.language ?? ctx.language;
  const attrs =
    (lineNumbers !== undefined ? ` data-line-numbers='${escapeAttr(lineNumbers)}'` : '') +
    " data-trim='' data-noescape=''" +
    (lang !== undefined && lang !== 'none' ? ` class='language-${escapeAttr(lang)}'` : '');
  return `<pre${classAttr(classes)}${findexAttr(el)}${styleAttr(el)}><code${attrs}>${escapeHtml(clean)}</code></pre>\n`;
}

/** The code text: verbatim when it starts flush against the tag; text
 * starting with a newline (the indented authoring style — content on its
 * own lines, indented relative to the tags) is de-indented with the same
 * rule as the book format (prose.ts dedent, kept in step by hand — the
 * slides module deliberately doesn't import prose.ts's module graph):
 * leading blank lines stripped, end trimmed, common space-indent removed. */
function codeText(el: XmlElement): string {
  let text = '';
  for (const c of el.children) {
    if (isText(c)) text += c.text;
    else throw new Error(`<code> holds verbatim text only (got <${(c as XmlElement).name}>)`);
  }
  if (!text.startsWith('\n')) return text;
  const lines = text.replace(/^([ \t]*\n)+/, '').trimEnd().split('\n');
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

function extractHighlights(text: string): { clean: string; highlights: string | undefined } {
  const marker = /[^\S\n]+\{\{hl:([0-9,]+)\}\}/;
  const clean = text.replace(new RegExp(marker, 'g'), '');
  const steps = new Map<number, number[]>();
  text.split('\n').forEach((line, i) => {
    const m = line.match(marker);
    if (!m) return;
    for (const n of m[1].split(',').map(Number)) {
      if (!steps.has(n)) steps.set(n, []);
      steps.get(n)!.push(i + 1);
    }
  });
  if (!steps.size) return { clean, highlights: undefined };
  const ordered = [...steps.entries()].sort((a, b) => a[0] - b[0]);
  return {
    clean,
    highlights: `|${ordered.map(([, lines]) => lines.sort((a, b) => a - b).join(',')).join('|')}`,
  };
}

// -- Tables -------------------------------------------------------------------

function renderTable(table: XmlElement, ctx: Ctx, classes: string[]): string {
  // A table's fragments= (e.g. "tr", "td") is the generic XPath mechanism —
  // block() already folded its matches into ctx.fragmentSet.
  const rows = elements(table)
    .map((tr) => {
      if (tr.name !== 'tr') throw new Error(`${ctx.file}: <${tr.name}> inside <table> — only <tr> allowed`);
      const trClasses = [...fragClasses(tr, ctx), ...ownClasses(tr)];
      const cells = elements(tr)
        .map((cell) => {
          if (cell.name !== 'td' && cell.name !== 'th') {
            throw new Error(`${ctx.file}: <${cell.name}> inside <tr> — only <td>/<th> allowed`);
          }
          const cellClasses = [...fragClasses(cell, ctx), ...ownClasses(cell)];
          const cellCtx = withFragments(withLanguage(ctx, cell), cell);
          const body = hasBlockContent(cell) ? `\n${blockChildren(cell, cellCtx)}` : inlineBlock(cell, cellCtx);
          return `<${cell.name}${copiedAttrs(cell)}${classAttr(cellClasses)}${findexAttr(cell)}>${body}</${cell.name}>\n`;
        })
        .join('');
      return `<tr${copiedAttrs(tr)}${classAttr(trClasses)}${findexAttr(tr)}>\n${cells}</tr>\n`;
    })
    .join('');
  return `<table${copiedAttrs(table)}${classAttr(classes)}${findexAttr(table)}>\n${rows}</table>\n`;
}

// -- repl ---------------------------------------------------------------------

/*
 * <repl><in>expr</in><out>value</out></repl>: the two-fragment REPL slide
 * heading (the Lisp pipeline's `expr ⟹ value` header rewrite). Renders as
 * the whole h2 (h3 with level="3"), so it stands in title position.
 */
function renderRepl(el: XmlElement, ctx: Ctx): string {
  const level = el.attributes.level ?? '2';
  const input = child(el, 'in');
  const output = child(el, 'out');
  if (!input || !output) throw new Error(`${ctx.file}: <repl> needs <in> and <out>`);
  return (
    `<h${level}><div class='repl'>\n` +
    `<div><span class='prompt'>» </span><span class='fragment'>${inlineBlock(input, ctx)}</span></div>\n` +
    `<div class='fragment'>${inlineBlock(output, ctx)}</div>\n` +
    `</div></h${level}>\n`
  );
}

// -- Raw HTML -----------------------------------------------------------------

/** <html>…CDATA…</html> or <html src="file"/>: verbatim output. The escape
 * hatch — the point of the format is to need it rarely. */
function rawHtml(el: XmlElement, ctx: Ctx): string {
  const src = el.attributes.src;
  if (src !== undefined) {
    if (el.children.length) throw new Error(`${ctx.file}: <html src=…> takes no content`);
    return `${fs.readFileSync(path.resolve(ctx.deckDir, src), 'utf8')}\n`;
  }
  let out = '';
  for (const c of el.children) {
    if (isText(c)) out += c.text;
    else throw new Error(`${ctx.file}: <html> holds text/CDATA only`);
  }
  return `${out}\n`;
}

// -- Passthrough --------------------------------------------------------------

const VOID_TAGS = new Set(['img', 'br', 'hr']);

/** An element the format doesn't model: emit it as the HTML element it
 * names, attributes and all (minus the format's own attributes). This is
 * the "generate custom HTML when needed" half of the format's goal. */
function passthrough(el: XmlElement, ctx: Ctx, classes: string[], mode: 'block' | 'inline'): string {
  const open = `<${el.name}${copiedAttrs(el)}${classAttr(classes)}${findexAttr(el)}>`;
  if (VOID_TAGS.has(el.name)) {
    if (el.children.length) throw new Error(`${ctx.file}: <${el.name}> takes no content`);
    return mode === 'block' ? `${open}\n` : open;
  }
  const body = mode === 'block' && hasBlockContent(el) ? `\n${blockChildren(el, ctx)}` : inline(el, ctx);
  const close = `</${el.name}>`;
  return mode === 'block' ? `${open}${body}${close}\n` : `${open}${body}${close}`;
}

// -- Inline content -----------------------------------------------------------

/*
 * Inline text collapses whitespace runs to single spaces (the HTML
 * rendering rule anyway — only <pre> is exempt, and block <code> takes the
 * verbatim path), so the emitted page is independent of how the XML source
 * is line-filled and indented: xml-format is a byte-level no-op on the
 * output. Block-level containers (p, titles, list items, cells) also trim
 * the ends; nested inline elements keep their boundary spaces (a space
 * inside <c> can be deliberate).
 */

function inline(el: XmlElement, ctx: Ctx): string {
  let out = '';
  for (const c of el.children) {
    if (isText(c)) out += escapeHtml(c.text.replace(/\s+/g, ' '));
    else if (isElement(c)) out += inlineElement(c, ctx);
  }
  return out;
}

/** Inline content of a block-level container: collapsed and end-trimmed. */
function inlineBlock(el: XmlElement, ctx: Ctx): string {
  return inline(el, ctx).trim();
}

function inlineElement(el: XmlElement, ctx0: Ctx): string {
  const ctx = withFragments(withLanguage(ctx0, el), el);
  const classes = [...fragClasses(el, ctx), ...ownClasses(el)];
  switch (el.name) {
    case 'c':
      return `<code${classAttr(classes)}${findexAttr(el)}${styleAttr(el)}>${inline(el, ctx)}</code>`;
    case 'm':
      // TeX math, rendered client-side by the deck's MathJax script.
      return `\\(${escapeHtml(rawText(el))}\\)`;
    case 'vocab':
      return `<span${classAttr(['vocab', ...classes])}${findexAttr(el)}${styleAttr(el)}>${inline(el, ctx)}</span>`;
    case 'f': {
      // Concise inline fragment: <f>x</f> == <span class="fragment">x</span>;
      // index= is data-fragment-index. Fragment styles ride class=
      // (<f class="fade-up">), which merges after 'fragment' as usual.
      const idx = el.attributes.index;
      return (
        `<span${classAttr(['fragment', ...ownClasses(el)])}` +
        `${idx !== undefined ? ` data-fragment-index='${escapeAttr(idx)}'` : findexAttr(el)}` +
        `${styleAttr(el)}>${inline(el, ctx)}</span>`
      );
    }
    case 'url': {
      // A link to itself: <url>https://x</url> -> <a href=…>…</a>. The
      // text is the URL, so ALL whitespace is stripped (an 80-column fill
      // may have wrapped it; URLs contain none). Always a new tab — a
      // bare URL on a slide is by nature an external reference.
      const u = rawText(el).replace(/\s+/g, '');
      const t = el.attributes.target ?? '_blank';
      return `<a target='${escapeAttr(t)}' href='${escapeAttr(u)}'${classAttr(classes)}${findexAttr(el)}${styleAttr(el)}>${escapeHtml(u)}</a>`;
    }
    case 'html':
      return el.attributes.src !== undefined
        ? fs.readFileSync(path.resolve(ctx.deckDir, el.attributes.src), 'utf8')
        : rawText(el);
    case 'a': {
      const href = el.attributes.href ?? '';
      const target =
        el.attributes.target ?? (href.startsWith('http') ? '_blank' : undefined);
      const t = target !== undefined ? ` target='${escapeAttr(target)}'` : '';
      return `<a${t} href='${escapeAttr(href)}'${classAttr(classes)}${findexAttr(el)}${styleAttr(el)}>${inline(el, ctx)}</a>`;
    }
    default:
      return passthrough(el, ctx, classes, 'inline');
  }
}

function rawText(el: XmlElement): string {
  let out = '';
  for (const c of el.children) {
    if (isText(c)) out += c.text;
    else throw new Error(`<${el.name}> holds text only`);
  }
  return out;
}

// -- Small helpers ------------------------------------------------------------

function withLanguage(ctx: Ctx, el: XmlElement): Ctx {
  const lang = el.attributes.language;
  return lang === undefined ? ctx : { ...ctx, language: lang };
}

/*
 * fragments="<xpath>" on any element turns every matched descendant into a
 * reveal fragment: <ul fragments="li">, <table fragments="td">,
 * <slide fragments="p">. The expression is an XPath subset — name and *
 * steps, / and // combinators, positional [n] predicates — evaluated with
 * the attribute's element as the context node, and a bare leading step
 * gets an implicit .// (so "li" means .//li; write ./li for children
 * only). Unsupported syntax and zero matches are build errors.
 */

type FragStep = { axis: 'child' | 'desc'; name: string; index?: number };

function parseFragmentsExpr(expr: string, ctx: Ctx): FragStep[] {
  let rest = expr.trim();
  if (rest.startsWith('/')) {
    throw new Error(`${ctx.file}: fragments='${expr}' — absolute paths aren't supported (the element is the context node)`);
  }
  rest = rest.startsWith('.') ? rest.slice(1) : `//${rest}`;
  const steps: FragStep[] = [];
  while (rest.length) {
    let axis: 'child' | 'desc';
    if (rest.startsWith('//')) {
      axis = 'desc';
      rest = rest.slice(2);
    } else if (rest.startsWith('/')) {
      axis = 'child';
      rest = rest.slice(1);
    } else {
      throw new Error(
        `${ctx.file}: fragments='${expr}' — unsupported syntax at '${rest}' (name or * steps, / and //, [n] predicates)`,
      );
    }
    const m = rest.match(/^([A-Za-z_][\w.-]*|\*)(?:\[([1-9]\d*)\])?/);
    if (!m || m[0].length === 0) {
      throw new Error(`${ctx.file}: fragments='${expr}' — unsupported syntax at '${rest}' (name or * steps, / and //, [n] predicates)`);
    }
    steps.push({ axis, name: m[1], index: m[2] === undefined ? undefined : Number(m[2]) });
    rest = rest.slice(m[0].length);
  }
  if (!steps.length) {
    throw new Error(`${ctx.file}: fragments='${expr}' — empty expression`);
  }
  return steps;
}

function descendantElements(el: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of elements(el)) {
    out.push(c, ...descendantElements(c));
  }
  return out;
}

function matchFragments(context: XmlElement, expr: string, ctx: Ctx): Set<XmlElement> {
  const steps = parseFragmentsExpr(expr, ctx);
  let current = new Set<XmlElement>([context]);
  for (const step of steps) {
    const next = new Set<XmlElement>();
    for (const node of current) {
      const parents = step.axis === 'child' ? [node] : [node, ...descendantElements(node)];
      for (const parent of parents) {
        const kids = elements(parent).filter((k) => step.name === '*' || k.name === step.name);
        if (step.index !== undefined) {
          const k = kids[step.index - 1];
          if (k) next.add(k);
        } else {
          for (const k of kids) next.add(k);
        }
      }
    }
    current = next;
  }
  return current;
}

function withFragments(ctx: Ctx, el: XmlElement): Ctx {
  const expr = el.attributes.fragments;
  if (expr === undefined || el.name === 'fragments') return ctx;
  const matched = matchFragments(el, expr, ctx);
  if (!matched.size) {
    throw new Error(`${ctx.file}: <${el.name} fragments='${expr}'> matches nothing`);
  }
  const set = new Set(ctx.fragmentSet ?? []);
  for (const m of matched) set.add(m);
  return { ...ctx, fragmentSet: set };
}

function ownClasses(el: XmlElement): string[] {
  return (el.attributes.class ?? '').split(/\s+/).filter(Boolean);
}

function classAttr(classes: string[]): string {
  const unique = [...new Set(classes)];
  return unique.length ? ` class='${escapeAttr(unique.join(' '))}'` : '';
}

/** The element's own attributes minus the format's, for passthrough. */
function copiedAttrs(el: XmlElement): string {
  let out = '';
  for (const [k, v] of Object.entries(el.attributes)) {
    if (FORMAT_ATTRS.has(k)) continue;
    out += ` ${k}='${escapeAttr(v)}'`;
  }
  return out;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
