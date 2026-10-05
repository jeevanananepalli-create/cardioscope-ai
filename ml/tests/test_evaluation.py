import numpy as np
import pytest

from ml.src.evaluation.metrics import SCALAR_METRICS, classification_metrics, summarize
from ml.src.evaluation.reports import comparison_table, render_comparison_markdown
from ml.src.features.feature_schema import LeakageError
from ml.src.models.base import load_candidates
from ml.src.training.cross_validation import cross_validate_candidate, make_cv
from ml.src.training.train import load_training_data

# Hand-checkable labels/scores (not patient data): 4 negatives, 4 positives.
Y = np.array([0, 0, 0, 0, 1, 1, 1, 1])
P = np.array([0.1, 0.2, 0.6, 0.4, 0.9, 0.8, 0.3, 0.7])


def test_metrics_match_hand_calculation():
    m = classification_metrics(Y, P)
    assert m["confusion_matrix"] == {"tn": 3, "fp": 1, "fn": 1, "tp": 3}
    assert m["accuracy"] == pytest.approx(6 / 8)
    assert m["precision"] == pytest.approx(3 / 4)
    assert m["recall"] == pytest.approx(3 / 4)
    assert m["specificity"] == pytest.approx(3 / 4)
    assert m["f1"] == pytest.approx(3 / 4)
    assert m["balanced_accuracy"] == pytest.approx(3 / 4)
    # 14 of the 16 positive/negative pairs are ranked correctly.
    assert m["roc_auc"] == pytest.approx(14 / 16)
    assert m["brier"] == pytest.approx(np.mean((P - Y) ** 2))
    assert m["n"] == 8


def test_threshold_changes_class_metrics_but_not_probability_metrics():
    low, high = classification_metrics(Y, P, 0.25), classification_metrics(Y, P, 0.75)
    assert low["recall"] == 1.0 and high["recall"] == pytest.approx(2 / 4)
    assert low["roc_auc"] == high["roc_auc"]
    assert low["brier"] == high["brier"]


def test_no_predicted_positives_gives_zero_precision_without_error():
    m = classification_metrics(Y, P, threshold=0.99)
    assert m["precision"] == 0.0 and m["recall"] == 0.0


def test_summarize_reports_mean_and_sample_std():
    summary = summarize([{"accuracy": 0.5}, {"accuracy": 0.7}, {"accuracy": 0.9}], keys=["accuracy"])
    assert summary["accuracy"]["mean"] == pytest.approx(0.7)
    assert summary["accuracy"]["std"] == pytest.approx(0.2)


@pytest.fixture(scope="module")
def data(_raw_df_session):
    return load_training_data(frame=_raw_df_session.copy())


@pytest.fixture(scope="module")
def logistic():
    return next(c for c in load_candidates() if c.name == "logistic_regression[C=1.0|weights=none]")


@pytest.mark.requires_dataset
def test_cv_folds_partition_the_development_set_each_repeat(data):
    y = data.y_dev["CAD"]
    splits = list(make_cv(n_splits=5, n_repeats=2, seed=1).split(data.X_dev, y))
    assert len(splits) == 10
    for repeat in range(2):
        tested = np.concatenate([test for _, test in splits[repeat * 5 : repeat * 5 + 5]])
        assert sorted(tested) == list(range(len(y)))
    for train, test in splits:
        assert set(train).isdisjoint(test)
        assert abs(y.iloc[test].mean() - y.mean()) < 0.06


@pytest.mark.requires_dataset
def test_cross_validation_is_reproducible_and_complete(data, logistic):
    kwargs = dict(seed=data.seed, n_splits=3, n_repeats=2)
    a = cross_validate_candidate(logistic, data.schema, data.X_dev, data.y_dev["RCA"], **kwargs)
    b = cross_validate_candidate(logistic, data.schema, data.X_dev, data.y_dev["RCA"], **kwargs)
    assert a["n_folds"] == 6 and len(a["folds"]) == 6
    assert a["summary"] == b["summary"]
    for metric in SCALAR_METRICS:
        values = [fold[metric] for fold in a["folds"]]
        assert a["summary"][metric]["mean"] == pytest.approx(np.mean(values))
        assert a["summary"][metric]["std"] == pytest.approx(np.std(values, ddof=1))
    assert sum(fold["n"] for fold in a["folds"]) == 2 * len(data.X_dev)


@pytest.mark.requires_dataset
def test_cross_validation_refuses_forbidden_columns(data, logistic):
    leaky = data.X_dev.assign(Cath=data.y_dev["CAD"].to_numpy())
    with pytest.raises(LeakageError):
        cross_validate_candidate(
            logistic, data.schema, leaky, data.y_dev["CAD"], seed=1, n_splits=3, n_repeats=1
        )


@pytest.mark.requires_dataset
def test_comparison_report_contains_only_computed_values(data, logistic):
    result = cross_validate_candidate(
        logistic, data.schema, data.X_dev, data.y_dev["CAD"], seed=1, n_splits=3, n_repeats=1
    )
    table = comparison_table({"CAD": [result]})
    assert table.loc[0, "roc_auc_mean"] == result["summary"]["roc_auc"]["mean"]
    markdown = render_comparison_markdown(table, {"n_splits": 3, "n_repeats": 1}, len(data.X_dev))
    assert f"{result['summary']['roc_auc']['mean']:.3f}" in markdown
