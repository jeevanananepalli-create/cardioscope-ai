"""Target-leakage tests.

LAD, LCX, RCA and Cath are targets. These tests fail if any of them can reach
a model's input features through the schema, the feature matrix or the
preprocessing pipeline.
"""

import numpy as np
import pytest

from ml.src.data.preprocessing import (
    FeatureMatrixError,
    SchemaCanonicalizer,
    build_feature_matrix,
    build_preprocessor,
    build_target,
)
from ml.src.features.feature_schema import (
    FORBIDDEN_COLUMNS,
    TARGET_NAMES,
    LeakageError,
    find_forbidden,
)

FORBIDDEN = sorted(FORBIDDEN_COLUMNS)

pytestmark = pytest.mark.requires_dataset


def test_forbidden_set_is_lad_lcx_rca_cath():
    assert FORBIDDEN_COLUMNS == {"LAD", "LCX", "RCA", "Cath"}


def test_raw_dataset_really_contains_the_forbidden_columns(raw_df):
    # Guards against the test passing only because the columns were renamed away.
    assert set(FORBIDDEN) <= set(raw_df.columns)


def test_feature_matrix_contains_no_forbidden_column(raw_df, schema):
    features = build_feature_matrix(raw_df, schema)
    assert find_forbidden(features.columns) == []
    assert list(features.columns) == schema.feature_names


def test_feature_matrix_is_whitelist_only(raw_df, schema):
    raw_df["Some New Column"] = 1
    features = build_feature_matrix(raw_df, schema)
    assert set(features.columns) == set(schema.feature_names)


@pytest.mark.parametrize("forbidden", FORBIDDEN)
def test_preprocessor_refuses_to_fit_with_forbidden_column(raw_df, schema, forbidden):
    features = build_feature_matrix(raw_df, schema)
    features[forbidden] = raw_df[forbidden]
    for scale in (False, True):
        with pytest.raises(LeakageError, match=forbidden):
            build_preprocessor(schema, scale=scale).fit(features)


@pytest.mark.parametrize("disguise", [str.lower, str.upper, lambda s: f" {s} "])
@pytest.mark.parametrize("forbidden", FORBIDDEN)
def test_renamed_case_or_padded_forbidden_column_is_still_blocked(
    raw_df, schema, forbidden, disguise
):
    features = build_feature_matrix(raw_df, schema)
    features[disguise(forbidden)] = raw_df[forbidden]
    with pytest.raises(LeakageError):
        SchemaCanonicalizer(schema).fit(features)


def test_preprocessor_refuses_the_raw_frame(raw_df, schema):
    with pytest.raises(LeakageError):
        build_preprocessor(schema).fit(raw_df)


@pytest.mark.parametrize("forbidden", FORBIDDEN)
def test_fitted_preprocessor_refuses_forbidden_column_at_transform(raw_df, schema, forbidden):
    features = build_feature_matrix(raw_df, schema)
    preprocessor = build_preprocessor(schema).fit(features)
    features[forbidden] = raw_df[forbidden]
    with pytest.raises(LeakageError):
        preprocessor.transform(features)


def test_non_whitelisted_column_is_rejected_by_preprocessor(raw_df, schema):
    features = build_feature_matrix(raw_df, schema)
    features["LAD Proximal"] = 1
    with pytest.raises(FeatureMatrixError, match="whitelist"):
        build_preprocessor(schema).fit(features)


def test_transformed_feature_names_derive_only_from_whitelisted_features(raw_df, schema):
    features = build_feature_matrix(raw_df, schema)
    preprocessor = build_preprocessor(schema).fit(features)
    for name in preprocessor.get_feature_names_out():
        assert any(name == f or name.startswith(f"{f}_") for f in schema.feature_names), name
        assert find_forbidden([name]) == []
        assert not any(name.startswith(f"{forbidden}_") for forbidden in FORBIDDEN)


def test_model_inputs_do_not_depend_on_target_columns(raw_df, schema):
    """Scrambling every target column must leave the model inputs unchanged."""
    baseline = build_preprocessor(schema, scale=True).fit_transform(
        build_feature_matrix(raw_df, schema)
    )
    scrambled = raw_df.copy()
    rng = np.random.default_rng(0)
    for column in FORBIDDEN:
        scrambled[column] = rng.permutation(scrambled[column].to_numpy())
    result = build_preprocessor(schema, scale=True).fit_transform(
        build_feature_matrix(scrambled, schema)
    )
    np.testing.assert_array_equal(baseline, result)


@pytest.mark.parametrize("target", TARGET_NAMES)
def test_targets_are_built_from_forbidden_columns_only(raw_df, schema, target):
    y = build_target(raw_df, schema, target)
    spec = schema.targets[target]
    assert spec.column in FORBIDDEN_COLUMNS
    assert set(y.unique()) == {0, 1}
    assert int(y.sum()) == int((raw_df[spec.column] == spec.positive).sum())
