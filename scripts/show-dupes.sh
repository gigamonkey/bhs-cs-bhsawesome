#!/usr/bin/env bash

set -euo pipefail

# Show the biggest duplicated elements in a hash-contents.py database.

sqlite3 "${1:?usage: show-dupes.sh <hashes.db>}" < "$(dirname "$0")/show-dupes.sql"
