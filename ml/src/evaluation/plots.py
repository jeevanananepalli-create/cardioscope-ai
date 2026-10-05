"""Offline report figures. Every figure is drawn from computed evaluation results."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

_COLORS = {"CAD": "#1f4e79", "LAD": "#b5532a", "LCX": "#2a7f62", "RCA": "#7a4a9e"}


def _save(figure, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(path, dpi=130)
    plt.close(figure)
    return path


def plot_roc_curves(holdout: Mapping[str, Mapping[str, Any]], path: Path) -> Path:
    figure, axis = plt.subplots(figsize=(5.5, 5))
    for target, result in holdout.items():
        curve = result["roc_curve"]
        axis.plot(
            curve["false_positive_rate"],
            curve["true_positive_rate"],
            color=_COLORS.get(target),
            label=f"{target} (AUC {result['metrics']['roc_auc']:.2f}, n={result['n']})",
        )
    axis.plot([0, 1], [0, 1], color="grey", linestyle="--", linewidth=1, label="No discrimination")
    axis.set(xlabel="False positive rate", ylabel="True positive rate", title="ROC curves — holdout set")
    axis.legend(loc="lower right", fontsize=8)
    return _save(figure, path)


def plot_confusion_matrices(holdout: Mapping[str, Mapping[str, Any]], path: Path) -> Path:
    figure, axes = plt.subplots(1, len(holdout), figsize=(3.2 * len(holdout), 3.4))
    for axis, (target, result) in zip(np.atleast_1d(axes), holdout.items()):
        cm = result["metrics"]["confusion_matrix"]
        grid = np.array([[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]])
        axis.imshow(grid, cmap="Blues", vmin=0)
        for (row, column), value in np.ndenumerate(grid):
            axis.text(column, row, str(value), ha="center", va="center",
                      color="white" if value > grid.max() / 2 else "black", fontsize=13)
        axis.set(
            xticks=[0, 1], yticks=[0, 1],
            xticklabels=["Pred. negative", "Pred. positive"],
            yticklabels=["Actual negative", "Actual positive"],
            title=f"{target} (threshold {result['metrics']['threshold']:.2f})",
        )
        axis.tick_params(labelsize=7)
    figure.suptitle("Confusion matrices — holdout set", fontsize=11)
    return _save(figure, path)


def plot_calibration_curves(
    cross_validated: Mapping[str, Mapping[str, Any]],
    holdout: Mapping[str, Mapping[str, Any]],
    path: Path,
) -> Path:
    """Reliability curves: pooled nested-CV predictions (line) and holdout bins (markers)."""
    figure, axes = plt.subplots(1, len(holdout), figsize=(3.4 * len(holdout), 3.6), sharey=True)
    for axis, target in zip(np.atleast_1d(axes), holdout):
        axis.plot([0, 1], [0, 1], color="grey", linestyle="--", linewidth=1)
        cv_curve = cross_validated[target]
        axis.plot(cv_curve["mean_predicted"], cv_curve["observed_rate"], marker="o", markersize=3,
                  color=_COLORS.get(target), label=f"Cross-validation (n={cv_curve['n_predictions']})")
        test_curve = holdout[target]["reliability_curve"]
        axis.scatter(test_curve["mean_predicted"], test_curve["observed_rate"], marker="s",
                     facecolors="none", edgecolors="black", label=f"Holdout (n={holdout[target]['n']})")
        axis.set(xlabel="Mean predicted probability", title=target, xlim=(0, 1), ylim=(0, 1))
        axis.legend(fontsize=7, loc="upper left")
    np.atleast_1d(axes)[0].set_ylabel("Observed positive rate")
    figure.suptitle("Calibration (reliability) curves", fontsize=11)
    return _save(figure, path)


def plot_class_distribution(distribution: Mapping[str, Mapping[str, Any]], path: Path) -> Path:
    figure, axis = plt.subplots(figsize=(5.5, 3.6))
    targets = list(distribution)
    positive = [distribution[t]["n_positive"] for t in targets]
    negative = [distribution[t]["n_negative"] for t in targets]
    positions = np.arange(len(targets))
    axis.bar(positions - 0.2, negative, width=0.4, label="Negative", color="#9db4c8")
    axis.bar(positions + 0.2, positive, width=0.4, label="Positive", color="#1f4e79")
    for x, value in zip([*positions - 0.2, *positions + 0.2], [*negative, *positive]):
        axis.text(x, value + 2, str(value), ha="center", fontsize=8)
    axis.set(xticks=positions, xticklabels=targets, ylabel="Records", title="Class distribution — full dataset")
    axis.legend(fontsize=8)
    return _save(figure, path)


def plot_model_comparison(table, path: Path) -> Path:
    """Mean CV ROC-AUC (± std) of the best variant of each algorithm, per target."""
    best = (
        table.sort_values("roc_auc_mean", ascending=False)
        .groupby(["target", "algorithm"], sort=False)
        .head(1)
    )
    targets = list(dict.fromkeys(table["target"]))
    algorithms = list(dict.fromkeys(table["algorithm"]))
    figure, axis = plt.subplots(figsize=(7.5, 3.8))
    width = 0.8 / len(algorithms)
    for offset, algorithm in enumerate(algorithms):
        rows = best[best["algorithm"] == algorithm].set_index("target").loc[targets]
        axis.bar(np.arange(len(targets)) + offset * width, rows["roc_auc_mean"], width=width,
                 yerr=rows["roc_auc_std"], capsize=2, label=algorithm)
    axis.axhline(0.5, color="grey", linestyle="--", linewidth=1)
    axis.set(
        xticks=np.arange(len(targets)) + width * (len(algorithms) - 1) / 2, xticklabels=targets,
        ylabel="ROC-AUC (mean ± std across CV folds)", ylim=(0.4, 1.0),
        title="Best variant per algorithm — cross-validation",
    )
    axis.legend(fontsize=7, ncol=2)
    return _save(figure, path)


def plot_global_importance(
    importance: list[Mapping[str, Any]], target: str, output_space: str, path: Path, top: int = 15
) -> Path:
    rows = importance[:top][::-1]
    figure, axis = plt.subplots(figsize=(6, 0.32 * len(rows) + 1.2))
    axis.barh([r["label"] for r in rows], [r["mean_abs_shap"] for r in rows], color=_COLORS.get(target))
    axis.set(
        xlabel=f"Mean |SHAP value| ({output_space.replace('_', '-')} units)",
        title=f"{target} model — global feature attribution",
    )
    axis.tick_params(labelsize=8)
    return _save(figure, path)
