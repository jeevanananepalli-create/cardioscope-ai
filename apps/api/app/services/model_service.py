"""Loads the four trained model artifacts once and keeps them in memory."""

from __future__ import annotations

from typing import Any

from apps.api.app.core.config import Settings
from apps.api.app.core.exceptions import ModelUnavailableError
from apps.api.app.core.logging import get_logger
from ml.src.config import load_training_config
from ml.src.explainability.shap_explainer import ModelExplainer, build_explainer
from ml.src.features.feature_schema import TARGET_NAMES, load_feature_schema
from ml.src.models.artifacts import ModelArtifact, ModelNotFoundError, load_artifact

_RETRAIN_HINT = "Train the models with `python -m ml.scripts.train_all`, then restart the API."


class ModelRegistry:
    """In-memory models and SHAP explainers, keyed by target."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.schema = load_feature_schema()
        self.training_config = load_training_config()
        self.artifacts: dict[str, ModelArtifact] = {}
        self.explainers: dict[str, ModelExplainer] = {}
        self.problems: dict[str, str] = {}

    def load(self) -> "ModelRegistry":
        logger = get_logger()
        self.artifacts, self.explainers, self.problems = {}, {}, {}
        for target in TARGET_NAMES:
            try:
                artifact = load_artifact(target, self.settings.models_dir)
            except ModelNotFoundError:
                self.problems[target] = f"The {target} model has not been trained. {_RETRAIN_HINT}"
                continue
            except Exception as exc:  # corrupt or incompatible artifact
                logger.error("could not load %s model: %s", target, type(exc).__name__)
                self.problems[target] = f"The {target} model could not be loaded. {_RETRAIN_HINT}"
                continue
            if artifact.model.feature_names != self.schema.feature_names:
                self.problems[target] = (
                    f"The {target} model was trained with a different feature schema. {_RETRAIN_HINT}"
                )
                continue
            estimator = artifact.model.pipeline.named_steps["model"]
            if hasattr(estimator, "n_jobs"):
                # Single-row inference is faster without thread fan-out.
                estimator.n_jobs = 1
            self.artifacts[target] = artifact
            try:
                self.explainers[target] = build_explainer(artifact, self.schema, self.training_config)
            except Exception as exc:
                logger.error("could not build %s explainer: %s", target, type(exc).__name__)
        logger.info("models loaded: %s", {t: t in self.artifacts for t in TARGET_NAMES})
        return self

    @property
    def availability(self) -> dict[str, bool]:
        return {target: target in self.artifacts for target in TARGET_NAMES}

    @property
    def ready(self) -> bool:
        return all(self.availability.values())

    @property
    def model_version(self) -> str | None:
        versions = {a.metadata["model_version"] for a in self.artifacts.values()}
        return sorted(versions)[-1] if versions else None

    def require_all(self) -> None:
        if not self.ready:
            missing = [t for t, ok in self.availability.items() if not ok]
            raise ModelUnavailableError(
                f"Prediction models are not available ({', '.join(missing)}). {_RETRAIN_HINT}",
                [{"field": t, "message": self.problems.get(t, "Unavailable.")} for t in missing],
            )

    def metadata(self, target: str) -> dict[str, Any]:
        return self.artifacts[target].metadata

    def development_statistics(self) -> dict[str, Any]:
        """Per-feature statistics observed on the development set (from any loaded model)."""
        for artifact in self.artifacts.values():
            return artifact.metadata.get("feature_statistics", {})
        return {}
