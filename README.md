# CardioScope AI

**Cardiovascular Risk Visualization & Prediction** — *From clinical numbers to anatomical insight.*

> **This prototype is intended for research, education, and decision-support demonstration only.
> It is not a medical device and does not replace professional clinical evaluation, diagnostic
> imaging, or physician judgment.**

CardioScope AI takes routine clinical, laboratory, ECG and echocardiography measurements and
shows four model predictions — coronary artery disease (CAD) and stenosis of the LAD, LCX and RCA
coronary arteries — with an explanation of each, mapped onto an interactive 3D view of the heart.

## Contents

1. [Project overview](#1-project-overview)
2. [Problem statement](#2-problem-statement)
3. [Architecture](#3-architecture)
4. [Dataset](#4-dataset)
5. [Feature preprocessing](#5-feature-preprocessing)
6. [Leakage prevention](#6-leakage-prevention)
7. [Model architecture](#7-model-architecture)
8. [Validation methodology](#8-validation-methodology)
9. [Evaluation metrics](#9-evaluation-metrics)
10. [Explainability](#10-explainability)
11. [3D visualization](#11-3d-visualization)
12. [API](#12-api)
13. [Installation](#13-installation)
14. [Running locally](#14-running-locally)
15. [Testing](#15-testing)
16. [Safety limitations](#16-safety-limitations)
17. [Dataset attribution](#17-dataset-attribution)
18. [Anatomy asset attribution](#18-anatomy-asset-attribution)

## 1. Project overview

| Part | What it does | Where |
|---|---|---|
| ML pipeline | Validates the data, compares models by cross-validation, selects, calibrates, evaluates, explains | `ml/` |
| API | Serves predictions, SHAP explanations, model metadata and the input schema | `apps/api/` |
| Dashboard | Patient form, risk summary, 3D anatomy, explanations, what-if simulation, model performance | `apps/web/` |
| Anatomy assets | Builds the 3D models from openly licensed anatomy | `scripts/anatomy/`, `assets/anatomy/` |

**Demo mode.** The form offers three synthetic profiles ("Demo Profile A — Elevated model risk",
"B — Lower model risk", "C — Mixed inputs"). They are hand-chosen inputs within the training
ranges, not real patients and not dataset records; their predictions are computed by the models
like any other input. A five-minute walkthrough is in [docs/presentation/demo-script.md](docs/presentation/demo-script.md),
with a [pitch](docs/presentation/pitch.md) and a [six-page summary](docs/presentation/project-summary.md).

Typical use: enter (or load) a patient's measurements, choose **Analyze Patient**, read the four
predicted probabilities, rotate the heart, select a vessel to see what drove its prediction, and
optionally explore how the models respond when an input is changed.

## 2. Problem statement

Coronary artery disease is normally confirmed by angiography, which is invasive. The Z-Alizadeh Sani
dataset records, for 303 patients, non-invasive measurements together with the angiography result
overall and per vessel. This project asks a narrow, honest question of that data:

*How well can the angiography findings be predicted from the non-invasive measurements alone, and
can the predictions be shown in a way that is understandable and not overstated?*

It is a demonstration of method and presentation. It is not a diagnostic tool, and the results
below show plainly where the models are weak.

## 3. Architecture

```
            ┌────────────────────────── browser ──────────────────────────┐
            │  Next.js dashboard (React, TypeScript, React Three Fiber)   │
            │  form · risk summary · 3D anatomy · SHAP · what-if · metrics │
            └───────────────▲─────────────────────────────────────────────┘
                            │ JSON over HTTP  (/api/v1)
            ┌───────────────┴─────────────────────────────────────────────┐
            │  FastAPI service                                            │
            │  strict input schema → 4 pipelines → predictions / SHAP     │
            └───────────────▲─────────────────────────────────────────────┘
                            │ loads at start-up
   ml/models/{cad,lad,lcx,rca}/model.joblib + metadata.json
                            ▲ written by
            ┌───────────────┴─────────────────────────────────────────────┐
            │  ML pipeline (pandas, scikit-learn, XGBoost, SHAP)          │
            │  validate → split → CV comparison → select → calibrate →    │
            │  fit → holdout evaluation → reports                         │
            └─────────────────────────────────────────────────────────────┘
```

Each saved model is one scikit-learn pipeline (preprocessing + classifier), so the API runs exactly
the preprocessing that was fitted in training. More detail:
[system design](docs/architecture/system-design.md),
[ML pipeline](docs/architecture/ml-pipeline.md),
[frontend architecture](docs/architecture/frontend-architecture.md).

## 4. Dataset

The UCI "Extention of Z-Alizadeh Sani dataset": 303 records and 59 columns, with no missing values.
It is **not included** in this repository; see [Installation](#13-installation) for where to put it.

- 55 candidate input columns: demographic, history, examination, symptoms, ECG, laboratory, echo.
- 4 outcome columns from angiography: `Cath` (CAD or Normal) and `LAD`, `LCX`, `RCA` (Stenotic or Normal).
- One input (`Exertional CP`) is the same for every record and is excluded, leaving 54 model inputs.
- Class balance: CAD 216/87, LAD 177/126, LCX 119/184, RCA 114/189 (positive/negative).

The full, generated column listing is in the [data dictionary](docs/dataset/data-dictionary.md).

## 5. Feature preprocessing

All preprocessing is a single scikit-learn pipeline, described in
[docs/dataset/preprocessing.md](docs/dataset/preprocessing.md):

- known spelling variants are normalised (`Fmale` → `Female`, `Y`/`N` → 1/0);
- values that are not a recognised representation raise an error; nothing is silently coerced;
- numeric inputs are median-imputed, flags and levels mode-imputed (the dataset has no missing
  values, so this only matters for robustness);
- categorical inputs are one-hot encoded with a fixed category list;
- numeric inputs are standardised only for the algorithms that need it.

BMI and the obesity flag are exact functions of weight and height in this dataset, so the
application computes them from the entered weight and height instead of asking for them.

## 6. Leakage prevention

`LAD`, `LCX`, `RCA` and `Cath` are outcomes and must never be model inputs. This is enforced in
code, not by convention:

- they are a hard-coded blacklist in `ml/src/features/feature_schema.py`; no configuration can change it;
- model inputs come from a whitelist (`ml/configs/features.yaml`), and a schema that lists a
  blacklisted column cannot be built;
- building a feature matrix, fitting, cross-validating and transforming all refuse a frame that
  contains a blacklisted column (matching ignores case and surrounding spaces);
- the API rejects any request that includes one;
- dedicated tests (`ml/tests/test_target_leakage.py` and others) fail if any of these guards is removed.

Preprocessing statistics are learned inside each training fold only, and one patient-level holdout
split is shared by all four models.

## 7. Model architecture

Four independent binary classifiers, one per target. For each target, 22 candidates were compared:
logistic regression, support vector machine, random forest and XGBoost, each with a small
hyperparameter grid and with and without class weighting. The candidate chosen for each target, and
the reasoning, is recorded in [model results](docs/evaluation/model-results.md).

Deep learning was not used: with about 240 training records, simpler models are the appropriate tool.

## 8. Validation methodology

1. **Holdout:** 20% of patients (61) are set aside once, stratified on the joint LAD/LCX/RCA pattern,
   and not used for any decision.
2. **Model comparison:** repeated stratified 5-fold cross-validation (5 repeats) on the remaining 242.
3. **Selection rule, fixed in advance:** keep candidates within 0.01 ROC-AUC of the best, then
   within 0.005 Brier score of the best of those, then take the simplest algorithm. Training-set
   scores are never used.
4. **Calibration and decision threshold:** evaluated by nested cross-validation and adopted only
   when the improvement exceeds two (correlation-corrected) standard errors.
5. **Holdout evaluation:** run once, after everything above is fixed, with bootstrap intervals.

## 9. Evaluation metrics

Accuracy, precision, recall, F1, ROC-AUC, Brier score, confusion matrix, ROC and calibration curves
are computed for every target. The table below is written by the evaluation pipeline.

<!-- results:start (generated by ml/scripts/generate_report.py; do not edit) -->

Holdout set (61 records, evaluated once). Brackets are 95% bootstrap intervals.

| Target | Model | Accuracy | Precision | Recall | F1 | ROC-AUC | No-information accuracy |
|---|---|---|---|---|---|---|---|
| CAD | xgboost | 0.869 | 0.875 | 0.955 | 0.913 | 0.904 (0.81–0.98) | 0.721 |
| LAD | random forest | 0.787 | 0.780 | 0.889 | 0.831 | 0.834 (0.72–0.93) | 0.590 |
| LCX | random forest | 0.672 | 0.568 | 0.840 | 0.677 | 0.764 (0.64–0.87) | 0.590 |
| RCA | logistic regression | 0.656 | 0.556 | 0.435 | 0.488 | 0.670 (0.52–0.81) | 0.623 |

<!-- results:end -->

"No-information accuracy" is what always predicting the more common class would score; a model is
only useful to the extent that it beats it. **The LCX and RCA models are weak**, and with 61 holdout
records every interval is wide. Full results, including cross-validation and the decisions taken:
[docs/evaluation/model-results.md](docs/evaluation/model-results.md).

## 10. Explainability

SHAP values are computed for each model: tree explainers for XGBoost and random forest, a linear
explainer for logistic regression. One-hot columns are summed back onto the original input, so each
contribution refers to a measurement the user entered.

- **Global:** mean absolute SHAP value per feature (model performance view).
- **Per patient:** which inputs moved this prediction up or down ("Why this prediction?").
- **Per vessel:** selecting LAD, LCX or RCA shows that model's explanation.

Contributions describe how a model used its inputs. They are not causal, and they say nothing about
anatomy; the interface is worded accordingly ("contributes toward a higher predicted LAD risk").
Explanations refer to each model's raw score; where calibration was adopted it is a monotone
rescaling, so the direction and ranking of contributions are unchanged.

## 11. 3D visualization

An interactive view built with React Three Fiber: rotate, zoom, pan, reset, a heart-focus mode and a
torso-context mode, and optional layers for arteries, veins, the nervous system, skeleton and organs.

- LAD, LCX and RCA are coloured by their model's predicted probability, through four visualization
  bands (low, moderate, high, very high). The band limits are configurable
  (`CARDIOSCOPE_RISK_THRESHOLDS`) and are **not clinically validated thresholds**.
- Everything else is anatomical context and never carries model output. By default it is drawn
  in conventional anatomical colours (red for vessels carrying oxygenated blood, blue for
  deoxygenated, yellow nerves, ivory bone, each organ its own colour); a **Realistic colours**
  switch changes to muted colours so that model output is the only colour on screen. A glowing
  outline marks the three vessels that carry model output.
- **Blood flow** is an optional animation of bright bands moving away from the heart in arteries
  and toward it in veins. It is illustrative only: it shows the normal direction of circulation,
  is identical for every input, and is never changed by a prediction. It is off when the system
  asks for reduced motion.
- The anatomy is generic reference anatomy of one adult, not the patient's. Colour on a vessel is a
  visualization of a model's output; it is not imaging and does not locate a lesion.
- If the 3D asset cannot be loaded, a labelled schematic is shown instead; without WebGL the
  vessel buttons still work.

**Look and feel.** The interface is dark by default, modelled on the visual language of leading 3D
anatomy software (the 3D view as centrepiece, floating glass controls, one teal accent). A switch
in the header changes to a light theme.

## 12. API

Base path `/api/v1`. Interactive documentation is served at `/api/v1/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service status and which models are loaded |
| POST | `/predict` | Four predictions for one patient |
| POST | `/explain` | SHAP contributions for each model |
| GET | `/model-info` | Model descriptions and evaluation results |
| GET | `/feature-schema` | The inputs, their types, limits and training ranges |
| GET | `/demo-profiles` | Synthetic demo inputs (never real patients) |

`/predict` takes `{"features": {...}}` keyed by dataset column name. Every input is required and
strictly typed; unknown fields (including the four outcome columns) are rejected with a per-field
message. Errors use one envelope, `{"error": {"code", "message", "details"}}`, and never include
tracebacks or file paths. Patient values are not logged.

## 13. Installation

Requirements: **Python 3.11 or 3.12** and **Node.js 20 or newer** (developed with Python 3.12.4 and
Node 24). Exact Python package versions used are in `requirements-lock.txt`.

1. **Get the dataset.** Download the "Extention of Z-Alizadeh Sani dataset" from the
   [UCI repository](https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset),
   unzip it, and place the file at:

   ```
   ml/data/raw/extention of Z-Alizadeh sani dataset.xlsx
   ```

2. **Install dependencies.**

   | Windows (PowerShell) | macOS / Linux |
   |---|---|
   | `.\scripts\setup.ps1` | `make setup` (or `./scripts/setup.sh`) |

3. **Train and evaluate the models** (about 10 minutes; the model files are not in the repository).

   | Windows (PowerShell) | macOS / Linux |
   |---|---|
   | `.\scripts\train.ps1` | `make train && make evaluate` |

   This writes `ml/models/`, the metrics and figures under `ml/reports/`, and the results documents.

The 3D anatomy files are already in the repository. Rebuilding them is optional; see
[assets/anatomy/ATTRIBUTION.md](assets/anatomy/ATTRIBUTION.md).

## 14. Running locally

| Windows (PowerShell) | macOS / Linux |
|---|---|
| `.\scripts\dev.ps1` | `make dev` (or `./scripts/dev.sh`) |

Then open <http://localhost:3000>. The API runs at <http://localhost:8000>.

To run the two parts by hand, from the repository root:

```
.venv/Scripts/python -m uvicorn apps.api.app.main:app --port 8000     # Windows; use .venv/bin/python elsewhere
cd apps/web && npm run dev
```

Configuration is by environment variable; copy `.env.example` to see the options. No secrets are needed.

**Docker.** `docker compose up --build` starts both services, with `ml/models/` mounted into the
API container, so train the models first. The Docker files have not been run on the development
machine (the Docker daemon was unavailable), so treat them as untested.

## 15. Testing

| Suite | Command | Needs |
|---|---|---|
| ML and API | `python -m pytest` | dataset and trained models for the full suite |
| Dashboard unit and component | `cd apps/web && npm test` | nothing |
| Type-check | `cd apps/web && npm run typecheck` | nothing |
| End to end, in a real browser | `cd apps/web && npm run test:e2e` | trained models; Chrome installed |

`.\scripts\test.ps1 -E2E` or `./scripts/test.sh --e2e` runs everything. Without the dataset, the
tests that need it are skipped and say so. The end-to-end tests drive the real API and models:
patient input, prediction, dashboard, rendered 3D view, vessel selection, what-if and error states.

## 16. Safety limitations

- **Not a medical device.** Outputs are model predictions from clinical features, not diagnoses.
- **Small, single-source data.** 303 patients from one centre; no external validation. Performance
  elsewhere is unknown and likely lower.
- **Two of four models are weak.** See the results above before reading anything into LCX or RCA output.
- **Probabilities are approximate.** Calibration was checked on the same small dataset.
- **The 3D view is illustrative.** Generic anatomy; vessel colour is not an anatomical finding.
- **What-if is model sensitivity, not medicine.** It does not predict the effect of changing anything in a patient.
- **Input limits are plausibility checks**, chosen for this prototype; they are not clinical reference ranges.
- **Units and labels** follow the dataset's published description and were not independently verified.
- No patient data is stored or logged, and there is no authentication: do not expose it publicly or enter real patient data.

More: [docs/clinical/safety.md](docs/clinical/safety.md).

## 17. Dataset attribution

Z-Alizadeh Sani dataset and its extension, UCI Machine Learning Repository (Creative Commons
Attribution 4.0). Please confirm the current citation and licence on the UCI page before publishing.

> Alizadehsani R., Habibi J., Hosseini M.J., Mashayekhi H., Boghrati R., Ghandeharioun A.,
> Bahadorian B., Sani Z.A. *A data mining approach for diagnosis of coronary artery disease.*
> Computer Methods and Programs in Biomedicine, 111(1):52–61, 2013.

The dataset is not redistributed here.

## 18. Anatomy asset attribution

- **Heart, coronary arteries, arteries, veins and body outline:** BodyParts3D, © The Database Center
  for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan.
- **Nervous system, skeleton and organs:** Z-Anatomy, the libre 3D atlas of anatomy, CC BY-SA 4.0,
  derived from BodyParts3D; cranial nerves adapted from "Cranial Nerves and Foramina" by University
  of Dundee, CAHID, CC BY 4.0.

The model files under `apps/web/public/models/anatomy/` are derivatives and are distributed under
those share-alike licences; this does not apply to the source code. What was selected, changed and
deliberately left out is documented in [assets/anatomy/ATTRIBUTION.md](assets/anatomy/ATTRIBUTION.md).

## Licence

No licence has been chosen for the source code yet, so by default all rights are reserved by the
author. Third-party components keep their own licences; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
