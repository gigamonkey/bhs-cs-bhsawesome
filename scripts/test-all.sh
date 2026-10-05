#!/usr/bin/env bash

set -euo pipefail

# Check that formatting every .ptx under a directory (default: the whole
# repo) is idempotent; prints each file that isn't.

fd -e ptx . "${1:-.}" | while read -r f; do
    "$(dirname "$0")/test-idempotency.sh" "$f"
done
