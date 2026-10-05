# Start the API (port 8000) and the dashboard (port 3000) in two new windows.
# Usage, from the repository root:  .\scripts\dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Start-Process powershell -WorkingDirectory $root -ArgumentList @(
    "-NoExit", "-Command", ".venv\Scripts\python.exe -m uvicorn apps.api.app.main:app --reload --port 8000"
)
Start-Process powershell -WorkingDirectory (Join-Path $root "apps\web") -ArgumentList @(
    "-NoExit", "-Command", "npm run dev"
)
Write-Host "API:       http://localhost:8000/api/v1/docs"
Write-Host "Dashboard: http://localhost:3000"
