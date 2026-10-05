#!/usr/bin/env bash
# Run the Python and web test suites. Pass --e2e to also run the browser end-to-end tests.
# Usage, from the repository root:  ./scripts/test.sh [--e2e]
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi

"$PY" -m pytest -q
cd apps/web
npm run typecheck
npm test
if [ "${1:-}" = "--e2e" ]; then
  npm run test:e2e
fi
