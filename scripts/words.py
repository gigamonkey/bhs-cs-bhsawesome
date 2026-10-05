#!/usr/bin/env -S uv run

import re
from argparse import ArgumentParser

from lxml import etree


def count_level(c, subs, level, parent_count, excluded):
    count = count_paragraphs(c, excluded)

    emit(title(c), count, parent_count, level)

    intros = c.xpath("./introduction")

    if len(intros) > 0:
        emit("Introduction", count_paragraphs(intros[0], excluded), count, level + 1)

    if subs:
        for s in c.xpath(f"./{subs[0]}"):
            count_level(s, subs[1:], level + 1, count, excluded)


def emit(title, count, parent_count, level):
    indent = " " * (level * 2)
    percent = 100 * count / parent_count
    print(f"{indent}- {title} ({count:,} - {percent:.1f}%)\n")


def title(elem):
    return re.sub(r"\s+", " ", to_text(elem.xpath("title")[0])).strip()


def count_paragraphs(e, excluded):
    """
    Count words in a <p> elements under e excluded those under specified
    ancestor elements.

    We also exclude nested <p> elements because otherwis their contents would be
    double counted.
    """
    exclusions = "|".join(f"ancestor::{e}" for e in [*(excluded or []), "p"])
    return sum(wordcount(p) for p in e.xpath(f".//p[not({exclusions})]"))

def wordcount(e):
    return len(re.findall(r"\w+", to_text(e)))


def to_text(elem):
    return etree.tostring(elem, encoding="unicode", method="text")


def main(filename, excluded):
    tree = etree.parse(filename)
    tree.xinclude()

    total = count_paragraphs(tree.getroot(), excluded)

    chapters = tree.xpath("//chapter")

    print("-*- mode: list-outline; eval: (outline-hide-sublevels 2) -*-\n")

    print(f"Total words: {total:,}\n")

    for c in chapters:
        count_level(c, ["section", "subsection"], 0, total, excluded)


if __name__ == "__main__":
    parser = ArgumentParser(
        prog="words",
        description="Count words in text of ptx file..",
    )
    parser.add_argument("-x", "--exclude", action='append', help='Element type to exclude.')

    parser.add_argument("file", help="Filename")

    args = parser.parse_args()

    main(args.file, args.exclude)
