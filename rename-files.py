#!/usr/bin/env python

"""
Rename .ptx files and keep their xml:ids in sync with the new file names.

In this book the published URL of a section is derived from its xml:id, and by
convention a section file is named <its-xml:id>.ptx (see check-ids.py). This
script automates renaming so that convention is preserved: given a config file
mapping old file paths to new ones it will, for each mapping,

  1. git mv the file to its new name,
  2. set the root element's xml:id to match the new base name,
  3. rewrite every <xi:include href="..."> that pointed at the old file, and
  4. rewrite every <xref ref="..."> (anywhere in the book) that pointed at the
     old xml:id.

Beyond the files named in the config, it also enforces the id convention across
the whole book: any section/subsection file whose root xml:id does not equal its
base name, or chapter (toctree.ptx) whose root xml:id does not equal its
directory name, is fixed in place -- the root xml:id is corrected and every
<xref> to the old id is rewritten, without moving the file. This makes the book
satisfy check-ids.py after a run. Pass --no-fix-ids to skip that pass and touch
only the files in the config.

Finally it runs xml-format on every file it touched so the result stays in
the canonical layout (rewriting a shorter/longer id can change line wrapping).

The id-uniqueness check and the include/reference rewrite only consider files
reachable from the book root (main.ptx) via <xi:include> -- the same set
list-files.py and the full-main.ptx Make rule use (commented-out chapter
includes in main.ptx are uncommented first, so not-yet-ready chapters still
count). Dead/orphan .ptx files that the book never includes are ignored, so
their ids never block a rename. Pass --all-files to fall back to scanning every
git-tracked .ptx instead.

Config file format -- one mapping per line, blank lines and #-comments ignored:

    # old path (or unambiguous bare name)   ->   new name
    pretext/loops/topic-2-7-while-loops.ptx  ->  while-loops.ptx
    topic-2-8-for-loops.ptx                      for-loops.ptx

The separator may be "->", "=>", "=", or just whitespace. If the OLD side has
no directory component it is looked up by base name under the book directory
(error if missing or ambiguous). If the NEW side has no directory component the
file stays in the same directory. The new xml:id is the new base name with the
.ptx stripped.
"""

import os
import re
import sys
import subprocess
from argparse import ArgumentParser
from pathlib import Path

from lxml import etree

XML_ID = "{http://www.w3.org/XML/1998/namespace}id"

XI_NS = "http://www.w3.org/2001/XInclude"
XI_INCLUDE = f"{{{XI_NS}}}include"

SCRIPT_DIR = Path(__file__).resolve().parent

# Attributes whose values reference an xml:id and so must follow a renamed id.
# Only "ref" is used in this book today; first/last/provisional are the other
# PreTeXt xref forms, included defensively. We only ever rewrite tokens that
# exactly equal a known old id, so listing extra attributes here is harmless.
REF_ATTRS = ("ref", "first", "last", "provisional")

ID_RE = re.compile(r"""xml:id\s*=\s*(["'])(.*?)\1""")


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config parsing and path resolution
# ---------------------------------------------------------------------------

def parse_config(path):
    pairs = []
    with open(path) as f:
        for n, line in enumerate(f, 1):
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            parts = re.split(r"\s*(?:->|=>|=)\s*|\s+", line, maxsplit=1)
            if len(parts) != 2 or not parts[0] or not parts[1]:
                die(f"{path}:{n}: can't parse mapping: {line!r}")
            pairs.append((parts[0], parts[1]))
    return pairs


def find_by_basename(book_dir, name):
    matches = [p for p in book_dir.rglob(name)]
    if not matches:
        die(f"no file named {name!r} under {book_dir}")
    if len(matches) > 1:
        listing = "\n  ".join(str(m) for m in matches)
        die(f"{name!r} is ambiguous; use a path. Matches:\n  {listing}")
    return matches[0].resolve()


def resolve_old(book_dir, raw):
    if os.sep in raw or "/" in raw:
        p = Path(raw).resolve()
        if not p.exists():
            die(f"old file does not exist: {raw}")
        return p
    return find_by_basename(book_dir, raw)


