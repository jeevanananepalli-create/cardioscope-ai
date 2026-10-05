#!/usr/bin/env bash
# Create the Python environment and install all dependencies (macOS / Linux / Git Bash).
# Usage, from the repository root:  ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  python3 -m venv .venv 2>/dev/null || python -m venv .venv
fi
if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi

"$PY" -m pip install --upgrade pip
"$PY" -m pip install -e ".[dev]" -r apps/api/requirements.txt
(cd apps/web && npm install)

if [ ! -f "ml/data/raw/extention of Z-Alizadeh sani dataset.xlsx" ]; then
  echo
  echo "Dataset not found. Place it at: ml/data/raw/extention of Z-Alizadeh sani dataset.xlsx"
  echo "Download: https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset"
fi
echo "Setup complete. Next: make train"
