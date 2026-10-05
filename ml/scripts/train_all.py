"""Train the four final models (CAD, LAD, LCX, RCA) and save their artifacts.

Steps:
  1. Cross-validate every candidate on the development set (or reuse a previous
     comparison with --reuse-comparison if it was produced with the same settings).
  2. Select one candidate per target with the documented selection rule.
  3. Fit each selected candidate on the development set and save it under ml/models/.

The holdout set is not touched here; run `python -m ml.scripts.evaluate_all` afterwards.

Usage (from the repository root):
    python -m ml.scripts.train_all [--reuse-comparison] [--n-jobs 4]
"""

from __future__ import annotations

import argparse
import sys

from ml.scripts.compare_models import run_comparison, write_comparison
from ml.src.data.loader import DatasetFormatError, DatasetNotFoundError
from ml.src.evaluation.reports import read_json, write_json
from ml.src.features.feature_schema import TARGET_NAMES
from ml.src.models.artifacts import save_artifact
from ml.src.models.base import load_candidates
from ml.src.paths import MODEL_COMPARISON_DIR, MODELS_DIR, REPO_ROOT
from ml.src.training.finalize import build_artifact, fit_final_model
from ml.src.training.selection import select_candidate
from ml.src.training.train import load_training_data


def _load_previous_comparison(data):
    path = MODEL_COMPARISON_DIR / "cv_results.json"
    if not path.is_file():
        return None
    previous = read_json(path)
    same_settings = (
        previous.get("seed") == data.seed
        and previous.get("cross_validation") == data.config["cross_validation"]
        and previous.get("n_development_records") == len(data.X_dev)
        and all(
            {r["candidate"]["name"] for r in previous["results"].get(t, [])}
            == {c.name for c in load_candidates()}
            for t in TARGET_NAMES
        )
    )
    return previous["results"] if same_settings else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--reuse-comparison", action="store_true")
    parser.add_argument("--n-jobs", type=int, default=4)
    args = parser.parse_args()
    try:
        data = load_training_data()
    except (DatasetNotFoundError, DatasetFormatError) as exc:
        print(f"SETUP ERROR\n{exc}", file=sys.stderr)
        return 2

    results = _load_previous_comparison(data) if args.reuse_comparison else None
    if results is None:
        results = run_comparison(data, n_jobs=args.n_jobs)
    else:
        print("Reusing cross-validation results from ml/reports/model_comparison/cv_results.json")

    rule = data.config["selection"]
    selection = {
        target: select_candidate(
            results[target],
            primary_metric=rule["primary_metric"],
            tolerance=float(rule["tolerance"]),
            secondary_metric=rule["secondary_metric"],
            secondary_tolerance=float(rule["secondary_tolerance"]),
        )
        for target in TARGET_NAMES
    }
    write_comparison(data, results, selection)
    write_json(MODEL_COMPARISON_DIR / "selection.json", selection)

    candidates = {c.name: c for c in load_candidates()}
    for target in TARGET_NAMES:
        spec = candidates[selection[target]["selected"]]
        model = fit_final_model(target, spec, data)
        directory = save_artifact(build_artifact(model, spec, data, selection[target]))
        cv = selection[target]["cv_summary"]
        print(
            f"{target}: {spec.name} | CV ROC-AUC {cv['roc_auc']['mean']:.3f} +/- {cv['roc_auc']['std']:.3f}"
            f" | saved {directory.relative_to(REPO_ROOT).as_posix()}/"
        )
    print(f"Artifacts in {MODELS_DIR.relative_to(REPO_ROOT).as_posix()}/ (not committed to git).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
