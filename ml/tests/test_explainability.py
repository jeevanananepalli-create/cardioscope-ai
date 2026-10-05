import numpy as np
import pytest

from ml.src.explainability.feature_contributions import (
    describe_contribution,
    global_importance,
    patient_contributions,
)
from ml.src.explainability.shap_explainer import ModelExplainer, transformed_feature_origins
from ml.src.features.feature_schema import find_forbidden
from ml.src.models.base import baseline_candidates
from ml.src.training.finalize import build_artifact, fit_final_model
from ml.src.training.train import load_training_data

pytestmark = pytest.mark.requires_dataset

_SELECTION = {"selected": "fixture", "algorithm": "fixture", "reason": "fixture", "cv_summary": {}}
_EXPECTED = {
    "logistic_regression": ("linear", "log_odds"),
    "xgboost": ("tree", "log_odds"),
    "random_forest": ("tree", "probability"),
    "svm": ("kernel", "probability"),
}


@pytest.fixture(scope="module")
def data(_raw_df_session):
    return load_training_data(frame=_raw_df_session.copy())


@pytest.fixture(scope="module", params=baseline_candidates(), ids=lambda c: c.algorithm)
def explainer(request, data):
    spec = request.param
    calibration = "sigmoid" if spec.algorithm == "random_forest" else "none"
    model = fit_final_model("LAD", spec, data, calibration_method=calibration)
    artifact = build_artifact(model, spec, data, _SELECTION)
    return spec, ModelExplainer(
        model, artifact.background, artifact.transformed_feature_names, data.schema, kernel_nsamples=400
    )


def _logit(p):
    return np.log(p / (1 - p))


def test_explainer_type_matches_the_algorithm(explainer):
    spec, model_explainer = explainer
    assert (model_explainer.kind, model_explainer.output_space) == _EXPECTED[spec.algorithm]


def test_contributions_are_reported_per_original_feature(explainer, data):
    _, model_explainer = explainer
    result = model_explainer.explain(data.X_test.iloc[:5])
    assert result.feature_names == data.schema.feature_names
    assert result.values.shape == (5, len(data.schema.feature_names))
    assert find_forbidden(result.feature_names) == []
    assert np.isfinite(result.values).all()


def test_shap_values_add_up_to_the_model_raw_score(explainer, data):
    spec, model_explainer = explainer
    rows = data.X_test.iloc[:8]
    result = model_explainer.explain(rows)
    raw = model_explainer.model.raw_proba(rows)
    expected = _logit(raw) if result.output_space == "log_odds" else raw
    tolerance = 0.02 if spec.algorithm == "svm" else 1e-4
    np.testing.assert_allclose(result.raw_score(), expected, atol=tolerance)


def test_one_hot_columns_are_folded_back_onto_their_feature(data):
    names = ["Age", "Sex_Female", "BBB_N", "BBB_LBBB", "BBB_RBBB", "DM"]
    assert transformed_feature_origins(names, data.schema) == ["Age", "Sex", "BBB", "BBB", "BBB", "DM"]
    with pytest.raises(ValueError):
        transformed_feature_origins(["Cath_CAD"], data.schema)


def test_patient_contributions_are_sorted_and_conservatively_worded(explainer, data):
    _, model_explainer = explainer
    explanation = patient_contributions(model_explainer, data.X_test.iloc[[0]])
    sizes = [abs(c["shap_value"]) for c in explanation["contributions"]]
    assert sizes == sorted(sizes, reverse=True)
    assert len(explanation["contributions"]) == len(data.schema.feature_names)
    assert explanation["target"] == "LAD"
    assert "not causal" in explanation["note"]
    text = " ".join(c["description"] for c in explanation["contributions"]).lower()
    for banned in ("proves", "causes", "caused", "blocked", "blockage", "diagnos", "confirm"):
        assert banned not in text
    top = explanation["contributions"][0]
    assert top["value"] is not None and top["label"]
    with pytest.raises(ValueError):
        patient_contributions(model_explainer, data.X_test.iloc[:2])


def test_explanations_are_reproducible(explainer, data):
    _, model_explainer = explainer
    row = data.X_test.iloc[[3]]
    np.testing.assert_allclose(
        model_explainer.explain(row).values, model_explainer.explain(row).values, atol=1e-12
    )


def test_global_importance_ranks_features_by_mean_absolute_shap(explainer, data):
    spec, model_explainer = explainer
    rows = data.X_dev.iloc[:12] if spec.algorithm == "svm" else data.X_dev
    ranking = global_importance(model_explainer, rows)
    values = [f["mean_abs_shap"] for f in ranking["features"]]
    assert values == sorted(values, reverse=True)
    assert ranking["n_rows"] == len(rows)
    assert {f["feature"] for f in ranking["features"]} == set(data.schema.feature_names)
    direct = np.abs(model_explainer.explain(rows).values).mean(axis=0).max()
    assert values[0] == pytest.approx(direct)


def test_description_wording():
    assert describe_contribution("ST elevation", "LAD", 0.4) == (
        "ST elevation contributes toward a higher predicted LAD risk."
    )
    assert "lower" in describe_contribution("Age", "CAD", -0.1)
    assert "did not change" in describe_contribution("Age", "CAD", 0.0)
