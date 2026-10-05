"""Feature schema, feature whitelist and target-leakage blacklist.

The schema in ``ml/configs/features.yaml`` is the whitelist of model inputs.
``FORBIDDEN_COLUMNS`` is the blacklist of target / target-derived columns. It is
defined here in code, not in configuration, so that no config edit can let a
target column into a feature matrix.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping

import yaml

from ml.src.paths import FEATURES_CONFIG

# Target / leakage columns. These must never be model inputs.
FORBIDDEN_COLUMNS: frozenset[str] = frozenset({"LAD", "LCX", "RCA", "Cath"})

TARGET_NAMES: tuple[str, ...] = ("CAD", "LAD", "LCX", "RCA")

FEATURE_KINDS = ("numeric", "binary", "ordinal", "categorical")

_BINARY_TRUE = {"1", "y", "yes", "true"}
_BINARY_FALSE = {"0", "n", "no", "false"}


class LeakageError(ValueError):
    """A forbidden target-derived column was about to be used as a model input."""


class SchemaError(ValueError):
    """The feature schema configuration is invalid."""


def _normalise_name(name: Any) -> str:
    return str(name).strip().casefold()


_FORBIDDEN_NORMALISED = frozenset(_normalise_name(c) for c in FORBIDDEN_COLUMNS)


def is_forbidden(column: Any) -> bool:
    """True if ``column`` is a forbidden column (case and whitespace insensitive)."""
    return _normalise_name(column) in _FORBIDDEN_NORMALISED


def find_forbidden(columns: Iterable[Any]) -> list[str]:
    return [str(c) for c in columns if is_forbidden(c)]


def assert_no_forbidden(columns: Iterable[Any], context: str = "model inputs") -> None:
    """Raise ``LeakageError`` if any forbidden column is present in ``columns``."""
    found = find_forbidden(columns)
    if found:
        raise LeakageError(
            f"Target leakage blocked: forbidden column(s) {sorted(found)} found in {context}. "
            f"{sorted(FORBIDDEN_COLUMNS)} are targets and must never be model inputs."
        )


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    try:
        return bool(math.isnan(value))
    except TypeError:
        return False


def _as_token(value: Any) -> str:
    """String form used for matching: 1.0 -> "1", " Mild " -> "mild"."""
    if isinstance(value, bool):
        return str(value).casefold()
    if isinstance(value, (int, float)) or hasattr(value, "is_integer"):
        try:
            as_float = float(value)
            if as_float.is_integer():
                return str(int(as_float))
        except (TypeError, ValueError):
            pass
    return str(value).strip().casefold()


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    label: str
    group: str
    kind: str
    unit: str | None = None
    categories: tuple[Any, ...] = ()
    aliases: Mapping[str, Any] = field(default_factory=dict)
    excluded: bool = False
    exclusion_reason: str | None = None
    input_limits: tuple[float, float] | None = None
    derived: bool = False

    def canonical(self, value: Any) -> Any:
        """Convert one raw value to its canonical form.

        numeric -> float, binary -> 0/1, ordinal/categorical -> the category as
        listed in the schema. Missing values are returned as ``None``. A value
        that is not a recognised representation raises ``ValueError``; nothing
        is silently coerced.
        """
        if is_missing(value):
            return None
        if self.kind == "numeric":
            if isinstance(value, bool):
                raise ValueError(f"{self.name}: expected a number, got {value!r}")
            try:
                number = float(value)
            except (TypeError, ValueError):
                raise ValueError(f"{self.name}: expected a number, got {value!r}") from None
            if not math.isfinite(number):
                raise ValueError(f"{self.name}: expected a finite number, got {value!r}")
            return number
        token = _as_token(value)
        if self.kind == "binary":
            if token in _BINARY_TRUE:
                return 1
            if token in _BINARY_FALSE:
                return 0
            raise ValueError(f"{self.name}: expected one of 0/1 or N/Y, got {value!r}")
        for raw, target in self.aliases.items():
            if token == _as_token(raw):
                token = _as_token(target)
                break
        for category in self.categories:
            if token == _as_token(category):
                return category
        raise ValueError(
            f"{self.name}: expected one of {list(self.categories)}, got {value!r}"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "group": self.group,
            "kind": self.kind,
            "unit": self.unit,
            "categories": list(self.categories),
            "excluded": self.excluded,
            "exclusion_reason": self.exclusion_reason,
            "input_limits": list(self.input_limits) if self.input_limits else None,
            "derived": self.derived,
        }


@dataclass(frozen=True)
class TargetSpec:
    name: str
    column: str
    positive: str
    negative: str
    label: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "column": self.column,
            "positive": self.positive,
            "negative": self.negative,
            "label": self.label,
        }


@dataclass(frozen=True)
class FeatureSchema:
    features: tuple[FeatureSpec, ...]
    targets: Mapping[str, TargetSpec]

    def __post_init__(self) -> None:
        names = [f.name for f in self.features]
        assert_no_forbidden(names, context="the feature schema")
        duplicates = sorted({n for n in names if names.count(n) > 1})
        if duplicates:
            raise SchemaError(f"Duplicate feature names in schema: {duplicates}")
        for spec in self.features:
            if spec.kind not in FEATURE_KINDS:
                raise SchemaError(f"{spec.name}: unknown kind {spec.kind!r}")
            if spec.kind in ("ordinal", "categorical") and len(spec.categories) < 2:
                raise SchemaError(f"{spec.name}: {spec.kind} feature needs at least 2 categories")
            if spec.input_limits is not None and (
                spec.kind != "numeric" or len(spec.input_limits) != 2
                or spec.input_limits[0] >= spec.input_limits[1]
            ):
                raise SchemaError(f"{spec.name}: input_limits must be [min, max] on a numeric feature")
            if spec.excluded and not spec.exclusion_reason:
                raise SchemaError(f"{spec.name}: excluded feature needs an exclusion_reason")
        if set(self.targets) != set(TARGET_NAMES):
            raise SchemaError(f"Schema targets must be exactly {list(TARGET_NAMES)}")
        for target in self.targets.values():
            if not is_forbidden(target.column):
                raise SchemaError(
                    f"Target column {target.column!r} is not in FORBIDDEN_COLUMNS; "
                    "every target column must be blacklisted."
                )

    @property
    def model_features(self) -> tuple[FeatureSpec, ...]:
        """Whitelisted model inputs, in schema order."""
        return tuple(f for f in self.features if not f.excluded)

    @property
    def feature_names(self) -> list[str]:
        return [f.name for f in self.model_features]

    @property
    def input_features(self) -> tuple[FeatureSpec, ...]:
        """Model inputs a user supplies (everything except derived features)."""
        return tuple(f for f in self.model_features if not f.derived)

    @property
    def excluded_features(self) -> tuple[FeatureSpec, ...]:
        return tuple(f for f in self.features if f.excluded)

    @property
    def target_columns(self) -> list[str]:
        return [t.column for t in self.targets.values()]

    def names_of_kind(self, *kinds: str) -> list[str]:
        return [f.name for f in self.model_features if f.kind in kinds]

    def get(self, name: str) -> FeatureSpec:
        for spec in self.features:
            if spec.name == name:
                return spec
        raise KeyError(name)

    def to_dict(self) -> dict[str, Any]:
        return {
            "features": [f.to_dict() for f in self.features],
            "targets": {name: t.to_dict() for name, t in self.targets.items()},
            "forbidden_columns": sorted(FORBIDDEN_COLUMNS),
        }


def schema_from_dict(config: Mapping[str, Any]) -> FeatureSchema:
    try:
        features = tuple(
            FeatureSpec(
                name=str(item["name"]).strip(),
                label=str(item.get("label", item["name"])),
                group=str(item["group"]),
                kind=str(item["kind"]),
                unit=item.get("unit"),
                categories=tuple(item.get("categories", ())),
                aliases=dict(item.get("aliases", {})),
                excluded=bool(item.get("excluded", False)),
                exclusion_reason=item.get("exclusion_reason"),
                input_limits=tuple(item["input_limits"]) if item.get("input_limits") else None,
                derived=bool(item.get("derived", False)),
            )
            for item in config["features"]
        )
        targets = {
            str(name): TargetSpec(
                name=str(name),
                column=str(item["column"]),
                positive=str(item["positive"]),
                negative=str(item["negative"]),
                label=str(item.get("label", name)),
            )
            for name, item in config["targets"].items()
        }
    except KeyError as exc:
        raise SchemaError(f"Feature schema is missing required key {exc}") from None
    return FeatureSchema(features=features, targets=targets)


def load_feature_schema(path: Path | str = FEATURES_CONFIG) -> FeatureSchema:
    with open(path, encoding="utf-8") as handle:
        return schema_from_dict(yaml.safe_load(handle))
