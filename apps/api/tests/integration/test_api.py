import json
import logging
import math

import pandas as pd
import pytest

from apps.api.app.core.config import DISCLAIMER, Settings
from apps.api.app.core.logging import LOGGER_NAME
from apps.api.app.main import create_app
from apps.api.app.services import prediction_service
from fastapi.testclient import TestClient
from ml.src.features.feature_engineering import add_derived_features
from ml.src.features.feature_schema import FORBIDDEN_COLUMNS, is_forbidden
from ml.src.paths import METRICS_DIR

API = "/api/v1"
TARGETS = ("CAD", "LAD", "LCX", "RCA")


def _predict(client, features):
    return client.post(f"{API}/predict", json={"features": features})


def _outputs(body):
    return {"CAD": body["cad"], **body["vessels"]}


# --- health, schema, model info ---------------------------------------------------------


def test_health_reports_all_models_loaded(client):
    body = client.get(f"{API}/health").json()
    assert body["status"] == "ok"
    assert body["models"] == {t: True for t in TARGETS}
    assert body["model_version"]


def test_feature_schema_lists_model_inputs_without_targets(feature_schema):
    names = [f["name"] for f in feature_schema["features"]]
    assert len(names) == 54
    assert not [n for n in names if is_forbidden(n)]
    derived = {f["name"] for f in feature_schema["features"] if f["derived"]}
    assert derived == {"BMI", "Obesity"}
    age = next(f for f in feature_schema["features"] if f["name"] == "Age")
    assert age["kind"] == "numeric" and age["input_limits"] == [18, 110]
    assert age["observed"]["min"] <= age["typical_value"] <= age["observed"]["max"]
    assert {g["key"] for g in feature_schema["groups"]} == {f["group"] for f in feature_schema["features"]}
    assert [f["name"] for f in feature_schema["excluded_features"]] == ["Exertional CP"]


def test_model_info_serves_the_generated_metrics(client):
    body = client.get(f"{API}/model-info").json()
    published = json.loads((METRICS_DIR / "model_metrics.json").read_text(encoding="utf-8"))
    assert set(body["targets"]) == set(TARGETS)
    for target in TARGETS:
        served = body["targets"][target]
        assert served["holdout"]["metrics"] == published[target]["holdout"]["metrics"]
        assert served["cross_validation"] == published[target]["cross_validation"]
        assert served["decision_threshold"] == published[target]["decision_threshold"]
        assert served["global_importance"]["features"]
    assert [c["key"] for c in body["risk_categories"]] == ["low", "moderate", "high", "very_high"]
    assert "not clinically validated" in body["risk_category_note"]
    assert body["disclaimer"] == DISCLAIMER


def test_responses_do_not_expose_paths_hashes_or_row_indices(client, patient):
    texts = [
        client.get(f"{API}/model-info").text,
        client.get(f"{API}/feature-schema").text,
        _predict(client, patient).text,
        client.post(f"{API}/explain", json={"features": patient}).text,
    ]
    for text in texts:
        for leak in ("C:\\\\", "site-packages", ".joblib", "sha256", "holdout_index", "Traceback", "ml/models"):
            assert leak not in text, leak


# --- prediction -------------------------------------------------------------------------


def test_predict_returns_four_consistent_outputs(client, patient):
    response = _predict(client, patient)
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"] and body["timestamp"]
    assert body["disclaimer"] == DISCLAIMER
    assert set(body["vessels"]) == {"LAD", "LCX", "RCA"}
    bands = {c["key"]: c for c in client.get(f"{API}/model-info").json()["risk_categories"]}
    for target, output in _outputs(body).items():
        assert output["target"] == target
        assert 0.0 <= output["probability"] <= 1.0
        assert output["predicted_class"] == int(output["probability"] >= output["decision_threshold"])
        band = bands[output["risk_category"]]
        assert band["min"] <= output["probability"] <= band["max"]
        assert output["predicted_label"].startswith("Model predicts")
        assert "diagnos" not in json.dumps(output).lower()


def test_api_prediction_equals_the_saved_pipeline_prediction(client, patient, trained_models):
    """Inference uses the serialized training pipeline, with no separate preprocessing."""
    body = _predict(client, patient).json()
    frame = pd.DataFrame([add_derived_features(patient)])[trained_models["CAD"].model.feature_names]
    for target, output in _outputs(body).items():
        expected = float(trained_models[target].model.predict_proba(frame)[0])
        assert output["probability"] == pytest.approx(expected, abs=1e-12)


def test_predict_is_deterministic(client, patient):
    first, second = _predict(client, patient).json(), _predict(client, patient).json()
    assert _outputs(first) == _outputs(second)


