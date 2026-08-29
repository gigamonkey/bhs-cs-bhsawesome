#!/usr/bin/env -S uv run
"""Validate every book source file against the book schema.

    ./validate.py [files...]        # default: all pretext/**/*.ptx

Validates against the committed pretext/bhsawesome.rng — the trang-compiled
form of pretext/bhsawesome.rnc (which includes the shared
builder/schema/core.rnc). After editing either .rnc, regenerate the .rng
with `make schema` (needs trang). Files are validated as authored —
xi:include elements are part of the schema, not resolved first.
"""

import sys
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).parent
SCHEMA = ROOT / "pretext" / "bhsawesome.rng"


def main() -> int:
    relaxng = etree.RelaxNG(etree.parse(str(SCHEMA)))
    files = [Path(a) for a in sys.argv[1:]] or sorted(
        (ROOT / "pretext").glob("**/*.ptx")
    )
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
