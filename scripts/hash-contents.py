#!/usr/bin/env -S uv run

"""
Hash every element of a book into a SQLite db to find duplicated content:

    scripts/hash-contents.py hashes.db <book>/source/main.ptx
    scripts/show-dupes.sh hashes.db
"""

from lxml import etree
import os
import hashlib
import sqlite3
from argparse import ArgumentParser

XML_NS = "http://www.w3.org/XML/1998/namespace"
XML_ID = f"{{{XML_NS}}}id"

XI_NAMESPACE = "http://www.w3.org/2001/XInclude"
XI_TAG = f"{{{XI_NAMESPACE}}}include"

def init_db(con):
    con.execute("DROP TABLE IF EXISTS hashes")
    con.execute("DROP TABLE IF EXISTS dupe_hashes")
    con.execute("DROP VIEW IF EXISTS dupes")
    con.execute("DROP VIEW IF EXISTS hash_source")
    con.execute("CREATE TABLE hashes (hash TEXT NOT NULL, source TEXT NOT NULL, contents TEXT NOT NULL, parent TEXT NULL)")


def finish_db(con):
    con.execute("CREATE TABLE dupe_hashes AS SELECT hash, COUNT(*) num, LENGTH(contents) size FROM hashes GROUP BY hash HAVING COUNT(*) > 1")
    con.execute("CREATE VIEW dupes AS SELECT hash, source, contents, parent FROM hashes LEFT JOIN dupe_hashes USING (hash) WHERE dupe_hashes.hash IS NOT NULL")
    con.execute("CREATE VIEW hash_source AS SELECT DISTINCT hash, source, LENGTH(contents) size FROM hashes")


def insert_hashes(con, all):
    con.executemany("INSERT INTO hashes (hash, source, contents, parent) values (:hash, :source, :contents, :parent)", all)


def process_xml(filename, base_dir=None):
    if base_dir is None:
        full_path = os.path.abspath(filename)
    else:
        full_path = os.path.join(base_dir, filename)

    parser = etree.XMLParser()
    tree = etree.parse(full_path, parser)
    root = tree.getroot()

    return walk(root, full_path, os.path.dirname(full_path), None)

def walk(elem, source, base_dir, parent):
    if elem.tag == XI_TAG and elem.get("parse") != "text":
        href = elem.get("href")
        if href:
            yield from process_xml(href, base_dir)
    else:
        r = row(elem, source, parent)
        yield r
        for child in elem:
            yield from walk(child, source, base_dir, r['hash'])


def hashText(text):
    m = hashlib.sha256()
    m.update(text.encode('utf-8'))
    return m.hexdigest()[:8]


def row(elem, source, parent):
    text = etree.tostring(elem).decode('utf-8').strip()
    return {
        "hash": hashText(text),
        "source": os.path.realpath(source),
        "contents": text,
        "parent": parent
    }



if __name__ == "__main__":

    parser = ArgumentParser(
        prog="hash-contents",
        description="Hash all tree elements in book",
    )
    parser.add_argument("db", help="Database file")
    parser.add_argument("root", help="Root file")

    args = parser.parse_args()

    top = os.path.dirname(os.path.abspath(args.root))

    print(f"Saving to {args.db}")
    con = con = sqlite3.connect(args.db)
    init_db(con)
    insert_hashes(con, process_xml(args.root))
    finish_db(con)
    con.commit()
