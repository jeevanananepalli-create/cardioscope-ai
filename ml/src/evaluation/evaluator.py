"""Evaluate a trained model on the holdout set."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import roc_curve

from ml.src.evaluation.metrics import SCALAR_METRICS, classification_metrics
from ml.src.models.base import TargetModel


def bootstrap_intervals(
    y_true, proba, threshold: float, seed: int, n_resamples: int = 2000, level: float = 0.95
) -> dict[str, dict[str, float]]:
    """Percentile bootstrap confidence intervals for each scalar metric.

    Resamples containing a single class are redrawn, because ROC-AUC is undefined for them.
    """
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    rng = np.random.default_rng(seed)
    samples: dict[str, list[float]] = {metric: [] for metric in SCALAR_METRICS}
    while len(samples["roc_auc"]) < n_resamples:
        index = rng.integers(0, len(y_true), len(y_true))
        if y_true[index].min() == y_true[index].max():
            continue
        metrics = classification_metrics(y_true[index], proba[index], threshold)
        for metric in SCALAR_METRICS:
            samples[metric].append(metrics[metric])
    tail = (1 - level) / 2 * 100
    return {
        metric: {
            "lower": float(np.percentile(values, tail)),
            "upper": float(np.percentile(values, 100 - tail)),
        }
        for metric, values in samples.items()
    }


def reference_baseline(y_dev, y_test) -> dict[str, float]:
    """What a model with no patient information would score on the holdout set.

    It predicts the development-set positive rate for everyone, which gives the
    accuracy and Brier score any real model has to beat.
    """
    rate = float(np.mean(y_dev))
    y_test = np.asarray(y_test).astype(int)
    majority = int(rate >= 0.5)
    return {
        "predicted_probability": rate,
        "accuracy": float(np.mean(y_test == majority)),
        "brier": float(np.mean((rate - y_test) ** 2)),
        "roc_auc": 0.5,
    }


def evaluate_holdout(
    model: TargetModel,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    y_dev: pd.Series,
    seed: int,
    n_resamples: int = 2000,
) -> dict[str, Any]:
    """Holdout metrics, curves and confidence intervals for one model."""
    proba = model.predict_proba(X_test)
    y = np.asarray(y_test).astype(int)
    metrics = classification_metrics(y, proba, model.threshold)
    false_positive_rate, true_positive_rate, _ = roc_curve(y, proba)
    n_bins = 5
    observed, predicted = calibration_curve(y, proba, n_bins=n_bins, strategy="quantile")
    result = {
        "n": int(len(y)),
        "class_counts": {"positive": int(y.sum()), "negative": int(len(y) - y.sum())},
        "metrics": metrics,
        "confidence_intervals_95": bootstrap_intervals(y, proba, model.threshold, seed, n_resamples),
        "bootstrap_resamples": n_resamples,
        "reference_baseline": reference_baseline(y_dev, y),
        "roc_curve": {
            "false_positive_rate": false_positive_rate.tolist(),
            "true_positive_rate": true_positive_rate.tolist(),
        },
        "reliability_curve": {
            "mean_predicted": predicted.tolist(),
            "observed_rate": observed.tolist(),
            "n_bins": n_bins,
        },
    }
    if model.threshold != 0.5:
        result["metrics_at_default_threshold"] = classification_metrics(y, proba, 0.5)
    return result
