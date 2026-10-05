# Run the Python and web test suites. Add -E2E to also run the browser end-to-end tests.
# Usage, from the repository root:  .\scripts\test.ps1 [-E2E]
param([switch]$E2E)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

& ".venv\Scripts\python.exe" -m pytest -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location apps/web
try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    npm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($E2E) {
        npm run test:e2e
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
} finally {
    Pop-Location
}
