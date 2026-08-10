# Vendored frozen assets

Committed copies of the two asset trees the builder can't produce itself.
`builder/build.ts` copies them into `build/out/public/bhsawesome/` verbatim.

## `generated/` — CodeLens traces

The 5 pregenerated pythontutor execution traces for the book's embedded
`codelens` programs. Regenerate only if one of the 5 codelens programs'
source changes — against OUR tracer (the runner's `POST /api/trace/`,
the vendored traceprinter; the monorepo's
`java/src/main/java/traceprinter/VENDORED.md`), which since 2026-08-08
is also what the live "Show CodeLens" button uses. The trace request is
`{"code": <program source>, "stdin": ""}`; the response body is the
trace JSON, which these files wrap in the small
`allTraceData[codelensID] = …` IIFE — copy the wrapper shape from an
existing file. (Historically these came from Runestone's public
`tracer.runestone.academy:5000` service via PreTeXt's `generate trace`;
that dependency is gone.)

## `_static/` — Runestone component bundles + PreTeXt theme files

Two parts:

- **`pretext/`** — the eight PreTeXt theme/runtime files the chrome
  references (`theme.css`, `ol-markers.css`, `jquery.min.js`,
  `pretext-core.js`, `pretext-read-aloud.js`, `mathjax_startup.js`,
  `lti_iframe_resizer.js`, `pretext_search.js`), frozen from the last
  PreTeXt build. These change only if we deliberately re-sync with a newer
  PreTeXt; the long-term plan replaces `theme.css` with a hand-written
  stylesheet anyway.

- **Everything else** — the Runestone component bundles, built from source
  with a **trimmed component set**: only the nine components the book uses
  (parsons, hparsons, clickablearea, dragndrop, fillintheblank,
  multiplechoice, shortanswer, codelens, datafile). ActiveCode is native
  (its stylesheet is folded into the entry CSS for the native widget's
  benefit), and the trim drops the heavyweight freight the stock CDN
  bundles carry — Handsontable (commercially licensed), skulpt, sql.js,
  CodeMirror 5 — shrinking the bundle set from ~6.5MB to ~1.5MB.

### Rebuilding the Runestone bundles

Source of truth: the Runestone monorepo checkout at `~/3rdparty/rs`
(`bases/rsptx/interactives/` — an ordinary npm/webpack project) plus
`runestone-trim.patch` in this directory, which holds the two book-specific
edits (the trimmed `module_map` + static activecode.less import in
`webpack.index.js`; the SQLFeedback stub in `hparsons.js` that severs the
static import chain to Handsontable/sql.js).

```sh
cd ~/3rdparty/rs
git apply /path/to/bhsawesome/vendor/runestone-trim.patch
cd bases/rsptx/interactives
npm install        # npm ci fails: the lockfile lacks other platforms' optional deps
npm run dist       # production webpack build -> runestone/dist/
```

Then, from this repo's root, replace the bundle half of `vendor/_static/`
(keep `pretext/`):

```sh
find vendor/_static -maxdepth 1 -type f -delete
find ~/3rdparty/rs/bases/rsptx/interactives/runestone/dist -maxdepth 1 -type f \
  ! -name '*.gz' ! -name '*.map' ! -name 'sql-wasm.wasm' ! -name 'server_side.js' \
  -exec cp {} vendor/_static/ \;
```

(`sql-wasm.wasm` is CopyPlugin output for the dropped sql.js; `server_side.js`
is Runestone's server-side grading engine; `.gz`/`.map` are compression and
sourcemap artifacts. None are referenced.)

Finally update `builder/chrome.html`: the three `data-bhs-defer-src` bundle
names and the two entry CSS links must match the new
`vendor/_static/webpack_static_imports.json` (contenthashes change on every
rebuild), and revert the patch in the rs checkout (`git checkout -- .`)
unless you're upstreaming it.
