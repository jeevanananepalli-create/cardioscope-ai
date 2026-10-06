# Third-party notices

CardioScope AI uses the following third-party material. Each keeps its own licence.

## Data

| Item | Use | Licence | Distributed here? |
|---|---|---|---|
| Extention of Z-Alizadeh Sani dataset (UCI Machine Learning Repository) | Model training and evaluation | CC BY 4.0 (confirm on the UCI page) | No |

Aggregate statistics derived from the dataset (counts, ranges, metrics) appear in `docs/` and
`ml/reports/`. No individual record is included.

## 3D anatomy

| Item | Use | Licence | Distributed here? |
|---|---|---|---|
| BodyParts3D, © The Database Center for Life Science | Heart, coronary arteries, arteries, veins, body outline | CC BY-SA 2.1 Japan | Yes, as a simplified derivative (`cardioscope-anatomy.glb`) |
| Z-Anatomy, the libre 3D atlas of anatomy | Nervous system, skeleton, organs | CC BY-SA 4.0 | Yes, as simplified derivatives (`layer-*.glb`) |
| "Cranial Nerves and Foramina", University of Dundee, CAHID (via Z-Anatomy) | Cranial nerves | CC BY 4.0 | Yes, within the nervous system layer |

Z-Anatomy's inner-ear and kidney models carry non-commercial licences and are **not** used.
Details: `assets/anatomy/ATTRIBUTION.md`.

## Software

Main runtime dependencies and their licences (as published by each project; check before redistribution):

| Package | Licence |
|---|---|
| scikit-learn, pandas, NumPy, joblib | BSD 3-Clause |
| XGBoost | Apache 2.0 |
| SHAP | MIT |
| Matplotlib | Matplotlib licence (BSD-style) |
| FastAPI, Pydantic, Uvicorn | MIT / BSD |
| Next.js, React, three.js, React Three Fiber, drei | MIT |
| Source Sans 3 typeface (Adobe), via `@fontsource-variable/source-sans-3` | SIL Open Font License 1.1 |
| trimesh, fast-simplification (anatomy build only) | MIT |
| Blender (anatomy export only; not distributed) | GPL |

Exact Python versions used are listed in `requirements-lock.txt`; JavaScript versions in
`apps/web/package-lock.json`.
