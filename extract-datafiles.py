#!/usr/bin/env python3

"""Extract activecode datafiles for the bhs-cs native runner
(the monorepo's plans/done/rehost-bhsawesome.md, phase 4a datafile
support):

    python3 extract-datafiles.py --monorepo <path-to-bhs-cs>

Plain data files (dictionary.txt, *.csv) go to the monorepo's
`java/src/main/resources/book-datafiles/`, and each exercise that reads
them gets a `book-tests/<label>.datafiles` manifest (one filename per
line) so BookTestRunner copies them into the run's working directory.

Which exercise uses which files comes from the source model
(`node builder/datafile-uses.ts` — the `datafile` attributes on live
`<program>` elements), and the file contents come straight from
`pretext/assets/_static/datasets/` (every plain datafile lives there;
the old `<datafile>`-element harvest is gone with the PreTeXt
toolchain). Jar "datafiles" (turtleClasses.jar & co — concatenated Java
source Runestone's client used to split per-class) are skipped entirely:
their split per-class copies in the monorepo's `java/book-src/` are
CANONICAL, hand-editable sources now, compiled into the runner's nested
book-classes.jar.

Everything written is generated-but-committed in the monorepo; re-run
this after editing the book's datasets or a `datafile` attribute.
"""

import json
import sys
from argparse import ArgumentParser
from pathlib import Path
from subprocess import run

ROOT = Path(__file__).resolve().parent
DATASETS = ROOT / "pretext" / "assets" / "_static" / "datasets"


def label_datafiles() -> dict[str, list[str]]:
    """label -> datafile filenames, from the builder's source model."""
    out = run(
        ["node", str(ROOT / "builder" / "datafile-uses.ts")],
        capture_output=True,
        text=True,
        check=True,
    )
    if out.stderr.strip():
        print(out.stderr.strip())
    return json.loads(out.stdout)


def main() -> int:
    parser = ArgumentParser(description="Extract activecode datafiles for the native runner.")
    parser.add_argument("--monorepo", required=True, help="path to the bhs-cs monorepo")
    args = parser.parse_args()

    monorepo = Path(args.monorepo)
    resources = monorepo / "java" / "src" / "main" / "resources"
    datafiles_dir = resources / "book-datafiles"
    tests_dir = resources / "book-tests"
    datafiles_dir.mkdir(parents=True, exist_ok=True)
    if not tests_dir.is_dir():
        print(f"error: {tests_dir} is not a directory")
        return 1

    uses = label_datafiles()
    plain_needed = sorted(
        {f for files in uses.values() for f in files if not f.endswith(".jar")}
    )

    for fname in plain_needed:
        src = DATASETS / fname
        if not src.is_file():
            print(f"error: no {src} for datafile {fname}")
            return 1
        # Preserve the historical normalization: exact content with a
        # guaranteed trailing newline.
        (datafiles_dir / fname).write_text(src.read_text().strip() + "\n")
        print(f"  {fname} -> book-datafiles/{fname}")

    manifests = 0
    for label, files in sorted(uses.items()):
        plain = [f for f in files if not f.endswith(".jar")]
        if plain:
            (tests_dir / f"{label}.datafiles").write_text("".join(f + "\n" for f in plain))
            manifests += 1
            print(f"  {label} -> book-tests/{label}.datafiles ({', '.join(plain)})")

    print(f"wrote {len(plain_needed)} data files, {manifests} manifests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
