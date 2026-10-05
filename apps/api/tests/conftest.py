import pytest
from fastapi.testclient import TestClient

from apps.api.app.core.config import Settings
from apps.api.app.main import create_app
from ml.src.features.feature_schema import TARGET_NAMES
from ml.src.models.artifacts import ModelNotFoundError, load_artifact
from ml.src.paths import MODELS_DIR


@pytest.fixture(scope="session")
def trained_models():
    """The real trained artifacts; tests needing them are skipped until they exist."""
    try:
        return {target: load_artifact(target, MODELS_DIR) for target in TARGET_NAMES}
    except ModelNotFoundError as exc:
        pytest.skip(str(exc))


@pytest.fixture(scope="session")
def client(trained_models):
    with TestClient(create_app(Settings()), raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def feature_schema(client):
    return client.get("/api/v1/feature-schema").json()


@pytest.fixture
def patient(feature_schema):
    """A valid input built from typical training values (not a real patient record)."""
    return {
        feature["name"]: feature["typical_value"]
        for feature in feature_schema["features"]
        if not feature["derived"]
    }


@pytest.fixture
def empty_client(tmp_path):
    """An API started with no trained models."""
    settings = Settings(models_dir=tmp_path)
    with TestClient(create_app(settings), raise_server_exceptions=False) as test_client:
        yield test_client
