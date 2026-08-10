# migration-tools — CSS-cleanup scaffolding (temporary)

Tooling built for the class-vocabulary renegotiation (the bhs-cs
monorepo's `plans/done/bhsawesome-css-cleanup.md` — done 2026-08-09,
final numbers there). **Kept alive past the plan for ongoing vocabulary
work; delete the directory — and the generated ledger in the monorepo —
when that work is truly over.** Nothing else may depend on it.

## census.mjs — the audit

Who consumes every class name in the built book (static HTML, book.css,
the vendored pretext scripts, the Runestone bundles/stylesheets, the
bhs-cs client bundle), classified by what we may do with it. The
generated ledger lives in the **monorepo**, beside the plan it serves:
`bhs-cs/plans/bhsawesome-class-audit.md`. Regenerate after each cleanup
step:

```sh
node builder/build.ts
node migration-tools/census.mjs     # rewrites bhs-cs/plans/bhsawesome-class-audit.md
```

Hand judgments (verified evidence, reclassifications) live in the
`OVERRIDES` / `NOTES` maps **in census.mjs**, so a re-run is idempotent —
edit the script, never the generated doc. Needs the bhs-cs checkout as a
sibling (`../bhs-cs`) or via `BHS_CS=<path>`, both for the client-bundle
evidence and as the ledger's destination.

Known blind spots, called out in the doc where they bite: attribute
selectors (`[class*=language-]`) aren't seen as consumers, and a class
name a script constructs at runtime evades the string scan. The
backstops are the shot harness and **`runtime-census.mjs`**, which loads
the shot pages in Chromium, pokes the stateful chrome, and records every
class in the live DOM (`shots/runtime-classes.txt`) — check purge
candidates against that before deleting rules. The criterion for
deleting a rule is "can this selector ever match our DOM" (static HTML ∪
runtime DOM ∪ emitter-supported), which is deliberately broader than the
ledger's name classification: a name can stay *frozen* for JS purposes
while our CSS for it is still unmatchable and deletable.

## shoot.mjs / compare.mjs — the screenshot harness

Before/after full-page screenshots over a fixed page set covering every
vocabulary the cleanup touches — component types, tables, sidebysides,
chapter/index/knowl pages — plus the JS-injected states (dark mode, open
knowl, search results, readability dialog, exposed permalinks).

```sh
node migration-tools/shoot.mjs migration-tools/shots/before
# ...edit emitters/book.css, node builder/build.ts...
node migration-tools/shoot.mjs migration-tools/shots/after
node migration-tools/compare.mjs migration-tools/shots/{before,after} \
    --diffs migration-tools/shots/diff
```

Shots land under `migration-tools/shots/` (gitignored). For pages
outside the fixed set, `shoot-one.mjs <outdir> <page>…` shoots arbitrary
pages by name (same server, no states). Serving is local
HTTP over `build/site` with `/js/bhsawesome.js` mapped from the bhs-cs
checkout (same `BHS_CS` convention; a defer-loader stub fills in without
it) and all external requests aborted; `Math.random` is seeded per page so
the components' card/block/choice shuffles deal identically every run.

Measured noise floor (2026-08-09, same build shot twice): **18 of 19
shots pixel-identical**. The exception is `if-traps-knowl-open`, whose
fetched knowl content renders with a few px of internal-layout jitter
(worst observed ~4% of pixels from a ~5px content shift below the
knowl) — judge that shot's diffs by eye. Re-measure the floor with a
same-build double-shoot whenever the harness or environment changes.

First-time setup (playwright's Chromium + system deps):

```sh
npm install
npx playwright install --with-deps chromium
```
