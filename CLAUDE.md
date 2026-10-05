# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This repo holds the **BHS CS books** — one directory per book — plus the
shared machinery that builds them. Today there is one book:

- **`bhsawesome/`** — **BHSawesome2**, an AP Computer Science A (Java)
  textbook served at `/bhsawesome/` on the bhs-cs website. The source
  format is PreTeXt-flavored XML, but the PreTeXt toolchain itself is
  fully retired (the monorepo's `plans/bhsawesome-next-steps.md` phase 1):
  the book is built by our own `builder/` and the schema is ours to
  evolve. It is adapted from **CSAwesome2** and follows the College
  Board's 2025 AP CSA revision, but reorders the material and does not
  mirror the College Board unit/topic numbering. (The book formerly
  published to Runestone; that era is over — zero Runestone dependencies
  remain.)

The shared parts:

- **`builder/`** — the generic book builder, published to npm as
  **`@peterseibel/book-builder`** (see below). Nothing book-specific
  lives here.
- **`scripts/`** — authoring/maintenance tooling (Python, TypeScript,
  shell, Perl, XSLT). Every tool that needs a book takes **the book
  directory** (e.g. `bhsawesome`) as its first argument, or the book's
  root file (`<book>/source/main.ptx`) where it works on one file; nothing
  defaults to a particular book. The Makefile's `BOOK ?= bhsawesome`
  supplies the usual one (`make build BOOK=other`).
- **`vendor/`** — committed frozen static assets shared by every book: the
  Runestone component bundles (trimmed, built from source) and the pretext
  theme files the chrome still uses (`vendor/README.md`).
- **`.xml-formats/ptx.json`** — the `xml-format` config; discovered by
  file extension, so one config serves every book.

The "source code" is almost entirely XML prose: the `.ptx` files under
`<book>/source/`. Everything else is tooling, not the product.

### A book directory

```
bhsawesome/
├── book.ts            # the BookConfig: everything book-specific the builder needs
├── source/            # main.ptx, one directory per chapter, assets/
├── schema.rnc         # the book's schema driver (includes builder/schema/core.rnc)
├── schema.rng, core.rng   # trang-compiled; what validate.py reads (make schema)
├── schemas.xml        # nxml locating rules: every .ptx below gets schema.rnc
├── chrome.html, book.css, permalinks.js, fonts/   # the page shell (per book for now)
├── traces/            # the committed CodeLens traces (traces/README.md)
├── shots.mjs          # the screenshot harness's page set
├── logo/              # SVG logo source + the uv script that outlines its text
├── TODO.md, style-guide.txt, scratch.xml   # authoring notes; cut-text stash
```

A second book is another directory with the same shape. The schema is
split so that adding a book never touches `builder/`: the shared grammar
is `builder/schema/core.rnc` (a new element means editing it and the
emitter), and the per-book driver adds only the book's `<box kind>`/
`<aside kind>` enumerations, which must agree with its `BookConfig`
`boxKinds`/`asideKinds` and its CSS. BHSawesome uses neither yet, so its
driver is a near-empty placeholder.

The chrome (`chrome.html`, `book.css`, fonts) hardcodes the book's base
URL, title and logo; a second book copies and edits it. Lifting a shared
theme out is future work, once there is a second book to compare against.

## Build & preview

The build is Node only (`npm ci` once; Node 26 type-strips the TypeScript):

```bash
make build            # = node scripts/build.ts bhsawesome -> build/out/public/bhsawesome/ (~1s)
make watch            # = node scripts/watch.ts bhsawesome: rebuild on any book, builder/,
                      #   or vendor/ change — a page edit re-emits just that page
                      #   (build.ts --only-files), the whole book catching up once edits pause
make serve            # = node scripts/serve.ts bhsawesome: preview at localhost:8237/bhsawesome/
make check-links      # = node scripts/check-links.ts bhsawesome: every internal ref resolves (CI runs it)
make validate         # = uv run scripts/validate.py bhsawesome: schema-validate every source file (CI runs it)
```

`builder/` parses the `.ptx` source directly (`@rgrove/parse-xml`, own
xi:include assembly) and emits every page plus the contents/backmatter/index
pages, xref knowl popups, video pages, `redirects.json`, `exercises.json`,
and the lunr search corpus. `scripts/build.ts` finishes by writing the
slice's version stamp, `version.txt` (the short git sha, `-dirty` if the
tree had uncommitted changes).