def resolve_new(old_abs, raw):
    if os.sep in raw or "/" in raw:
        return Path(raw).resolve()
    return (old_abs.parent / raw).resolve()


def same_path_ci(a, b):
    """True if a and b are the same path ignoring letter case.

    Compared as lowercased strings rather than via os.path.samefile(): on some
    case-insensitive mounts (e.g. a macOS volume bind-mounted into a Linux
    container) stat reports a *different* inode for each spelling of the same
    file, so samefile() wrongly returns False. True for a path against itself
    (the in-place id-fix records) as well as for a case-only rename.
    """
    return str(a).lower() == str(b).lower()


def is_case_only(old_abs, new_abs):
    """True if old/new are the same file but with a different letter case."""
    return old_abs != new_abs and same_path_ci(old_abs, new_abs)


def root_id(path):
    """Return (root_tag, current_xml:id-or-None) for a .ptx file."""
    root = etree.parse(str(path)).getroot()
    return etree.QName(root).localname, root.get(XML_ID)


# Root element kinds whose xml:id the book's naming convention pins down (the
# rule check-ids.py enforces). Two flavors: container roots (a chapter, or the
# <frontmatter> in frontmatter/toctree.ptx) take their directory name; the rest
# (section, subsection, and each <preface> file) take their file's base name.
# Other roots (pretext, ...) have no such rule and are left untouched.
DIR_NAMED_ROOTS = {"chapter", "frontmatter"}
ENFORCED_ROOTS = {"section", "subsection", "chapter", "frontmatter", "preface"}


def expected_root_id(path, root_tag):
    """The xml:id the convention dictates for the root element of `path`."""
    return path.parent.name if root_tag in DIR_NAMED_ROOTS else path.stem


# ---------------------------------------------------------------------------
# Text rewriting (targeted edits; xml-format canonicalizes afterwards)
# ---------------------------------------------------------------------------

def rewrite_ids(text, id_map):
    """Rewrite ref-style attribute values, mapping each id token via id_map."""
    if not id_map:
        return text, 0
    count = 0

    def repl(m):
        nonlocal count
        quote, value = m.group("q"), m.group("v")
        tokens = value.split()
        new_tokens = [id_map.get(t, t) for t in tokens]
        if new_tokens != tokens:
            count += 1
            return f"{m.group('a')}={quote}{' '.join(new_tokens)}{quote}"
        return m.group(0)

    attr_alt = "|".join(REF_ATTRS)
    pattern = re.compile(
        rf"""\b(?P<a>{attr_alt})\s*=\s*(?P<q>["'])(?P<v>.*?)(?P=q)"""
    )
    return pattern.sub(repl, text), count


def rewrite_includes(text, including_dir, move_map):
    """Rewrite <xi:include href="..."> targets that point at a moved file.

    move_map maps resolved old absolute paths -> new absolute paths.
    """
    if not move_map:
        return text, 0
    count = 0

    def repl(m):
        nonlocal count
        quote, href = m.group("q"), m.group("v")
        target = (including_dir / href).resolve()
        new_abs = move_map.get(target)
        if new_abs is None:
            return m.group(0)
        rel = os.path.relpath(new_abs, start=including_dir)
        if not rel.startswith((".", os.sep)):
            rel = f"./{rel}"          # keep the book's "./name.ptx" style
        count += 1
        return f"{m.group('pre')}{quote}{rel}{quote}"

    pattern = re.compile(
        r"""(?P<pre><xi:include\b[^>]*?\bhref\s*=\s*)(?P<q>["'])(?P<v>.*?)(?P=q)"""
    )
    return pattern.sub(repl, text), count


