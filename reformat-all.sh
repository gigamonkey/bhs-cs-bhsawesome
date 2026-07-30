#!/usr/bin/env bash

set -euo pipefail

fd \.ptx pretext | while read -r f; do
    xml-format -i "$f"
done
