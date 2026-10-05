#!/usr/bin/env bash
# Start the API (port 8000) and the dashboard (port 3000). Ctrl+C stops both.
# Usage, from the repository root:  ./scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi

"$PY" -m uvicorn apps.api.app.main:app --reload --port 8000 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

echo "API:       http://localhost:8000/api/v1/docs"
echo "Dashboard: http://localhost:3000"
cd apps/web && npm run dev
