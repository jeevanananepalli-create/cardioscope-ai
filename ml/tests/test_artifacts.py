import json

import numpy as np
import pytest

from ml.src.features.feature_schema import FORBIDDEN_COLUMNS, TARGET_NAMES, find_forbidden
from ml.src.models.artifacts import (
    METADATA_FILENAME,
    MODEL_FILENAME,
    ModelNotFoundError,
    load_artifact,
    save_artifact,
)
from ml.src.models.base import load_candidates
from ml.src.paths import MODELS_DIR
from ml.src.training.finalize import build_artifact, fit_final_model
from ml.src.training.train import load_training_data

pytestmark = pytest.mark.requires_dataset

_SELECTION = {
    "selected": "logistic_regression[C=0.1|weights=none]",
    "algorithm": "logistic_regression",
    "reason": "test fixture",
    "cv_summary": {},
}


@pytest.fixture(scope="module")
def data(_raw_df_session):
    return load_training_data(frame=_raw_df_session.copy())


@pytest.fixture(scope="module")
def saved(data, tmp_path_factory):
    models_dir = tmp_path_factory.mktemp("models")
    spec = next(c for c in load_candidates() if c.name == _SELECTION["selected"])
    model = fit_final_model("RCA", spec, data)
    save_artifact(build_artifact(model, spec, data, _SELECTION), models_dir)
    return models_dir, model


def test_missing_artifact_gives_actionable_error(tmp_path):
    with pytest.raises(ModelNotFoundError, match="train_all"):
        load_artifact("CAD", tmp_path)


def test_artifact_round_trip_reproduces_predictions(saved, data):
    models_dir, model = saved
    loaded = load_artifact("RCA", models_dir)
    np.testing.assert_array_equal(
        loaded.model.predict_proba(data.X_test), model.predict_proba(data.X_test)
    )
    assert loaded.background.shape == (len(data.X_dev), len(loaded.transformed_feature_names))


def test_artifact_bundles_preprocessing_with_the_model(saved, data):
    models_dir, _ = saved
    loaded = load_artifact("RCA", models_dir)
    assert list(loaded.model.pipeline.named_steps) == ["preprocess", "model"]
    # Raw, un-preprocessed rows go straight in: there is no separate inference preprocessing.
    assert loaded.model.predict_proba(data.X_test.iloc[[0]]).shape == (1,)


def test_metadata_describes_the_model(saved, data):
    models_dir, _ = saved
    metadata = json.loads((models_dir / "rca" / METADATA_FILENAME).read_text(encoding="utf-8"))
    assert (models_dir / "rca" / MODEL_FILENAME).is_file()
    for key in ("target", "model_version", "created_at", "candidate", "feature_schema",
                "feature_names", "training", "selection", "validation", "calibration"):
        assert key in metadata, key
    assert metadata["feature_names"] == data.schema.feature_names
    assert find_forbidden(metadata["feature_names"]) == []
    assert metadata["training"]["n_development"] == len(data.X_dev)
    assert metadata["training"]["n_holdout"] == len(data.X_test)
    assert len(metadata["training"]["dataset_sha256"]) == 64
    assert set(metadata["feature_statistics"]) == set(data.schema.feature_names)


@pytest.mark.parametrize("target", TARGET_NAMES)
def test_trained_artifacts_on_disk_have_no_forbidden_inputs(target):
    """Spec section 22, applied to the real trained artifacts when they exist."""
    try:
        artifact = load_artifact(target, MODELS_DIR)
    except ModelNotFoundError:
        pytest.skip(f"{target} model has not been trained yet")
    assert find_forbidden(artifact.model.feature_names) == []
    assert find_forbidden(artifact.metadata["feature_names"]) == []
    for name in artifact.transformed_feature_names:
        assert not any(name == f or name.startswith(f"{f}_") for f in FORBIDDEN_COLUMNS), name