def set_root_id(text, root_tag, old_id, new_id):
    """Set the root element's xml:id to new_id (adding it if absent)."""
    if old_id is not None:
        if old_id == new_id:
            return text, False
        new_text = ID_RE.sub(
            lambda m: f"xml:id={m.group(1)}{new_id}{m.group(1)}", text, count=1
        )
        return new_text, new_text != text
    # No xml:id on the root yet: insert one right after the tag name.
    new_text, n = re.subn(
        rf"(<{re.escape(root_tag)})(\s|/|>)",
        rf'\1 xml:id="{new_id}"\2',
        text,
        count=1,
    )
    return new_text, n > 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = ArgumentParser(
        prog="rename-files",
        description="Rename .ptx files and sync their xml:ids and references.",
    )
    parser.add_argument("config", help="Mapping file (old -> new per line)")
    parser.add_argument(
        "--book-dir",
        default=str(SCRIPT_DIR / "pretext"),
        help="Directory to resolve bare base names and scan (default: pretext)",
    )
    parser.add_argument(
        "-n", "--dry-run", action="store_true",
        help="Print what would change without touching anything",
    )
    parser.add_argument(
        "--root", default=None,
        help="Book root to scope the id scan to (default: <book-dir>/main.ptx)",
    )
    parser.add_argument(
        "--all-files", action="store_true",
        help="Scan every tracked .ptx instead of only book-reachable files",
    )
    parser.add_argument(
        "--no-fix-ids", action="store_true",
        help="Don't normalize root xml:ids of files not named in the config",
    )
    parser.add_argument(
        "--no-git", action="store_true", help="Use plain rename instead of git mv"
    )
    parser.add_argument(
        "--no-format", action="store_true", help="Skip running xml-format"
    )
    args = parser.parse_args()

    book_dir = Path(args.book_dir).resolve()
    book_root = Path(args.root).resolve() if args.root else book_dir / "main.ptx"

    # 1. Resolve every config mapping into a record
    #    (old_abs, new_abs, root_tag, old_id, new_id).
    records = []
    for old_raw, new_raw in parse_config(args.config):
        old_abs = resolve_old(book_dir, old_raw)
        new_abs = resolve_new(old_abs, new_raw)
        if new_abs.suffix != ".ptx":
            die(f"new name must end in .ptx: {new_raw}")
        root_tag, old_id = root_id(old_abs)
        new_id = expected_root_id(new_abs, root_tag)
        records.append((old_abs, new_abs, root_tag, old_id, new_id))

    # Scope the scan to the book (files reachable from main.ptx) unless the
    # caller asks for every tracked file, so dead/orphan trees can't block a
    # rename or be needlessly rewritten.
    if args.all_files:
        scan_files = git_ptx_files(book_dir, args.no_git)
    else:
        scan_files = book_ptx_files(book_root)
    all_text = {
        Path(p).resolve(): Path(p).read_text() for p in scan_files
    }

    # 1b. Enforce the id convention on every other file too: a section's or
    #     subsection's root xml:id must equal its base name and a chapter's must
    #     equal its directory name. Any in-convention file whose root id is
    #     missing or wrong is fixed in place (new_abs == old_abs, no move) and
    #     its old id flows into id_map so xrefs to it are rewritten as well.
    config_sources = {r[0] for r in records}
    if not args.no_fix_ids:
        for path in sorted(all_text):
            if path in config_sources:
                continue
            root_tag, cur_id = root_id(path)
            if root_tag not in ENFORCED_ROOTS:
                continue
            want = expected_root_id(path, root_tag)
            if cur_id != want:
                records.append((path, path, root_tag, cur_id, want))

    move_map = {r[0]: r[1] for r in records if r[0] != r[1]}  # old_abs -> new_abs
    id_map = {r[3]: r[4] for r in records if r[3] and r[3] != r[4]}  # old->new id

    # 2. Validate ids: legal, no internal duplicates, no clash with kept ids.
    existing_ids = set()
    for text in all_text.values():
        existing_ids.update(m.group(2) for m in ID_RE.finditer(text))

    seen_new = {}
    kept_ids = existing_ids - {r[3] for r in records if r[3]}
    for old_abs, new_abs, _, old_id, new_id in records:
        if not re.fullmatch(r"[A-Za-z_][\w-]*", new_id):
            die(f"{new_id!r} is not a valid xml:id")
        if new_id in seen_new:
            die(f"two mappings produce the same id {new_id!r}: "
                f"{seen_new[new_id].name} and {old_abs.name}")
        seen_new[new_id] = old_abs
        if new_id in kept_ids:
            die(f"id {new_id!r} (for {new_abs.name}) already exists elsewhere")
        # A case-only rename (Foo.ptx -> foo.ptx) looks like a pre-existing
        # target on a case-insensitive filesystem because new_abs resolves to
        # old_abs itself; that's fine, only a *different* existing file is not.
        target_clash = (
            new_abs.exists()
            and new_abs not in move_map
            and not same_path_ci(old_abs, new_abs)
        )
        if target_clash:
            die(f"target already exists: {new_abs}")

    # 3. Report.
    renames = [r for r in records if r[0] != r[1]]
    fixes = [r for r in records if r[0] == r[1]]
    if renames:
        print("Renames:")
        for old_abs, new_abs, _, old_id, new_id in renames:
            rel_o = os.path.relpath(old_abs)
            rel_n = os.path.relpath(new_abs)
            idnote = (f"id {old_id!r} -> {new_id!r}" if old_id
                      else f"add id {new_id!r}")
            print(f"  {rel_o}\n    -> {rel_n}   ({idnote})")
    if fixes:
        print("Root xml:id fixes (no move):")
        for old_abs, _, _, old_id, new_id in fixes:
            idnote = f"{old_id!r} -> {new_id!r}" if old_id else f"add {new_id!r}"
            print(f"  {os.path.relpath(old_abs)}   ({idnote})")

    # 4. Apply.
    changed = set()       # paths (post-move) whose text we rewrote

    # 4a. Move files first so subsequent edits operate on final locations.
    #     (id-fix records have new_abs == old_abs and are not moved.)
    for old_abs, new_abs, *_ in records:
        if args.dry_run or old_abs == new_abs:
            continue
        new_abs.parent.mkdir(parents=True, exist_ok=True)
        git_mv(old_abs, new_abs, args.no_git)

    # 4b. Rewrite references / includes across every file, plus each renamed
    #     file's own root xml:id.
    rename_targets = {r[1]: r for r in records}   # new_abs -> record
    for orig_path, text in all_text.items():
        cur_path = move_map.get(orig_path, orig_path)
        new_text = text

        new_text, n_inc = rewrite_includes(new_text, cur_path.parent, move_map)
        new_text, n_ref = rewrite_ids(new_text, id_map)

        n_id = 0
        if cur_path in rename_targets:
            _, _, root_tag, old_id, new_id = rename_targets[cur_path]
            new_text, did = set_root_id(new_text, root_tag, old_id, new_id)
            n_id = int(did)
            if old_id is None and not did:
                print(f"  warning: could not set xml:id on {cur_path.name}",
                      file=sys.stderr)

        if new_text != text:
            changed.add(cur_path)
            rel = os.path.relpath(cur_path)
            bits = []
            if n_id:
                bits.append("xml:id")
            if n_inc:
                bits.append(f"{n_inc} include(s)")
            if n_ref:
                bits.append(f"{n_ref} ref(s)")
            print(f"  edit {rel}: {', '.join(bits)}")
            if not args.dry_run:
                cur_path.write_text(new_text)

    # 5. Warn about references this script does not touch (publication config).
    check_publication(id_map)

    if args.dry_run:
        print("\n(dry run -- nothing written)")
        return

    # 6. Re-canonicalize touched files.
    if changed and not args.no_format:
        run_format([move_map.get(p, p) for p in changed])

    print(f"\nDone: {len(renames)} file(s) renamed, {len(fixes)} id(s) fixed, "
          f"{len(changed)} file(s) edited.")


