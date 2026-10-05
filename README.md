# BHS CS books

The textbooks for Berkeley High's CS classes, one directory per book, plus
the shared machinery that builds them:

- `bhsawesome/` — **BHSawesome**, a revision of CSAwesome2 (the Runestone
  book CSAwesome, a curriculum for the 2025 revision of the College Board AP
  Computer Science A Course and Exam Description), served at `/bhsawesome/`
  on the bhs-cs website. It was adapted from the source published on
  Runestone and built with PreTeXt in order to serve it directly on the
  class website with our own Java test runner and class database; the
  PreTeXt toolchain has since been retired in favor of building the source
  directly.
- `builder/` — the generic book builder, published as
  `@peterseibel/book-builder`.
- `scripts/` — authoring and maintenance tooling; each tool takes the book
  directory (or the book's root file) as an argument.
- `vendor/` — frozen static assets (the Runestone component bundles and the
  pretext theme files) shared by every book.

```
npm ci
make build        # node scripts/build.ts bhsawesome -> build/out/public/bhsawesome/
make serve        # preview at http://localhost:8237/bhsawesome/
make watch        # rebuild on change
make validate     # schema-validate the source (uv run scripts/validate.py bhsawesome)
```

`CLAUDE.md` has the full tour.

# Formatting `.ptx` files

The `.ptx` files are kept in a canonical layout produced by `xml-format`, the
config-driven XML formatter from
[xml-tools](https://github.com/gigamonkey/xml-tools). Install it (and
`xml-identify`) onto your `PATH` with [uv](https://docs.astral.sh/uv/):

    uv tool install git+https://github.com/gigamonkey/xml-tools

All the PreTeXt-specific formatting behavior — which tags are inline, verbatim
handling of `<program>` and `datafile` `<pre>` bodies, CDATA for code
containing `& < >`, compact elements, the google-java-format hook — is
configured in the checked-in `.xml-formats/ptx.json`. `xml-format` discovers
that config automatically for any `.ptx` file when run from inside the repo,
so no flags are needed:

    xml-format -i bhsawesome/source/loops/for-loops.ptx  # reformat one file in place
    scripts/reformat-all.sh                              # reformat every book file
    scripts/test-all.sh                                  # verify formatting is idempotent

Run any hand-edited `.ptx` file through `xml-format -i` before committing so
diffs stay canonical. With `-f`/`--format-code`, Java code inside `<program>`
elements is additionally piped through google-java-format; that requires
`google-java-format-1.25.2-all-deps.jar` (not checked in) in the current
directory.

# Authors

CSAwesome was based on the Java Review ebook written by Barbara Ericson of
University of Michigan @ericsonga, and revised and reorganized by Beryl Hoffman
of Elms College and the Mobile CSP project in 2019 for the 2019 AP CSA exam as
CSAwesome. Kate McDonnell from Cherry Creek Schools created a JUnit test code
suite in 2020 to provide feedback to students in every active code. Peter Seibel
from Berkeley High School joined the authors and developers in 2023. Many others
have contributed. For the most up to date listing of who has contributed to the
ebook see the Preface.

Peter Seibel then restructured the book into BHSawesome for use in his AP CSA
classes at Berkeley High School.
