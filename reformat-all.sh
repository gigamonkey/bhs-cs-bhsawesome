#!/usr/bin/env bash

set -euo pipefail

fd -e ptx . bhsawesome/source | while read -r f; do
    xml-format -i "$f"
done
