import pytest

from ml.src.data.loader import DatasetNotFoundError, load_raw_dataset
from ml.src.features.feature_schema import load_feature_schema


@pytest.fixture(scope="session")
def schema():
    return load_feature_schema()


@pytest.fixture(scope="session")
def _raw_df_session():
    try:
        return load_raw_dataset()
    except DatasetNotFoundError as exc:
        pytest.skip(f"Real dataset not available: {exc}")


@pytest.fixture
def raw_df(_raw_df_session):
    """A fresh copy of the real dataset; skipped when the file is not present."""
    return _raw_df_session.copy()
