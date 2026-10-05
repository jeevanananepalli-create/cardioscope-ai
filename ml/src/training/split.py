"""Development / holdout split shared by all four targets."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from ml.src.features.feature_schema import FeatureSchema

_VESSELS = ("LAD", "LCX", "RCA")


@dataclass(frozen=True)
class HoldoutSplit:
    dev_index: np.ndarray
    test_index: np.ndarray


def stratification_key(frame: pd.DataFrame, schema: FeatureSchema) -> pd.Series:
    """Joint LAD/LCX/RCA pattern, e.g. "101" = LAD and RCA stenotic."""
    key = pd.Series("", index=frame.index)
    for name in _VESSELS:
        target = schema.targets[name]
        key = key + (frame[target.column] == target.positive).astype(int).astype(str)
    return key


def make_holdout_split(
    frame: pd.DataFrame, schema: FeatureSchema, test_size: float, seed: int
) -> HoldoutSplit:
    """One deterministic patient-level split used for every target.

    The same patients are held out for all four models, so no patient is in one
    model's training set and another model's test set.
    """
    positions = np.arange(len(frame))
    dev, test = train_test_split(
        positions,
        test_size=test_size,
        random_state=seed,
        stratify=stratification_key(frame, schema).to_numpy(),
    )
    return HoldoutSplit(dev_index=np.sort(dev), test_index=np.sort(test))
