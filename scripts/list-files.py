#!/usr/bin/env -S uv run

from lxml import etree
import os
from argparse import ArgumentParser


XML_NS = "http://www.w3.org/XML/1998/namespace"
XML_ID = f"{{{XML_NS}}}id"

XI_NAMESPACE = "http://www.w3.org/2001/XInclude"
XI_TAG = f"{{{XI_NAMESPACE}}}include"

def process_xml(filename, base_dir=None, parent_source=None):
    if base_dir is None:
        full_path = os.path.abspath(filename)
    else:
        full_path = os.path.join(base_dir, filename)

    parser = etree.XMLParser()
    tree = etree.parse(full_path, parser)
    root = tree.getroot()

    return walk(root, source=full_path, base_dir=os.path.dirname(full_path))

def walk(elem, source, base_dir):
    if elem.tag == XI_TAG and elem.get("parse") != "text":
        href = elem.get("href")
        if href:
            # Resolve included file
            included_path = os.path.join(base_dir, href)
            yield included_path
            yield from process_xml(href, base_dir)
    else:
        for child in elem:
            yield from walk(child, source, base_dir)

if __name__ == "__main__":
    import sys

    parser = ArgumentParser(
        prog="list-files",
        description="List book files in topological order.",
    )
    parser.add_argument("-f", "--full", action="store_true", help="Full paths")
    parser.add_argument("root", help="Root file")

    args = parser.parse_args()

    top = os.path.dirname(os.path.abspath(args.root))

    for source in process_xml(args.root):
        if args.full:
            print(os.path.realpath(source))
        else:
            print(os.path.relpath(os.path.realpath(source), start=top))
