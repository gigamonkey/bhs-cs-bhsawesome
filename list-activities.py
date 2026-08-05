#!/usr/bin/env python3

"""List every interactive activity in the live book, one per line, for the
component click-through (the monorepo's plans/rehost-bhsawesome.md, 1d):

    uv run python list-activities.py [--kind KIND] [--summary]

Output is a TSV: source file:line (of the interactive payload element),
kind, the rendered component id (rs-<label>, what you find in the DOM and
the book grid), the page URL it renders on, and notes (graded or not,
datafiles used). Files come via list-files.py in book order, so the listing
reads front-to-back.

The URL column leans on the repo's filename == xml:id convention
(check-ids.py) and level-2 chunking: a section file's payloads render at
/bhsawesome/<stem>.html. Payloads in non-section files (main.ptx's
conclusion, chapter toctrees) get the same best-effort stem URL — check
those few by hand.

Kinds mirror PreTeXt's exercise classification: activecode, codelens,
parsons, hparsons, multiplechoice, clickablearea, fillin, cardsort,
shortanswer.
"""

import re
import signal
import subprocess
import sys
from argparse import ArgumentParser
from pathlib import Path

# Die quietly when piped into head et al.
signal.signal(signal.SIGPIPE, signal.SIG_DFL)

ROOT = Path(__file__).resolve().parent
PRETEXT = ROOT / "pretext"

OPEN_TAG_RE = re.compile(r"<(activity|exercise|project|task|program|blocks|choices|areas|fillin|cardsort)\b")
RESPONSE_RE = re.compile(r"<response\s*/>")
LABEL_RE = re.compile(r'label="([^"]+)"')


def book_files() -> list[Path]:
    out = subprocess.run(
        [sys.executable, str(ROOT / "list-files.py"), str(PRETEXT / "main.ptx")],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    files = [PRETEXT / "main.ptx"]
    files.extend(PRETEXT / line for line in out.splitlines() if line.endswith(".ptx"))
    return [f for f in files if f.is_file()]


def whole_tag(lines: list[str], i: int) -> str:
    """The tag opening on line i, joined through its closing '>' (the
    canonical formatting wraps long tags across lines)."""
    tag = lines[i]
    j = i
    while ">" not in tag and j + 1 < len(lines):
        j += 1
        tag += " " + lines[j].strip()
    return tag[: tag.index(">") + 1] if ">" in tag else tag


def activecode_notes(lines: list[str], i: int, tag: str) -> str:
    """graded / no tests, from whether a <tests> element appears before the
    matching </program>; plus any datafile attribute."""
    graded = False
    for text in lines[i:]:
        if "<tests" in text:
            graded = True
            break
        if "</program>" in text:
            break
    notes = ["graded" if graded else "no tests"]
    if m := re.search(r'datafile="([^"]+)"', tag):
        notes.append(f"datafiles: {m.group(1)}")
    return "; ".join(notes)


def scan(path: Path) -> list[tuple[Path, int, str, str, str]]:
    lines = path.read_text().splitlines()
    results = []
    label = ""
    in_cardsort = False

    for i, text in enumerate(lines):
        if "</cardsort>" in text:
            in_cardsort = False
        if RESPONSE_RE.search(text) and not in_cardsort:
            results.append((path, i + 1, "shortanswer", label, ""))
        m = OPEN_TAG_RE.search(text)
        if not m:
            continue
        tag = whole_tag(lines, i)
        element = m.group(1)
        line_no = i + 1
        if element in ("activity", "exercise", "project", "task"):
            if lm := LABEL_RE.search(tag):
                label = lm.group(1)
        elif element == "program":
            interactive = re.search(r'interactive="(\w+)"', tag)
            if interactive and interactive.group(1) == "activecode":
                results.append(
                    (path, line_no, "activecode", label, activecode_notes(lines, i, tag))
                )
            elif interactive and interactive.group(1) == "codelens":
                results.append((path, line_no, "codelens", label, ""))
        elif element == "blocks":
            kind = "hparsons" if 'layout="horizontal"' in tag else "parsons"
            results.append((path, line_no, kind, label, ""))
        elif element == "choices":
            results.append((path, line_no, "multiplechoice", label, ""))
        elif element == "areas":
            results.append((path, line_no, "clickablearea", label, ""))
        elif element == "fillin":
            results.append((path, line_no, "fillin", label, ""))
        elif element == "cardsort":
            in_cardsort = True
            results.append((path, line_no, "cardsort", label, ""))
    return results


def main() -> int:
    parser = ArgumentParser(description="List the book's interactive activities.")
    parser.add_argument("--kind", help="only this kind (e.g. parsons, activecode)")
    parser.add_argument("--summary", action="store_true", help="counts by kind only")
    args = parser.parse_args()

    results = [r for path in book_files() for r in scan(path)]
    if args.kind:
        results = [r for r in results if r[2] == args.kind]

    if args.summary:
        counts: dict[str, int] = {}
        for _, _, kind, _, notes in results:
            key = f"{kind} ({notes.split(';')[0]})" if kind == "activecode" else kind
            counts[key] = counts.get(key, 0) + 1
        for kind in sorted(counts):
            print(f"{counts[kind]:5} {kind}")
        print(f"{len(results):5} total")
        return 0

    for path, line, kind, label, notes in results:
        rid = f"rs-{label}" if label else "-"
        url = f"/bhsawesome/{path.stem}.html"
        print("\t".join([f"{path.relative_to(ROOT)}:{line}", kind, rid, url, notes]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
