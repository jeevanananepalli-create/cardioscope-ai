import pickle

import numpy as np
import pytest
from sklearn.base import clone

from ml.src.data.preprocessing import (
    FeatureMatrixError,
    SchemaCanonicalizer,
    build_feature_matrix,
    build_preprocessor,
    build_target,
)

pytestmark = pytest.mark.requires_dataset


@pytest.fixture
def features(raw_df, schema):
    return build_feature_matrix(raw_df, schema)


def _expected_width(schema):
    width = len(schema.names_of_kind("numeric", "binary", "ordinal"))
    for name in schema.names_of_kind("categorical"):
        n_categories = len(schema.get(name).categories)
        width += 1 if n_categories == 2 else n_categories
    return width


@pytest.mark.parametrize("scale", [False, True])
def test_output_is_finite_numeric_with_stable_shape(features, schema, scale):
    preprocessor = build_preprocessor(schema, scale=scale)
    matrix = preprocessor.fit_transform(features)
    assert matrix.shape == (len(features), _expected_width(schema))
    assert np.isfinite(matrix).all()
    assert len(preprocessor.get_feature_names_out()) == matrix.shape[1]


def test_missing_feature_column_is_rejected(raw_df, schema):
    with pytest.raises(FeatureMatrixError, match="Age"):
        build_feature_matrix(raw_df.drop(columns=["Age"]), schema)


def test_canonicalizer_normalises_representations(features, schema):
    canonical = SchemaCanonicalizer(schema).fit_transform(features)
    assert set(canonical["Sex"].unique()) == {"Male", "Female"}
    assert set(canonical["Obesity"].unique()) <= {0.0, 1.0}
    assert int(canonical["Obesity"].sum()) == int((features["Obesity"] == "Y").sum())
    assert set(canonical["VHD"].unique()) <= {0.0, 1.0, 2.0, 3.0}
    assert int((canonical["VHD"] == 3.0).sum()) == int((features["VHD"] == "Severe").sum())
    np.testing.assert_array_equal(canonical["Age"], features["Age"].astype(float))


def test_equivalent_binary_encodings_give_identical_output(features, schema):
    preprocessor = build_preprocessor(schema).fit(features)
    recoded = features.copy()
    recoded["DM"] = recoded["DM"].map({1: "Y", 0: "N"})
    recoded["Obesity"] = recoded["Obesity"].map({"Y": 1, "N": 0})
    np.testing.assert_array_equal(
        preprocessor.transform(features), preprocessor.transform(recoded)
    )


def test_column_order_does_not_matter(features, schema):
    preprocessor = build_preprocessor(schema, scale=True).fit(features)
    shuffled = features[list(reversed(features.columns))]
    np.testing.assert_array_equal(
        preprocessor.transform(features), preprocessor.transform(shuffled)
    )


def test_statistics_are_learned_from_the_fit_rows_only(features, schema):
    train, test = features.iloc[:200], features.iloc[200:]
    preprocessor = build_preprocessor(schema, scale=True).fit(train)
    encode = preprocessor.named_steps["encode"]
    numeric = schema.names_of_kind("numeric")
    scaler = encode.named_transformers_["numeric"].named_steps["scale"]
    imputer = encode.named_transformers_["numeric"].named_steps["impute"]
    np.testing.assert_allclose(scaler.mean_, train[numeric].astype(float).mean().to_numpy())
    np.testing.assert_allclose(
        imputer.statistics_, train[numeric].astype(float).median().to_numpy()
    )
    assert not np.allclose(scaler.mean_, features[numeric].astype(float).mean().to_numpy())
    assert np.isfinite(preprocessor.transform(test)).all()


def test_missing_values_are_imputed_from_training_statistics(features, schema):
    preprocessor = build_preprocessor(schema).fit(features)
    names = list(preprocessor.get_feature_names_out())
    row = features.iloc[[0]].copy().astype(object)
    row.loc[:, ["HDL", "DM", "Sex", "VHD"]] = None
    matrix = preprocessor.transform(row)
    assert np.isfinite(matrix).all()
    assert matrix[0, names.index("HDL")] == pytest.approx(features["HDL"].median())
    assert matrix[0, names.index("DM")] == features["DM"].mode()[0]


@pytest.mark.parametrize(
    ("column", "value"),
    [("Age", "old"), ("DM", 3), ("Sex", "Unknown"), ("BBB", "XBBB"), ("Function Class", 9)],
)
def test_invalid_values_are_rejected_not_coerced(features, schema, column, value):
    preprocessor = build_preprocessor(schema).fit(features)
    row = features.iloc[[0]].copy().astype(object)
    row.loc[:, column] = value
    with pytest.raises(FeatureMatrixError, match=column):
        preprocessor.transform(row)


def test_scaling_flag_only_changes_numeric_and_ordinal_columns(features, schema):
    plain = build_preprocessor(schema, scale=False).fit(features)
    scaled = build_preprocessor(schema, scale=True).fit(features)
    names = list(plain.get_feature_names_out())
    assert names == list(scaled.get_feature_names_out())
    a, b = plain.transform(features), scaled.transform(features)
    rescaled = set(schema.names_of_kind("numeric", "ordinal"))
    for index, name in enumerate(names):
        if name in rescaled:
            assert abs(b[:, index].mean()) < 1e-9
        else:
            np.testing.assert_array_equal(a[:, index], b[:, index])


def test_pipeline_is_deterministic_cloneable_and_picklable(features, schema):
    preprocessor = build_preprocessor(schema, scale=True).fit(features)
    expected = preprocessor.transform(features)
    np.testing.assert_array_equal(clone(preprocessor).fit(features).transform(features), expected)
    restored = pickle.loads(pickle.dumps(preprocessor))
    np.testing.assert_array_equal(restored.transform(features), expected)


def test_unfitted_preprocessor_cannot_transform(features, schema):
    with pytest.raises(Exception):
        build_preprocessor(schema).transform(features)


def test_unknown_target_value_is_rejected(raw_df, schema):
    raw_df.loc[0, "LAD"] = "Unclear"
    with pytest.raises(FeatureMatrixError, match="LAD"):
        build_target(raw_df, schema, "LAD")
