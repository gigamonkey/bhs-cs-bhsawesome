#!/usr/bin/env bash

set -euo pipefail

fd -e ptx . pretext | while read -r f; do
    xml-format -i "$f"
done
