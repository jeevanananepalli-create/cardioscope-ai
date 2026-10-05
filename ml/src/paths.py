"""Canonical repository paths used by the ML pipeline."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"

CONFIG_DIR = ML_ROOT / "configs"
FEATURES_CONFIG = CONFIG_DIR / "features.yaml"

DATA_DIR = ML_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"

MODELS_DIR = ML_ROOT / "models"

REPORTS_DIR = ML_ROOT / "reports"
METRICS_DIR = REPORTS_DIR / "metrics"
FIGURES_DIR = REPORTS_DIR / "figures"
MODEL_COMPARISON_DIR = REPORTS_DIR / "model_comparison"

DOCS_DIR = REPO_ROOT / "docs"
DATA_DICTIONARY_MD = DOCS_DIR / "dataset" / "data-dictionary.md"
