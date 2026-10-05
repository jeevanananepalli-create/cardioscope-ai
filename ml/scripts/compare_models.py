"""Cross-validate every candidate model for every target and write the comparison.

Usage (from the repository root):
    python -m ml.scripts.compare_models [--n-jobs 4]
"""

from __future__ import annotations

import argparse
import sys
import time

from ml.src.data.loader import DatasetFormatError, DatasetNotFoundError
from ml.src.evaluation.reports import comparison_table, render_comparison_markdown, write_json
from ml.src.features.feature_schema import TARGET_NAMES
from ml.src.models.base import load_candidates
from ml.src.paths import MODEL_COMPARISON_DIR, REPO_ROOT
from ml.src.training.cross_validation import compare_candidates
from ml.src.training.train import load_training_data


def run_comparison(data, n_jobs: int = 4, verbose: bool = True) -> dict:
    cv = data.config["cross_validation"]
    candidates = load_candidates()
    results = {}
    for target in TARGET_NAMES:
        started = time.perf_counter()
        results[target] = compare_candidates(
            candidates,
            data.schema,
            data.X_dev,
            data.y_dev[target],
            seed=data.seed,
            n_splits=int(cv["n_splits"]),
            n_repeats=int(cv["n_repeats"]),
            n_jobs=n_jobs,
        )
        if verbose:
            best = max(results[target], key=lambda r: r["summary"]["roc_auc"]["mean"])
            print(
                f"{target}: {len(candidates)} candidates in {time.perf_counter() - started:.0f}s; "
                f"highest mean CV ROC-AUC {best['summary']['roc_auc']['mean']:.3f} "
                f"({best['candidate']['name']})"
            )
    return results


def write_comparison(data, results, selection=None) -> None:
    cv = data.config["cross_validation"]
    table = comparison_table(results)
    MODEL_COMPARISON_DIR.mkdir(parents=True, exist_ok=True)
    write_json(
        MODEL_COMPARISON_DIR / "cv_results.json",
        {
            "seed": data.seed,
            "cross_validation": cv,
            "n_development_records": len(data.X_dev),
            # Per-fold values are summarised (mean, std); the raw folds are not stored.
            "results": {
                target: [{k: v for k, v in result.items() if k != "folds"} for result in candidates]
                for target, candidates in results.items()
            },
        },
    )
    table.to_csv(MODEL_COMPARISON_DIR / "model_comparison.csv", index=False)
    (MODEL_COMPARISON_DIR / "model_comparison.md").write_text(
        render_comparison_markdown(table, cv, len(data.X_dev), selection), encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n-jobs", type=int, default=4)
    args = parser.parse_args()
    try:
        data = load_training_data()
    except (DatasetNotFoundError, DatasetFormatError) as exc:
        print(f"SETUP ERROR\n{exc}", file=sys.stderr)
        return 2
    results = run_comparison(data, n_jobs=args.n_jobs)
    write_comparison(data, results)
    print(f"wrote {MODEL_COMPARISON_DIR.relative_to(REPO_ROOT).as_posix()}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
