import numpy as np
import pytest

from ml.src.features.feature_engineering import (
    DERIVED_FROM,
    add_derived_features,
    body_mass_index,
    obesity_flag,
)


def test_derived_features_match_the_schema(schema):
    assert {f.name for f in schema.model_features if f.derived} == set(DERIVED_FROM)
    assert set(DERIVED_FROM).isdisjoint(f.name for f in schema.input_features)
    assert len(schema.input_features) == len(schema.model_features) - len(DERIVED_FROM)


def test_add_derived_features():
    completed = add_derived_features({"Weight": 81, "Length": 180, "Age": 50})
    assert completed["BMI"] == pytest.approx(25.0)
    assert completed["Obesity"] == 1 and completed["Age"] == 50
    assert add_derived_features({"Weight": 60, "Length": 170})["Obesity"] == 0


@pytest.mark.requires_dataset
def test_derivation_reproduces_every_dataset_record(raw_df):
    bmi = np.array([body_mass_index(w, h) for w, h in zip(raw_df["Weight"], raw_df["Length"])])
    np.testing.assert_allclose(bmi, raw_df["BMI"].to_numpy(), rtol=1e-12)
    flags = [obesity_flag(v) for v in raw_df["BMI"]]
    assert flags == (raw_df["Obesity"] == "Y").astype(int).tolist()


def test_numeric_features_have_input_limits_covering_the_observed_data(schema, request):
    for spec in schema.names_of_kind("numeric"):
        assert schema.get(spec).input_limits is not None, spec
    raw_df = request.getfixturevalue("raw_df")
    for name in schema.names_of_kind("numeric"):
        low, high = schema.get(name).input_limits
        assert low <= raw_df[name].min() and raw_df[name].max() <= high, name
