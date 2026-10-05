"""Classification and probability-quality metrics."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)

# Metrics that depend on the decision threshold.
THRESHOLD_METRICS = ("accuracy", "balanced_accuracy", "precision", "recall", "specificity", "f1")
# Metrics computed from the probabilities alone.
PROBABILITY_METRICS = ("roc_auc", "brier", "log_loss")
SCALAR_METRICS = THRESHOLD_METRICS + PROBABILITY_METRICS


def classification_metrics(y_true, proba, threshold: float = 0.5) -> dict[str, Any]:
    """Metrics for binary labels ``y_true`` and positive-class probabilities ``proba``."""
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    predicted = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, predicted, labels=[0, 1]).ravel()
    return {
        "accuracy": float(accuracy_score(y_true, predicted)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, predicted)),
        "precision": float(precision_score(y_true, predicted, zero_division=0)),
        "recall": float(recall_score(y_true, predicted, zero_division=0)),
        "specificity": float(tn / (tn + fp)) if (tn + fp) else 0.0,
        "f1": float(f1_score(y_true, predicted, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "brier": float(brier_score_loss(y_true, proba)),
        "log_loss": float(log_loss(y_true, np.clip(proba, 1e-12, 1 - 1e-12), labels=[0, 1])),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "threshold": float(threshold),
        "n": int(len(y_true)),
    }


def summarize(fold_metrics: Iterable[Mapping[str, Any]], keys=SCALAR_METRICS) -> dict[str, dict]:
    """Mean and sample standard deviation of each metric across folds."""
    folds = list(fold_metrics)
    summary = {}
    for key in keys:
        values = np.array([fold[key] for fold in folds], dtype=float)
        summary[key] = {
            "mean": float(values.mean()),
            "std": float(values.std(ddof=1)) if len(values) > 1 else 0.0,
        }
    return summary
