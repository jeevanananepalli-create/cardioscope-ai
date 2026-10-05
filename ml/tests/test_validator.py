import numpy as np
import pytest

from ml.src.data.profile import class_distribution, dataset_summary, missing_value_report
from ml.src.data.validator import DatasetValidationError, validate_dataset

pytestmark = pytest.mark.requires_dataset


def test_real_dataset_passes_validation(raw_df, schema):
    report = validate_dataset(raw_df, schema)
    assert report.ok, report.errors
    assert report.n_rows == len(raw_df)


def test_every_dataset_column_is_accounted_for(raw_df, schema):
    known = {f.name for f in schema.features} | set(schema.target_columns)
    assert set(raw_df.columns) == known


def test_excluded_constant_features_really_are_constant(raw_df, schema):
    for spec in schema.excluded_features:
        assert raw_df[spec.name].nunique() == 1, spec.name


def test_missing_column_is_an_error(raw_df, schema):
    report = validate_dataset(raw_df.drop(columns=["Age"]), schema)
    assert not report.ok
    with pytest.raises(DatasetValidationError, match="Age"):
        report.raise_if_invalid()


def test_unrecognised_category_is_an_error(raw_df, schema):
    raw_df.loc[0, "Sex"] = "Unknown"
    report = validate_dataset(raw_df, schema)
    assert any("Sex" in e for e in report.errors)


def test_non_numeric_measurement_is_an_error(raw_df, schema):
    raw_df["BP"] = raw_df["BP"].astype(object)
    raw_df.loc[0, "BP"] = "high"
    report = validate_dataset(raw_df, schema)
    assert any("BP" in e for e in report.errors)


def test_bad_target_value_is_an_error(raw_df, schema):
    raw_df.loc[0, "Cath"] = "Maybe"
    report = validate_dataset(raw_df, schema)
    assert any("CAD" in e for e in report.errors)


def test_missing_values_are_reported_not_rejected(raw_df, schema):
    raw_df["HDL"] = raw_df["HDL"].astype(float)
    raw_df.loc[:2, "HDL"] = np.nan
    report = validate_dataset(raw_df, schema)
    assert report.ok
    assert any("HDL: 3 missing" in w for w in report.warnings)
    missing = missing_value_report(raw_df).set_index("column")
    assert missing.loc["HDL", "n_missing"] == 3


def test_class_distribution_matches_raw_counts(raw_df, schema):
    distribution = class_distribution(raw_df, schema)
    assert set(distribution) == {"CAD", "LAD", "LCX", "RCA"}
    for name, target in schema.targets.items():
        info = distribution[name]
        assert info["n_positive"] == int((raw_df[target.column] == target.positive).sum())
        assert info["n_positive"] + info["n_negative"] == len(raw_df)


def test_dataset_summary_counts(raw_df, schema):
    summary = dataset_summary(raw_df, schema)
    assert summary["n_rows"] == len(raw_df)
    assert summary["n_model_features"] == len(schema.feature_names)
    assert set(summary["features"]) == {f.name for f in schema.features}
