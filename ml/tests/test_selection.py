import pytest

from ml.src.training.selection import select_candidate


def _result(name, algorithm, simplicity, roc_auc, brier, train_auc=1.0):
    """A minimal CV result with made-up summary values, for testing the rule only."""
    return {
        "candidate": {"name": name, "algorithm": algorithm},
        "simplicity": simplicity,
        "summary": {
            "roc_auc": {"mean": roc_auc, "std": 0.05},
            "brier": {"mean": brier, "std": 0.02},
            "train_roc_auc": {"mean": train_auc, "std": 0.0},
        },
    }


def test_simplest_model_wins_when_scores_are_equivalent():
    results = [
        _result("xgb", "xgboost", 3, 0.905, 0.120),
        _result("rf", "random_forest", 2, 0.903, 0.121),
        _result("lr", "logistic_regression", 0, 0.900, 0.122),
    ]
    choice = select_candidate(results)
    assert choice["selected"] == "lr"
    assert choice["best_primary_candidate"] == "xgb"
    assert set(choice["eligible"]) == {"xgb", "rf", "lr"}


def test_clearly_better_complex_model_is_not_overridden_by_simplicity():
    results = [
        _result("xgb", "xgboost", 3, 0.92, 0.110),
        _result("lr", "logistic_regression", 0, 0.88, 0.125),
    ]
    assert select_candidate(results)["selected"] == "xgb"


def test_worse_probability_quality_removes_a_candidate():
    results = [
        _result("lr_balanced", "logistic_regression", 0, 0.905, 0.140),
        _result("rf", "random_forest", 2, 0.900, 0.120),
    ]
    choice = select_candidate(results)
    assert choice["selected"] == "rf"
    assert choice["eligible"] == ["rf"]


def test_training_score_is_never_used():
    results = [
        _result("overfit", "random_forest", 2, 0.80, 0.18, train_auc=1.0),
        _result("honest", "logistic_regression", 0, 0.90, 0.12, train_auc=0.91),
    ]
    assert select_candidate(results)["selected"] == "honest"


def test_ties_within_an_algorithm_go_to_the_higher_primary_metric():
    results = [
        _result("lr_a", "logistic_regression", 0, 0.900, 0.120),
        _result("lr_b", "logistic_regression", 0, 0.904, 0.121),
    ]
    assert select_candidate(results)["selected"] == "lr_b"


def test_reason_quotes_the_actual_numbers():
    results = [_result("lr", "logistic_regression", 0, 0.9123, 0.1234)]
    choice = select_candidate(results)
    assert "0.912" in choice["reason"] and "0.123" in choice["reason"]
    assert choice["cv_summary"] is results[0]["summary"]


def test_empty_results_are_rejected():
    with pytest.raises(ValueError):
        select_candidate([])
