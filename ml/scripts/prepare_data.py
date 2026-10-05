"""Inspect and validate the dataset, then write the data dictionary and dataset reports.

Usage (from the repository root):
    python -m ml.scripts.prepare_data
"""

from __future__ import annotations

import json
import sys

from ml.src.data.loader import DatasetFormatError, DatasetNotFoundError, load_raw_dataset, resolve_dataset_path
from ml.src.data.profile import (
    class_distribution,
    dataset_summary,
    missing_value_report,
    render_data_dictionary,
)
from ml.src.data.validator import DatasetValidationError, validate_dataset
from ml.src.features.feature_schema import load_feature_schema
from ml.src.paths import DATA_DICTIONARY_MD, METRICS_DIR, REPO_ROOT


def _write_json(path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    try:
        source = resolve_dataset_path()
        frame = load_raw_dataset(source)
    except (DatasetNotFoundError, DatasetFormatError) as exc:
        print(f"SETUP ERROR\n{exc}", file=sys.stderr)
        return 2

    schema = load_feature_schema()
    report = validate_dataset(frame, schema)
    for warning in report.warnings:
        print(f"warning: {warning}")
    try:
        report.raise_if_invalid()
    except DatasetValidationError as exc:
        print(exc, file=sys.stderr)
        return 1

    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DICTIONARY_MD.parent.mkdir(parents=True, exist_ok=True)

    summary = dataset_summary(frame, schema)
    classes = class_distribution(frame, schema)
    _write_json(METRICS_DIR / "dataset_summary.json", summary)
    _write_json(METRICS_DIR / "class_distribution.json", classes)
    missing_value_report(frame).to_csv(METRICS_DIR / "missing_values.csv", index=False)
    DATA_DICTIONARY_MD.write_text(
        render_data_dictionary(frame, schema, source.name), encoding="utf-8"
    )

    print(f"Dataset: {source.name}: {summary['n_rows']} rows x {summary['n_columns']} columns")
    print(f"Model input features: {summary['n_model_features']} {summary['model_features_by_kind']}")
    print(f"Missing cells: {summary['n_missing_cells']}, duplicate rows: {summary['n_duplicate_rows']}")
    for name, info in classes.items():
        print(
            f"  {name}: {info['n_positive']} positive / {info['n_negative']} negative "
            f"(positive rate {info['positive_rate']:.3f}, imbalance ratio {info['imbalance_ratio']})"
        )
    for path in (
        METRICS_DIR / "dataset_summary.json",
        METRICS_DIR / "class_distribution.json",
        METRICS_DIR / "missing_values.csv",
        DATA_DICTIONARY_MD,
    ):
        print(f"wrote {path.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
