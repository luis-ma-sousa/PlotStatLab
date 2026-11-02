"""Non-destructive, per-column Grubbs and published constant-model ROUT detection.

ROUT implements Motulsky & Brown (2006), doi:10.1186/1471-2105-7-123,
with K=1. It does not reproduce or depend on GraphPad's proprietary source.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any

import numpy as np
import scipy
from scipy import stats

ROUT_REFERENCE = "https://doi.org/10.1186/1471-2105-7-123"
GRUBBS_REFERENCE = "https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h1.htm"


def _real(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number.")
    return float(value)


def _identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 10000:
        raise ValueError(f"{label} must be a nonempty identifier.")
    return value


def _scaled(value: float, scale: float) -> float | None:
    result = value * scale
    return float(result) if math.isfinite(result) else None


def _rsdr(residuals: np.ndarray) -> float:
    """Published finite-N correction, K=1; linear proportional interpolation."""
    return float(np.quantile(np.abs(residuals), 0.6827, method="linear") * len(residuals) / (len(residuals) - 1))


def _robust_location(values: np.ndarray) -> tuple[float, float, int, bool]:
    """Adaptive Lorentzian location using published gradient/Hessian surrogate.

    After a trial update both merit scores use the trial RSDR, as required by
    the paper. The constant-model Hessian yields a weighted-mean step; damping
    halves rejected steps. This solves the one-parameter published fit without
    treating an ordinary MAD/median rule as ROUT.
    """
    location = float(np.mean(values))
    for iteration in range(1, 1001):
        residuals = values - location
        scale = _rsdr(residuals)
        if scale == 0:
            return location, scale, iteration, True
        weights = 1.0 / (1.0 + (residuals / scale) ** 2)
        step = float(np.sum(weights * residuals) / np.sum(weights))
        tolerance = 1e-12 * max(float(np.ptp(values)), abs(location), 1e-12)
        if abs(step) <= tolerance:
            return location, scale, iteration, True
        accepted = False
        fraction = 1.0
        for _ in range(60):
            candidate = location + fraction * step
            new_scale = _rsdr(values - candidate)
            if new_scale == 0:
                return candidate, new_scale, iteration, True
            # Recompute BOTH merits with the same new residual scale (paper).
            old_merit = float(np.log1p(((values - location) / new_scale) ** 2).sum())
            new_merit = float(np.log1p(((values - candidate) / new_scale) ** 2).sum())
            if new_merit <= old_merit:
                location = candidate
                accepted = True
                break
            fraction *= .5
        if not accepted:
            return location, scale, iteration, False
        if abs(fraction * step) <= tolerance:
            return location, _rsdr(values - location), iteration, True
    return location, _rsdr(values - location), 1000, False


def _grubbs(values: np.ndarray, ids: list[str], alpha: float, unit: float) -> dict:
    n = len(values)
    center = float(np.mean(values))
    deviation = float(np.std(values, ddof=1))
    if deviation == 0:
        return {"flaggedIds": [], "status": "constant", "details": {"mean": _scaled(center, unit), "sd": 0, "statistic": 0, "p": 1, "criticalValue": None, "candidateId": None}}
    distances = np.abs(values - center)
    maximum = float(np.max(distances))
    # Stable identity breaks equal-distance ties without depending on row order.
    candidate = min((i for i, distance in enumerate(distances) if distance == maximum), key=lambda i: ids[i])
    statistic = maximum / deviation
    critical_t = float(stats.t.isf(alpha / (2 * n), n - 2))
    critical = (n - 1) / math.sqrt(n) * (1.0 if math.isinf(critical_t) else critical_t / math.hypot(math.sqrt(n - 2), critical_t))
    denominator = (n - 1) ** 2 - n * statistic ** 2
    p = 0.0 if denominator <= 0 else min(1.0, float(2 * n * stats.t.sf(math.sqrt(n * (n - 2) * statistic ** 2 / denominator), n - 2)))
    flagged = [ids[candidate]] if statistic > critical else []
    return {"flaggedIds": flagged, "status": "complete", "details": {"mean": _scaled(center, unit), "sd": _scaled(deviation, unit), "statistic": statistic, "p": p, "criticalValue": critical, "candidateId": ids[candidate], "tail": "two-sided", "iterations": 1}}


def _rout(values: np.ndarray, ids: list[str], q: float, unit: float) -> dict:
    n = len(values)
    if np.ptp(values) == 0:
        return {"flaggedIds": [], "status": "constant", "details": {"robustMean": _scaled(float(values[0]), unit), "robustSD": 0, "degreesOfFreedom": n - 1, "iterations": 0, "converged": True, "maximumTested": math.ceil(.3 * n), "points": []}}
    center, scale, iterations, converged = _robust_location(values)
    common = {"robustMean": _scaled(center, unit), "robustSD": _scaled(scale, unit), "degreesOfFreedom": n - 1, "iterations": iterations, "converged": converged, "percentile": 68.27, "percentileInterpolation": "linear", "model": "Y = M", "maximumTested": math.ceil(.3 * n)}
    if not converged:
        return {"flaggedIds": [], "status": "not-converged", "details": {**common, "points": []}}
    # A collapsed residual scale cannot justify Gaussian residual p-values.
    if scale <= np.finfo(float).eps * max(float(np.ptp(values)), abs(center), np.finfo(float).tiny):
        return {"flaggedIds": [], "status": "degenerate-scale", "details": {**common, "points": []}}
    residuals = np.abs(values - center)
    order = sorted(range(n), key=lambda i: (float(residuals[i]), ids[i]))
    # Ranks are one-based in equations17–18. Test ceil(.3*N) largest residuals;
    # starting at zero-based floor(.7*N) avoids an off-by-one extra candidate.
    start = math.floor(.7 * n)
    point_results = []
    flagged: list[str] = []
    cutoff = None
    for position in range(start, n):
        index = order[position]
        ratio = float(residuals[index] / scale)
        p = float(2 * stats.t.sf(ratio, n - 1))
        threshold = q * (n - position) / n
        point_results.append({"id": ids[index], "rank": position + 1, "absoluteResidual": _scaled(float(residuals[index]), unit), "standardizedResidual": ratio, "p": p, "threshold": threshold})
        if cutoff is None and p < threshold:
            cutoff = position
    if cutoff is not None:
        flagged = [ids[order[position]] for position in range(cutoff, n)]
    return {"flaggedIds": flagged, "status": "complete", "details": {**common, "points": point_results, "cutoffRank": None if cutoff is None else cutoff + 1}}


def detect_outliers(payload: dict) -> dict:
    """Return flags and diagnostics; never alter measurements or exclusion state."""
    if not isinstance(payload, dict):
        raise ValueError("The outlier request must be an object.")
    method = payload.get("method", "rout")
    if not isinstance(method, str) or method not in {"grubbs", "rout"}:
        raise ValueError("Choose 'grubbs' or 'rout' for outlier detection.")
    alpha = _real(payload.get("alpha", .05), "Alpha")
    q = _real(payload.get("q", .01), "Q")
    if not 0 < alpha < 1:
        raise ValueError("Alpha must be greater than 0 and less than 1.")
    if not 0 < q <= .1:
        raise ValueError("ROUT Q must be greater than 0 and at most 0.10 (10%).")
    groups = payload.get("groups")
    if not isinstance(groups, list) or not 1 <= len(groups) <= 30:
        raise ValueError("Supply between 1 and 30 groups.")
    fingerprint = payload.get("fingerprint", "")
    if not isinstance(fingerprint, str) or len(fingerprint) > 1000000:
        raise ValueError("The fingerprint must be text.")
    warnings = ["Outliers are assessed separately within each column. Detection flags observations; it never deletes or automatically excludes them.", "Both methods assume independent observations with approximately Gaussian scatter around a single location; they are not tests of a time trend or dose-response curve."]
    if method == "rout":
        warnings.append("ROUT uses the published constant-model algorithm. Its numerical implementation has not been certified as identical to GraphPad Prism.")
    else:
        warnings.append("Grubbs detects at most one outlier per column. It is not repeated after removing a flagged value; multiple outliers may mask each other.")
    output = []
    seen_groups: set[str] = set()
    seen_points: set[str] = set()
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("Every group must be an object.")
        group_id = _identifier(group.get("id"), "Group ID")
        if group_id in seen_groups:
            raise ValueError("Group IDs must be unique.")
        seen_groups.add(group_id)
        name = group.get("name", group_id)
        if not isinstance(name, str):
            raise ValueError("Group names must be text.")
        observations = group.get("observations")
        if not isinstance(observations, list) or len(observations) > 100000:
            raise ValueError("Each group must contain a list of at most 100000 observations.")
        included = []
        excluded = 0
        for observation in observations:
            if not isinstance(observation, dict):
                raise ValueError("Every observation must be an object.")
            point_id = _identifier(observation.get("id"), "Observation ID")
            if point_id in seen_points:
                raise ValueError("Observation IDs must be unique across all groups.")
            seen_points.add(point_id)
            value = _real(observation.get("value"), "Observation value")
            is_excluded = observation.get("excluded", False)
            if not isinstance(is_excluded, bool):
                raise ValueError("The excluded flag must be true or false.")
            if is_excluded:
                excluded += 1
            else:
                included.append((point_id, value))
        n = len(included)
        result = {"groupId": group_id, "name": name, "n": n, "excludedN": excluded, "flaggedIds": []}
        if excluded:
            warnings.append(f"{name}: {excluded} explicitly excluded observation(s) were not tested.")
        if n < 3:
            result.update(status="insufficient-data", details={})
            warnings.append(f"{name}: at least 3 included observations are required; no outlier test was performed.")
        else:
            ids = [item[0] for item in included]
            raw = np.array([item[1] for item in included], dtype=float)
            unit = max(float(np.max(np.abs(raw))), np.finfo(float).tiny)
            values = raw / unit
            tested = _grubbs(values, ids, alpha, unit) if method == "grubbs" else _rout(values, ids, q, unit)
            result.update(tested)
            if result["status"] == "not-converged":
                warnings.append(f"{name}: robust fitting did not converge; no observations were flagged.")
            elif result["status"] == "degenerate-scale":
                warnings.append(f"{name}: residual scale collapsed, usually because of identical rounded values; no observations were flagged.")
        output.append(result)
    return {"method": method, "methodLabel": "Grubbs (two-sided, single outlier)" if method == "grubbs" else "ROUT (published constant model)", "engine": f"SciPy {scipy.__version__}; PSL outlier engine 1", "fingerprint": fingerprint, "createdAt": datetime.now(timezone.utc).isoformat(), "parameters": {"alpha": alpha, "q": q}, "groups": output, "warnings": warnings, "reference": GRUBBS_REFERENCE if method == "grubbs" else ROUT_REFERENCE}
