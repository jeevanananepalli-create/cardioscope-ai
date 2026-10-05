"""Select the final candidate per target from cross-validation results.

Selection never looks at training-set scores or at the holdout set. The rule:

1. Find the best mean CV value of the primary metric (ROC-AUC).
2. Keep candidates within ``tolerance`` of it: differences that small are well
   inside fold-to-fold noise on this dataset.
3. Of those, keep candidates whose mean CV Brier score is within
   ``secondary_tolerance`` of the best among them (probability quality matters
   because the application displays probabilities).
4. Choose the simplest algorithm left; break remaining ties by the primary metric.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence


def _mean(result: Mapping[str, Any], metric: str) -> float:
    return result["summary"][metric]["mean"]


def select_candidate(
    results: Sequence[Mapping[str, Any]],
    primary_metric: str = "roc_auc",
    tolerance: float = 0.01,
    secondary_metric: str = "brier",
    secondary_tolerance: float = 0.005,
) -> dict[str, Any]:
    """Return the selected candidate name with the reasoning, for one target."""
    if not results:
        raise ValueError("No cross-validation results to select from.")
    best_primary = max(_mean(r, primary_metric) for r in results)
    close = [r for r in results if _mean(r, primary_metric) >= best_primary - tolerance]
    best_secondary = min(_mean(r, secondary_metric) for r in close)
    eligible = [r for r in close if _mean(r, secondary_metric) <= best_secondary + secondary_tolerance]
    chosen = min(
        eligible,
        key=lambda r: (r["simplicity"], -_mean(r, primary_metric), r["candidate"]["name"]),
    )
    top = max(results, key=lambda r: _mean(r, primary_metric))
    reason = (
        f"best mean CV {primary_metric} is {best_primary:.3f} ({top['candidate']['name']}); "
        f"{len(close)} of {len(results)} candidates are within {tolerance} of it and "
        f"{len(eligible)} of those are also within {secondary_tolerance} of the best "
        f"{secondary_metric} ({best_secondary:.3f}). The simplest of these is "
        f"{chosen['candidate']['name']} ({primary_metric} {_mean(chosen, primary_metric):.3f}, "
        f"{secondary_metric} {_mean(chosen, secondary_metric):.3f})."
    )
    return {
        "selected": chosen["candidate"]["name"],
        "algorithm": chosen["candidate"]["algorithm"],
        "reason": reason,
        "best_primary_candidate": top["candidate"]["name"],
        "n_candidates": len(results),
        "eligible": sorted(r["candidate"]["name"] for r in eligible),
        "cv_summary": chosen["summary"],
        "rule": {
            "primary_metric": primary_metric,
            "tolerance": tolerance,
            "secondary_metric": secondary_metric,
            "secondary_tolerance": secondary_tolerance,
        },
    }
