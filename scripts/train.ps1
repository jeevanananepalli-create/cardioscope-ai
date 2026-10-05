# Validate the data, train and save the four models, evaluate them and write the reports.
# Usage, from the repository root:  .\scripts\train.ps1 [-ReuseComparison]
param([switch]$ReuseComparison)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$python = ".venv\Scripts\python.exe"

& $python -m ml.scripts.prepare_data
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($ReuseComparison) { & $python -m ml.scripts.train_all --reuse-comparison } else { & $python -m ml.scripts.train_all }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $python -m ml.scripts.evaluate_all
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $python -m ml.scripts.generate_report
