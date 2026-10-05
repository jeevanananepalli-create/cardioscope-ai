"""Load the raw Z-Alizadeh Sani (extension) dataset.

The dataset is never committed and never synthesised. If it is not found, a
``DatasetNotFoundError`` explains exactly where to put it.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from ml.src.paths import RAW_DATA_DIR, REPO_ROOT

DEFAULT_DATASET_FILENAME = "extention of Z-Alizadeh sani dataset.xlsx"
DATASET_PATH_ENV = "CARDIOSCOPE_DATASET_PATH"
DATASET_SOURCE_URL = "https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset"

_SUPPORTED_SUFFIXES = (".xlsx", ".xls", ".csv")


class DatasetNotFoundError(FileNotFoundError):
    """The dataset file is not where the pipeline expects it."""


class DatasetFormatError(ValueError):
    """The dataset file exists but could not be read as a table of records."""


def _missing_message(looked_at: Path) -> str:
    try:
        shown = looked_at.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        shown = str(looked_at)
    return (
        f"Dataset not found at '{shown}'.\n"
        "CardioScope AI needs the UCI 'extention of Z-Alizadeh sani dataset'.\n"
        f"  1. Download it from {DATASET_SOURCE_URL}\n"
        "  2. Unzip it.\n"
        f"  3. Place the file at: ml/data/raw/{DEFAULT_DATASET_FILENAME}\n"
        f"Alternatively set the {DATASET_PATH_ENV} environment variable to the file's path.\n"
        "The dataset is not distributed with this repository and is never generated."
    )


def resolve_dataset_path(path: Path | str | None = None) -> Path:
    """Return the dataset path: explicit argument, then env var, then the default."""
    if path is None:
        path = os.environ.get(DATASET_PATH_ENV) or RAW_DATA_DIR / DEFAULT_DATASET_FILENAME
    resolved = Path(path)
    if not resolved.is_file():
        raise DatasetNotFoundError(_missing_message(resolved))
    if resolved.suffix.lower() not in _SUPPORTED_SUFFIXES:
        raise DatasetFormatError(
            f"Unsupported dataset file type '{resolved.suffix}'. "
            f"Expected one of {list(_SUPPORTED_SUFFIXES)}."
        )
    return resolved


def load_raw_dataset(path: Path | str | None = None) -> pd.DataFrame:
    """Load the raw dataset exactly as supplied (column names whitespace-trimmed).

    For Excel workbooks the first sheet that contains records is used; the
    supplied workbook also carries a header-only sheet, which is skipped.
    """
    resolved = resolve_dataset_path(path)
    if resolved.suffix.lower() == ".csv":
        frame = pd.read_csv(resolved)
    else:
        sheets = pd.read_excel(resolved, sheet_name=None)
        frame = next((df for df in sheets.values() if len(df) > 0), None)
        if frame is None:
            raise DatasetFormatError(f"No sheet in '{resolved.name}' contains any records.")
    if frame.empty:
        raise DatasetFormatError(f"'{resolved.name}' contains no records.")
    frame = frame.copy()
    frame.columns = [str(c).strip() for c in frame.columns]
    return frame.reset_index(drop=True)
