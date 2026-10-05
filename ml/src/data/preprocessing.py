"""Reusable preprocessing pipeline shared by training and inference.

The whole of preprocessing is one scikit-learn ``Pipeline``:

    canonicalize (SchemaCanonicalizer) -> encode (ColumnTransformer)

It is fitted inside each training fold and serialized with the model, so
inference always runs exactly the preprocessing that was fitted in training.

Leakage is blocked at two points here (and a third time when the schema is
built): ``build_feature_matrix`` selects whitelisted columns only, and
``SchemaCanonicalizer`` refuses to fit or transform a frame that contains a
forbidden column or any column outside the whitelist.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.utils.validation import check_is_fitted

from ml.src.features.feature_schema import FeatureSchema, assert_no_forbidden


class FeatureMatrixError(ValueError):
    """The input frame cannot be turned into a valid feature matrix."""


def build_feature_matrix(frame: pd.DataFrame, schema: FeatureSchema) -> pd.DataFrame:
    """Select the whitelisted model inputs from a raw frame.

    Only columns named in the schema whitelist are returned, in schema order.
    Targets and any other columns in ``frame`` are left behind.
    """
    names = schema.feature_names
    assert_no_forbidden(names, context="the feature whitelist")
    missing = [n for n in names if n not in frame.columns]
    if missing:
        raise FeatureMatrixError(f"Missing required feature column(s): {missing}")
    features = frame.loc[:, names].copy()
    assert_no_forbidden(features.columns, context="the feature matrix")
    return features


def build_target(frame: pd.DataFrame, schema: FeatureSchema, target_name: str) -> pd.Series:
    """Return the binary target (1 = positive class) for ``target_name``."""
    target = schema.targets[target_name]
    series = frame[target.column]
    unknown = sorted(set(pd.unique(series)) - {target.positive, target.negative}, key=str)
    if unknown:
        raise FeatureMatrixError(
            f"Target {target_name}: unexpected value(s) {unknown} in column {target.column!r}"
        )
    return (series == target.positive).astype(int).rename(target_name)


class SchemaCanonicalizer(BaseEstimator, TransformerMixin):
    """Validate columns against the whitelist and convert values to canonical form.

    numeric -> float, binary -> 0/1, ordinal -> level index, categorical ->
    canonical category string. Missing values become NaN. Unrecognised values
    raise ``FeatureMatrixError``; they are never coerced.
    """

    def __init__(self, schema: FeatureSchema):
        self.schema = schema

    def _check_columns(self, X) -> None:
        if not isinstance(X, pd.DataFrame):
            raise FeatureMatrixError(
                "Preprocessing needs a pandas DataFrame with named feature columns."
            )
        assert_no_forbidden(X.columns, context="the preprocessing input")
        expected = self.schema.feature_names
        missing = [n for n in expected if n not in X.columns]
        if missing:
            raise FeatureMatrixError(f"Missing required feature column(s): {missing}")
        extra = [c for c in X.columns if c not in expected]
        if extra:
            raise FeatureMatrixError(
                f"Column(s) {extra} are not in the feature whitelist and cannot be model inputs."
            )

    def fit(self, X, y=None):
        self._check_columns(X)
        self.feature_names_in_ = np.asarray(self.schema.feature_names, dtype=object)
        self.n_features_in_ = len(self.feature_names_in_)
        return self

    def transform(self, X) -> pd.DataFrame:
        check_is_fitted(self, "feature_names_in_")
        self._check_columns(X)
        columns = {}
        for spec in self.schema.model_features:
            try:
                values = [spec.canonical(v) for v in X[spec.name]]
            except ValueError as exc:
                raise FeatureMatrixError(str(exc)) from None
            if spec.kind == "categorical":
                columns[spec.name] = pd.Series(
                    [np.nan if v is None else v for v in values], index=X.index, dtype=object
                )
                continue
            if spec.kind == "ordinal":
                levels = {level: position for position, level in enumerate(spec.categories)}
                values = [None if v is None else levels[v] for v in values]
            columns[spec.name] = pd.Series(
                [np.nan if v is None else float(v) for v in values], index=X.index, dtype=float
            )
        return pd.DataFrame(columns, index=X.index)

    def get_feature_names_out(self, input_features=None):
        check_is_fitted(self, "feature_names_in_")
        return self.feature_names_in_


def build_preprocessor(schema: FeatureSchema, scale: bool = False) -> Pipeline:
    """Build the (unfitted) preprocessing pipeline for ``schema``.

    ``scale=True`` standardizes numeric and ordinal features, for algorithms
    that need it (logistic regression, SVM). Tree models use ``scale=False``.
    One-hot columns use the category list from the schema, so the output
    columns are identical in every fold.
    """
    numeric = schema.names_of_kind("numeric")
    binary = schema.names_of_kind("binary")
    ordinal = schema.names_of_kind("ordinal")
    categorical = schema.names_of_kind("categorical")

    def with_scaling(imputer: SimpleImputer) -> Pipeline:
        steps = [("impute", imputer)]
        if scale:
            steps.append(("scale", StandardScaler()))
        return Pipeline(steps)

    one_hot = OneHotEncoder(
        categories=[list(schema.get(name).categories) for name in categorical],
        drop="if_binary",
        handle_unknown="error",
        sparse_output=False,
    )
    encode = ColumnTransformer(
        transformers=[
            ("numeric", with_scaling(SimpleImputer(strategy="median")), numeric),
            ("binary", SimpleImputer(strategy="most_frequent"), binary),
            ("ordinal", with_scaling(SimpleImputer(strategy="most_frequent")), ordinal),
            (
                "categorical",
                Pipeline(
                    [("impute", SimpleImputer(strategy="most_frequent")), ("one_hot", one_hot)]
                ),
                categorical,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    return Pipeline([("canonicalize", SchemaCanonicalizer(schema)), ("encode", encode)])
