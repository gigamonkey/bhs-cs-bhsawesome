# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This is **BHSawesome2**, an AP Computer Science A (Java) textbook written in
[PreTeXt](https://pretextbook.org/) and published to the
[Runestone](https://runestone.academy/) interactive ebook platform. It is
adapted from **CSAwesome2** (the `CSAawesome2`/`CSAwesome2` upstream referenced
in recent commits) and follows the College Board's 2025 AP CSA revision, but
reorders the material and does not mirror the College Board unit/topic numbering.

The "source code" is almost entirely XML prose: ~324 `.ptx` files under
`pretext/`. The Python/Perl/XSLT/shell scripts at the repo root are authoring
*tooling*, not the product.

## Build & preview

Python tooling is managed by **uv** (`pyproject.toml`, `uv.lock`, Python ≥3.13).
Run everything through `uv run` so the pinned `pretext`/`lxml`/`ruff` are used.

```bash
uv run pretext build web        # build the standalone HTML target
uv run pretext build runestone  # build the Runestone-hosted target
uv run pretext view web         # build + serve locally with live reload
./watch                         # watchman-triggered rebuild on any pretext/ change
```

Targets are defined in `project.ptx`: **web** (HTML, `publication/html.xml`),
**runestone** (`publication/runestone.xml`), and **print** (PDF). Both HTML
targets build from `pretext/main.ptx`.

`pretext.rnc` is the RELAX NG schema for validation/editor support; refresh it
after a pretext upgrade with `./update-schema`.

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
