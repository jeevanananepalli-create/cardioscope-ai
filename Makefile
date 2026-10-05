# CardioScope AI — common tasks.
#
# `make` is not installed by default on Windows. Every target has an equivalent in
# scripts/*.ps1 (PowerShell) and scripts/*.sh; see README, "Running locally".

ifeq ($(OS),Windows_NT)
PY := .venv/Scripts/python.exe
else
PY := .venv/bin/python
endif

.PHONY: help setup data train evaluate report anatomy test test-e2e dev api web clean

help:
	@echo "setup      create .venv, install Python and web dependencies"
	@echo "data       validate the dataset and write the data dictionary and dataset reports"
	@echo "train      cross-validate, select, calibrate and save the four models"
	@echo "evaluate   evaluate the saved models on the holdout set, write metrics and figures"
	@echo "report     regenerate docs/evaluation/model-results.md and the README results table"
	@echo "anatomy    rebuild the 3D anatomy assets from the downloaded source meshes"
	@echo "test       run the Python and web test suites"
	@echo "test-e2e   run the browser end-to-end tests (needs trained models)"
	@echo "dev        run the API (port 8000) and the dashboard (port 3000)"

setup:
	python -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e ".[dev]" -r apps/api/requirements.txt
	cd apps/web && npm install

data:
	$(PY) -m ml.scripts.prepare_data

train: data
	$(PY) -m ml.scripts.train_all

evaluate:
	$(PY) -m ml.scripts.evaluate_all
	$(PY) -m ml.scripts.generate_report

report:
	$(PY) -m ml.scripts.generate_report

anatomy:
	$(PY) -m pip install -r scripts/anatomy/requirements.txt
	$(PY) scripts/anatomy/fetch_bodyparts3d.py
	$(PY) scripts/anatomy/build_anatomy.py

test:
	$(PY) -m pytest -q
	cd apps/web && npm run typecheck && npm test

test-e2e:
	cd apps/web && npm run test:e2e

api:
	$(PY) -m uvicorn apps.api.app.main:app --reload --port 8000

web:
	cd apps/web && npm run dev

# Runs both servers; stop with Ctrl+C.
dev:
	$(MAKE) -j 2 api web

clean:
	rm -rf .pytest_cache apps/web/.next apps/web/test-results
