"""Fit the final model for a target on the development set and package it as an artifact."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np

from ml.src.data.loader import resolve_dataset_path
from ml.src.data.profile import feature_statistics
from ml.src.features.feature_schema import FORBIDDEN_COLUMNS
from ml.src.models.artifacts import ModelArtifact, environment_info, file_sha256
from ml.src.models.base import CandidateSpec, TargetModel
from ml.src.training.calibration import inner_oof_proba, make_calibrator, tune_threshold
from ml.src.training.train import TrainingData, fit_candidate


def fit_final_model(
    target: str,
    spec: CandidateSpec,
    data: TrainingData,
    calibration_method: str = "none",
    use_tuned_threshold: bool = False,
) -> TargetModel:
    """Fit ``spec`` on the whole development set.

    A calibrator and/or tuned threshold, if requested, are fitted on
    out-of-fold development-set scores, never on the model's own training
    predictions and never on the holdout set.
    """
    y = data.y_dev[target]
    pipeline = fit_candidate(spec, data.schema, data.X_dev, y, data.seed)
    calibrator, threshold = None, 0.5
    if calibration_method != "none" or use_tuned_threshold:
        inner_splits = int(data.config["inner_cv"]["n_splits"])
        oof = inner_oof_proba(spec, data.schema, data.X_dev, y, data.seed, inner_splits)
        if calibration_method != "none":
            calibrator = make_calibrator(calibration_method).fit(oof, y)
        if use_tuned_threshold:
            threshold = tune_threshold(y, oof, data.config["threshold"]["objective"])
            if calibrator is not None:
                threshold = float(calibrator.transform(np.array([threshold]))[0])
    return TargetModel(target=target, pipeline=pipeline, calibrator=calibrator, threshold=threshold)


def build_artifact(
    model: TargetModel,
    spec: CandidateSpec,
    data: TrainingData,
    selection: dict[str, Any],
    calibration: dict[str, Any] | None = None,
) -> ModelArtifact:
    """Bundle the fitted model with its SHAP background and descriptive metadata."""
    target = model.target
    preprocess = model.pipeline.named_steps["preprocess"]
    background = np.asarray(preprocess.transform(data.X_dev), dtype=float)
    y_dev, y_test = data.y_dev[target], data.y_test[target]
    dataset_path = resolve_dataset_path()
    metadata = {
        "target": target,
        "target_label": data.schema.targets[target].label,
        "model_version": str(data.config["model_version"]),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "algorithm": spec.algorithm,
        "candidate": spec.to_dict(),
        "decision_threshold": model.threshold,
        "feature_schema": data.schema.to_dict(),
        "feature_names": model.feature_names,
        # Observed on the development set only.
        "feature_statistics": feature_statistics(
            data.X_dev, data.schema, features=data.schema.model_features
        ),
        "forbidden_columns": sorted(FORBIDDEN_COLUMNS),
        "training": {
            "seed": data.seed,
            "dataset_file": dataset_path.name,
            "dataset_sha256": file_sha256(dataset_path),
            "n_development": int(len(y_dev)),
            "n_holdout": int(len(y_test)),
            "development_class_counts": {
                "positive": int(y_dev.sum()),
                "negative": int(len(y_dev) - y_dev.sum()),
            },
            "holdout_class_counts": {
                "positive": int(y_test.sum()),
                "negative": int(len(y_test) - y_test.sum()),
            },
            "holdout_index": [int(i) for i in data.split.test_index],
            "cross_validation": data.config["cross_validation"],
            "environment": environment_info(),
        },
        "selection": {k: v for k, v in selection.items() if k != "cv_summary"},
        "validation": {"cross_validation": selection["cv_summary"]},
        "calibration": calibration
        or {"method": "none", "reason": "Calibration has not been evaluated yet."},
    }
    return ModelArtifact(
        model=model,
        background=background,
        transformed_feature_names=[str(n) for n in preprocess.get_feature_names_out()],
        metadata=metadata,
    )
