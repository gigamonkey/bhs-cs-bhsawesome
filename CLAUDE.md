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
node builder/build.ts     # the whole site -> build/site/ (~400ms)
node builder/watch.ts     # rebuild on any pretext/, builder/, or vendor/ change
```

`builder/` parses the `.ptx` source directly (`@rgrove/parse-xml`, own
xi:include assembly) and emits every page plus the contents/backmatter/index
pages, xref knowl popups, video pages, `exercises.json`, and the lunr search
corpus; `vendor/` holds the committed static trees (Runestone component
bundles built from source, the pretext theme files the chrome still uses,
the CodeLens traces — see `vendor/README.md`). The page chrome is the
committed, hand-maintained `builder/chrome.html`.

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
- `main.ptx` keeps not-yet-ready chapters as commented-out `<!-- ... -->`
  includes. The Makefile's `pretext/full-main.ptx` is `main.ptx` with those
  comments stripped (everything uncommented) — used by the file-listing tooling
  so it can see the whole book.

## Code exercises (the Runestone/JUnit harness)

Interactive Java exercises are `<activity>` → `<program>` elements. Auto-graded
ones carry a `<tests>` block containing a JUnit class that extends
**`CodeTestHelper`**:

```xml
<program interactive="activecode" language="java">
  ...student-visible code...
  <tests>
    public class RunestoneTests extends CodeTestHelper {
        @Test public void testMain() throws IOException {
            String output = getMethodOutput("main");
            boolean passed = getResults(expect, output, "...");
            assertTrue(passed);
        }
    }
  </tests>
</program>
```

`CodeTestHelper.java` (~60KB, from the CSAwesome project) is the grading library
those tests build on — `getMethodOutput`, `getResults`, etc. `CodeDigest.java`
is a tiny CLI wrapper around `CodeTestHelper.codeDigest()`. **Java code lives
inside the `.ptx` XML — the `.ptx` is the source of truth.** Any `*.java` files
extracted under `pretext/**` are gitignored scratch artifacts; do not treat them
as canonical.

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
- Every Runestone `<activity>` needs a `label` attribute — Runestone depends on
  it.
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
- The two extract scripts feed the **monorepo's** runner jar and read the
  ptx source, not any build output: `uv run python extract-tests.py
  --outdir <monorepo>/java/src/main/resources/book-tests --all` (the
  `<tests>` JUnit classes → `book-tests/` resources; lxml) and
  `python3 extract-datafiles.py --monorepo <monorepo>` (datafiles →
  `book-src/` + `book-datafiles/`; stdlib, but shells out to
  `node builder/datafile-uses.ts` for the label→datafiles map). Re-run
  them after editing tests or datafiles in the source.
