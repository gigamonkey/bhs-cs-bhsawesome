#!/usr/bin/env bash

set -euo pipefail

# Reformat every .ptx under a directory (default: the whole repo, i.e. every book).

fd -e ptx . "${1:-.}" | while read -r f; do
    xml-format -i "$f"
done
