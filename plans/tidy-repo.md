# Tidy the repo for a second book

The repo root is a sediment layer from BHSawesome's three lives (the
Runestone `.rst` book, the true-PreTeXt book, and now our own
PreTeXt-derived format built by `builder/`): ~40 loose scripts and
stylesheets, a Java source dump, logo scratch, a proofreading log, and a
rename config that was applied in June 2026. Meanwhile the book itself
(`pretext/`) and its book-specific build inputs (`builder/bhsawesome.ts`,
`chrome.html`, `book.css`, `fonts/`, `permalinks.js`, `vendor/generated/`)
are scattered across three top-level directories. Before a sibling book
lands, the root should hold only the shared infrastructure, every
reusable tool should live in `scripts/`, and everything BHSawesome-specific
should live under `bhsawesome/`.

Three phases, each its own commit(s), each leaving the build green:

1. **Delete** what nothing needs anymore.
2. **`scripts/`** — move the reusable tooling there and make each script
   take the book as an argument instead of assuming `pretext/`.
3. **`bhsawesome/`** — move the book and its build inputs there.

The invariant for phases 2 and 3: the emitted site is byte-identical
before and after (`diff -r` of two `build/out` trees, ignoring
`version.txt`). Phase 1 can't change the output at all.

## Target layout

```
.
├── CLAUDE.md  README.md  LICENSE.txt  Makefile
├── package.json  package-lock.json  pyproject.toml  uv.lock  .python-version
├── .github/workflows/{publish,publish-book-builder}.yml
├── .xml-formats/ptx.json          # xml-format config (discovered by extension; covers every book)
├── builder/                       # the generic @peterseibel/book-builder package, unchanged
├── vendor/                        # shared frozen assets: _static/ (Runestone bundles + pretext theme)
├── scripts/                       # book-agnostic tooling; each takes a book dir / root file
└── bhsawesome/                    # THE BOOK
    ├── book.ts                    # the BookConfig (was builder/bhsawesome.ts)
    ├── chrome.html  book.css  permalinks.js  fonts/   (were builder/)
    ├── schema.rnc  schema.rng  core.rng  schemas.xml  (were pretext/bhsawesome.rn[cg] etc.)
    ├── source/                    # was pretext/: main.ptx, the chapter dirs, assets/
    ├── traces/                    # was vendor/generated/: the 5 CodeLens traces
    ├── logo/                      # the SVG logo sources
    ├── TODO.md  style-guide.txt  scratch.xml
```

Conventions a second book (`<book>/`) follows: `book.ts` exports
`config`, `source/main.ptx` is the root, `schema.rnc` is its driver
(including `../builder/schema/core.rnc`), `schemas.xml` beside it gives
Emacs nxml the schema for every `.ptx` beneath. The output stays at
`build/out/public/<base>` — the monorepo's dev-all and push-content both
read `build/out`, so nothing outside this repo moves.

**Not in scope:** renaming the GitHub repo (`gigamonkey/bhs-cs-bhsawesome`
is baked into the npm Trusted Publisher link, `builder/package.json`'s
`repository.url`, and `setup.sh`); templating `chrome.html` so sibling
books can share one chrome (it hardcodes `/bhsawesome/` paths, the title
and the logo — a second book copies and edits it for now, and lifting a
shared `theme/` is its own plan once there is a second book to compare
against).

## Phase 1 — delete the vestiges

Everything here has no references (checked with `rg` across the repo, the
Makefile, the workflows and CLAUDE.md) and either did a one-shot job that
is finished or targets vocabulary the schema no longer has. Git keeps them
if anyone ever wants to look.

