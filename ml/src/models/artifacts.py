"""Save and load model artifacts under ml/models/<target>/.

Each artifact directory holds:
  model.joblib    the fitted TargetModel (preprocessing + classifier + calibrator
                  + threshold) and the transformed background matrix used by SHAP
  metadata.json   human-readable description: feature schema, version, training
                  metadata, selection reasoning, validation metrics, calibration
"""

from __future__ import annotations

import hashlib
import json
import platform
from dataclasses import dataclass
from importlib import metadata as importlib_metadata
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from ml.src.features.feature_schema import TARGET_NAMES, assert_no_forbidden
from ml.src.models.base import TargetModel
from ml.src.paths import MODELS_DIR

MODEL_FILENAME = "model.joblib"
METADATA_FILENAME = "metadata.json"
_TRACKED_PACKAGES = ("scikit-learn", "xgboost", "shap", "pandas", "numpy", "joblib")


class ModelNotFoundError(FileNotFoundError):
    """A trained model artifact is missing."""


@dataclass
class ModelArtifact:
    model: TargetModel
    background: np.ndarray
    transformed_feature_names: list[str]
    metadata: dict[str, Any]


def artifact_dir(target: str, models_dir: Path = MODELS_DIR) -> Path:
    if target not in TARGET_NAMES:
        raise ValueError(f"Unknown target {target!r}")
    return models_dir / target.lower()


def environment_info() -> dict[str, str]:
    info = {"python": platform.python_version()}
    for package in _TRACKED_PACKAGES:
        info[package] = importlib_metadata.version(package)
    return info


def file_sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save_artifact(artifact: ModelArtifact, models_dir: Path = MODELS_DIR) -> Path:
    assert_no_forbidden(artifact.model.feature_names, context="the model artifact inputs")
    directory = artifact_dir(artifact.model.target, models_dir)
    directory.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": artifact.model,
            "background": artifact.background,
            "transformed_feature_names": artifact.transformed_feature_names,
        },
        directory / MODEL_FILENAME,
    )
    write_metadata(artifact.model.target, artifact.metadata, models_dir)
    return directory


def write_metadata(target: str, metadata: dict[str, Any], models_dir: Path = MODELS_DIR) -> None:
    path = artifact_dir(target, models_dir) / METADATA_FILENAME
    path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_metadata(target: str, models_dir: Path = MODELS_DIR) -> dict[str, Any]:
    path = artifact_dir(target, models_dir) / METADATA_FILENAME
    if not path.is_file():
        raise ModelNotFoundError(_missing_message(target))
    return json.loads(path.read_text(encoding="utf-8"))


def _missing_message(target: str) -> str:
    return (
        f"No trained {target} model found. Train the models first with "
        "`python -m ml.scripts.train_all`."
    )


def load_artifact(target: str, models_dir: Path = MODELS_DIR) -> ModelArtifact:
    directory = artifact_dir(target, models_dir)
    if not (directory / MODEL_FILENAME).is_file():
        raise ModelNotFoundError(_missing_message(target))
    payload = joblib.load(directory / MODEL_FILENAME)
    model: TargetModel = payload["model"]
    assert_no_forbidden(model.feature_names, context=f"the loaded {target} model inputs")
    return ModelArtifact(
        model=model,
        background=payload["background"],
        transformed_feature_names=list(payload["transformed_feature_names"]),
        metadata=read_metadata(target, models_dir),
    )
