#!/usr/bin/env -S uv run

"""
Dump out all the xml:id values used anywhere in the book.
"""

from lxml import etree
import os

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
    if elem.tag == XI_TAG:
        href = elem.get("href")
        if href:
            # Resolve included file
            included_path = os.path.join(base_dir, href)
            included_tree = process_xml(href, base_dir)
            for item in included_tree:
                yield item
    else:
        yield (elem, source)
        for child in elem:
            yield from walk(child, source, base_dir)

# Example usage
if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Usage: scripts/all-ids.py <book>/source/main.ptx")
        sys.exit(1)

    filename = sys.argv[1]

    for elem, source in process_xml(filename):
        if id := elem.get(XML_ID):
            print(id)
