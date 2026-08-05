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

# PreTeXt inlines the full book ToC into every page; its link order IS the
# book order, which exercises.json preserves (the website's grid index and
# dashboard render pages in exercises.json order).
TOC_RE = re.compile(r"<nav id=\"ptx-toc\".*?</nav>", re.S)
TOC_HREF_RE = re.compile(r"href=\"([\w-]+)\.html")

# -- Converted exercises (phase 4a) ------------------------------------------
#
# Labels in converted-tests.txt name activecodes whose tests have been
# extracted for the native runner (extract-tests.py -> bhs-cs.jar's
# book-tests/ resources). For those, the landed page's Runestone activecode
# block is rewritten into the website widget's container
# (.bhs-book-exercise, built live by /js/bhsawesome.js): the statement is
# kept, the starter code (the textarea payload up to the ==== test
# sentinel) rides in a hidden textarea, and the tests never reach the
# browser. Their exercises.json entries carry the book:<label> testClass.

CONVERTED_FILE = ROOT / "converted-tests.txt"

TEXTAREA_RE = re.compile(
    r"(<textarea[^>]*data-lang=\"java\"[^>]*>)((?:(?!</textarea>)[\s\S])*)</textarea>"
)
STDIN_ATTR_RE = re.compile(r"data-stdin=\"([^\"]*)\"")
AC_QUESTION_RE = re.compile(r"<div class=\"ac_question[^\"]*\"[^>]*>")


def activecode_css_link() -> str:
    """A <link> for the Runestone activecode chunk's stylesheet (toolbar
    flex/centering, .CodeMirror, the ac-feedback results table...). Pages
    only get it when the activecode JS chunk lazy-loads — so a page whose
    activecodes are ALL converted (no Runestone activecode left to trigger
    the load) would render the widget unstyled. Injected statically into
    converted pages instead; identified by content since the chunk name is
    hashed."""
    for css in sorted((SRC / "_static").glob("prefix-*.css")):
        if ".ptx-runestone-container .ac_actions" in css.read_text():
            return f'<link href="_static/{css.name}" rel="stylesheet" type="text/css">'
    print("  WARNING: no activecode css chunk found; converted pages may render unstyled")
    return ""


def converted_labels() -> set[str]:
    if not CONVERTED_FILE.is_file():
        return set()
    return {
        line.strip()
        for line in CONVERTED_FILE.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    }


def unescape(text: str) -> str:
    return (
        text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&amp;", "&")
    )


