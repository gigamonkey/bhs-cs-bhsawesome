#!/usr/bin/env bash

set -euo pipefail

# Format a file twice and report it if the second pass changes anything.

config="$(dirname "$0")/../.xml-formats/ptx.json"
first=$(mktemp)
second=$(mktemp)
trap 'rm -f "$first" "$second"' EXIT

# The explicit config matters: discovery is by file extension, and the
# temp files would otherwise not get the .ptx config.
xml-format -c "$config" "$1" > "$first"
xml-format -q -c "$config" "$first" > "$second"

if ! cmp -s "$first" "$second"; then
    echo "$1"
    exit 1
fi
