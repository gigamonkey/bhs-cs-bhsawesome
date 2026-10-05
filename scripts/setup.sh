#!/usr/bin/env bash
#
# One-time provisioning of the GitHub Actions config for the book-publish
# workflow (.github/workflows/publish.yml): the prod server URL (a repo
# variable) and the shared master secret (a repo secret, from 1Password —
# the same values the bhs-cs-content repo's setup.sh provisions there).
# Re-run to update either value.

set -euo pipefail

REPO=gigamonkey/bhs-cs-bhsawesome
SERVER=https://bhs-cs.gigamonkeys.com
SECRET_REF="op://BHS-CS-2026/bhs-cs-2026 service-keys/secret"

gh variable set BHS_CS_SERVER --repo "$REPO" --body "$SERVER"

# Capture first (set -e aborts if `op read` fails, instead of silently setting an
# empty secret), and strip the trailing newline op emits so the GitHub secret is
# byte-identical to the server's fly secret — CI derives HMAC(secret, "content"),
# so a stray newline would make its key differ and its push 403.
secret=$(op read "$SECRET_REF")
printf '%s' "$secret" | gh secret set SERVICE_KEYS_SECRET --repo "$REPO"
