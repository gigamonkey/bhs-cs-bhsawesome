#!/usr/bin/env python

"""
List the URLs of the HTML pages of the book in reading order.

This mimics the builder's chunking (builder/src/book.ts, itself PreTeXt's
default chunk level 2 for a book without parts): the book and each chapter
get an intermediate summary page and each section gets a full page, as do
frontmatter/backmatter divisions. Each page is a directory URL
(plans/bhsawesome-index-html-urls.md): its ancestor page-divisions' ids
joined with /, slash-terminated — the book itself is the base URL. An id is
the division's label or xml:id, or a generated parent-id-N value when it
has neither.
"""

import os
from argparse import ArgumentParser
from urllib.parse import urljoin

from lxml import etree

XML_NS = "http://www.w3.org/XML/1998/namespace"
XML_ID = f"{{{XML_NS}}}id"

XI_NS = "http://www.w3.org/2001/XInclude"
XI_INCLUDE = f"{{{XI_NS}}}include"

# The STRUCTURAL entity from pretext's xsl/entities.ent.
STRUCTURAL = {
    "book", "article", "slideshow", "letter", "memo", "frontmatter", "part",
    "chapter", "appendix", "index", "preface", "acknowledgement", "biography",
    "foreword", "dedication", "colophon", "section", "subsection",
    "subsubsection", "slide", "exercises", "worksheet", "handout",
    "reading-questions", "solutions", "references", "glossary", "backmatter",
}

# Divisions whose presence makes a division "structured" rather than a leaf.
TRADITIONAL = {"part", "chapter", "section", "subsection", "subsubsection"}

# Default titles (per pretext's en-US localization) for divisions that
# needn't have an explicit <title>.
DEFAULT_TITLES = {
    "frontmatter": "Front Matter",
    "backmatter": "Back Matter",
    "index": "Index",
    "preface": "Preface",
    "colophon": "Colophon",
    "dedication": "Dedication",
    "acknowledgement": "Acknowledgements",
    "biography": "Author Biography",
    "exercises": "Exercises",
    "worksheet": "Worksheet",
    "reading-questions": "Reading Questions",
    "solutions": "Solutions",
    "references": "References",
    "glossary": "Glossary",
}


def load(filename, sources):
    """Parse filename, recursively resolving <xi:include>s ourselves so we can
    record which file each included element came from (libxml2's xinclude no
    longer does base-URI fixup, so element.base can't tell us). parse="text"
    includes are left alone; no division comes from them."""
    root = etree.parse(filename).getroot()
    sources[root] = filename
    resolve_includes(root, os.path.dirname(filename), sources)
    return root


def resolve_includes(elem, base_dir, sources):
    for child in list(elem):
        if child.tag == XI_INCLUDE and child.get("parse") != "text":
            included = load(os.path.join(base_dir, child.get("href")), sources)
            elem.replace(child, included)
        else:
            resolve_includes(child, base_dir, sources)


def source_file(elem, sources):
    while elem not in sources:
        elem = elem.getparent()
    return sources[elem]


def default_chunk_level(root):
    if root.find("book/part") is not None:
        return 3
    if root.find("book") is not None:
        return 2
    if root.find("article/section") is not None:
        return 1
    return 0


def level(elem, has_parts):
    tag = elem.tag
    parent = elem.getparent()
    if tag in ("book", "article"):
        return 0
    if tag in ("frontmatter", "backmatter"):
        return 1 if (parent.tag == "book" and has_parts) else 0
    if tag == "part":
        return 1
    return level(parent, has_parts) + 1


def is_leaf(elem):
    if elem.tag == "frontmatter":
        return all(child.tag == "titlepage" for child in elem)
    if elem.tag == "backmatter":
        return False
    return not any(child.tag in TRADITIONAL for child in elem)


def visible_id(elem):
    "A division's label or xml:id, else parent-id-N as pretext generates."
    explicit = elem.get("label") or elem.get(XML_ID)
    if explicit is not None:
        return explicit
    n = sum(1 for _ in elem.itersiblings(preceding=True)) + 1
    return f"{visible_id(elem.getparent())}-{n}"


def number(elem):
    """The division's number ("12" for a chapter, "12.2" for a section), or
    None for the book itself and the unnumbered front/backmatter divisions."""
    if elem.tag in ("book", "article", "frontmatter", "backmatter"):
        return None
    parent = elem.getparent()
    if parent.tag in ("frontmatter", "backmatter"):
        return None
    n = 1 + sum(
        1
        for s in elem.itersiblings(preceding=True)
        if s.tag in STRUCTURAL and s.tag not in ("frontmatter", "backmatter")
    )
    above = number(parent)
    return f"{above}.{n}" if above else str(n)


def page_title(elem):
    "The heading as rendered on the division's page, e.g. '12.2 Sorting algorithms'."
    t = elem.find("title")
    if t is not None:
        text = " ".join("".join(t.itertext()).split())
    else:
        text = DEFAULT_TITLES.get(elem.tag, elem.tag.capitalize())
    n = number(elem)
    return f"{n} {text}" if n else text


def pages(elem, chunk_level, has_parts):
    "Yield the divisions that get their own page, in reading order."
    if chunk_level == level(elem, has_parts) or is_leaf(elem):
        yield elem  # a full page
    else:
        yield elem  # an intermediate (summary) page
        for child in elem:
            if child.tag in STRUCTURAL:
                yield from pages(child, chunk_level, has_parts)


if __name__ == "__main__":
    parser = ArgumentParser(
        prog="list-urls",
        description="List the URLs of the book's pages in reading order.",
    )
    parser.add_argument(
        "-b", "--base",
        default="/bhsawesome/",
        help="Base URL (default: /bhsawesome/, the site's mount on the "
        "bhs-cs website)",
    )
    parser.add_argument(
        "-f", "--files",
        action="store_true",
        help="Emit a TSV of the source .ptx file of each page and its URL",
    )
    parser.add_argument(
        "-t", "--titles",
        action="store_true",
        help="Add a column with the title rendered on each page, "
        "e.g. '12.2 Sorting algorithms'",
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=os.path.join(os.path.dirname(__file__), "pretext", "main.ptx"),
        help="Root file (default: pretext/main.ptx)",
    )
    args = parser.parse_args()

    sources = {}
    root = load(args.root, sources)

    base = args.base
    if not base.endswith("/"):
        base += "/"

    book = root.find("book")
    if book is None:
        book = root.find("article")
    has_parts = book.find("part") is not None
    page_list = list(pages(book, default_chunk_level(root), has_parts))
    page_set = set(page_list)

    def url_path(division):
        "Ancestor page-divisions' ids joined with /; '' for the book itself."
        parts = []
        el = division
        while el is not None and el.tag not in ("book", "article"):
            if el in page_set:
                parts.append(visible_id(el))
            el = el.getparent()
        return "/".join(reversed(parts))

    for division in page_list:
        columns = []
        if args.files:
            columns.append(os.path.relpath(source_file(division, sources)))
        path = url_path(division)
        columns.append(urljoin(base, f"{path}/") if path else base)
        if args.titles:
            columns.append(page_title(division))
        print("\t".join(columns))