# ---------------------------------------------------------------------------
# External commands / file discovery
# ---------------------------------------------------------------------------

def book_ptx_files(main_ptx):
    """Resolved paths of every .ptx reachable from the book root via xi:include.

    Mirrors list-files.py / the full-main.ptx Make rule: commented-out chapter
    includes in main.ptx are uncommented first (perl -pe 's/<!-- (.*) -->/$1/')
    so not-yet-ready chapters still count, then <xi:include> is followed
    recursively. Dead/orphan .ptx files that nothing includes are excluded --
    their ids are irrelevant to the published book and must not block a rename.
    """
    main_ptx = Path(main_ptx).resolve()
    if not main_ptx.exists():
        die(f"book root does not exist: {main_ptx}")
    root_text = re.sub(r"<!-- (.*) -->", r"\1", main_ptx.read_text())

    found = [main_ptx]
    seen = {main_ptx}

    def walk(xml_bytes, base_dir):
        try:
            root = etree.fromstring(xml_bytes)
        except etree.XMLSyntaxError as e:
            die(f"could not parse {base_dir} while scanning the book: {e}")
        for inc in root.iter(XI_INCLUDE):
            if inc.get("parse") == "text":
                continue                       # raw code include, not a .ptx
            href = inc.get("href")
            if not href:
                continue
            target = (base_dir / href).resolve()
            if target in seen or not target.exists():
                continue
            seen.add(target)
            found.append(target)
            walk(target.read_bytes(), target.parent)

    walk(root_text.encode(), main_ptx.parent)
    return [str(p) for p in found]