**URL scheme** (the monorepo's `plans/bhsawesome-index-html-urls.md`):
every page is an `index.html` in its own directory, addressed by a slashed
root-relative URL — `/bhsawesome/` (contents), `/bhsawesome/<chapter>/`,
`/bhsawesome/<chapter>/<section>/`, `/bhsawesome/frontmatter/<preface>/`,
`/bhsawesome/backmatter/{book-index,colophon}/`, `/bhsawesome/video/<label>/`.
A `Division.page` is the extensionless path; `builder/src/urls.ts` is the
only place it becomes a URL (`href`) or an output file (`fileFor`), and
every emitted ref is root-relative (pages sit at multiple depths, and the
shared toc.js/search corpus can't be depth-relative). `redirects.json`
maps each old flat `<id>.html` name to its new URL; the web app serves
those as 301s. Because the refs are root-relative, preview through
`scripts/serve.ts` (or the dev website's overlay) — a static server rooted
at the output dir won’t resolve them.

Python tooling in `scripts/` is managed by **uv** (`pyproject.toml`,
`uv.lock`, Python ≥3.13; lxml + ruff). The lxml scripts have a
`#!/usr/bin/env -S uv run` shebang, so `scripts/foo.py …` from the repo
root just works.

The schema is ours, written fresh for the vocabulary the builder actually
supports (the stock PreTeXt grammar is retired): the shared core is
`builder/schema/core.rnc` (documented in `builder/FORMAT.md`, shipped in
the package), and `<book>/schema.rnc` is the book's driver. `make
validate` (and CI) validate every source file against the committed,
trang-compiled `<book>/schema.rng` — regenerate it with `make schema`
after editing either `.rnc`. A format change needs the matching emitter
case in `builder/src/prose.ts` (or `components.ts`), the schema, and
possibly `.xml-formats/ptx.json`.

The builder itself is generic (everything book-specific is the
`BookConfig` in `<book>/book.ts`) and is published to npm as
**`@peterseibel/book-builder`** for bhs-cs-content's builds (release with
`make release-book-builder`, the monorepo's release-bhs-content pattern;
the publish-book-builder workflow publishes on the tag via npm Trusted
Publisher — it runs `npm test` in builder/ and a whole-book build first).

The package also builds a second document type: **XML slide decks** (the
monorepo's `plans/xml-slides.md`) — `buildSlideDeck`/`deckMeta` in
`builder/src/slides/slides.ts`, grammar `builder/schema/slides.rnc`, prose
companion `builder/SLIDES-FORMAT.md`, tests `builder/test/slides.test.ts`
(`npm test` in builder/). bhs-cs-content's slides pass consumes it; this
repo's books don't use it. The emitted HTML is DOM-equivalent to the
retired Lisp slides pipeline's — that parity is pinned by the tests, so
treat any deliberate change to the emitted shapes as a format-version
event for the content repo's decks.

## Document structure

- `<book>/source/main.ptx` is the book root. Each chapter lives in its own
  directory (e.g. `bhsawesome/source/loops/`, `…/methods/`) and is pulled in
  via `<xi:include href="./<chapter>/toctree.ptx" />`. Each chapter's
  `toctree.ptx` in turn includes its section files.
- **Naming convention (enforced by `scripts/check-ids.py`):** a section
  file must be named `<its-xml:id>.ptx`, and a chapter's directory name
  must equal the chapter's `xml:id`. `make check-ids` (silent when clean)
  finds violations; `scripts/all-ids.py <book>/source/main.ptx` dumps every
  `xml:id` in the book.
- The source tree contains ONLY files reachable from `main.ptx` via
  `xi:include` (the dead legacy trees were pruned,
  `bhsawesome-next-steps.md` phase 2), so a file that isn't included
  anywhere shouldn't exist. `make files` lists them in reading order.

## Code exercises

Interactive Java exercises are `<program interactive="activecode">` elements
(often inside a labeled `<activity>`); the `.ptx` carries the
student-visible starter code only. **The tests live in the bhs-cs
monorepo**, not here: `java/src/main/resources/book-tests/<label>.java`
(JUnit classes extending `CodeTestHelper`, run by the runner's
BookTestRunner under the native protocol; the exercise's `label` is the
join key). Editing an exercise's grading means editing the monorepo and
rebuilding/deploying the runner jar — the source `<tests>` blocks were
deleted when canonical ownership flipped (`bhsawesome-next-steps.md`
phase 2).

A program is **graded by default**; the few ungraded demos carry
`run-only="yes"` (our schema attribute — the emitter renders them as
run-only widgets with no results table). Every activity/program keeps its
`label` attribute — it is the exercise identity everywhere (the
`rs-<label>` component id, answer tracking, the book-tests join).

## Formatting `.ptx` files — `xml-format`

Formatting is done with `xml-format` from
[xml-tools](https://github.com/gigamonkey/xml-tools), installed on `PATH` with
`uv tool install git+https://github.com/gigamonkey/xml-tools` (not via this
project's venv). It re-serializes XML to a canonical layout (2-space indent,
80-col fill for prose, verbatim handling for `<program>`, CDATA when code
contains `& < >`, special inline-tag set, etc.), all driven by the checked-in
config **`.xml-formats/ptx.json`**, which it discovers automatically for
`.ptx` files anywhere under the repo.

```bash
xml-format -i <file>              # reformat in place
scripts/reformat-all.sh [dir]     # reformat every .ptx under dir (default: the whole repo)
xml-format -f -i <f>              # also run google-java-format on code (needs the jar)
```

Formatting **must be idempotent** — `scripts/test-all.sh [dir]` (or
`scripts/test-idempotency.sh <file>`) verifies that formatting twice yields
a stable result, and prints any file that doesn't. Run this after changing
`.xml-formats/ptx.json`.

The `-f` option shells out to `google-java-format-1.25.2-all-deps.jar`
(gitignored; download separately) to format the Java inside `<program>` bodies.

## scripts/

Each tool's header comment has its usage. By family:

- **Build entry points** (TypeScript, `node scripts/<x>.ts <book> …`):
  `build.ts`, `watch.ts`, `serve.ts`, `check-links.ts`, and
  `datafile-uses.ts` (the label→datafiles JSON `extract-datafiles.py`
  consumes). `lib/book.ts` is the shared "resolve the book dir, import its
  `book.ts`" helper.
- **Source checks** (Python via uv): `validate.py <book>`,
  `check-ids.py <root>`, `all-ids.py <root>`, `list-files.py <root>`
  (book files in reading order), `words.py <root>` (per-section word
  counts → `make words`), `hash-contents.py <db> <root>` +
  `show-dupes.sh <db>` (hash every element into SQLite to find duplicated
  content). `node scripts/fix-keywords.mjs <book> [--check]` keeps `<k>`
  (single Java keyword) vs `<c>` (inline code) straight.
- **Bulk edits**: `transform <stylesheet.xsl>` applies an XSLT in place to
  every file on stdin and reformats each; `rename-files.py <book> <config>`
  renames `.ptx` files and keeps their `xml:id`s, includes and xrefs in
  sync (dry-run with `-n`). `fix-javadocs.pl` repoints Oracle javadoc
  links at each JDK bump.
- **Prose**: `find-in-order.sh <book> <pattern>` (ripgrep in reading
  order); `titles.xsl` + `bad-titles.pl` flag titles with nonstandard
  capitalization; `make-text.py` generates the string/array-index SVG
  diagrams.
- **Regression harness** (Playwright): `shoot.mjs <book> <outdir>`
  screenshots the book's `shots.mjs` page set from a built site,
  `shoot-one.mjs` any page, `compare.mjs` pixel-diffs two shot dirs,
  `text-parity.mjs <book>` digests every page's visible text so an emitter
  change can prove it didn't alter what the book says. `lib/site-server.mjs`
  is their throwaway static server (mounts the site at the book's base).
- **Infra**: `setup.sh` provisions the publish workflow's GitHub variable
  and secret.

## Conventions

- **Prose style:** see `bhsawesome/style-guide.txt` (e.g. "2D" not "2d",
  "subexpression" not "sub-expression", "Chapter"/"Section" not
  "unit"/"lesson", small numbers spelled out).
- Every interactive `<activity>`/`<program>` needs a `label` attribute — it
  is the exercise identity everywhere (component ids, answer tracking, the
  monorepo's book-tests join).
- `bhsawesome/TODO.md` tracks outstanding text/formatting cleanup work.
- After editing any `.ptx` by hand, run it through `xml-format -i` before
  committing so diffs stay canonical.

## Publishing (the bhs-cs content overlay)

This repo is one of the bhs-cs content overlay's prefix-scoped publishers
(the monorepo's `plans/done/rehost-bhsawesome.md`): it owns
`public/bhsawesome/`, served at `/bhsawesome/` on the website.

- `.github/workflows/publish.yml` runs `npm ci`, validates the source,
  `node scripts/build.ts bhsawesome` (which emits straight to
  `build/out/public/bhsawesome` — the overlay-shaped tree push-content
  expects, no staging step — and finishes by writing `version.txt`, served
  at `/bhsawesome/version.txt` so the monorepo's `scripts/since-deployed
  book` can tell what's on origin/main but not yet published), checks
  links, and mirrors it to the server with `push-content --only
  public/bhsawesome/` (needs the `BHS_CS_SERVER` variable +
  `SERVICE_KEYS_SECRET` secret configured on GitHub — `scripts/setup.sh`
  provisions both). Keep the workflow file named `publish.yml` — the
  monorepo's `scripts/republish` dispatches it by that exact name.
  `push-content` is a bin of the pinned `@peterseibel/bhs-content`
  devDependency; bumping it is `npm update @peterseibel/bhs-content`.
- `uv run scripts/extract-datafiles.py bhsawesome --monorepo <monorepo>`
  feeds the monorepo's runner jar: it copies each needed dataset from
  `bhsawesome/source/assets/_static/datasets/` to `book-datafiles/` and
  writes the `book-tests/<label>.datafiles` manifests, with the label→files
  map from `scripts/datafile-uses.ts` (the `datafile` attributes in the
  live source). Re-run after editing a dataset or a `datafile` attribute.
  (There is no extract-tests anymore — tests are edited directly in the
  monorepo's `book-tests/`; and the jar "datafiles"' split classes in
  `java/book-src/` are canonical, hand-editable sources.)