def test_bmi_and_obesity_are_derived_from_weight_and_height(client, patient):
    patient.update(Weight=81, Length=180)
    body = _predict(client, patient).json()
    assert body["derived_features"]["BMI"] == pytest.approx(25.0)
    assert body["derived_features"]["Obesity"] == 1


def test_changing_an_input_changes_the_prediction(client, patient):
    baseline = _predict(client, patient).json()["cad"]["probability"]
    patient["Typical Chest Pain"] = 1 - patient["Typical Chest Pain"]
    assert _predict(client, patient).json()["cad"]["probability"] != baseline


def test_value_outside_training_range_is_accepted_with_a_warning(client, patient):
    patient["Age"] = 100
    body = _predict(client, patient).json()
    assert [w["field"] for w in body["warnings"]] == ["Age"]
    assert "extrapolating" in body["warnings"][0]["message"]


def test_typical_input_has_no_warnings(client, patient):
    assert _predict(client, patient).json()["warnings"] == []


# --- validation -------------------------------------------------------------------------


def _error(response, status=422):
    assert response.status_code == status
    body = response.json()
    assert set(body) == {"error"}
    return body["error"]


def test_missing_field_is_reported_by_name(client, patient):
    del patient["Age"]
    error = _error(_predict(client, patient))
    assert error["code"] == "INVALID_INPUT"
    assert "incomplete" in error["message"]
    assert error["details"] == [{"field": "Age", "message": "This field is required."}]


def test_empty_patient_lists_every_missing_field(client, patient):
    error = _error(_predict(client, {}))
    assert {d["field"] for d in error["details"]} == set(patient)


@pytest.mark.parametrize(
    ("field", "value", "fragment"),
    [
        ("Age", 500, "at most 110"),
        ("Age", -4, "at least 18"),
        ("BP", "high", "number"),
        ("BP", None, "expected type"),
        ("Age", True, "expected type"),
        ("DM", 2, "one of"),
        ("DM", True, "one of"),
        ("DM", "Y", "one of"),
        ("Sex", "Unknown", "one of"),
        ("Sex", "Fmale", "one of"),
        ("Function Class", 9, "one of"),
        ("VHD", "mild", "one of"),
    ],
)
def test_invalid_values_are_rejected_not_coerced(client, patient, field, value, fragment):
    patient[field] = value
    error = _error(_predict(client, patient))
    assert [d["field"] for d in error["details"]] == [field]
    assert fragment in error["details"][0]["message"]


