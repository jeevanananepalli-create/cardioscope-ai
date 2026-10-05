"""Candidate model definitions and the fitted per-target model wrapper.

All four targets (CAD, LAD, LCX, RCA) share this code; a target differs only in
which column supplies its labels, so there is no per-target model module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from xgboost import XGBClassifier

from ml.src.config import MODELS_CONFIG, load_yaml
from ml.src.data.preprocessing import build_preprocessor
from ml.src.features.feature_schema import FeatureSchema, assert_no_forbidden

CLASS_WEIGHTINGS = ("none", "balanced")


@dataclass(frozen=True)
class CandidateSpec:
    """One model configuration: algorithm + hyperparameters + imbalance handling."""

    algorithm: str
    params: Mapping[str, Any]
    variant: Mapping[str, Any]
    class_weighting: str
    scale: bool
    simplicity: int
    is_baseline: bool = False

    @property
    def name(self) -> str:
        variant = ",".join(f"{k}={v}" for k, v in self.variant.items())
        return f"{self.algorithm}[{variant}|weights={self.class_weighting}]"

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "algorithm": self.algorithm,
            "params": {**self.params, **self.variant},
            "class_weighting": self.class_weighting,
            "scale": self.scale,
            "is_baseline": self.is_baseline,
        }


def load_candidates(path: Path | str = MODELS_CONFIG) -> list[CandidateSpec]:
    """All candidates: every grid variant of every algorithm x every class weighting."""
    config = load_yaml(path)
    candidates = []
    for algorithm, entry in config["algorithms"].items():
        for variant in entry["grid"]:
            for weighting in config["class_weighting"]:
                if weighting not in CLASS_WEIGHTINGS:
                    raise ValueError(f"Unknown class_weighting {weighting!r}")
                candidates.append(
                    CandidateSpec(
                        algorithm=algorithm,
                        params=dict(entry.get("params", {})),
                        variant=dict(variant),
                        class_weighting=weighting,
                        scale=bool(entry["scale"]),
                        simplicity=int(entry["simplicity"]),
                        is_baseline=variant == entry["default"] and weighting == "none",
                    )
                )
    return candidates


def baseline_candidates(path: Path | str = MODELS_CONFIG) -> list[CandidateSpec]:
    """One unweighted default-hyperparameter candidate per algorithm."""
    return [c for c in load_candidates(path) if c.is_baseline]


def build_estimator(spec: CandidateSpec, y_train, seed: int):
    """Build the unfitted classifier for ``spec``.

    For XGBoost, "balanced" sets ``scale_pos_weight`` to the negative/positive
    ratio of ``y_train`` (the labels the estimator is about to be fitted on).
    """
    params = {**spec.params, **spec.variant}
    balanced = spec.class_weighting == "balanced"
    if spec.algorithm == "logistic_regression":
        return LogisticRegression(
            **params, class_weight="balanced" if balanced else None, random_state=seed
        )
    if spec.algorithm == "svm":
        # SVC has no native probabilities; Platt scaling on internal out-of-fold scores
        # (the replacement for the deprecated SVC(probability=True)).
        svc = SVC(**params, class_weight="balanced" if balanced else None, random_state=seed)
        return CalibratedClassifierCV(svc, method="sigmoid", cv=5, ensemble=False)
    if spec.algorithm == "random_forest":
        return RandomForestClassifier(
            **params, class_weight="balanced" if balanced else None, random_state=seed
        )
    if spec.algorithm == "xgboost":
        y = np.asarray(y_train)
        n_positive = int(y.sum())
        ratio = (len(y) - n_positive) / n_positive if balanced else 1.0
        return XGBClassifier(
            **params, scale_pos_weight=ratio, eval_metric="logloss", random_state=seed
        )
    raise ValueError(f"Unknown algorithm {spec.algorithm!r}")


def build_pipeline(spec: CandidateSpec, schema: FeatureSchema, y_train, seed: int) -> Pipeline:
    """Preprocessing + classifier as one pipeline, so preprocessing is fitted per fold."""
    return Pipeline(
        [
            ("preprocess", build_preprocessor(schema, scale=spec.scale)),
            ("model", build_estimator(spec, y_train, seed)),
        ]
    )


@dataclass
class TargetModel:
    """A fitted model for one target: pipeline, optional calibrator, decision threshold."""

    target: str
    pipeline: Pipeline
    calibrator: Any = None
    threshold: float = 0.5
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        assert_no_forbidden(self.feature_names, context=f"the {self.target} model inputs")

    @property
    def feature_names(self) -> list[str]:
        """Input features the fitted pipeline was trained on."""
        return list(self.pipeline.named_steps["preprocess"].named_steps["canonicalize"].feature_names_in_)

    def raw_proba(self, features: pd.DataFrame) -> np.ndarray:
        """Positive-class probability straight from the pipeline (before calibration)."""
        return self.pipeline.predict_proba(features)[:, 1]

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        """Positive-class probability, calibrated if a calibrator was adopted."""
        raw = self.raw_proba(features)
        return raw if self.calibrator is None else self.calibrator.transform(raw)

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        return (self.predict_proba(features) >= self.threshold).astype(int)
