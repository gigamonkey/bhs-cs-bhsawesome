#!/usr/bin/env python3

"""Land the built web target as a bhs-cs content-overlay tree.

Copies output/build/html (the `pretext build web` output) to
build/out/public/bhsawesome/ - the overlay-shaped tree that
`push-content --only public/bhsawesome/` mirrors to the website, where it
serves at /bhsawesome/ - and injects <script src="/js/bhsawesome.js"> into
every HTML page. The script (served by the website, not this repo) points
the Runestone components' Jobe config at the site's Java-running endpoints;
it can't be in the source because eBookConfig and the page skeleton are
PreTeXt-emitted. Mirrors the BJC landing pass in bhs-cs-content
(landBjcFile in build/build-bjc.ts).

Phase 2 additions (the monorepo's plans/rehost-bhsawesome.md):

- The Runestone bundle <script> tags are neutralized (src ->
  data-bhs-defer-src) so /js/bhsawesome.js can fetch the reader's identity
  from /whoami BEFORE the components construct, then load the bundles and
  dispatch runestone:pre-login-complete itself. This makes the landed pages
  depend on the website serving the phase-2 bootstrap — deploy the website
  before pushing a re-landed book.

- exercises.json (page -> interactive exercises, in document order) is
  emitted into the landed tree; the website's teacher progress grid reads it
  from the overlay for its page list and grid columns.

Usage: uv run python land.py
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# The CLI resolves the target's output-dir under output/.
SRC = ROOT / "output" / "build" / "html"
OUT = ROOT / "build" / "out"
DST = OUT / "public" / "bhsawesome"
PRETEXT = ROOT / "pretext"

SCRIPT_TAG = '<script src="/js/bhsawesome.js"></script>'

# The Runestone service bundles (three webpack chunks, order-sensitive).
BUNDLE_TAG_RE = re.compile(r'<script src="(_static/prefix-[^"]+\.bundle\.js)"></script>')

# -- exercises.json ----------------------------------------------------------

# The interactive, answer-producing component types (grid columns). Not
# datafile (data, not an exercise), not answer/feedback (subcomponents), not
# parsons-runnable (a parsons' hidden run box), not codelens (step-through,
# no answers in this book).
EXERCISE_TYPES = {
    "activecode",
    "parsons",
    "hparsons",
    "multiplechoice",
    "clickablearea",
    "fillintheblank",
    "dragndrop",
    "shortanswer",
}

COMPONENT_TAG_RE = re.compile(r"<\w+[^>]*data-component=\"([a-z-]+)\"[^>]*>")
ID_RE = re.compile(r"id=\"([^\"]+)\"")
TITLE_RE = re.compile(r"<title>([^<]*)</title>")


def page_exercises(html: str) -> list[dict[str, str]]:
    exercises = []
    seen = set()
    for m in COMPONENT_TAG_RE.finditer(html):
        component = m.group(1)
        if component not in EXERCISE_TYPES:
            continue
        id_match = ID_RE.search(m.group(0))
        if not id_match or id_match.group(1) in seen:
            continue
        seen.add(id_match.group(1))
        exercises.append({"id": id_match.group(1), "type": component})
    return exercises

# -- Datafiles ---------------------------------------------------------------
#
# An activecode's data-datafile references are resolved by the Runestone JS
# via document.querySelector('[data-filename="..."]') — i.e. the datafile must
# be IN THE SAME PAGE. On Runestone that isn't true for many of this book's
# datafiles (the turtle classes live in main.ptx, the CSVs in sections that
# reference each other's files) because the Runestone server falls back to its
# source_code database (GET /ns/logger/get_source_code). Self-hosted there is
# no such database, so landing injects a hidden provider div into every page
# that references a datafile it doesn't already carry. All the book's
# datafiles are text (the ".jar" ones are Java source the client splits into
# classes), so a plain hidden div whose textContent is the file works — the
# JS reads .value || .textContent and never needs a real datafile component.

DATAFILE_RE = re.compile(r"<datafile\b[^>]*?filename=\"([^\"]+)\".*?(?:</datafile>|/>)", re.S)
PRE_SOURCE_RE = re.compile(r"<pre\s+source=\"([^\"]+)\"")
XI_TEXT_RE = re.compile(r"<xi:include\s+parse=\"text\"\s+href=\"([^\"]+)\"")
INLINE_PRE_RE = re.compile(r"<pre>(.*?)</pre>", re.S)


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def datafile_library() -> dict[str, str]:
    """filename -> HTML-escaped content, from every <datafile> in the source
    (legacy trees included — harmless, and some live pages reference datafiles
    defined outside the live tree)."""
    lib: dict[str, str] = {}
    for ptx in sorted(PRETEXT.rglob("*.ptx")):
        for m in DATAFILE_RE.finditer(ptx.read_text()):
            fname, block = m.group(1), m.group(0)
            if fname in lib:
                continue
            if src := PRE_SOURCE_RE.search(block):
                # @source is relative to the external (assets) directory.
                path = PRETEXT / "assets" / src.group(1)
                if path.is_file():
                    lib[fname] = escape(path.read_text())
            elif xi := XI_TEXT_RE.search(block):
                path = (ptx.parent / xi.group(1)).resolve()
                if path.is_file():
                    lib[fname] = escape(path.read_text())
            elif inline := INLINE_PRE_RE.search(block):
                # PreTeXt escaping for &, <, > is HTML escaping; keep as-is.
                lib[fname] = inline.group(1)
    return lib


def inject_datafiles(html: str, path: Path, lib: dict[str, str]) -> str:
    referenced: set[str] = set()
    for m in re.finditer(r"data-datafile=\"([^\"]*)\"", html):
        referenced.update(f.strip() for f in m.group(1).split(",") if f.strip())
    present = set(re.findall(r"data-filename=\"([^\"]*)\"", html))
    missing = referenced - present
    if not missing:
        return html
    divs = []
    for fname in sorted(missing):
        if fname in lib:
            divs.append(f'<div data-filename="{fname}" style="display: none">{lib[fname]}</div>')
        else:
            print(f"  WARNING: {path.name} references datafile {fname!r} with no known source")
    if not divs:
        return html
    body_end = html.rfind("</body>")
    if body_end == -1:
        print(f"  no </body> in {path.name}; datafiles not injected")
        return html
    return html[:body_end] + "\n".join(divs) + "\n" + html[body_end:]


def inject(html: str, path: Path) -> str:
    if SCRIPT_TAG in html:
        return html
    head_end = html.find("</head>")
    if head_end == -1:
        # Not a full document (shouldn't happen; knowl fragments have heads
        # too). Leave it alone but say so.
        print(f"  no </head> in {path.relative_to(SRC)}; not injecting")
        return html
    return html[:head_end] + SCRIPT_TAG + "\n" + html[head_end:]


def main() -> int:
    if not SRC.is_dir():
        print(f"error: {SRC} not found - run `uv run pretext build web` first")
        return 1

    if DST.exists():
        shutil.rmtree(DST)
    DST.mkdir(parents=True)

    lib = datafile_library()
    pages = 0
    total = 0
    index = []
    for src in sorted(SRC.rglob("*")):
        if src.is_dir():
            continue
        rel = src.relative_to(SRC)
        dst = DST / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix == ".html":
            html = inject(src.read_text(), src)
            html = inject_datafiles(html, src, lib)
            html = BUNDLE_TAG_RE.sub(r'<script data-bhs-defer-src="\1"></script>', html)
            dst.write_text(html)
            pages += 1
            if len(rel.parts) == 1:  # top-level pages only, not knowls/iframes
                exercises = page_exercises(html)
                if exercises:
                    title_match = TITLE_RE.search(html)
                    index.append(
                        {
                            "file": rel.name,
                            "title": title_match.group(1).strip() if title_match else rel.name,
                            "exercises": exercises,
                        }
                    )
        else:
            shutil.copy2(src, dst)
        total += 1

    (DST / "exercises.json").write_text(json.dumps({"book": "bhsawesome", "pages": index}, indent=1))
    print(f"exercises.json: {len(index)} pages, {sum(len(p['exercises']) for p in index)} exercises")

    size_mb = sum(f.stat().st_size for f in DST.rglob("*") if f.is_file()) / 2**20
    print(f"landed {total} files ({pages} html) into {DST.relative_to(ROOT)} ({size_mb:.0f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
