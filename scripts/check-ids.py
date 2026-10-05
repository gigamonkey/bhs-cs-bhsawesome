#!/usr/bin/env -S uv run

"""
Report every section/preface file not named <its-xml:id>.ptx and every
chapter/frontmatter whose directory name differs from its xml:id (the
convention rename-files.py maintains). Silent when the book conforms.
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
        # Skip raw text includes (e.g. <xi:include parse="text" .../> pulling in
        # a .java file); they aren't XML and parsing them would crash.
        if elem.get("parse") == "text":
            return
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
        print("Usage: scripts/check-ids.py <book>/source/main.ptx")
        sys.exit(1)

    filename = sys.argv[1]

    # Container roots take their directory name; file-level roots take their
    # base name. Keep these in sync with rename-files.py's ENFORCED_ROOTS.
    FILE_NAMED_ROOTS = ('section', 'preface')
    DIR_NAMED_ROOTS = ('chapter', 'frontmatter')

    for elem, source in process_xml(filename):
        if elem.tag in FILE_NAMED_ROOTS:
            id = elem.get(XML_ID)
            base = os.path.basename(source)
            if f"{id}.ptx" != base:
                print(os.path.realpath(source))
        elif elem.tag in DIR_NAMED_ROOTS:
            id = elem.get(XML_ID)
            base = os.path.basename(os.path.dirname(source))
            if id != base:
                print(os.path.realpath(source))