def git_ptx_files(book_dir, no_git):
    if no_git:
        return [str(p) for p in book_dir.rglob("*.ptx")]
    out = subprocess.run(
        ["git", "ls-files", "--", "*.ptx"],
        cwd=SCRIPT_DIR, capture_output=True, text=True, check=True,
    ).stdout
    return [str((SCRIPT_DIR / line).resolve()) for line in out.splitlines() if line]


def git_mv(old_abs, new_abs, no_git):
    # On a case-insensitive filesystem a case-only rename (Foo.ptx -> foo.ptx)
    # has a "destination" that already refers to the same file, so a plain move
    # is refused ("destination exists"). Detect that and force it.
    case_only = is_case_only(old_abs, new_abs)
    if case_only and not no_git:
        # `git mv -f` records the rename in the index with the new casing. The
        # working-tree filename may keep the old case until a fresh checkout,
        # which is harmless on a case-insensitive filesystem. (A two-step move
        # through a temp name does NOT work here -- the second `git mv` hits the
        # same "destination exists" refusal and strands a *.rename-tmp file.)
        _do_mv(old_abs, new_abs, no_git, force=True)
    elif case_only:
        # Without git, os.replace can't change only the case in place on such a
        # filesystem, so bounce through a temp name.
        tmp = old_abs.with_name(old_abs.name + ".rename-tmp")
        os.replace(old_abs, tmp)
        os.replace(tmp, new_abs)
    else:
        _do_mv(old_abs, new_abs, no_git)


def _do_mv(old_abs, new_abs, no_git, force=False):
    if no_git:
        os.replace(old_abs, new_abs)
        return
    cmd = ["git", "mv"]
    if force:
        cmd.append("-f")
    cmd += [str(old_abs), str(new_abs)]
    subprocess.run(cmd, cwd=SCRIPT_DIR, check=True)


def run_format(paths):
    paths = sorted(set(str(p) for p in paths))
    print(f"\nFormatting {len(paths)} file(s) with xml-format ...")
    subprocess.run(
        ["xml-format", "-q", "-i", *paths],
        cwd=SCRIPT_DIR, check=True,
    )


def check_publication(id_map):
    if not id_map:
        return
    for name in ("publication/html.xml", "publication/runestone.xml", "project.ptx"):
        p = SCRIPT_DIR / name
        if not p.exists():
            continue
        text = p.read_text()
        for old_id in id_map:
            if re.search(rf'"{re.escape(old_id)}"', text):
                print(f"  warning: {name} mentions {old_id!r}; "
                      f"check it manually (not auto-edited)", file=sys.stderr)


if __name__ == "__main__":
    main()
