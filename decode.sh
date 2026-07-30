#!/usr/bin/env bash

set -euo pipefail

#for f in pretext/**/*.ptx; do

rg --no-heading -l -g '*.ptx' '<code>' pretext/ | while read -r f; do
    out=$(mktemp)
    if xsltproc decode.xsl "$f" > "$out"; then
        mv "$out" "$f"
        xml-format -i "$f"
    else
        echo "Problem processing $f"
    fi
done
