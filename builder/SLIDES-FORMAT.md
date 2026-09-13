# The XML slide-deck format

The second document type @peterseibel/book-builder builds (the bhs-cs
monorepo's `plans/xml-slides.md`): a `slides.xml` deck compiled into a
self-contained reveal.js page. It replaced the Lisp/Markup slides pipeline
in bhs-cs-content; the emitter (`src/slides/slides.ts`) produces HTML
DOM-equivalent to what that pipeline produced, which is how the migration
was verified. The grammar is `schema/slides.rnc`; this is the prose
companion.

The API: `buildSlideDeck({ deckFile, outFile, defaultLanguage })` compiles
one deck; `deckMeta(deckFile)` reads its metadata (title/courses/grading)
without building. The module knows nothing about the content repo's layout
— the caller owns paths and the default language.

## Structure

```xml
<deck courses="csa">
  <title>2d arrays</title>
  <fragments>
    <p>Content before the first slide shares the title slide.</p>
  </fragments>

  <slide>
    <title>Remember</title>
    <p><c>int[] array</c> — an array of <c>int</c></p>
  </slide>
</deck>
```

- **`<deck>`** — the root. Its `<title>` renders the `<h1>` title slide,
  the page's head title, and names the deck in the materials index — one
  title, one place (a title-less deck falls back to its directory name in
  the index); deck content before the first `<slide>` joins the title
  slide. The rest of the metadata rides as attributes — there is no
  metadata.yml: `courses="csa csp"` (space-separated) and `grading="…"`
  (default `none`).

- **`<slide>`** — one reveal `<section>`. An optional leading `<title>`
  renders as `<h2>` (`level="1"`/`"3"` for h1/h3). No `<title>` = an
  untitled slide; an empty `<title/>` renders a deliberately blank heading
  that keeps the heading's line box. A leading `<repl>` stands in title
  position instead (below).

## Prose

`<p>`, `<ul>`/`<ol>`/`<li>` (items hold inline content, or block content —
paragraphs, code — when they need it). Inline: `<c>` (code), `<em>`,
`<strong>`, `<vocab>` (a vocabulary term — semantic, not just styling),
`<m>` (TeX math, rendered client-side by the deck's MathJax), `<sup>`,
`<sub>`, `<a href="…">` (http links open in a new tab unless `target=` says
otherwise), `<img src="…"/>`, `<br/>`.

**Anything else passes through**: an element the format doesn't model is
emitted as the HTML element it names, attributes and all. That is the
"generate custom HTML when needed" half of the format's purpose —
`<div class="bigcode">`, `<span class="hl">`, `<small>`, an inline `<i>` —
no escape hatch needed for ordinary HTML. For markup that XML can't
express, `<html>` holds verbatim HTML (CDATA), block or inline, and
`<html src="file"/>` inlines a deck-local file.

## Code blocks

`<code>` (block form — inline code is `<c>`) holds verbatim text and
renders as reveal's `<pre><code data-trim data-noescape>`:

```xml
<code>
  for (int i = 0; i &lt; 10; i++) {
    System.out.println(i);      {{hl:1}}
  }
</code>
```

- Text starting with a newline is de-indented (first newline dropped,
  common indent stripped, trailing whitespace trimmed) so the XML can stay
  indented; text starting immediately after the tag is taken verbatim.
- `{{hl:n[,n]}}` at the end of a line adds that line to highlight step n
  (`data-line-numbers` steps, grouped and ordered by n). A bare
  `{{linenumbers}}` marker asks for plain always-on line numbers.
- **`language` is an inherited attribute**: legal on `<deck>`, `<slide>`,
  or any element, nearest ancestor wins; the build supplies the outermost
  default (the subcat name in bhs-cs-content). `language="none"` cancels
  it (no highlighting class). There is no content sniffing.

## Fragments

The reveal.js control surface — the reason this format exists:

- `fragment=""` on ANY element makes it a fragment; a value adds fragment
  styles (`fragment="fade-up"`, `"highlight-red"`); `findex="2"` sets
  `data-fragment-index`. This composes with `class="…"`.
- `<fragments>` wraps a run of blocks and makes each child a fragment.
  Two special cases carried over from the Markup pipeline: a single
  `<ul>`/`<ol>` child makes the *items* the fragments (use `fragment=""`
  on the list itself to reveal it whole — the thing the old format
  couldn't say), and a `<table>` child takes the class itself.
- `<table fragments="rows">` / `fragments="cells"` reveal a table by rows
  or by data cells.

## REPL slides

```xml
<slide><repl><in>(int) 3.14</in><out>3</out></repl></slide>
```

renders the two-step REPL heading (prompt + expression, then the value) —
the old format's `expr ⟹ value` header. `level="3"` for an h3-sized one.

## Tables

Literal `<table>`/`<tr>`/`<th>`/`<td>`, attributes passed through
(`align="center"`, `class=…`). Cells hold inline content, or blocks when
they need them.

## Speaker notes

`<notes>` renders as reveal's `<aside class="notes">` (the notes plugin is
loaded in every deck; press S for the speaker view).

## class= and the stylesheet

`class="…"` is legal on every element and lands on the emitted HTML,
appended after any classes the emitter generates. The deck stylesheet
lives WITH the decks — bhs-cs-content's `materials/slides/custom.css`,
served at the `/reveal/dist/custom.css` URL the shell links (the content
build routes it there; the website's overlay-first static mounts serve
it) — so a one-off look is one content-repo commit: a `class=` in the
deck plus (if it isn't one of the existing classes — `bigcode`,
`smallcode`, `tinycode`, `smaller`, `hl`, `dbtable`, …) a rule in that
file. No website deploy involved.
