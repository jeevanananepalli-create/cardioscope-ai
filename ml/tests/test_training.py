import numpy as np
import pytest

from ml.src.features.feature_schema import FORBIDDEN_COLUMNS, TARGET_NAMES, LeakageError, find_forbidden
from ml.src.models.base import TargetModel, baseline_candidates, load_candidates
from ml.src.training.split import make_holdout_split
from ml.src.training.train import fit_candidate, load_training_data

pytestmark = pytest.mark.requires_dataset


@pytest.fixture(scope="module")
def data(_raw_df_session):
    return load_training_data(frame=_raw_df_session.copy())


def test_candidates_cover_the_four_required_algorithms():
    algorithms = {c.algorithm for c in load_candidates()}
    assert algorithms == {"logistic_regression", "random_forest", "xgboost", "svm"}
    assert {c.algorithm for c in baseline_candidates()} == algorithms
    names = [c.name for c in load_candidates()]
    assert len(names) == len(set(names))
    assert {c.class_weighting for c in load_candidates()} == {"none", "balanced"}


def test_holdout_split_is_disjoint_complete_and_deterministic(raw_df, schema):
    a = make_holdout_split(raw_df, schema, test_size=0.2, seed=42)
    b = make_holdout_split(raw_df, schema, test_size=0.2, seed=42)
    np.testing.assert_array_equal(a.test_index, b.test_index)
    assert set(a.dev_index).isdisjoint(a.test_index)
    assert sorted([*a.dev_index, *a.test_index]) == list(range(len(raw_df)))
    assert len(a.test_index) == pytest.approx(0.2 * len(raw_df), abs=1)
    c = make_holdout_split(raw_df, schema, test_size=0.2, seed=7)
    assert not np.array_equal(a.test_index, c.test_index)


def test_holdout_split_preserves_class_balance_for_every_target(data):
    for target in TARGET_NAMES:
        dev_rate = data.y_dev[target].mean()
        test_rate = data.y_test[target].mean()
        assert abs(dev_rate - test_rate) < 0.05, target


def test_training_data_has_no_forbidden_columns(data):
    for features in (data.X_dev, data.X_test):
        assert find_forbidden(features.columns) == []
        assert list(features.columns) == data.schema.feature_names


@pytest.mark.parametrize("spec", baseline_candidates(), ids=lambda c: c.algorithm)
def test_each_baseline_fits_and_outputs_probabilities(data, spec):
    pipeline = fit_candidate(spec, data.schema, data.X_dev, data.y_dev["CAD"], data.seed)
    proba = pipeline.predict_proba(data.X_test)
    assert proba.shape == (len(data.X_test), 2)
    assert np.all((proba >= 0) & (proba <= 1))
    np.testing.assert_allclose(proba.sum(axis=1), 1.0, rtol=1e-6)
    model = TargetModel(target="CAD", pipeline=pipeline)
    assert find_forbidden(model.feature_names) == []
    assert set(np.unique(model.predict(data.X_test))) <= {0, 1}


@pytest.mark.parametrize("spec", baseline_candidates(), ids=lambda c: c.algorithm)
def test_training_is_reproducible(data, spec):
    first = fit_candidate(spec, data.schema, data.X_dev, data.y_dev["LAD"], data.seed)
    second = fit_candidate(spec, data.schema, data.X_dev, data.y_dev["LAD"], data.seed)
    np.testing.assert_array_equal(
        first.predict_proba(data.X_test), second.predict_proba(data.X_test)
    )


@pytest.mark.parametrize("forbidden", sorted(FORBIDDEN_COLUMNS))
def test_training_refuses_a_feature_matrix_with_a_forbidden_column(data, raw_df, forbidden):
    """Spec section 22: fails if a forbidden column enters the training feature matrix."""
    leaky = data.X_dev.copy()
    leaky[forbidden] = raw_df[forbidden].iloc[data.split.dev_index].to_numpy()
    for spec in baseline_candidates():
        with pytest.raises(LeakageError, match=forbidden):
            fit_candidate(spec, data.schema, leaky, data.y_dev["CAD"], data.seed)


def test_balanced_weighting_changes_the_fitted_model(data):
    by_name = {c.name: c for c in load_candidates()}
    plain = by_name["logistic_regression[C=1.0|weights=none]"]
    balanced = by_name["logistic_regression[C=1.0|weights=balanced]"]
    y = data.y_dev["CAD"]
    a = fit_candidate(plain, data.schema, data.X_dev, y, data.seed).predict_proba(data.X_test)
    b = fit_candidate(balanced, data.schema, data.X_dev, y, data.seed).predict_proba(data.X_test)
    assert not np.allclose(a, b)
    # CAD is the majority class, so balancing must lower the mean predicted CAD probability.
    assert b[:, 1].mean() < a[:, 1].mean()
