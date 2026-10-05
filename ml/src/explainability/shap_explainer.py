"""SHAP explanations for a trained target model.

The explainer works on the classifier inside the pipeline, in the transformed
feature space, then sums one-hot columns back onto the original clinical
feature so every contribution is reported per input feature.

Explanations describe the model's raw score before any probability
calibration:
  - "log_odds"     logistic regression and XGBoost
  - "probability"  random forest, and the model-agnostic fallback
Calibration is a monotone rescaling of that score, so the direction and
ranking of contributions are unchanged by it.

SHAP values describe how the model used its inputs. They are not causal and
say nothing about anatomy.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier

from ml.src.features.feature_schema import FeatureSchema
from ml.src.models.base import TargetModel


def transformed_feature_origins(
    transformed_names: list[str], schema: FeatureSchema
) -> list[str]:
    """Original feature behind each transformed column (one-hot columns map to their source)."""
    categorical = schema.names_of_kind("categorical")
    known = set(schema.feature_names)
    origins = []
    for name in transformed_names:
        if name in known:
            origins.append(name)
            continue
        source = next((c for c in categorical if name.startswith(f"{c}_")), None)
        if source is None:
            raise ValueError(f"Transformed column {name!r} does not map to a schema feature.")
        origins.append(source)
    return origins


@dataclass
class ShapResult:
    """SHAP values per original feature for a batch of rows."""

    feature_names: list[str]
    values: np.ndarray  # shape (n_rows, n_features)
    base_value: float
    output_space: str

    def raw_score(self) -> np.ndarray:
        """Model raw score reconstructed from the explanation (base + contributions)."""
        return self.base_value + self.values.sum(axis=1)


class ModelExplainer:
    """Builds the right SHAP explainer for a model once, then explains rows on demand."""

    def __init__(
        self,
        model: TargetModel,
        background: np.ndarray,
        transformed_feature_names: list[str],
        schema: FeatureSchema,
        kernel_background_size: int = 25,
        kernel_nsamples: int = 300,
        seed: int = 0,
    ):
        self.model = model
        self.schema = schema
        self.feature_names = schema.feature_names
        self._preprocess = model.pipeline.named_steps["preprocess"]
        self._estimator = model.pipeline.named_steps["model"]
        self._kernel_nsamples = kernel_nsamples
        self._seed = seed

        origins = transformed_feature_origins(transformed_feature_names, schema)
        position = {name: index for index, name in enumerate(self.feature_names)}
        self._aggregate = np.zeros((len(transformed_feature_names), len(self.feature_names)))
        for column, origin in enumerate(origins):
            self._aggregate[column, position[origin]] = 1.0

        background = np.asarray(background, dtype=float)
        if isinstance(self._estimator, XGBClassifier):
            self.kind, self.output_space = "tree", "log_odds"
            self._explainer = shap.TreeExplainer(self._estimator)
        elif isinstance(self._estimator, RandomForestClassifier):
            self.kind, self.output_space = "tree", "probability"
            self._explainer = shap.TreeExplainer(self._estimator)
        elif isinstance(self._estimator, LogisticRegression):
            self.kind, self.output_space = "linear", "log_odds"
            # Use every background row (the default masker would subsample to 100).
            masker = shap.maskers.Independent(background, max_samples=len(background))
            self._explainer = shap.LinearExplainer(self._estimator, masker)
        else:
            self.kind, self.output_space = "kernel", "probability"
            np.random.seed(seed)
            summary = shap.kmeans(background, min(kernel_background_size, len(background)))
            self._explainer = shap.KernelExplainer(self._positive_probability, summary)

    def _positive_probability(self, transformed: np.ndarray) -> np.ndarray:
        return self._estimator.predict_proba(transformed)[:, 1]

    def _transformed_shap(self, transformed: np.ndarray) -> tuple[np.ndarray, float]:
        if self.kind == "kernel":
            np.random.seed(self._seed)
            values = self._explainer.shap_values(transformed, nsamples=self._kernel_nsamples, silent=True)
        else:
            values = self._explainer.shap_values(transformed)
        values = np.asarray(values, dtype=float)
        base = np.atleast_1d(np.asarray(self._explainer.expected_value, dtype=float))
        if values.ndim == 3:  # (rows, features, classes): keep the positive class
            values = values[:, :, 1]
            base = base[1:]
        return values, float(base[-1] if len(base) > 1 else base[0])

    def explain(self, features: pd.DataFrame) -> ShapResult:
        """SHAP values for each row of raw (un-preprocessed) ``features``."""
        transformed = np.asarray(self._preprocess.transform(features), dtype=float)
        values, base_value = self._transformed_shap(transformed)
        return ShapResult(
            feature_names=list(self.feature_names),
            values=values @ self._aggregate,
            base_value=base_value,
            output_space=self.output_space,
        )


def build_explainer(artifact, schema: FeatureSchema, config: dict | None = None) -> ModelExplainer:
    """Explainer for a loaded ``ModelArtifact``, using settings from training.yaml."""
    settings = (config or {}).get("explainability", {})
    return ModelExplainer(
        artifact.model,
        artifact.background,
        artifact.transformed_feature_names,
        schema,
        kernel_background_size=int(settings.get("kernel_background_size", 25)),
        kernel_nsamples=int(settings.get("kernel_nsamples", 300)),
        seed=int((config or {}).get("seed", 0)),
    )
