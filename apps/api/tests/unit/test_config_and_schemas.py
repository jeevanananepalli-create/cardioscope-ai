import pytest
from pydantic import ValidationError

from apps.api.app.core.config import Settings, _parse_thresholds, get_settings
from apps.api.app.schemas.patient import PatientFeatures, features_to_dict
from ml.src.features.feature_schema import FORBIDDEN_COLUMNS, load_feature_schema


def test_default_risk_bands():
    settings = Settings()
    assert [settings.risk_category(p) for p in (0.0, 0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 1.0)] == [
        "low", "low", "moderate", "moderate", "high", "high", "very_high", "very_high",
    ]
    bands = settings.risk_categories()
    assert bands[0]["min"] == 0.0 and bands[-1]["max"] == 1.0
    assert all(a["max"] == b["min"] for a, b in zip(bands, bands[1:]))


@pytest.mark.parametrize("raw", ["0.5,0.25,0.75", "0.2,0.4", "a,b,c", "0,0.5,0.9", "0.2,0.5,1"])
def test_bad_threshold_configuration_is_rejected(raw):
    with pytest.raises(ValueError):
        _parse_thresholds(raw)


def test_settings_read_from_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("CARDIOSCOPE_RISK_THRESHOLDS", "0.2,0.4,0.6")
    monkeypatch.setenv("CARDIOSCOPE_CORS_ORIGINS", "https://a.example, https://b.example")
    monkeypatch.setenv("CARDIOSCOPE_MODELS_DIR", str(tmp_path))
    settings = get_settings()
    assert settings.risk_thresholds == (0.2, 0.4, 0.6)
    assert settings.cors_origins == ("https://a.example", "https://b.example")
    assert settings.models_dir == tmp_path


def test_patient_schema_is_generated_from_the_feature_schema():
    schema = load_feature_schema()
    aliases = {field.alias for field in PatientFeatures.model_fields.values()}
    assert aliases == {f.name for f in schema.input_features}
    assert aliases.isdisjoint(FORBIDDEN_COLUMNS)
    assert all(field.is_required() for field in PatientFeatures.model_fields.values())


def test_patient_schema_round_trips_dataset_column_names():
    schema = load_feature_schema()
    values = {}
    for spec in schema.input_features:
        if spec.kind == "numeric":
            values[spec.name] = spec.input_limits[0]
        elif spec.kind == "binary":
            values[spec.name] = 0
        else:
            values[spec.name] = spec.categories[0]
    assert features_to_dict(PatientFeatures.model_validate(values)) == values
    with pytest.raises(ValidationError):
        PatientFeatures.model_validate({**values, "Cath": "CAD"})
