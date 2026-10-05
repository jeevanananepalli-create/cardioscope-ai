import copy

import pytest
import yaml

from ml.src.features.feature_schema import (
    FORBIDDEN_COLUMNS,
    TARGET_NAMES,
    LeakageError,
    SchemaError,
    assert_no_forbidden,
    is_forbidden,
    schema_from_dict,
)
from ml.src.paths import FEATURES_CONFIG


@pytest.fixture
def config():
    with open(FEATURES_CONFIG, encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def test_forbidden_columns_are_exactly_the_four_targets():
    assert FORBIDDEN_COLUMNS == frozenset({"LAD", "LCX", "RCA", "Cath"})


def test_schema_has_four_targets_backed_by_forbidden_columns(schema):
    assert tuple(schema.targets) == TARGET_NAMES
    assert set(schema.target_columns) == set(FORBIDDEN_COLUMNS)


def test_schema_features_contain_no_forbidden_column(schema):
    assert not [f.name for f in schema.features if is_forbidden(f.name)]
    assert_no_forbidden(schema.feature_names)


def test_excluded_features_are_not_model_features(schema):
    excluded = {f.name for f in schema.excluded_features}
    assert excluded
    assert excluded.isdisjoint(schema.feature_names)
    assert all(f.exclusion_reason for f in schema.excluded_features)


@pytest.mark.parametrize("name", ["LAD", "LCX", "RCA", "Cath", "cath", " lad ", "Rca"])
def test_forbidden_matching_ignores_case_and_whitespace(name):
    assert is_forbidden(name)
    with pytest.raises(LeakageError):
        assert_no_forbidden(["Age", name])


@pytest.mark.parametrize("forbidden", sorted(FORBIDDEN_COLUMNS))
def test_schema_with_forbidden_feature_cannot_be_built(config, forbidden):
    bad = copy.deepcopy(config)
    bad["features"].append({"name": forbidden, "group": "echo", "kind": "binary"})
    with pytest.raises(LeakageError):
        schema_from_dict(bad)


def test_target_column_must_be_blacklisted(config):
    bad = copy.deepcopy(config)
    bad["targets"]["CAD"]["column"] = "Age"
    with pytest.raises(SchemaError):
        schema_from_dict(bad)


def test_duplicate_feature_is_rejected(config):
    bad = copy.deepcopy(config)
    bad["features"].append(copy.deepcopy(bad["features"][0]))
    with pytest.raises(SchemaError):
        schema_from_dict(bad)


def test_canonical_binary(schema):
    spec = schema.get("DM")
    assert [spec.canonical(v) for v in (1, 0, "Y", "n", 1.0, "1")] == [1, 0, 1, 0, 1, 1]
    assert spec.canonical(None) is None
    assert spec.canonical(float("nan")) is None
    for bad in (2, "maybe", 0.5):
        with pytest.raises(ValueError):
            spec.canonical(bad)


def test_canonical_categorical_normalises_known_spellings(schema):
    assert schema.get("Sex").canonical("Fmale") == "Female"
    assert schema.get("Sex").canonical(" male ") == "Male"
    assert schema.get("VHD").canonical("mild") == "Mild"
    with pytest.raises(ValueError):
        schema.get("Sex").canonical("unknown")


def test_canonical_ordinal_and_numeric(schema):
    assert schema.get("Function Class").canonical(2.0) == 2
    with pytest.raises(ValueError):
        schema.get("Function Class").canonical(7)
    assert schema.get("Age").canonical("54") == 54.0
    for bad in ("old", True, float("inf")):
        with pytest.raises(ValueError):
            schema.get("Age").canonical(bad)
