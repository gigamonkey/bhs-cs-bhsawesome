#!/usr/bin/env bash

set -euo pipefail

# Search a book's files in reading order:
#
#     scripts/find-in-order.sh <book> <pattern>

book="${1:?usage: find-in-order.sh <book> <pattern>}"
pat="${2:?usage: find-in-order.sh <book> <pattern>}"

# Ripgrep normally processes things in parallel so output can come out in any order.
# So we loop through the files and rg them one at a time.
uv run "$(dirname "$0")/list-files.py" --full "$book/source/main.ptx" | while read -r f; do
    if rg --ignore-case --pretty --with-filename "$pat" "$f"; then
        echo ""
    fi
done
