# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This is **BHSawesome2**, an AP Computer Science A (Java) textbook served at
`/bhsawesome/` on the bhs-cs website. The source format is PreTeXt-flavored
XML, but the PreTeXt toolchain itself is fully retired (the monorepo's
`plans/bhsawesome-next-steps.md` phase 1): the book is built by our own
`builder/` and the schema is ours to evolve. It is adapted from
**CSAwesome2** and follows the College Board's 2025 AP CSA revision, but
reorders the material and does not mirror the College Board unit/topic
numbering. (The book formerly published to Runestone; that era is over —
zero Runestone dependencies remain.)

The "source code" is almost entirely XML prose: the `.ptx` files under
`pretext/`. The Python/Perl/XSLT/shell scripts at the repo root are authoring
*tooling*, not the product.

## Build & preview

The build is Node only (`npm ci` once; Node 26 type-strips the TypeScript):

```bash
node builder/build.ts        # the whole site -> build/site/ (~400ms)
node builder/watch.ts        # rebuild on any pretext/, builder/, or vendor/ change
node builder/serve.ts        # preview build/site at localhost:8237/bhsawesome/
node builder/check-links.ts  # verify every internal ref resolves (CI runs it)
```

`builder/` parses the `.ptx` source directly (`@rgrove/parse-xml`, own
xi:include assembly) and emits every page plus the contents/backmatter/index
pages, xref knowl popups, video pages, `redirects.json`, `exercises.json`,
and the lunr search corpus; `vendor/` holds the committed static trees
(Runestone component bundles built from source, the pretext theme files the
chrome still uses, the CodeLens traces — see `vendor/README.md`). The page
chrome is the committed, hand-maintained `builder/chrome.html`.

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
`builder/serve.ts` (or the dev website's overlay) — a static server rooted
at `build/site` won't resolve them.

Python tooling for the root scripts is managed by **uv** (`pyproject.toml`,
`uv.lock`, Python ≥3.13; lxml + ruff — run lxml-using scripts through
`uv run`).

`pretext/pretext.rnc` is the RELAX NG schema for validation/editor support.
It is a frozen copy from the last PreTeXt install — ours to evolve as the
source format grows beyond PreTeXt (schema changes need a matching emitter
case in `builder/src/prose.ts` and possibly `.xml-formats/ptx.json`).

## Document structure

- `pretext/main.ptx` is the book root. Each chapter lives in its own directory
  (e.g. `pretext/loops/`, `pretext/methods/`) and is pulled in via
  `<xi:include href="./<chapter>/toctree.ptx" />`. Each chapter's `toctree.ptx`
  in turn includes its section files.
- **Naming convention (enforced by `check-ids.py`):** a section file must be
  named `<its-xml:id>.ptx`, and a chapter's directory name must equal the
  chapter's `xml:id`. Run `./check-ids.py pretext/main.ptx` to find violations;
  `./all-ids.py pretext/main.ptx` dumps every `xml:id` in the book.
- `main.ptx` MAY keep not-yet-ready chapters as commented-out `<!-- ... -->`
  includes (none currently). The Makefile's `pretext/full-main.ptx` is
  `main.ptx` with those comments stripped — used by the file-listing tooling
  so it can see the whole book. The source tree contains ONLY files
  reachable this way: the dead legacy trees were pruned
  (`bhsawesome-next-steps.md` phase 2), so a file that isn't included
  anywhere shouldn't exist.

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
xml-format -i <file>   # reformat in place
./reformat-all.sh      # reformat every pretext/**/*.ptx in place
xml-format -f -i <f>   # also run google-java-format on code (needs the jar)
```

Formatting **must be idempotent** — `./test-all.sh` (or
`./test-idempotency.sh <file>`) verifies that formatting twice yields a stable
result, and prints any file that doesn't. Run this after changing
`.xml-formats/ptx.json`.

The `-f` option shells out to `google-java-format-1.25.2-all-deps.jar`
(gitignored; download separately) to format the Java inside `<program>` bodies.

## Bulk edits via XSLT

Repo-wide structural edits are done with XSLT stylesheets run through small
wrapper scripts that transform then reformat each touched file:

- `./transform <stylesheet.xsl>` — apply an XSLT to every file read on stdin.
- `./cleanup.sh <files...>` (uses `cleanup.xsl`), `./decode.sh` (uses
  `decode.xsl`, targets files containing `<code>`) — common pre-baked passes.

Other root-level helpers: `list-files.py` (book files in topological include
order — drives the Makefile), `hash-contents.py` (hashes every element into
SQLite to find duplicated content; see `show-dupes.sql`), `words.py` (per-section
word counts, drives `words.txt`), `find-in-order.sh <pattern>` (ripgrep in book
order), `make-text.py` (generate the string/array-index SVG diagrams).

## Conventions

- **Prose style:** see `style-guide.txt` (e.g. "2D" not "2d", "subexpression"
  not "sub-expression", "Chapter"/"Section" not "unit"/"lesson", small numbers
  spelled out). `bad-titles.pl` flags titles with nonstandard capitalization.
- Every interactive `<activity>`/`<program>` needs a `label` attribute — it
  is the exercise identity everywhere (component ids, answer tracking, the
  monorepo's book-tests join).
- `TODO.md` tracks outstanding text/formatting cleanup work.
- After editing any `.ptx` by hand, run it through `xml-format -i` before
  committing so diffs stay canonical.

## Publishing (the bhs-cs content overlay)

This repo is one of the bhs-cs content overlay's prefix-scoped publishers
(the monorepo's `plans/done/rehost-bhsawesome.md`): it owns
`public/bhsawesome/`, served at `/bhsawesome/` on the website.

- `.github/workflows/publish.yml` runs `npm ci`, `node builder/build.ts`,
  stages `build/site` as `build/out/public/bhsawesome`, and mirrors it to
  the server with `push-content --only public/bhsawesome/` (needs the
  `BHS_CS_SERVER` variable + `SERVICE_KEYS_SECRET` secret configured on
  GitHub — `./setup.sh` provisions both). Keep the workflow file named
  `publish.yml` — the monorepo's `scripts/republish` dispatches it by that
  exact name. `push-content` is a bin of the pinned
  `@peterseibel/bhs-content` devDependency; bumping it is
  `npm update @peterseibel/bhs-content`.
- `python3 extract-datafiles.py --monorepo <monorepo>` feeds the
  monorepo's runner jar: it copies each needed dataset from
  `pretext/assets/_static/datasets/` to `book-datafiles/` and writes the
  `book-tests/<label>.datafiles` manifests, with the label→files map from
  `node builder/datafile-uses.ts` (the `datafile` attributes in the live
  source). Re-run after editing a dataset or a `datafile` attribute.
  (There is no extract-tests anymore — tests are edited directly in the
  monorepo's `book-tests/`; and the jar "datafiles"' split classes in
  `java/book-src/` are canonical, hand-editable sources.)
