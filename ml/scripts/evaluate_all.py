"""Evaluate the four trained models on the holdout set and write metrics and figures.

Run after `python -m ml.scripts.train_all`. All modelling decisions (algorithm,
calibration, threshold) are fixed by then; this script only measures.

Usage (from the repository root):
    python -m ml.scripts.evaluate_all
"""

from __future__ import annotations

import sys

import pandas as pd

from ml.src.data.loader import DatasetFormatError, DatasetNotFoundError
from ml.src.evaluation.evaluator import evaluate_holdout
from ml.src.evaluation.plots import (
    plot_calibration_curves,
    plot_class_distribution,
    plot_confusion_matrices,
    plot_model_comparison,
    plot_roc_curves,
)
from ml.src.evaluation.reports import read_json, write_json
from ml.src.features.feature_schema import TARGET_NAMES
from ml.src.models.artifacts import ModelNotFoundError, load_artifact, write_metadata
from ml.src.paths import FIGURES_DIR, METRICS_DIR, MODEL_COMPARISON_DIR, REPO_ROOT
from ml.src.training.train import load_training_data


def evaluate_models(data, artifacts) -> dict:
    """Holdout evaluation of every model; refuses a holdout that differs from training's."""
    holdout = {}
    for target, artifact in artifacts.items():
        trained_on = artifact.metadata["training"]
        if trained_on["holdout_index"] != [int(i) for i in data.split.test_index]:
            raise RuntimeError(
                f"The {target} model was trained with a different holdout split than the current "
                "configuration produces. Retrain with `python -m ml.scripts.train_all`."
            )
        holdout[target] = evaluate_holdout(
            artifact.model, data.X_test, data.y_test[target], data.y_dev[target], seed=data.seed
        )
    return holdout


def build_model_metrics(artifacts, holdout) -> dict:
    """One consolidated, path-free summary per target (the source for the API and UI)."""
    summary = {}
    for target, artifact in artifacts.items():
        metadata = artifact.metadata
        summary[target] = {
            "target": target,
            "target_label": metadata["target_label"],
            "model_version": metadata["model_version"],
            "algorithm": metadata["algorithm"],
            "candidate": metadata["candidate"]["name"],
            "selection_reason": metadata["selection"]["reason"],
            "decision_threshold": metadata["decision_threshold"],
            "calibration": {
                "method": metadata["calibration"]["method"],
                "reason": metadata["calibration"]["reason"],
                "threshold_reason": metadata["calibration"]["threshold"]["reason"],
                "reliability_curve": metadata["calibration"]["reliability_curve"],
            },
            "training": {
                key: metadata["training"][key]
                for key in ("n_development", "n_holdout", "development_class_counts",
                            "holdout_class_counts", "cross_validation")
            },
            "cross_validation": metadata["validation"]["cross_validation"],
            "nested_cross_validation": metadata["calibration"]["nested_cv"],
            "holdout": holdout[target],
        }
    return summary


def main() -> int:
    try:
        data = load_training_data()
        artifacts = {target: load_artifact(target) for target in TARGET_NAMES}
    except (DatasetNotFoundError, DatasetFormatError, ModelNotFoundError) as exc:
        print(f"SETUP ERROR\n{exc}", file=sys.stderr)
        return 2

    holdout = evaluate_models(data, artifacts)
    for target, artifact in artifacts.items():
        artifact.metadata["validation"]["holdout"] = holdout[target]
        write_metadata(target, artifact.metadata)
    metrics = build_model_metrics(artifacts, holdout)
    write_json(METRICS_DIR / "model_metrics.json", metrics)

    plot_roc_curves(holdout, FIGURES_DIR / "roc_curves.png")
    plot_confusion_matrices(holdout, FIGURES_DIR / "confusion_matrices.png")
    plot_calibration_curves(
        {t: metrics[t]["calibration"]["reliability_curve"] for t in TARGET_NAMES},
        holdout,
        FIGURES_DIR / "calibration_curves.png",
    )
    plot_class_distribution(
        read_json(METRICS_DIR / "class_distribution.json"), FIGURES_DIR / "class_distribution.png"
    )
    plot_model_comparison(
        pd.read_csv(MODEL_COMPARISON_DIR / "model_comparison.csv"), FIGURES_DIR / "model_comparison.png"
    )

    for target in TARGET_NAMES:
        m, ci = holdout[target]["metrics"], holdout[target]["confidence_intervals_95"]
        print(
            f"{target} holdout (n={holdout[target]['n']}, threshold {m['threshold']:.2f}): "
            f"ROC-AUC {m['roc_auc']:.3f} [{ci['roc_auc']['lower']:.3f}, {ci['roc_auc']['upper']:.3f}] "
            f"accuracy {m['accuracy']:.3f} precision {m['precision']:.3f} recall {m['recall']:.3f} "
            f"F1 {m['f1']:.3f} Brier {m['brier']:.3f}"
        )
    print(f"wrote {METRICS_DIR.relative_to(REPO_ROOT).as_posix()}/model_metrics.json and figures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
