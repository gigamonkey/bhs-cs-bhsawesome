#!/usr/bin/env python

"""
List the URLs of the HTML pages of the book in reading order.

This mimics PreTeXt's chunking algorithm (see xsl/pretext-common.xsl in the
pretext distribution): with the default chunk level for a book without parts
(2), the book and each chapter get an intermediate summary page and each
section gets a full page, as do frontmatter/backmatter divisions. Each page is
named <id>.html where <id> is the division's label or xml:id, or a generated
parent-id-N value when it has neither.
"""

import os
from argparse import ArgumentParser
from urllib.parse import urljoin

from lxml import etree

XML_NS = "http://www.w3.org/XML/1998/namespace"
XML_ID = f"{{{XML_NS}}}id"

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
        help="Base URL (default: the Runestone published-book URL "
        "derived from docinfo/document-id)",
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=os.path.join(os.path.dirname(__file__), "pretext", "main.ptx"),
        help="Root file (default: pretext/main.ptx)",
    )
    args = parser.parse_args()

    tree = etree.parse(args.root)
    tree.xinclude()
    root = tree.getroot()

    base = args.base
    if base is None:
        document_id = root.findtext("docinfo/document-id").strip()
        base = f"https://runestone.academy/ns/books/published/{document_id}/"
    if not base.endswith("/"):
        base += "/"

    book = root.find("book")
    if book is None:
        book = root.find("article")
    has_parts = book.find("part") is not None
    for division in pages(book, default_chunk_level(root), has_parts):
        print(urljoin(base, f"{visible_id(division)}.html"))
