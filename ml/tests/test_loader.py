import pytest

from ml.src.data.loader import (
    DATASET_PATH_ENV,
    DEFAULT_DATASET_FILENAME,
    DatasetFormatError,
    DatasetNotFoundError,
    load_raw_dataset,
    resolve_dataset_path,
)


def test_missing_dataset_gives_actionable_setup_error(tmp_path):
    with pytest.raises(DatasetNotFoundError) as excinfo:
        load_raw_dataset(tmp_path / "nope.xlsx")
    message = str(excinfo.value)
    assert "ml/data/raw/" in message
    assert DEFAULT_DATASET_FILENAME in message
    assert DATASET_PATH_ENV in message


def test_env_var_overrides_default_path(tmp_path, monkeypatch):
    monkeypatch.setenv(DATASET_PATH_ENV, str(tmp_path / "elsewhere.xlsx"))
    with pytest.raises(DatasetNotFoundError, match="elsewhere.xlsx"):
        resolve_dataset_path()


def test_unsupported_file_type_is_rejected(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("{}")
    with pytest.raises(DatasetFormatError):
        resolve_dataset_path(path)


def test_empty_csv_is_rejected(tmp_path):
    path = tmp_path / "empty.csv"
    path.write_text("Age,Sex\n")
    with pytest.raises(DatasetFormatError):
        load_raw_dataset(path)


@pytest.mark.requires_dataset
def test_real_dataset_loads_with_expected_columns(raw_df, schema):
    assert len(raw_df) > 0
    expected = {f.name for f in schema.features} | set(schema.target_columns)
    assert expected <= set(raw_df.columns)
    assert all(c == c.strip() for c in raw_df.columns)
