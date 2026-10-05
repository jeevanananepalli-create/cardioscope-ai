"""Probability calibration and decision-threshold tuning, evaluated out of fold.

Calibration and a tuned threshold are adopted only if nested cross-validation
shows a clear improvement; otherwise the model keeps its own probabilities and
the default 0.5 threshold.

In every outer fold the calibrator and the threshold are fitted on *inner*
out-of-fold scores of the outer training part, then judged on the outer test
part, which neither the model nor the calibrator has seen.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold

from ml.src.evaluation.metrics import classification_metrics, summarize
from ml.src.features.feature_schema import FeatureSchema
from ml.src.models.base import CandidateSpec, build_pipeline
from ml.src.training.cross_validation import make_cv

_EPS = 1e-6


def _logit(proba) -> np.ndarray:
    clipped = np.clip(np.asarray(proba, dtype=float), _EPS, 1 - _EPS)
    return np.log(clipped / (1 - clipped))


class SigmoidCalibrator:
    """Platt scaling: a one-variable logistic regression on the logit of the raw probability."""

    method = "sigmoid"

    def fit(self, proba, y) -> "SigmoidCalibrator":
        self.regression_ = LogisticRegression(C=1e6, max_iter=1000)
        self.regression_.fit(_logit(proba).reshape(-1, 1), np.asarray(y).astype(int))
        return self

    def transform(self, proba) -> np.ndarray:
        return self.regression_.predict_proba(_logit(proba).reshape(-1, 1))[:, 1]


class IsotonicCalibrator:
    """Isotonic regression: a monotone step function from raw to calibrated probability."""

    method = "isotonic"

    def fit(self, proba, y) -> "IsotonicCalibrator":
        self.regression_ = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
        self.regression_.fit(np.asarray(proba, dtype=float), np.asarray(y).astype(int))
        return self

    def transform(self, proba) -> np.ndarray:
        return self.regression_.predict(np.asarray(proba, dtype=float))


def make_calibrator(method: str):
    if method == "sigmoid":
        return SigmoidCalibrator()
    if method == "isotonic":
        return IsotonicCalibrator()
    raise ValueError(f"Unknown calibration method {method!r}")


def inner_oof_proba(
    spec: CandidateSpec, schema: FeatureSchema, X: pd.DataFrame, y: pd.Series, seed: int, n_splits: int
) -> np.ndarray:
    """Out-of-fold positive-class probabilities for every row of ``X``."""
    oof = np.empty(len(X), dtype=float)
    folds = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    for train, test in folds.split(X, y):
        pipeline = build_pipeline(spec, schema, y.iloc[train], seed).fit(X.iloc[train], y.iloc[train])
        oof[test] = pipeline.predict_proba(X.iloc[test])[:, 1]
    return oof


_OBJECTIVES = {
    "balanced_accuracy": balanced_accuracy_score,
    "f1": lambda y, predicted: f1_score(y, predicted, zero_division=0),
}


def tune_threshold(y, proba, objective: str = "balanced_accuracy") -> float:
    """Threshold maximising ``objective``; ties go to the threshold closest to 0.5."""
    y = np.asarray(y).astype(int)
    proba = np.asarray(proba, dtype=float)
    score = _OBJECTIVES[objective]
    levels = np.unique(proba)
    candidates = np.concatenate([[0.5], (levels[:-1] + levels[1:]) / 2])
    scored = [(score(y, (proba >= t).astype(int)), -abs(t - 0.5), t) for t in candidates]
    return float(max(scored)[2])


def _study_fold(spec, schema, X, y, train, test, seed, inner_splits, methods, objective):
    X_train, y_train = X.iloc[train], y.iloc[train]
    X_test, y_test = X.iloc[test], y.iloc[test]
    oof = inner_oof_proba(spec, schema, X_train, y_train, seed, inner_splits)
    pipeline = build_pipeline(spec, schema, y_train, seed).fit(X_train, y_train)
    raw_test = pipeline.predict_proba(X_test)[:, 1]
    raw_threshold = tune_threshold(y_train, oof, objective)

    fold: dict[str, Any] = {}
    for method in ("none", *methods):
        if method == "none":
            proba, threshold = raw_test, raw_threshold
        else:
            calibrator = make_calibrator(method).fit(oof, y_train)
            proba = calibrator.transform(raw_test)
            threshold = float(calibrator.transform(np.array([raw_threshold]))[0])
        fold[method] = {
            "default": classification_metrics(y_test, proba, 0.5),
            "tuned": classification_metrics(y_test, proba, threshold),
            "proba": proba.tolist(),
        }
    fold["y_test"] = y_test.astype(int).tolist()
    return fold


def paired_comparison(baseline: Sequence[float], alternative: Sequence[float], test_fraction: float) -> dict:
    """Mean paired difference (alternative - baseline) with a corrected standard error.

    Folds of repeated cross-validation share training data, so the plain
    standard error is too small. This uses the Nadeau-Bengio correction:
    variance x (1/n + n_test/n_train).
    """
    differences = np.asarray(alternative, dtype=float) - np.asarray(baseline, dtype=float)
    n = len(differences)
    variance = float(differences.var(ddof=1)) if n > 1 else 0.0
    correction = 1.0 / n + test_fraction / (1.0 - test_fraction)
    return {
        "mean_difference": float(differences.mean()),
        "standard_error": float(np.sqrt(correction * variance)),
        "n_folds": n,
    }


def calibration_study(
    spec: CandidateSpec,
    schema: FeatureSchema,
    X: pd.DataFrame,
    y: pd.Series,
    seed: int,
    n_splits: int,
    n_repeats: int,
    inner_splits: int,
    methods: Sequence[str],
    objective: str = "balanced_accuracy",
    n_jobs: int = 1,
) -> dict[str, Any]:
    """Nested-CV comparison of no calibration vs each method, and 0.5 vs a tuned threshold."""
    splits = list(make_cv(n_splits, n_repeats, seed).split(X, y))
    folds = Parallel(n_jobs=n_jobs)(
        delayed(_study_fold)(spec, schema, X, y, train, test, seed, inner_splits, methods, objective)
        for train, test in splits
    )
    test_fraction = 1.0 / n_splits
    variants: dict[str, Any] = {}
    for method in ("none", *methods):
        default = [fold[method]["default"] for fold in folds]
        tuned = [fold[method]["tuned"] for fold in folds]
        pooled_y = np.concatenate([fold["y_test"] for fold in folds])
        pooled_p = np.concatenate([fold[method]["proba"] for fold in folds])
        observed, predicted = calibration_curve(pooled_y, pooled_p, n_bins=10, strategy="quantile")
        variants[method] = {
            "default_threshold": summarize(default),
            "tuned_threshold": summarize(tuned),
            "mean_tuned_threshold": float(np.mean([m["threshold"] for m in tuned])),
            "threshold_gain": paired_comparison(
                [m[objective] for m in default], [m[objective] for m in tuned], test_fraction
            ),
            "reliability_curve": {
                "mean_predicted": predicted.tolist(),
                "observed_rate": observed.tolist(),
                "n_predictions": int(len(pooled_y)),
            },
        }
        if method != "none":
            baseline = [fold["none"]["default"] for fold in folds]
            variants[method]["brier_vs_uncalibrated"] = paired_comparison(
                [m["brier"] for m in baseline], [m["brier"] for m in default], test_fraction
            )
    return {
        "candidate": spec.name,
        "n_folds": len(folds),
        "inner_splits": inner_splits,
        "threshold_objective": objective,
        "variants": variants,
    }


def decide_calibration(study: dict[str, Any], min_improvement_se: float) -> dict[str, Any]:
    """Adopt the best method only if its Brier improvement is clearly beyond noise."""
    best_method, best_gain = "none", 0.0
    notes = []
    for method, variant in study["variants"].items():
        if method == "none":
            continue
        comparison = variant["brier_vs_uncalibrated"]
        improvement = -comparison["mean_difference"]  # lower Brier is better
        required = min_improvement_se * comparison["standard_error"]
        notes.append(
            f"{method}: Brier change {comparison['mean_difference']:+.4f} "
            f"(needs an improvement above {required:.4f})"
        )
        if improvement > required and improvement > best_gain:
            best_method, best_gain = method, improvement
    brier = study["variants"]["none"]["default_threshold"]["brier"]
    verdict = (
        f"adopted {best_method} calibration"
        if best_method != "none"
        else "kept the model's own probabilities (no calibration)"
    )
    return {
        "method": best_method,
        "reason": f"Uncalibrated out-of-fold Brier {brier['mean']:.4f} ± {brier['std']:.4f}. "
        + "; ".join(notes)
        + f". Decision: {verdict}.",
    }


def decide_threshold(study: dict[str, Any], method: str, min_improvement_se: float) -> dict[str, Any]:
    """Use the tuned threshold only if it clearly beats 0.5 on outer folds."""
    variant = study["variants"][method]
    gain = variant["threshold_gain"]
    required = min_improvement_se * gain["standard_error"]
    use_tuned = gain["mean_difference"] > required
    objective = study["threshold_objective"]
    return {
        "use_tuned": bool(use_tuned),
        "reason": (
            f"Tuning the threshold for {objective} changed out-of-fold {objective} by "
            f"{gain['mean_difference']:+.4f} versus 0.5 (needs a gain above {required:.4f}; "
            f"mean tuned threshold {variant['mean_tuned_threshold']:.3f}). Decision: "
            + ("use the tuned threshold." if use_tuned else "keep the 0.5 threshold.")
        ),
    }
