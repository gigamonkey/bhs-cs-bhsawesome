# `traces/` — CodeLens traces

The 5 pregenerated pythontutor execution traces for the book's embedded
`codelens` programs, emitted to `/bhsawesome/generated/` (the `assetTrees`
entry in `../book.ts`). Regenerate only if one of the 5 codelens programs'
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
