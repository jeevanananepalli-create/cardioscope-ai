"""Load the data, split it, and fit models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd
from sklearn.pipeline import Pipeline

from ml.src.config import load_training_config
from ml.src.data.loader import load_raw_dataset
from ml.src.data.preprocessing import build_feature_matrix, build_target
from ml.src.data.validator import validate_dataset
from ml.src.features.feature_schema import (
    TARGET_NAMES,
    FeatureSchema,
    assert_no_forbidden,
    load_feature_schema,
)
from ml.src.models.base import CandidateSpec, build_pipeline
from ml.src.training.split import HoldoutSplit, make_holdout_split


@dataclass
class TrainingData:
    """Validated dataset split into development and holdout parts."""

    schema: FeatureSchema
    config: dict[str, Any]
    split: HoldoutSplit
    X_dev: pd.DataFrame
    X_test: pd.DataFrame
    y_dev: dict[str, pd.Series]
    y_test: dict[str, pd.Series]

    @property
    def seed(self) -> int:
        return int(self.config["seed"])


def load_training_data(
    frame: pd.DataFrame | None = None,
    schema: FeatureSchema | None = None,
    config: dict[str, Any] | None = None,
) -> TrainingData:
    schema = schema or load_feature_schema()
    config = config or load_training_config()
    frame = load_raw_dataset() if frame is None else frame
    validate_dataset(frame, schema).raise_if_invalid()

    split = make_holdout_split(
        frame, schema, test_size=float(config["holdout"]["test_size"]), seed=int(config["seed"])
    )
    features = build_feature_matrix(frame, schema)
    targets = {name: build_target(frame, schema, name) for name in TARGET_NAMES}
    return TrainingData(
        schema=schema,
        config=config,
        split=split,
        X_dev=features.iloc[split.dev_index].reset_index(drop=True),
        X_test=features.iloc[split.test_index].reset_index(drop=True),
        y_dev={n: y.iloc[split.dev_index].reset_index(drop=True) for n, y in targets.items()},
        y_test={n: y.iloc[split.test_index].reset_index(drop=True) for n, y in targets.items()},
    )


def fit_candidate(
    spec: CandidateSpec, schema: FeatureSchema, X: pd.DataFrame, y: pd.Series, seed: int
) -> Pipeline:
    """Fit one candidate pipeline. Refuses a feature matrix containing a forbidden column."""
    assert_no_forbidden(X.columns, context="the training feature matrix")
    return build_pipeline(spec, schema, y, seed).fit(X, y)
