#!/usr/bin/env python3

"""Extract activecode datafiles for the bhs-cs native runner
(the monorepo's plans/rehost-bhsawesome.md, phase 4a datafile support):

    uv run python extract-datafiles.py --monorepo <path-to-bhs-cs>

The book's datafiles are all text. Two kinds:

- The ".jar" ones (turtleClasses.jar, turtleClasses2.jar, GridWorld.jar)
  are concatenated Java SOURCE that Runestone's client splits into
  per-class files (activecode's parseJavaClasses, ported below). We split
  them once here and write the pieces to the monorepo's `java/book-src/`,
  which the java build compiles into a nested `book-classes.jar` resource
  that BookTestRunner puts on book runs' classpaths (NOT the fat jar's
  root: default-package classes there would shadow same-named student
  classes in normal assignment grading, whose in-memory classloader is
  parent-first).

- Plain data files (dictionary.txt, *.csv) go to the monorepo's
  `java/src/main/resources/book-datafiles/`, and each converted exercise
  that reads them gets a `book-tests/<label>.datafiles` manifest (one
  filename per line) so BookTestRunner copies them into the run's working
  directory.

Everything written is generated-but-committed in the monorepo; re-run this
after editing the book's datafiles.
"""

import re
import sys
from argparse import ArgumentParser
from pathlib import Path

from land import SRC, datafile_library, unescape

FAKE_JARS = {"turtleClasses.jar", "turtleClasses2.jar", "GridWorld.jar"}

TA_RE = re.compile(r"<textarea[^>]*data-lang=\"java\"[^>]*>")
DATAFILE_ATTR_RE = re.compile(r"data-datafile=\"([^\"]*)\"")
ID_RE = re.compile(r"id=\"([^\"]*)_editor\"")


def parse_java_classes(source: str) -> list[tuple[str, str]]:
    """Split concatenated Java source into (filename, content) per top-level
    type — a direct port of Runestone activecode's parseJavaClasses: scan
    character-wise skipping comments/strings/chars/parens, and at each
    top-level closing brace emit everything since the previous type's end,
    named for the token before extends/implements (else the last header
    token)."""
    e = source.strip()
    in_type = False
    depth = 0
    brace_pos = 0
    out: list[tuple[str, str]] = []
    unit_start = 0
    header_start = 0
    a = 0
    while a < len(e):
        l = e[a]
        if l == "/":
            a += 1
            if a < len(e) and e[a] == "/":
                a += 1
                while a < len(e) and e[a] != "\n":
                    a += 1
                if not in_type:
                    header_start = a
            elif a < len(e) and e[a] == "*":
                a += 1
                while a + 1 < len(e) and not (e[a] == "*" and e[a + 1] == "/"):
                    a += 1
                if not in_type:
                    header_start = a
        elif l == '"':
            a += 1
            while a < len(e) and e[a] != '"':
                a += 1
        elif l == "'":
            a += 1
            while a < len(e) and e[a] != "'":
                a += 1
        elif l == "(":
            parens = 1
            a += 1
            while parens > 0 and a < len(e):
                if e[a] == "(":
                    parens += 1
                elif e[a] == ")":
                    parens -= 1
                a += 1
        if a >= len(e):
            break
        if not in_type and e[a] == "{":
            brace_pos = a
            in_type = True
            depth = 1
        elif in_type:
            if e[a] == "{":
                depth += 1
            elif e[a] == "}":
                depth -= 1
        if in_type and depth == 0:
            end = a + 1
            tokens = e[header_start:brace_pos].split()
            name = tokens[-1] if tokens else "Unknown"
            for i, tok in enumerate(tokens):
                if tok in ("extends", "implements"):
                    name = tokens[i - 1]
                    break
            # Generic types (Grid<E>) name their file for the raw type.
            name = name.split("<")[0]
            out.append((name + ".java", e[unit_start:end]))
            in_type = False
            unit_start = end
            header_start = end
        a += 1
    return out


def label_datafiles() -> dict[str, list[str]]:
    """label -> data-datafile filenames, from the rendered pages (the same
    ground truth the conversion list is built from)."""
    uses: dict[str, list[str]] = {}
    for page in sorted(SRC.glob("*.html")):
        html = page.read_text()
        for m in TA_RE.finditer(html):
            tag = m.group(0)
            dfm = DATAFILE_ATTR_RE.search(tag)
            idm = ID_RE.search(tag)
            if dfm and idm:
                label = idm.group(1).removeprefix("rs-")
                uses[label] = [f.strip() for f in dfm.group(1).split(",") if f.strip()]
    return uses


def main() -> int:
    parser = ArgumentParser(description="Extract activecode datafiles for the native runner.")
    parser.add_argument("--monorepo", required=True, help="path to the bhs-cs monorepo")
    args = parser.parse_args()

    monorepo = Path(args.monorepo)
    book_src = monorepo / "java" / "book-src"
    resources = monorepo / "java" / "src" / "main" / "resources"
    datafiles_dir = resources / "book-datafiles"
    tests_dir = resources / "book-tests"
    for d in (book_src, datafiles_dir):
        d.mkdir(parents=True, exist_ok=True)
    if not tests_dir.is_dir():
        print(f"error: {tests_dir} is not a directory")
        return 1

    def clean(content: str) -> str:
        # Inline <pre> datafiles (GridWorld.jar) keep their CDATA wrapper in
        # the harvested library; strip it.
        c = unescape(content).strip()
        if c.startswith("<![CDATA["):
            c = c.removeprefix("<![CDATA[").removesuffix("]]>").strip()
        return c + "\n"

    lib = {name: clean(content) for name, content in datafile_library().items()}
    uses = label_datafiles()

    plain_needed = sorted({f for files in uses.values() for f in files if f not in FAKE_JARS})
    jar_needed = sorted({f for files in uses.values() for f in files if f in FAKE_JARS})

    classes = 0
    for jar in jar_needed:
        if jar not in lib:
            print(f"error: no source for {jar}")
            return 1
        for fname, content in parse_java_classes(lib[jar]):
            (book_src / fname).write_text(content + "\n")
            classes += 1
            print(f"  {jar} -> book-src/{fname}")

    for fname in plain_needed:
        if fname not in lib:
            print(f"error: no source for datafile {fname}")
            return 1
        (datafiles_dir / fname).write_text(lib[fname])
        print(f"  {fname} -> book-datafiles/{fname}")

    manifests = 0
    for label, files in sorted(uses.items()):
        plain = [f for f in files if f not in FAKE_JARS]
        if plain:
            (tests_dir / f"{label}.datafiles").write_text("".join(f + "\n" for f in plain))
            manifests += 1
            print(f"  {label} -> book-tests/{label}.datafiles ({', '.join(plain)})")

    print(
        f"wrote {classes} classes from {len(jar_needed)} fake jars, "
        f"{len(plain_needed)} data files, {manifests} manifests"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
