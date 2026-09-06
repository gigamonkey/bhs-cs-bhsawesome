# The book source format

The shared, PreTeXt-derived XML format @peterseibel/book-builder builds
(the bhs-cs monorepo's `plans/bjc-quarto-to-xml.md`). It started as the
subset of PreTeXt BHSawesome actually used and is ours to evolve; the
grammar is `schema/core.rnc` (RELAX NG compact), which each book's driver
schema includes — this document is the prose companion. The three artifacts
that must stay in sync when the format changes: an emitter case
(`src/prose.ts` / `src/components.ts`), the schema, and possibly the
book's `.xml-formats/ptx.json` (inline/verbatim/compact treatment for the
formatter).

Source files are `.ptx`, assembled from a book root (`main.ptx`) via
`xi:include`, formatted canonically by `xml-format` (2-space indent,
80-column fill), and validated in CI against the book's compiled `.rng`.
File-naming convention: a division file is named `<its-xml:id>.ptx`; a
chapter's directory equals the chapter's `xml:id` (`check-ids.py`).

## Divisions

`book` > `frontmatter` (with `preface`s) | `chapter` > `section` >
`subsection` | `page`. Which levels get their own output pages is the
book's `chunkDepth` (BookConfig): 2 for BHSawesome (sections are pages,
subsections inline), 3 for BJC (unit=chapter, lab=section, page=page). A
division's `<introduction>`/`<conclusion>` render inline on its own page,
never as pages of their own; a division above the chunk depth renders a
summary page (heading, inline introduction, links to child pages).
Division type labels ("Chapter"/"Section" vs "Unit"/"Lab"/"Page") come
from BookConfig `divisionLabels`.

Every division has an `xml:id` (an NCName — it becomes the URL path
segment and the filename). `<title>` conventionally comes first (after any
`<idx>` entries).

## Blocks

- `<p>` — inline content only; block content lives as siblings.
- `<ul>`, `<ol type="a|A|i|I|1">`, `<li>`, `<dl>` (li with `<title>`).
- `<figure align?>` + `<caption>` + content; numbered per section.
- `<image source>` — block form renders a centered image-box sized by
  `%`-width. See "Images" below for the inline/float extensions.
- `<video youtube label/>` — inline embed plus a standalone
  `/video/<label>/` page.
- `<table>` + `<tabular>`/`<col>`/`<row>`/`<cell>` — PreTeXt's border
  model (`top/bottom/left/right` = `none|minor|medium|major`, cell > row/col
  > tabular precedence), `halign`/`valign`, `row-headers`.
- `<note>` — the one classic admonition; titled, numbered.
- `<blockquote>` + `<attribution>`.
- `<pre>`, `<code>`, `<listing>` (captioned, numbered), `<program>` —
  display code, syntax-highlighted at build time (`language` defaults per
  book; `language="text"` for output). `<program interactive="activecode">`
  is the graded exercise widget (`run-only="yes"` for ungraded demos;
  `datafile="a.csv"` names needed data files).
- `<sidebyside widths margins valign>` with `<stack>`/panel children —
  the CSS-grid row layout; `<gutterimage source description>` — an image
  in the left margin gutter beside block content.
- `<activity>`/`<project>`/`<exercise>` — numbered blocks whose body is
  prose (`statement`, `solution`/`answer`/`hint` knowls) or an interactive
  payload (see below). `label` is the exercise identity everywhere.
- `<idx>` / `<idx><h>…</h><h>…</h></idx>` — index entries.

## Inline

`<c>` (code), `<k>` (language keyword), `<term>`, `<em>`, `<strong>`,
`<var>` (a program/Snap! variable name), `<pubtitle>`, `<m>` (TeX math,
prerendered to SVG at build time), `<url href visual?>`, `<xref ref
text?>` (division refs link; block refs become knowl popups), `<fillin>`
(in fillin payloads), `<area>` (in clickable payloads).

## Shared-format extensions (beyond PreTeXt)

- **`<box kind="…">` / `<aside kind="…">`** — the generic
  admonition/callout block and its margin/floating sibling. Each book
  enumerates its kinds in its driver schema and registers rendering in
  BookConfig `boxKinds`/`asideKinds` (css class, optional fixed title,
  collapsible-with-label). A new kind is config + schema-enum + css — not
  a new element.
- **`<task>`** — a numbered "for you to do" step, numbered continuously
  per page (independent of the section-scoped block numbering).
- **`<todo>` / `<comment>` / `<standard>`** — author-only content:
  preserved in source, emitted nowhere. `<standard>` carries a
  curriculum-standard code (the AP CSP EK annotations).
- **`<reveal label="…">`** — click-to-expand content (renders as
  `<details>`).
- **`<iframe src width? height?>`** — the rare embedded page.
- **`<assignment material="…" [assignment="kind/name"]>text?</assignment>`**
  — a BHS assignment link: emits the `bhs-assignment` contract
  (`data-material`/`data-assignment`/`data-autotitle`) that the website
  resolves per viewer (`/api/bjc/resolve`). No text → the client fills in
  the assignment/material title.
- **`<checkpoint material="…"/>`** — the button-styled checkpoint-quiz
  link (same resolution contract).

## Images

`<image source="…">` resolves under the book's assets tree (served at
`<base>/external/…`). Attributes:

- `width` — with a `%` sign, the PreTeXt centered-box width; a bare
  number is a pixel width on a bare `<img>`.
- `placement="inline|left|right|indent"` — flow the image inline in a
  sentence, float it, or indent it (bare `<img>`, no box).
- `alt` text: a `<shortdescription>` child or the `description`
  attribute; `title` is the hover tooltip.
- `shadow="no"` — suppress the book's default image shadow.
- `animated="click-to-play"` — a gifffer GIF: the runtime swaps the
  animation in on click (`data-gifffer`).
- `<hotspot shape="rect|circle|poly" coords="…">` children make the image
  an image map (BJC's hover-a-number components diagram): each hotspot's
  block content pops up on hover over its region, driven purely by the
  theme's `.hoverinfo` CSS (the `<area>`'s `:hover` reaches its ancestor
  div). Coords are HTML `<area>` coords in the image's **rendered** pixel
  space — image maps don't scale — so give a hotspot image bare-number
  `width`/`height` pinning its displayed size to the coord space. Emitted
  as `div.image-map` > (`map` > `div.hoverinfo` > `area` + content) +
  `img[usemap]`; the map name is the image's `xml:id` (or a generated
  `image-map-N`).

## Interactive payloads (inside activity/project/exercise)

Detected by payload element: `<choices><choice correct><statement/feedback>`
(multiple choice), `<blocks><block><cline>` (Parsons;
`layout="horizontal"` for hparsons), `<areas>` + `<cline>`/table
(clickable area), `<cardsort><match><premise/response>` (drag and drop),
`<fillin>` + `<evaluation><evaluate><test>` (fill-in-the-blank),
`<response/>` (ungraded short answer), `<datafile>` (static data display),
`<program interactive>` (activecode / codelens).

## Numbering and ids

Blocks (`activity`, `project`, `exercise`, `figure`, `table`, `listing`,
`note`) share one serial counter per section-level division ("Activity
2.1.9" and "Figure 2.1.5" count each other). Tasks number 1..N per page.
An element without `xml:id` gets the PreTeXt positional id
`<ancestor-id>-<i>-<j>`; a component `label` acts as its id.
