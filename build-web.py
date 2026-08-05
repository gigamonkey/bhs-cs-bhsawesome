#!/usr/bin/env python3

"""Run `pretext build web`, tolerating only the known-expected PTX:ERRORs.

The pretext CLI exits nonzero if ANY PTX:ERROR was emitted, with no
tolerance flag - but this book deliberately builds with a fixed set of
errors (the left-gutter image hack's negative sidebyside margins, plus a
couple of dead cross-references into retired chapters). Fixing them at the
source would change how the book renders on Runestone, which the website
rehost deliberately avoids while the two are side by side (see the
monorepo's plans/rehost-bhsawesome.md phase 1; the phase-3 build
replacement retires the hack properly).

So: run the build, stream its output, and succeed only when the build
actually completed AND every PTX:ERROR matches the expected list. Any new
error still fails, loudly.

Usage: uv run python build-web.py
"""

import re
import subprocess
import sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")

EXPECTED_ERRORS = [
    # The left-gutter image hack: sidebysides with margins="-20% 0%".
    re.compile(r'left margin of a <sidebyside> \("-20%"\)'),
    # Dead xrefs into chapters not included from main.ptx.
    re.compile(r'a cross-reference \("xref"\) uses references \[comparing-objects\]'),
]

FINISHED = "Finished build for target web"


def main() -> int:
    proc = subprocess.Popen(
        ["uv", "run", "pretext", "build", "web"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    lines: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        sys.stdout.write(line)
        lines.append(ANSI.sub("", line.rstrip("\n")))
    proc.wait()

    if proc.returncode == 0:
        return 0

    if not any(FINISHED in line for line in lines):
        print("build-web: build did not complete; failing")
        return 1

    errors = [line for line in lines if "PTX:ERROR" in line]
    unexpected = [e for e in errors if not any(p.search(e) for p in EXPECTED_ERRORS)]
    if not errors or unexpected:
        print("build-web: unexpected build errors; failing:")
        for e in unexpected or ["(nonzero exit with no PTX:ERROR lines)"]:
            print(f"  {e}")
        return 1

    print(f"build-web: build completed; tolerating {len(errors)} known-expected PTX:ERROR lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
