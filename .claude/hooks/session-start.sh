#!/bin/bash
# Installs the Vercel CLI so Claude Code (web) sessions can run `vercel` commands.
# Idempotent and non-interactive. Runs only in the remote (web) environment.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Already available? Nothing to do (container state is cached between runs).
if command -v vercel >/dev/null 2>&1; then
  exit 0
fi

npm install -g vercel >/dev/null 2>&1 || true