| Delete | Why |
| --- | --- |
| `add-time-markers.pl`, `remove-time.xsl` | `<time>` isn't in the schema; zero occurrences in the source. |
| `cleanup.sh`, `cleanup.xsl` | The one-shot normalization of the Runestone-generated PreTeXt. Its remaining matches (`language="java"` in 54 files, `image/@alt` in 4, `url/@visual` in 17) are all schema-legal; the two still wanted are TODO.md items better done once with a fresh stylesheet through `transform`. |
| `decode.sh`, `decode.xsl` | Converted `<p><code>` to `<c>`; zero `p/code` left (the 87 `<code>` hits are `<program>` children, which is the format). |
| `fix-quick-ref.pl` | One-shot URL rewrite (Google Drive → College Board), applied 2025-07. |
| `ids.xsl`, `refs.xsl`, `outline.xsl`, `just-programs.xsl` | `all-ids.py` supersedes `ids.xsl` (and resolves includes); `builder/check-links.ts` supersedes the ids/refs dangling-xref check; `outline.xsl` is a 2025-07 course-planning dump ("Unit … (2 weeks)"); `just-programs.xsl` fed the retired test extraction. Also drop the Makefile's `%.txt: %.xsl` rule with them. |
| `rename-config.txt` | The June 2026 rename mapping, long since applied. `rename-files.py`'s docstring carries the format and an example. |
| `commas.txt` | The log of the 2026-08-29 comma-proofreading pass. |
| `list-activities.py` | Written for the component click-through; now wrong on two counts (it computes the retired `<stem>.html` URLs and detects grading from `<tests>` blocks that no longer exist in the source). The builder's `exercises.json` is the live listing. |
| `list-urls.py` | A Python re-implementation of the builder's chunking, written for the directory-URL migration; nothing calls it and it will drift from `builder/src/book.ts`. If a page listing is ever wanted again, it should be a few lines over `loadBook()`, not a second chunker. |
| `TurtleJavaHTMLCode/` | The concatenated-source turtle "datafile" classes (revived 2025-07 for the Runestone jar-datafile mechanism). CLAUDE.md records that the split classes in the monorepo's `java/book-src/` are the canonical, hand-editable sources now. Nothing references the directory. |
| `migration-tools/census.mjs`, `migration-tools/runtime-census.mjs` | The class-audit ledger generators for the CSS-cleanup plan (done 2026-08-09; the README says to delete when the vocabulary work is over, and the directory hasn't been touched since 2026-08-23). The ledger they wrote lives in the monorepo's `plans/done/`. The other four tools in that directory are kept — see phase 2. |
| `pretext/reorg.sh` | The 2025-07 one-shot that created the chapter directories. |
| `pretext/rs-substitutes.xml` | Runestone poll substitutes from the 2024-12 PreTeXt generation; unreferenced. |
| `logo/` scratch: `big-*.png`, `make-images.sh`, `images.html`, `logo.html`, `prism.css`, `prism.js`, `jac.png`, `snap-*.png`, `bhsawesome-logo-old.svg` | The PNG-era logo experiments and unrelated scratch. Keep `bhsawesome-logo.svg` (the source of `assets/_static/BHSawesomeLogo.svg`, byte-identical today), `outline-text.py` (the uv script that produces it), `logo.png`/`logo-transparent.png` (the raster exports). Pruning this is the one judgment call in this phase — skip it if any of these are wanted. |

Also in this phase, in `Makefile`: drop the `all: pretext/files.txt
words.txt pretext/full-main.ptx` default and the `all-files.mk`
auto-dependency machinery. It exists to make `words.txt` and
`pretext/files.txt` rebuild when any chapter changes — fine, but the
`full-main.ptx` indirection (uncommenting `<!-- <xi:include> -->` lines so
not-yet-ready chapters count) serves a case CLAUDE.md says is empty ("none
currently") and that the "only reachable files exist" rule argues
against. `rename-files.py` has its own copy of the uncomment logic
(`book_ptx_files`); simplify it to read `main.ptx` as-is at the same time.
`list-files.py`, `words.py` and `find-in-order.sh` then run on `main.ptx`
directly. Update `.gitignore` (`pretext/files.txt`, `pretext/full-main.ptx`,
`all-files.mk` go; `words.txt`, `*.db`, `first.xml`/`second.xml` stay).

Verify: `node builder/build.ts && node builder/check-links.ts` and
`uv run ./validate.py` still pass (they can't not, but run them).

## Phase 2 — `scripts/`

Move every surviving tool into `scripts/` and remove its `pretext/`
assumption. The convention: a script that needs the book takes **the book
directory** (`bhsawesome`) as its first positional argument, or the root
file where it already takes one; nothing defaults to a particular book.
The Makefile carries `BOOK ?= bhsawesome` so the common case stays one
word.

### What moves, and what changes in each

Python (run via `uv run`, lxml):

- `check-ids.py`, `all-ids.py`, `list-files.py`, `hash-contents.py`,
  `words.py` — already take the root file; just move. Fix
  `check-ids.py`/`all-ids.py`'s usage strings (they still say
  `process_xi.py`).
- `validate.py` — takes the book dir; schema is `<book>/schema.rng`, files
  are `<book>/source/**/*.ptx` (explicit files still accepted).
- `rename-files.py` — `--book-dir` becomes a required positional (the
  book's `source/` dir, since that's where bare names resolve); default
  root `<book-dir>/main.ptx` as now. Drop the full-main uncomment pass
  (phase 1).
- `extract-datafiles.py` — takes the book dir; `DATASETS` becomes
  `<book>/source/assets/_static/datasets`; invokes
  `scripts/datafile-uses.ts <book>` (below). Still `--monorepo`.
- `make-text.py` — pure generator, just move.

Node / TypeScript:

- The builder entry wrappers `builder/build.ts`, `watch.ts`, `serve.ts`,
  `check-links.ts`, `datafile-uses.ts` move to `scripts/` and take the
  book dir as their first argument, importing `<book>/book.ts` for the
  config (`await import(path.resolve(book, 'book.ts'))`). `build.ts`
  keeps its `--only`/`--only-files`/`--no-assets` flags after the book
  arg; its `gitVersion()` runs git from the repo root, which is now
  `path.resolve(import.meta.dirname, '..')` from `scripts/` too.
  `builder/` is then exactly the published package (its `files` list is
  already `src`, `schema`, the two FORMAT docs) plus its tests and
  `scripts/{pre,post}pack.mjs`.
- `fix-keywords.mjs` — walks `pretext`; take the book dir and walk
  `<book>/source`. (Consider adding `--check` to CI beside `validate` —
  it's idempotent and cheap. Optional.)
- `migration-tools/shoot.mjs`, `shoot-one.mjs`, `compare.mjs`,
  `text-parity.mjs` → `scripts/` as the visual/text regression harness;
  they're generic (serve a built site, screenshot, pixel-diff, text-digest)
  and are exactly what phase 3's parity check wants. Each hardcodes
  `build/out/public/bhsawesome` and the `/bhsawesome/` mount; make them
  take the book dir and read `base`/`siteDir` from its `book.ts`.
  `shoot.mjs`'s fixed page set is BHSawesome's — keep it as the default
  set for that book (or move the list into `book.ts` under a small
  `shotPages` field if a second book wants its own). Delete the emptied
  `migration-tools/` (README included; `shots/` output is gitignored —
  re-point that ignore at `scripts/shots/` or wherever the harness writes).
  The root `devDependencies` (`playwright`, `pixelmatch`, `pngjs`) stay
  for them; update the root `package.json` description, which still cites
  "the migration-tools deps".

Shell / Perl:

- `transform` — generic (`xsl` arg, files on stdin); move as is.
- `find-in-order.sh` — `scripts/find-in-order.sh <book> <pattern>`;
  uses `scripts/list-files.py --full <book>/source/main.ptx`.
- `reformat-all.sh`, `test-all.sh`, `test-idempotency.sh` — the first two
  do `fd -e ptx . pretext`; make it `fd -e ptx . "${1:-.}"` so with no
  argument they cover every book in the repo (the `.xml-formats/ptx.json`
  config is discovered by extension, so one config already serves all
  books). `test-idempotency.sh` writes `first.xml`/`second.xml` into the
  cwd — have it use `mktemp` and drop those two `.gitignore` lines.
- `bad-titles.pl` — stdin filter; move. Its input used to be `titles.txt`
  from `titles.xsl`; keep `titles.xsl` in `scripts/` as its companion and
  document the pipeline in the script header
  (`xsltproc --xinclude scripts/titles.xsl <book>/source/main.ptx | scripts/bad-titles.pl`).
- `fix-javadocs.pl` — reusable at every JDK bump (bump `$JDK_VERSION`, run
  over the source); move.
- `show-dupes.sh` + `show-dupes.sql` — companions of `hash-contents.py`;
  move (`show-dupes.sh` takes the db path instead of assuming
  `hashes.db` in cwd).
- `setup.sh` — the GitHub-Actions provisioning for `publish.yml`; move.
- `make-file-list.sh` — fold into the Makefile `files` target (it's three
  lines) and delete.

### Makefile

Rewrite around `BOOK ?= bhsawesome`:

```make
BOOK ?= bhsawesome
build:        ; node scripts/build.ts $(BOOK)
watch:        ; node scripts/watch.ts $(BOOK)
serve:        ; node scripts/serve.ts $(BOOK)
check-links:  ; node scripts/check-links.ts $(BOOK)
validate:     ; uv run scripts/validate.py $(BOOK)
check-ids:    ; uv run scripts/check-ids.py $(BOOK)/source/main.ptx
schema:       $(BOOK)/schema.rng
$(BOOK)/schema.rng: $(BOOK)/schema.rnc builder/schema/core.rnc
	trang -I rnc -O rng $< $@
words:        ; uv run scripts/words.py -x activity $(BOOK)/source/main.ptx > $(BOOK)/words.txt
release-book-builder: (unchanged)
```

(`words.txt` lands in the book dir, gitignored by pattern.)

### Everything that names a moved path

- `.github/workflows/publish.yml`: `uv run scripts/validate.py bhsawesome`,
  `node scripts/build.ts bhsawesome`, `node scripts/check-links.ts bhsawesome`.
- `.github/workflows/publish-book-builder.yml`: the whole-book smoke build
  step, same substitutions.
- `CLAUDE.md`, `README.md`: every command. (Full rewrite of the affected
  sections in phase 3, when the book paths change too — do a minimal
  pass here so nothing is wrong between the two commits.)
- `builder/FORMAT.md` mentions `check-ids.py` — qualify as
  `scripts/check-ids.py`.
- `scripts/rename-files.py` ↔ `scripts/check-ids.py` cross-reference each
  other in comments (`ENFORCED_ROOTS` sync note) — fine once both are in
  `scripts/`.

Verify: build the site before and after this phase into two output dirs
and `diff -r` them (only `version.txt` may differ); `npm test` and
`npm run typecheck` in `builder/`; `uv run scripts/validate.py bhsawesome`;
`scripts/test-all.sh`; `uv run scripts/check-ids.py bhsawesome/source/main.ptx`
(well, `pretext/main.ptx` until phase 3) prints nothing.

## Phase 3 — move the book into `bhsawesome/`

All `git mv`, then path fix-ups:

| From | To |
| --- | --- |
| `pretext/` (chapters, `main.ptx`, `assets/`, `frontmatter/`) | `bhsawesome/source/` |
| `pretext/bhsawesome.rnc`, `.rng`, `core.rng`, `schemas.xml` | `bhsawesome/schema.rnc`, `schema.rng`, `core.rng`, `schemas.xml` |
| `pretext/scratch-ptx.xml` | `bhsawesome/scratch.xml` (the author's cut-text stash; out of the source tree, where the "only reachable files" rule applies, and still not `.ptx` so the formatter/validator ignore it) |
| `builder/bhsawesome.ts` | `bhsawesome/book.ts` |
| `builder/chrome.html`, `book.css`, `permalinks.js`, `fonts/` | `bhsawesome/` |
| `vendor/generated/` | `bhsawesome/traces/` |
| `logo/` (pruned in phase 1) | `bhsawesome/logo/` |
| `TODO.md`, `style-guide.txt` | `bhsawesome/` |

`vendor/_static/` stays at the root: the Runestone component bundles and
the eight pretext theme/runtime files are what any book in this repo that
uses the `runestone` payload style and the pretext-derived chrome needs,
so they're shared infrastructure, not book content. (The bundle trim is
"the nine components the book uses" — a second book that needs a tenth
rebuilds the bundles for both; `vendor/README.md` already documents how.)
The CodeLens traces, by contrast, are five specific BHSawesome programs'
execution traces, hence `bhsawesome/traces/`.

### Fix-ups

- `bhsawesome/book.ts`: `ROOT` is still the repo root, now
  `path.resolve(import.meta.dirname, '..')`; `BOOK = import.meta.dirname`.
  `mainPtx: BOOK/source/main.ptx`, `chromeFile: BOOK/chrome.html`,
  `cssFile`, `fontsDir`, `permalinksFile`, `assetsDir: BOOK/source/assets`,
  `assetTrees: [{ ROOT/vendor/_static → '_static' }, { BOOK/traces → 'generated' }]`
  (the `dest` stays `generated` so the emitted `/bhsawesome/generated/…`
  URLs don't change), `watchDirs: [BOOK, ROOT/builder, ROOT/vendor]`.
  The type import becomes `../builder/src/config.ts`. `siteDir` unchanged.
- `bhsawesome/schema.rnc`: `include "../builder/schema/core.rnc"` still
  resolves (one level up either way). Header comment: "Regenerate with
  `make schema`". Re-run `make schema` and confirm `schema.rng` +
  `core.rng` are identical to the old pair modulo the include filename.
- `bhsawesome/schemas.xml`: `uri="schema.rnc"`; nxml finds it by walking
  up from any `source/**/*.ptx`.
- `bhsawesome/source/classes/Person.java` is the one `parse="text"`
  include; relative, moves with its includer.
- `.gitignore`: `bhsawesome/words.txt` (or `*/words.txt`); drop the
  `pretext/` lines (phase 1 already did most).
- `.xml-formats/ptx.json`: nothing (extension-keyed, no paths). The
  `datafile` rule and `preserve_whitespace: cline` are also format-wide.
- Workflows: the book arg is already `bhsawesome` from phase 2; nothing
  else.
- `pyproject.toml`: `name = "csawesome2"` → `"bhs-cs-books"` (the
  description is the uv template default; fix it too). Root
  `package.json` `name`/`description` likewise ("the BHS CS books:
  bhsawesome/, …; builder/ is the generic builder …").
- `vendor/README.md`: drop the `generated/` section (move its regeneration
  recipe into a short `bhsawesome/traces/README.md`), and its first line
  "two asset trees" → one.

### Documentation

Rewrite the layout-dependent parts of `CLAUDE.md` and `README.md` for the
new tree:

- "What this is" — this repo now holds the BHS CS books; `bhsawesome/` is
  one; the generic parts are `builder/`, `scripts/`, `vendor/`.
- "Build & preview" — the `scripts/<tool>.ts bhsawesome` forms, or the
  `make` targets.
- "Document structure" — `bhsawesome/source/main.ptx`; the schema files
  at `bhsawesome/schema.rnc`; `scripts/check-ids.py`.
- "Formatting", "Bulk edits via XSLT", "Other root-level helpers" → one
  "scripts/" section listing each tool in a line.
- "Publishing" — `scripts/extract-datafiles.py bhsawesome --monorepo …`.
- Add the "adding a book" convention from Target layout above.
- Note that the book-specific chrome/css/fonts live in the book dir and
  that a shared theme is future work.

### Verify

- `diff -r` the pre-move and post-move `build/out/public/bhsawesome`
  (only `version.txt` differs). This is the whole point: every emitted
  URL, asset path and knowl must be unchanged.
- `node scripts/check-links.ts bhsawesome`, `uv run scripts/validate.py bhsawesome`,
  `uv run scripts/check-ids.py bhsawesome/source/main.ptx` (silent),
  `scripts/test-all.sh` (silent), `npm test` + `npm run typecheck` in
  `builder/`, `node scripts/fix-keywords.mjs bhsawesome --check`.
- `node scripts/watch.ts bhsawesome` + an edit to one section rebuilds
  just that page (the `--only-files` path resolves source files against
  `path.dirname(config.mainPtx)`, which moved with the config).
- `uv run scripts/extract-datafiles.py bhsawesome --monorepo <bhs-cs>`
  against a monorepo checkout produces no diff there (same 5 datasets,
  same manifests). Needs the host; can't be run in the container.
- `make schema` is a no-op diff.

## Follow-ups this plan creates (not part of it)

- The monorepo's docs cite `builder/bhsawesome.ts` as the example
  `BookConfig` and `pretext/` as the source dir (`plans/bjc-quarto-to-xml.md`,
  `plans/bhsawesome-next-steps.md`, maybe the runner's book-tests README).
  Update those pointers after this lands.
- A shared `theme/` (chrome template parametrized by `base`/title/logo,
  `book.css`, fonts) once a second book exists to share it with.
- TODO.md's "Remove `language="java"`" and "Strip unneeded `<code>` child"
  items are now a one-off `transform` run with a two-template stylesheet,
  if still wanted.
