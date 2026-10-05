#!/usr/bin/env -S uv run
"""Validate a book's source files against its schema.

    scripts/validate.py <book> [files...]   # default: all <book>/source/**/*.ptx

Validates against the committed <book>/schema.rng — the trang-compiled form
of <book>/schema.rnc (which includes the shared builder/schema/core.rnc).
After editing either .rnc, regenerate the .rng with `make schema` (needs
trang). Files are validated as authored — xi:include elements are part of
the schema, not resolved first.
"""

import sys
from argparse import ArgumentParser
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = ArgumentParser(description="Validate a book's source against its schema.")
    parser.add_argument("book", help="book directory (holds schema.rng and source/)")
    parser.add_argument("files", nargs="*", help="specific files (default: every .ptx under source/)")
    args = parser.parse_args()
    book = Path(args.book).resolve()
    relaxng = etree.RelaxNG(etree.parse(str(book / "schema.rng")))
    files = [Path(a) for a in args.files] or sorted((book / "source").glob("**/*.ptx"))
    bad = 0
    for f in files:
        try:
            doc = etree.parse(str(f))
        except etree.XMLSyntaxError as e:
            print(f"BAD {f.relative_to(ROOT)}: {e}")
            bad += 1
            continue
        if not relaxng.validate(doc):
            bad += 1
            for err in relaxng.error_log:
                print(f"BAD {Path(err.filename).relative_to(ROOT)}:{err.line}: {err.message}")
    print(f"validated {len(files)} file(s); {bad} invalid")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
