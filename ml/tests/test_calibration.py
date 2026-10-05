import numpy as np
import pytest

from ml.src.models.base import load_candidates
from ml.src.training.calibration import (
    IsotonicCalibrator,
    SigmoidCalibrator,
    calibration_study,
    decide_calibration,
    decide_threshold,
    inner_oof_proba,
    paired_comparison,
    tune_threshold,
)
from ml.src.training.finalize import fit_final_model
from ml.src.training.train import load_training_data


def _overconfident_scores(seed=0, n=4000):
    """Simulated scores (not patient data) whose true rate is known by construction."""
    rng = np.random.default_rng(seed)
    true_p = rng.uniform(0.05, 0.95, n)
    y = (rng.uniform(size=n) < true_p).astype(int)
    logit = np.log(true_p / (1 - true_p))
    return y, 1 / (1 + np.exp(-3 * logit)), true_p


@pytest.mark.parametrize("calibrator_class", [SigmoidCalibrator, IsotonicCalibrator])
def test_calibrators_repair_overconfident_scores(calibrator_class):
    y, scores, true_p = _overconfident_scores()
    y_new, scores_new, true_new = _overconfident_scores(seed=1)
    calibrator = calibrator_class().fit(scores, y)
    calibrated = calibrator.transform(scores_new)
    assert np.all((calibrated >= 0) & (calibrated <= 1))
    assert np.mean((calibrated - true_new) ** 2) < np.mean((scores_new - true_new) ** 2) / 4
    order = np.argsort(scores_new)
    assert np.all(np.diff(calibrated[order]) >= -1e-12)  # monotone: ranking is preserved


def test_tune_threshold_finds_the_separating_point():
    y = np.array([0, 0, 0, 1, 1, 1])
    proba = np.array([0.05, 0.10, 0.20, 0.30, 0.35, 0.40])
    assert tune_threshold(y, proba) == pytest.approx(0.25)


def test_tune_threshold_prefers_half_when_nothing_is_better():
    y = np.array([0, 0, 1, 1])
    proba = np.array([0.1, 0.2, 0.8, 0.9])
    assert tune_threshold(y, proba) == 0.5


def test_paired_comparison_uses_a_corrected_standard_error():
    baseline, alternative = [0.20, 0.22, 0.18, 0.21, 0.19], [0.19, 0.20, 0.18, 0.19, 0.19]
    result = paired_comparison(baseline, alternative, test_fraction=0.2)
    differences = np.array(alternative) - np.array(baseline)
    assert result["mean_difference"] == pytest.approx(differences.mean())
    naive = differences.std(ddof=1) / np.sqrt(5)
    assert result["standard_error"] > naive
    assert result["standard_error"] == pytest.approx(
        np.sqrt((1 / 5 + 0.25) * differences.var(ddof=1))
    )


def _study(brier_difference, brier_se, threshold_gain, threshold_se):
    """A study summary with made-up values, for testing the decision rules only."""
    return {
        "threshold_objective": "balanced_accuracy",
        "variants": {
            "none": {
                "default_threshold": {"brier": {"mean": 0.15, "std": 0.02}},
                "threshold_gain": {"mean_difference": threshold_gain, "standard_error": threshold_se},
                "mean_tuned_threshold": 0.6,
            },
            "sigmoid": {
                "brier_vs_uncalibrated": {"mean_difference": brier_difference, "standard_error": brier_se},
                "threshold_gain": {"mean_difference": threshold_gain, "standard_error": threshold_se},
                "mean_tuned_threshold": 0.6,
            },
        },
    }


def test_calibration_is_adopted_only_for_a_clear_improvement():
    assert decide_calibration(_study(-0.010, 0.002, 0, 1), 2.0)["method"] == "sigmoid"
    assert decide_calibration(_study(-0.003, 0.002, 0, 1), 2.0)["method"] == "none"
    assert decide_calibration(_study(+0.010, 0.002, 0, 1), 2.0)["method"] == "none"


def test_tuned_threshold_is_adopted_only_for_a_clear_gain():
    assert decide_threshold(_study(0, 1, 0.05, 0.01), "none", 2.0)["use_tuned"] is True
    assert decide_threshold(_study(0, 1, 0.01, 0.01), "none", 2.0)["use_tuned"] is False
    assert decide_threshold(_study(0, 1, -0.02, 0.01), "sigmoid", 2.0)["use_tuned"] is False


@pytest.fixture(scope="module")
def data(_raw_df_session):
    return load_training_data(frame=_raw_df_session.copy())


@pytest.fixture(scope="module")
def logistic():
    return next(c for c in load_candidates() if c.name == "logistic_regression[C=0.1|weights=none]")


@pytest.mark.requires_dataset
def test_inner_oof_scores_are_out_of_fold_and_reproducible(data, logistic):
    y = data.y_dev["LAD"]
    a = inner_oof_proba(logistic, data.schema, data.X_dev, y, seed=3, n_splits=5)
    b = inner_oof_proba(logistic, data.schema, data.X_dev, y, seed=3, n_splits=5)
    np.testing.assert_array_equal(a, b)
    assert a.shape == (len(y),) and np.all((a > 0) & (a < 1))
    in_sample = fit_final_model("LAD", logistic, data).raw_proba(data.X_dev)
    # Out-of-fold scores must fit the labels worse than the model's own training predictions.
    assert np.mean((a - y) ** 2) > np.mean((in_sample - y) ** 2)


@pytest.mark.requires_dataset
def test_calibration_study_structure_and_reproducibility(data, logistic):
    kwargs = dict(
        seed=data.seed, n_splits=3, n_repeats=1, inner_splits=3, methods=["sigmoid", "isotonic"]
    )
    a = calibration_study(logistic, data.schema, data.X_dev, data.y_dev["LCX"], **kwargs)
    b = calibration_study(logistic, data.schema, data.X_dev, data.y_dev["LCX"], **kwargs)
    assert a == b
    assert set(a["variants"]) == {"none", "sigmoid", "isotonic"}
    assert a["variants"]["none"]["reliability_curve"]["n_predictions"] == len(data.X_dev)
    # Sigmoid calibration is strictly monotone, so ranking (ROC-AUC) cannot change.
    none, sigmoid = a["variants"]["none"], a["variants"]["sigmoid"]
    assert sigmoid["default_threshold"]["roc_auc"]["mean"] == pytest.approx(
        none["default_threshold"]["roc_auc"]["mean"]
    )
    decision = decide_calibration(a, 2.0)
    assert decision["method"] in {"none", "sigmoid", "isotonic"}


@pytest.mark.requires_dataset
@pytest.mark.parametrize("method", ["sigmoid", "isotonic"])
def test_final_model_with_calibration_and_tuned_threshold(data, logistic, method):
    plain = fit_final_model("CAD", logistic, data)
    tuned = fit_final_model("CAD", logistic, data, calibration_method=method, use_tuned_threshold=True)
    assert plain.calibrator is None and plain.threshold == 0.5
    assert tuned.calibrator is not None and 0 < tuned.threshold < 1
    np.testing.assert_array_equal(plain.raw_proba(data.X_test), tuned.raw_proba(data.X_test))
    calibrated = tuned.predict_proba(data.X_test)
    assert np.all((calibrated >= 0) & (calibrated <= 1))
    np.testing.assert_array_equal(
        tuned.predict(data.X_test), (calibrated >= tuned.threshold).astype(int)
    )
