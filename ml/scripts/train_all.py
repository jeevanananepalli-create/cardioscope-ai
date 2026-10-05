"""Train the four final models (CAD, LAD, LCX, RCA) and save their artifacts.

Steps:
  1. Cross-validate every candidate on the development set (or reuse a previous
     comparison with --reuse-comparison if it was produced with the same settings).
  2. Select one candidate per target with the documented selection rule.
  3. For each selected candidate, run a nested-CV study of probability calibration and
     threshold tuning, and adopt either only if it clearly helps.
  4. Fit each selected candidate on the development set and save it under ml/models/.

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
from ml.src.paths import METRICS_DIR, MODEL_COMPARISON_DIR, MODELS_DIR, REPO_ROOT
from ml.src.training.calibration import calibration_study, decide_calibration, decide_threshold
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
    cv = data.config["cross_validation"]
    studies = {}
    for target in TARGET_NAMES:
        spec = candidates[selection[target]["selected"]]
        study = calibration_study(
            spec,
            data.schema,
            data.X_dev,
            data.y_dev[target],
            seed=data.seed,
            n_splits=int(cv["n_splits"]),
            n_repeats=int(cv["n_repeats"]),
            inner_splits=int(data.config["inner_cv"]["n_splits"]),
            methods=list(data.config["calibration"]["methods"]),
            objective=data.config["threshold"]["objective"],
            n_jobs=args.n_jobs,
        )
        calibration = decide_calibration(study, float(data.config["calibration"]["min_improvement_se"]))
        threshold = decide_threshold(
            study, calibration["method"], float(data.config["threshold"]["min_improvement_se"])
        )
        studies[target] = {**study, "calibration_decision": calibration, "threshold_decision": threshold}

        model = fit_final_model(
            target,
            spec,
            data,
            calibration_method=calibration["method"],
            use_tuned_threshold=threshold["use_tuned"],
        )
        adopted = study["variants"][calibration["method"]]
        calibration_info = {
            **calibration,
            "threshold": {**threshold, "value": model.threshold},
            "nested_cv": adopted["tuned_threshold" if threshold["use_tuned"] else "default_threshold"],
            "reliability_curve": adopted["reliability_curve"],
            "uncalibrated_reliability_curve": study["variants"]["none"]["reliability_curve"],
        }
        directory = save_artifact(build_artifact(model, spec, data, selection[target], calibration_info))
        summary = selection[target]["cv_summary"]
        print(
            f"{target}: {spec.name} | CV ROC-AUC {summary['roc_auc']['mean']:.3f} "
            f"+/- {summary['roc_auc']['std']:.3f} | calibration: {calibration['method']} "
            f"| threshold: {model.threshold:.3f} | saved {directory.relative_to(REPO_ROOT).as_posix()}/"
        )
    write_json(METRICS_DIR / "calibration_study.json", studies)
    print(f"Artifacts in {MODELS_DIR.relative_to(REPO_ROOT).as_posix()}/ (not committed to git).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
