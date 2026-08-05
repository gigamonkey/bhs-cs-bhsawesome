#!/usr/bin/env python3

"""Extract activecode unit tests for the bhs-cs native runner
(the monorepo's plans/rehost-bhsawesome.md, phase 4a):

    uv run python extract-tests.py --outdir <monorepo>/java/src/main/resources/book-tests label...
    uv run python extract-tests.py --outdir ... --all

For each label, finds the live activity's <tests> JUnit class and writes it
to <outdir>/<label>.java as close to verbatim as possible. The tests ship as
SOURCE resources in bhs-cs.jar and compile per-run alongside the student's
code (they reference student classes directly, so they can't precompile);
each stays `public class RunestoneTests` — only one is ever compiled per
run. The one transformation is an injected import: CodeTestHelper (and
CodeDigest) live in the jar's com.gigamonkeys.bhs.book package, and the
tests reference them unqualified.

The output is generated-but-committed in the monorepo (the jar build stays
self-contained); re-run this after editing a converted exercise's tests.
"""

import re
import subprocess
import sys
import textwrap
from argparse import ArgumentParser
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent
PRETEXT = ROOT / "pretext"

IMPORTS = (
    "// Injected by extract-tests.py (the rest of this file is verbatim from the book):\n"
    "import com.gigamonkeys.bhs.book.CodeDigest;\n"
    "import com.gigamonkeys.bhs.book.CodeTestHelper;\n"
)


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


def graded_activities() -> dict[str, tuple[str, str | None]]:
    """label -> (tests source, stdin text or None), for every live <tests>
    block, keyed by the nearest labeled ancestor (activity, exercise,
    project, task, ... — mirroring how PreTeXt derives the rendered
    component id). The stdin is the program's <stdin> payload: on Runestone
    the client ships it as the run input, and CodeTestHelper's constructor
    runs main — which blocks (or dies) without it when the program reads
    from Scanner."""
    found: dict[str, tuple[str, str | None]] = {}
    for path in book_files():
        tree = etree.parse(str(path))
        for tests in tree.iter("tests"):
            if not (tests.text and "class RunestoneTests" in tests.text):
                continue
            program = tests.getparent()
            stdin = program.find("stdin") if program is not None else None
            label = None
            node = program
            while node is not None and label is None:
                label = node.get("label")
                node = node.getparent()
            if label and label not in found:
                found[label] = (tests.text, stdin.text if stdin is not None else None)
    return found


def transform(tests: str) -> str:
    source = textwrap.dedent(tests).strip() + "\n"
    # A few tests have ragged indentation (a stray space on every line but
    # the first, so dedent can't flatten it) — javac doesn't care, so allow
    # leading whitespace before the class line.
    m = re.search(r"^[ \t]*public\s+class\s+RunestoneTests\b", source, re.M)
    if not m:
        raise ValueError("no `public class RunestoneTests` found")
    return source[: m.start()] + IMPORTS + source[m.start() :]


def main() -> int:
    parser = ArgumentParser(description="Extract activecode tests for the native runner.")
    parser.add_argument("--outdir", required=True, help="book-tests resource dir in the monorepo")
    parser.add_argument("--all", action="store_true", help="every graded live activity")
    parser.add_argument("labels", nargs="*")
    args = parser.parse_args()

    outdir = Path(args.outdir)
    if not outdir.is_dir():
        print(f"error: {outdir} is not a directory")
        return 1

    activities = graded_activities()
    labels = sorted(activities) if args.all else args.labels
    if not labels:
        print("error: no labels given (or use --all)")
        return 1

    failures = 0
    for label in labels:
        if label not in activities:
            print(f"  MISSING: no live graded activity with label {label!r}")
            failures += 1
            continue
        tests, stdin = activities[label]
        try:
            (outdir / f"{label}.java").write_text(transform(tests))
            extra = ""
            if stdin is not None:
                (outdir / f"{label}.stdin").write_text(textwrap.dedent(stdin).strip() + "\n")
                extra = " + stdin"
            print(f"  {label} -> {label}.java{extra} (testClass book:{label})")
        except ValueError as e:
            print(f"  FAILED {label}: {e}")
            failures += 1
    print(f"extracted {len(labels) - failures} of {len(labels)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
