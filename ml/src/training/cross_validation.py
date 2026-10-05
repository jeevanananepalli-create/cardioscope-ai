"""Repeated stratified k-fold cross-validation of candidate models.

Each fold builds a fresh pipeline (preprocessing + classifier) and fits it on
the training part of the fold only, so no preprocessing statistic ever sees
the fold's test rows.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold

from ml.src.evaluation.metrics import classification_metrics, summarize
from ml.src.features.feature_schema import FeatureSchema, assert_no_forbidden
from ml.src.models.base import CandidateSpec, build_pipeline


def make_cv(n_splits: int, n_repeats: int, seed: int) -> RepeatedStratifiedKFold:
    return RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=seed)


def _evaluate_fold(spec, schema, X, y, train_index, test_index, seed) -> dict[str, Any]:
    X_train, y_train = X.iloc[train_index], y.iloc[train_index]
    X_test, y_test = X.iloc[test_index], y.iloc[test_index]
    pipeline = build_pipeline(spec, schema, y_train, seed).fit(X_train, y_train)
    metrics = classification_metrics(y_test, pipeline.predict_proba(X_test)[:, 1])
    metrics["train_roc_auc"] = float(roc_auc_score(y_train, pipeline.predict_proba(X_train)[:, 1]))
    return metrics


def cross_validate_candidate(
    spec: CandidateSpec,
    schema: FeatureSchema,
    X: pd.DataFrame,
    y: pd.Series,
    seed: int,
    n_splits: int,
    n_repeats: int,
    n_jobs: int = 1,
) -> dict[str, Any]:
    """Cross-validate one candidate; returns per-fold metrics and their mean/std."""
    assert_no_forbidden(X.columns, context="the cross-validation feature matrix")
    splits = list(make_cv(n_splits, n_repeats, seed).split(X, y))
    folds = Parallel(n_jobs=n_jobs)(
        delayed(_evaluate_fold)(spec, schema, X, y, train, test, seed) for train, test in splits
    )
    summary = summarize(folds)
    train_auc = np.array([fold["train_roc_auc"] for fold in folds])
    summary["train_roc_auc"] = {"mean": float(train_auc.mean()), "std": float(train_auc.std(ddof=1))}
    return {
        "candidate": spec.to_dict(),
        "simplicity": spec.simplicity,
        "n_folds": len(folds),
        "summary": summary,
        "folds": folds,
    }


def compare_candidates(
    candidates: Sequence[CandidateSpec],
    schema: FeatureSchema,
    X: pd.DataFrame,
    y: pd.Series,
    seed: int,
    n_splits: int,
    n_repeats: int,
    n_jobs: int = 1,
) -> list[dict[str, Any]]:
    """Cross-validate every candidate on identical folds."""
    return [
        cross_validate_candidate(spec, schema, X, y, seed, n_splits, n_repeats, n_jobs)
        for spec in candidates
    ]
