# Create the Python environment and install all dependencies (Windows PowerShell).
# Usage, from the repository root:  .\scripts\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path ".venv")) {
    # Python 3.11 or 3.12 is recommended (see README); `py -3.12` picks it if several are installed.
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3.12 -m venv .venv } else { python -m venv .venv }
}
$python = ".venv\Scripts\python.exe"
& $python -m pip install --upgrade pip
& $python -m pip install -e ".[dev]" -r apps/api/requirements.txt

Push-Location apps/web
npm install
Pop-Location

if (-not (Test-Path "ml/data/raw/extention of Z-Alizadeh sani dataset.xlsx")) {
    Write-Host ""
    Write-Host "Dataset not found. Place it at: ml/data/raw/extention of Z-Alizadeh sani dataset.xlsx"
    Write-Host "Download: https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset"
}
Write-Host "Setup complete. Next: .\scripts\train.ps1"