def balanced_div(html: str, start: int) -> int:
    """End index (exclusive) of the div whose '<div' starts at `start`."""
    depth = 0
    for m in re.finditer(r"<div\b|</div>", html[start:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return start + m.end()
    raise ValueError("unbalanced divs")


def convert_exercises(html: str, page: Path, labels: set[str], css_link: str) -> str:
    converted_any = False
    for label in labels:
        anchor = html.find(f'id="rs-{label}"')
        if anchor == -1:
            continue
        # The enclosing ptx-runestone-container div wraps the whole component.
        start = html.rfind('<div class="ptx-runestone-container">', 0, anchor)
        if start == -1:
            print(f"  WARNING: {page.name}: no container around rs-{label}; not converting")
            continue
        end = balanced_div(html, start)
        block = html[start:end]

        ta = TEXTAREA_RE.search(block)
        if not ta:
            print(f"  WARNING: {page.name}: no activecode payload for rs-{label}; not converting")
            continue
        # The canned stdin (ptx <stdin>) rides the textarea tag; carry it
        # onto the widget container so its stdin box renders, prefilled
        # (re-embedded verbatim — it's already attribute-escaped).
        stdin_attr = ""
        if sm := STDIN_ATTR_RE.search(ta.group(1)):
            stdin_attr = f' data-stdin="{sm.group(1)}"'
        payload = unescape(ta.group(2))
        if "^^^^" in payload or "===!" in payload:
            print(f"  WARNING: {page.name}: rs-{label} uses prefix/visible-suffix sentinels; not converting")
            continue
        if "data-datafile" in block:
            print(f"  WARNING: {page.name}: rs-{label} uses datafiles (not wired natively); not converting")
            continue
        starter = payload.split("\n====\n")[0].strip("\n")

        statement = ""
        if q := AC_QUESTION_RE.search(block):
            statement = block[q.start() : balanced_div(block, q.start())]

        # The runestone/ac_section shell classes are what the shipped
        # Runestone + theme CSS style — including the wider-than-prose
        # layout (.ptx-runestone-container:has(.ac_section)) — so the widget
        # looks like the activecodes around it. No data-component, so the
        # Runestone JS ignores it.
        replacement = (
            '<div class="ptx-runestone-container">'
            '<div class="runestone explainer ac_section">'
            f'<div class="bhs-book-exercise" id="rs-{label}" data-testclass="book:{label}"{stdin_attr}>'
            f"{statement}"
            f'<textarea class="bhs-book-starter" hidden>{escape(starter)}</textarea>'
            "</div></div></div>"
        )
        html = html[:start] + replacement + html[end:]
        converted_any = True
    if converted_any and css_link and css_link not in html:
        head_end = html.find("</head>")
        if head_end != -1:
            html = html[:head_end] + css_link + "\n" + html[head_end:]
    return html


def toc_order(toc_html: str) -> dict[str, int]:
    order: dict[str, int] = {}
    for m in TOC_HREF_RE.finditer(toc_html):
        order.setdefault(f"{m.group(1)}.html", len(order))
    return order


WIDGET_RE = re.compile(r"<div class=\"bhs-book-exercise\" id=\"([^\"]+)\" data-testclass=\"([^\"]+)\"")


def page_exercises(html: str) -> list[dict[str, str]]:
    found: list[tuple[int, dict[str, str]]] = []
    for m in COMPONENT_TAG_RE.finditer(html):
        component = m.group(1)
        if component not in EXERCISE_TYPES:
            continue
        id_match = ID_RE.search(m.group(0))
        if id_match:
            found.append((m.start(), {"id": id_match.group(1), "type": component}))
    # Converted exercises (their Runestone data-component is gone); testClass
    # rides into exercises.json for the page widget's config and the
    # conversion ledger.
    for m in WIDGET_RE.finditer(html):
        found.append((m.start(), {"id": m.group(1), "type": "activecode", "testClass": m.group(2)}))
    exercises = []
    seen = set()
    for _, e in sorted(found, key=lambda t: t[0]):
        if e["id"] not in seen:
            seen.add(e["id"])
            exercises.append(e)
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
    converted = converted_labels()
    css_link = activecode_css_link() if converted else ""
    if converted:
        print(f"converting {len(converted)} exercise(s) to the native widget")
    pages = 0
    total = 0
    index = []
    toc_html = None
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
            if len(rel.parts) == 1:
                html = convert_exercises(html, src, converted, css_link)
            dst.write_text(html)
            pages += 1
            if len(rel.parts) == 1:  # top-level pages only, not knowls/iframes
                if toc_html is None and (toc := TOC_RE.search(html)):
                    toc_html = toc.group(0)
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

    order = toc_order(toc_html) if toc_html else {}
    if not order:
        print("  WARNING: no ToC found; exercises.json pages stay in filename order")
    index.sort(key=lambda p: (order.get(p["file"], len(order)), p["file"]))

    (DST / "exercises.json").write_text(json.dumps({"book": "bhsawesome", "pages": index}, indent=1))
    print(f"exercises.json: {len(index)} pages, {sum(len(p['exercises']) for p in index)} exercises")

    size_mb = sum(f.stat().st_size for f in DST.rglob("*") if f.is_file()) / 2**20
    print(f"landed {total} files ({pages} html) into {DST.relative_to(ROOT)} ({size_mb:.0f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
