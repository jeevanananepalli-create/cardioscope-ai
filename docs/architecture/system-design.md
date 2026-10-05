# System design

CardioScope AI has three runtime-independent parts that share one contract: the feature schema.

```
ml/configs/features.yaml  ──►  ML pipeline  ──►  ml/models/<target>/{model.joblib, metadata.json}
        │                                                        │
        └────────────►  API (patient schema, loaded models)  ◄───┘
                                   │  JSON /api/v1
                                   ▼
                              Dashboard (form built from GET /feature-schema)
```

## Components

| Component | Technology | Responsibility |
|---|---|---|
| ML pipeline (`ml/`) | Python, pandas, scikit-learn, XGBoost, SHAP | Everything that produces a number: validation, training, selection, calibration, evaluation, reports |
| API (`apps/api/`) | FastAPI, Pydantic | Validate input, run the saved pipelines, explain, serve metadata |
| Dashboard (`apps/web/`) | Next.js, React, TypeScript, React Three Fiber | Collect input, present predictions, explanations, 3D view and results |
| Anatomy build (`scripts/anatomy/`) | Python (trimesh), Blender | Turn openly licensed anatomy into browser-sized model files |

## Design decisions

**One schema, three consumers.** `features.yaml` lists every model input with its kind, categories
and input limits. Training uses it to build the feature matrix; the API generates its request model
from it; the dashboard builds its form from the API's description of it. A feature cannot exist in
one layer and not the others.

**The model artifact contains its preprocessing.** Each `model.joblib` holds a scikit-learn pipeline
(canonicalise → impute/encode/scale → classifier), an optional calibrator and the decision
threshold. The API passes raw validated values straight in. There is no second implementation of
preprocessing to drift out of step.

**Outcome columns are blocked structurally.** See README, "Leakage prevention". The blacklist lives
in code and is checked at schema build, feature-matrix build, fit, transform, artifact save and
load, and at the API boundary.

**Numbers have one source.** Every metric shown anywhere comes from `ml/scripts/evaluate_all.py`,
which writes `ml/reports/metrics/model_metrics.json` and the model metadata. The API serves that
metadata; the dashboard renders it; `generate_report.py` writes the documents from it. Nothing is
typed in by hand, and a test compares the published file with a fresh evaluation of the saved models.

**The API degrades instead of failing.** Without trained models it still starts: `/health` reports
`degraded`, `/predict` returns 503 with instructions, and the dashboard explains what to do.

**Risk bands are configuration.** The low/moderate/high/very-high limits are an API setting
(`CARDIOSCOPE_RISK_THRESHOLDS`), returned by `/model-info` and applied by both the API and the 3D
view. They are visualization categories only.

## Request flow: "Analyze Patient"

1. The dashboard validates the form against the schema (required, numeric, within input limits,
   listed category). Invalid input is explained and not sent.
2. `POST /predict` — Pydantic validates again, strictly. BMI and the obesity flag are derived from
   weight and height. The four pipelines run; each probability is thresholded and banded.
   Values outside the range seen in training are accepted with a warning.
3. The dashboard shows the four predictions and colours LAD, LCX and RCA in the 3D view.
4. `POST /explain` runs only if a panel that shows explanations is on screen, once per prediction,
   for all four models.
5. In what-if mode, changed inputs are sent to `/predict` again (debounced); the comparison table
   and the 3D view show the simulated output, labelled as exploratory.

## Error handling

| Situation | API | Dashboard |
|---|---|---|
| Backend unreachable | — | Notice with retry; previous result cleared; disclaimer stays |
| Models not trained | 503 `MODEL_UNAVAILABLE` | Notice with the training command |
| Invalid or incomplete input | 422 `INVALID_INPUT` with per-field details | Messages on the fields |
| Malformed response | — | Response-shape guards reject it; notice shown; no partial result |
| Explanation failure | 500 `EXPLANATION_FAILED` | Notice with retry; prediction unaffected |
| 3D asset load failure | — | Labelled schematic fallback |
| No WebGL | — | Notice; vessel buttons still work |
| Unexpected server error | 500, generic message, no traceback | Notice with retry |
| Rendering error in a panel | — | Error boundary confines it to that panel |

## Security and privacy

- No patient data is stored. Request bodies and values are never logged; the access log has method,
  path, status and latency only.
- No secrets are required. Configuration is by environment variable (`.env.example`).
- There is no authentication, by design for a local prototype. It must not be exposed publicly.
- CORS is restricted to configured origins.

## Deployment

`docker-compose.yml` defines `backend` and `frontend`. Model files are mounted into the backend at
run time because they are generated from data that is not distributed. The Docker configuration is
provided but was not run on the development machine.