def test_non_finite_number_is_rejected(client, patient):
    body = json.dumps({"features": {**patient, "BP": 1}}).replace('"BP": 1', '"BP": NaN')
    response = client.post(f"{API}/predict", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize("forbidden", sorted(FORBIDDEN_COLUMNS))
def test_target_columns_are_rejected_as_inputs(client, patient, forbidden):
    """Leakage prevention at the API boundary (spec section 22)."""
    patient[forbidden] = "Stenotic"
    error = _error(_predict(client, patient))
    assert error["details"] == [{"field": forbidden, "message": "This field is not accepted."}]


@pytest.mark.parametrize("field", ["BMI", "Obesity", "Exertional CP", "Something Else"])
def test_derived_excluded_and_unknown_fields_are_rejected(client, patient, field):
    patient[field] = 1
    assert _error(_predict(client, patient))["details"][0]["field"] == field


def test_malformed_json_gives_a_clean_error(client):
    response = client.post(
        f"{API}/predict", content="{not json", headers={"Content-Type": "application/json"}
    )
    assert _error(response)["code"] == "INVALID_INPUT"


def test_unknown_route_uses_the_error_envelope(client):
    assert _error(client.get(f"{API}/nope"), 404)["code"] == "NOT_FOUND"


# --- explanation ------------------------------------------------------------------------


def test_explain_returns_contributions_for_all_four_models(client, patient):
    response = client.post(f"{API}/explain", json={"features": patient})
    assert response.status_code == 200
    body = response.json()
    assert set(body["explanations"]) == set(TARGETS)
    assert "not causal" in body["note"]
    for target, explanation in body["explanations"].items():
        contributions = explanation["contributions"]
        assert len(contributions) == explanation["n_features"] == 54
        assert not [c for c in contributions if is_forbidden(c["feature"])]
        sizes = [abs(c["shap_value"]) for c in contributions]
        assert sizes == sorted(sizes, reverse=True)
        total = explanation["base_value"] + sum(c["shap_value"] for c in contributions)
        assert total == pytest.approx(explanation["raw_score"], abs=1e-6)
        text = " ".join(c["description"] for c in contributions).lower()
        for banned in ("proves", "cause", "blocked", "blockage", "diagnos", "confirm"):
            assert banned not in text


def test_explanation_agrees_with_the_prediction(client, patient, trained_models):
    explanations = client.post(f"{API}/explain", json={"features": patient}).json()["explanations"]
    frame = pd.DataFrame([add_derived_features(patient)])[trained_models["CAD"].model.feature_names]
    for target, explanation in explanations.items():
        raw = float(trained_models[target].model.raw_proba(frame)[0])
        score = explanation["raw_score"]
        implied = 1 / (1 + math.exp(-score)) if explanation["output_space"] == "log_odds" else score
        assert implied == pytest.approx(raw, abs=1e-4)


def test_explain_supports_target_subset_and_top_k(client, patient):
    body = client.post(
        f"{API}/explain", json={"features": patient, "targets": ["LAD"], "top_k": 5}
    ).json()
    assert list(body["explanations"]) == ["LAD"]
    assert len(body["explanations"]["LAD"]["contributions"]) == 5
    assert body["explanations"]["LAD"]["n_features"] == 54


def test_explain_validates_like_predict(client, patient):
    del patient["Sex"]
    assert _error(client.post(f"{API}/explain", json={"features": patient}))["details"][0]["field"] == "Sex"
    patient["Sex"] = "Male"
    assert _error(client.post(f"{API}/explain", json={"features": patient, "targets": ["XYZ"]}))


def test_explanation_failure_is_reported_cleanly(client, patient, monkeypatch):
    registry = client.app.state.registry
    monkeypatch.setattr(registry.explainers["CAD"], "explain", lambda frame: 1 / 0)
    error = _error(client.post(f"{API}/explain", json={"features": patient}), 500)
    assert error["code"] == "EXPLANATION_FAILED"
    assert "ZeroDivision" not in json.dumps(error)
    assert _predict(client, patient).status_code == 200


# --- failure modes ----------------------------------------------------------------------


def test_api_starts_and_reports_degraded_without_models(empty_client):
    body = empty_client.get(f"{API}/health").json()
    assert body["status"] == "degraded"
    assert body["models"] == {t: False for t in TARGETS}
    info = empty_client.get(f"{API}/model-info")
    assert info.status_code == 200 and info.json()["targets"] == {}


def test_predict_without_models_returns_503_with_instructions(empty_client, patient):
    for path in ("predict", "explain"):
        error = _error(empty_client.post(f"{API}/{path}", json={"features": patient}), 503)
        assert error["code"] == "MODEL_UNAVAILABLE"
        assert "train_all" in error["message"]
        assert {d["field"] for d in error["details"]} == set(TARGETS)


def test_unexpected_error_does_not_leak_details(client, patient, monkeypatch):
    def explode(*args, **kwargs):
        raise RuntimeError("secret internal detail /var/secret/path")

    monkeypatch.setattr(prediction_service, "predict_target", explode)
    error = _error(_predict(client, patient), 500)
    assert error["code"] == "INTERNAL_ERROR"
    assert "secret" not in json.dumps(error) and "Traceback" not in json.dumps(error)


def test_patient_values_are_not_logged(client, patient):
    records = []
    handler = logging.Handler()
    handler.emit = lambda record: records.append(record.getMessage())
    logger = logging.getLogger(LOGGER_NAME)
    logger.addHandler(handler)
    try:
        patient.update(Age=77, TG=987)
        _predict(client, patient)
        client.post(f"{API}/explain", json={"features": patient})
    finally:
        logger.removeHandler(handler)
    assert any("/api/v1/predict" in message for message in records)
    joined = " ".join(records)
    assert "987" not in joined and "features" not in joined


def test_risk_thresholds_are_configurable(trained_models, patient):
    settings = Settings(risk_thresholds=(0.001, 0.002, 0.003))
    with TestClient(create_app(settings)) as custom:
        body = _predict(custom, patient).json()
        assert all(o["risk_category"] == "very_high" for o in _outputs(body).values())
        bands = custom.get(f"{API}/model-info").json()["risk_categories"]
        assert [b["max"] for b in bands] == [0.001, 0.002, 0.003, 1.0]


# --- performance ------------------------------------------------------------------------


def test_prediction_and_explanation_are_fast_enough_for_interactive_use(client, patient):
    """Generous ceilings (several times the measured medians) to catch regressions, not noise."""
    import statistics
    import time

    def median_ms(path):
        timings = []
        for _ in range(12):
            started = time.perf_counter()
            assert client.post(f"{API}/{path}", json={"features": patient}).status_code == 200
            timings.append((time.perf_counter() - started) * 1000)
        return statistics.median(timings[2:])

    assert median_ms("predict") < 600
    assert median_ms("explain") < 1200


def test_large_responses_are_compressed(client):
    response = client.get(f"{API}/model-info", headers={"Accept-Encoding": "gzip"})
    assert response.headers.get("content-encoding") == "gzip"
    assert response.json()["targets"]
