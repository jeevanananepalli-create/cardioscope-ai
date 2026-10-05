# ML pipeline

Results are in [model-results.md](../evaluation/model-results.md). This document describes the
method. All randomness derives from `seed` in `ml/configs/training.yaml`.

## Stages

| Stage | Command | Code | Output |
|---|---|---|---|
| Inspect and validate | `python -m ml.scripts.prepare_data` | `ml/src/data/` | data dictionary, dataset summary, missing-value and class-distribution reports |
| Compare models | `python -m ml.scripts.compare_models` | `ml/src/training/cross_validation.py` | `ml/reports/model_comparison/` |
| Select, calibrate, fit, save | `python -m ml.scripts.train_all` | `ml/src/training/` | `ml/models/<target>/`, `calibration_study.json` |
| Evaluate on holdout, explain | `python -m ml.scripts.evaluate_all` | `ml/src/evaluation/`, `ml/src/explainability/` | `model_metrics.json`, figures |
| Write documents | `python -m ml.scripts.generate_report` | `ml/scripts/generate_report.py` | `docs/evaluation/model-results.md`, README table |

`train_all --reuse-comparison` skips the comparison (about eight minutes) when its settings are unchanged.

## Data split

One patient-level split serves all four models, so no patient is in one model's training set and
another's test set. 20% is held out, stratified on the joint LAD/LCX/RCA pattern so every target
keeps its class balance. The holdout is used once, at the end.

## Candidates

For each of the four targets, 22 candidates: four algorithms × a small hyperparameter grid × two
class-weighting options (`ml/configs/models.yaml`).

| Algorithm | Grid | Scaling |
|---|---|---|
| Logistic regression (L2) | C ∈ {0.01, 0.1, 1} | yes |
| Support vector machine (RBF, Platt-scaled) | C ∈ {0.3, 1, 3} | yes |
| Random forest (300 trees) | min samples per leaf ∈ {1, 3, 5} | no |
| XGBoost (200 trees, learning rate 0.05) | max depth ∈ {2, 3} | no |

The grids are deliberately small: a large search on about 240 records would mostly fit noise.
There is no separate tuning stage; the grid is part of the comparison.

## Cross-validation

Repeated stratified 5-fold, 5 repeats (25 folds), on the development set. Each fold builds a fresh
pipeline and fits it on that fold's training part only, so imputation, encoding and scaling never
see test rows. Mean and standard deviation across folds are reported.

## Class imbalance

Imbalance is moderate (largest ratio 2.5:1 for CAD). Class weighting was evaluated for every
candidate and resampling was not used. Weighting raised recall but worsened probability quality and
was not selected for any target; where needed, imbalance is handled by the decision threshold.

## Selection rule

Fixed before looking at results:

1. Find the best mean cross-validated ROC-AUC.
2. Keep candidates within 0.01 of it (well inside fold-to-fold noise).
3. Of those, keep candidates within 0.005 of the best Brier score (the application displays
   probabilities, so their quality matters).
4. Choose the simplest algorithm (logistic regression < SVM < random forest < XGBoost); break ties
   by ROC-AUC.

Training-set scores are reported to expose overfitting but never used.

## Calibration and threshold

Evaluated by nested cross-validation for the selected candidate. In each outer fold, inner
out-of-fold scores of the training part are used to fit a sigmoid and an isotonic calibrator and to
tune a threshold for balanced accuracy; all are judged on the outer test part.

A calibration method or a tuned threshold is adopted only if its mean improvement exceeds two
standard errors of the paired fold differences, using the Nadeau–Bengio correction because folds of
repeated cross-validation share training data. Otherwise the model keeps its own probabilities and
a 0.5 threshold. The decision and its numbers are stored with each model.

The final calibrator and threshold are fitted on out-of-fold development-set scores, never on the
model's own training predictions and never on the holdout.

## Final models and artifacts

Each selected candidate is fitted on the 242 development records. The deployed model is that model,
not one refitted on all data, so the holdout results describe exactly what is served.

`ml/models/<target>/model.joblib` — pipeline, calibrator, threshold, and the transformed development
matrix used as SHAP background. `metadata.json` — feature schema, version, training metadata,
selection reasoning, cross-validation and holdout metrics, calibration decision, global importance.
Model files are not committed.

## Holdout evaluation

Accuracy, balanced accuracy, precision, recall, specificity, F1, ROC-AUC, Brier score, log loss,
confusion matrix, ROC and reliability curves. Intervals are 95% percentile bootstrap (2,000
resamples). A no-information reference (predict the development-set positive rate for everyone) is
reported alongside, because accuracy alone is misleading with imbalanced classes.

## Explainability

`ml/src/explainability/` builds one explainer per model: tree SHAP for XGBoost and random forest,
linear SHAP for logistic regression, and a slower model-agnostic fallback for SVM. Values are
computed in the transformed feature space and one-hot columns are summed back onto the original
input. Tests check that contributions add up to the model's raw score.

Explanations are in log-odds (logistic regression, XGBoost) or probability points (random forest),
of the model's raw score before calibration.

## Reproducibility

Seeds are fixed, the split and folds are deterministic, and package versions are pinned in
`requirements-lock.txt`. With those versions, retraining reproduces every cross-validation metric
to about 15 decimal places regardless of how many folds run in parallel (checked by training twice
with different `--n-jobs`, and by a test). Exact bit-for-bit equality is not guaranteed because
random-forest prediction sums in parallel.

XGBoost runs single-threaded on purpose. With several threads its results depended on the number
of threads it was given, and cross-validated ROC-AUC moved by up to 0.008 between otherwise
identical runs. Different package versions or hardware may still give slightly different numbers.

## Known limitations

- 303 records from one centre; no external validation.
- 22 candidates were compared on the same development data, so the cross-validated score of the
  winner is slightly optimistic. The holdout is the unbiased check, and it is small.
- One record has `Cath` = Normal with `LAD` = Stenotic. It was left as supplied.
- Several inputs are almost constant (for example one positive record for congestive heart failure).
