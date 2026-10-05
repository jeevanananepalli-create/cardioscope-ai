"""Validate the raw dataset against the feature schema."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from ml.src.features.feature_schema import FeatureSchema, is_missing


class DatasetValidationError(ValueError):
    """The dataset does not match the feature schema."""


@dataclass
class ValidationReport:
    n_rows: int
    n_columns: int
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def raise_if_invalid(self) -> None:
        if self.errors:
            raise DatasetValidationError(
                "Dataset failed validation:\n" + "\n".join(f"  - {e}" for e in self.errors)
            )


def _invalid_values(series: pd.Series, spec) -> list:
    invalid = []
    for value in pd.unique(series):
        try:
            spec.canonical(value)
        except ValueError:
            invalid.append(value)
    return invalid


def validate_dataset(frame: pd.DataFrame, schema: FeatureSchema) -> ValidationReport:
    """Check columns, value representations and targets. Does not modify ``frame``."""
    report = ValidationReport(n_rows=len(frame), n_columns=frame.shape[1])
    columns = set(frame.columns)

    if frame.empty:
        report.errors.append("Dataset contains no records.")
        return report

    expected = [f.name for f in schema.features] + schema.target_columns
    missing_columns = [c for c in expected if c not in columns]
    if missing_columns:
        report.errors.append(f"Missing expected column(s): {missing_columns}")
    unexpected = sorted(columns - set(expected))
    if unexpected:
        report.warnings.append(
            f"Column(s) not in the feature schema are ignored: {unexpected}"
        )

    for spec in schema.features:
        if spec.name not in columns:
            continue
        series = frame[spec.name]
        invalid = _invalid_values(series, spec)
        if invalid:
            report.errors.append(
                f"{spec.name} ({spec.kind}): unrecognised value(s) {invalid[:10]}"
            )
        n_missing = int(series.map(is_missing).sum())
        if n_missing:
            report.warnings.append(f"{spec.name}: {n_missing} missing value(s)")
        if spec.excluded:
            continue
        if series.nunique(dropna=True) <= 1:
            report.warnings.append(
                f"{spec.name}: constant in this dataset; consider excluding it in the schema"
            )

    for target in schema.targets.values():
        if target.column not in columns:
            continue
        series = frame[target.column]
        allowed = {target.positive, target.negative}
        bad = [v for v in pd.unique(series) if v not in allowed]
        if bad:
            report.errors.append(
                f"Target {target.name} (column {target.column}): unexpected value(s) {bad[:10]}; "
                f"expected {sorted(allowed)}"
            )
        elif series.nunique() < 2:
            report.errors.append(
                f"Target {target.name} (column {target.column}) has a single class."
            )

    n_duplicates = int(frame.duplicated().sum())
    if n_duplicates:
        report.warnings.append(f"{n_duplicates} fully duplicated row(s)")

    return report
