"""Scientific tests and compatibility advice, independent of the HTTP layer.

Values are never dropped or paired implicitly. Recommendations describe tests
compatible with the supplied design; they do not infer the experimental design
or select a test by a preliminary normality test.
"""
from __future__ import annotations

from datetime import datetime, timezone
from itertools import combinations
import math
import warnings as python_warnings
from typing import Literal

import numpy as np
import scipy
from scipy import stats
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Observation(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: str = Field(min_length=1)
    value: float
    x: float | None = None
    subject: str | None = None
    excluded: bool = False


class Group(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    observations: list[Observation] = Field(max_length=100000)


class AnalysisConfig(BaseModel):
    test: str
    design: Literal["independent", "paired"] = "independent"
    comparisons: Literal["control", "all"] = "control"
    correction: Literal["holm", "bonferroni", "bh", "none"] = "holm"
    control: str
    alpha: float = Field(default=0.05, gt=0, lt=1, allow_inf_nan=False)


class SuggestRequest(BaseModel):
    groups: list[Group] = Field(min_length=1, max_length=30)
    design: Literal["independent", "paired"] = "independent"

    @model_validator(mode="after")
    def validate_ids(self):
        group_ids = [g.id for g in self.groups]
        point_ids = [p.id for g in self.groups for p in g.observations]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("Group identifiers must be unique.")
        if len(point_ids) != len(set(point_ids)):
            raise ValueError("Observation identifiers must be unique.")
        return self


class AnalyzeRequest(SuggestRequest):
    config: AnalysisConfig
    fingerprint: str = Field(min_length=1, max_length=1000000)


LABELS = {
    "welch": "Welch t-test",
    "student": "Student t-test",
    "paired-t": "Paired t-test",
    "mann-whitney": "Mann–Whitney U",
    "wilcoxon": "Paired Wilcoxon",
    "anova": "One-way ANOVA + Student t-tests",
    "anova-tukey": "One-way ANOVA + Tukey HSD",
    "welch-anova": "Welch ANOVA + Welch t-tests",
    "kruskal": "Kruskal–Wallis + Mann–Whitney",
    "friedman": "Friedman + paired Wilcoxon",
}
PAIRED_TESTS = {"paired-t", "wilcoxon", "friedman"}
TWO_TESTS = {"welch", "student", "paired-t", "mann-whitney", "wilcoxon"}
MULTI_TESTS = set(LABELS) - TWO_TESTS


def _paired_arrays(groups: list[Group]) -> list[np.ndarray]:
    maps = []
    for group in groups:
        subjects = [p.subject.strip() if p.subject else "" for p in group.observations]
        if not all(subjects):
            raise ValueError("Paired data require an explicit subject ID for every observation.")
        if len(subjects) != len(set(subjects)):
            raise ValueError(f"Group {group.name} contains duplicate subject IDs.")
        maps.append(dict(zip(subjects, [p.value for p in group.observations])))
    expected = set(maps[0])
    if any(set(m) != expected for m in maps[1:]):
        raise ValueError("Paired groups must contain the same subjects; incomplete pairs are never dropped automatically.")
    order = sorted(expected)
    return [np.array([m[key] for key in order], dtype=float) for m in maps]


def _compatibility(groups: list[Group], design: str, test: str) -> str | None:
    if len(groups) < 2:
        return "At least two groups are required."
    if any(len(g.observations) < 2 for g in groups):
        return "Each group needs at least two observations."
    if test in TWO_TESTS and len(groups) != 2:
        return "This test compares exactly two groups."
    if test in MULTI_TESTS and len(groups) < 3:
        return "This procedure requires at least three groups."
    if (test in PAIRED_TESTS) != (design == "paired"):
        return "This test does not match the selected experimental design."
    try:
        arrays = _paired_arrays(groups) if design == "paired" else [np.array([p.value for p in g.observations]) for g in groups]
    except ValueError as exc:
        return str(exc)
    if test == "paired-t" and np.std(arrays[0] - arrays[1], ddof=1) == 0:
        return "The paired t-test requires variability in paired differences."
    if test == "welch-anova" and any(np.std(a, ddof=1) == 0 for a in arrays):
        return "Welch ANOVA requires positive variance in every group."
    if test in {"welch", "student", "anova", "anova-tukey"} and all(np.std(a, ddof=1) == 0 for a in arrays):
        return "These data do not have sufficient variability for a parametric test."
    if test == "kruskal" and np.ptp(np.concatenate(arrays)) == 0:
        return "Kruskal–Wallis is undefined when all values are identical."
    if test == "friedman" and all(np.ptp(row) == 0 for row in np.stack(arrays, axis=1)):
        return "Friedman is undefined when every subject has identical values across groups."
    return None


def _included_groups(groups: list[Group]) -> list[Group]:
    return [g.model_copy(update={"observations": [p for p in g.observations if not p.excluded]}) for g in groups]


def suggest(request: SuggestRequest) -> dict:
    request = request.model_copy(update={"groups": _included_groups(request.groups)})
    design = request.design
    n_groups = len(request.groups)
    recommended = ("paired-t" if n_groups == 2 else "friedman") if design == "paired" else ("welch" if n_groups == 2 else "welch-anova")
    reasons = {
        "welch": "Compares two independent means without requiring equal variances; confirm independence and model suitability.",
        "student": "Compares two independent means, assuming equal population variances and approximately normal errors.",
        "paired-t": "Compares mean within-subject differences; requires approximately normal differences.",
        "mann-whitney": "Compares two independent distributions by ranks; this is not always a test of medians.",
        "wilcoxon": "Compares paired differences by ranks; a location interpretation assumes symmetric differences.",
        "anova": "Compares independent means with equal variances; planned comparisons use t-tests with the selected correction.",
        "anova-tukey": "Compares means with equal variances and controls all pairwise comparisons with Tukey HSD.",
        "welch-anova": "Compares several independent means without requiring equal variances; pairwise comparisons use Welch t-tests with the selected correction.",
        "kruskal": "Compares independent distributions by ranks; pairwise comparisons use Mann–Whitney with the selected correction.",
        "friedman": "Compares repeated conditions by ranks; pairwise comparisons use Wilcoxon with the selected correction. The approximation may be poor in small samples.",
    }
    candidates = [key for key in LABELS if (key in PAIRED_TESTS) == (design == "paired") and ((key in TWO_TESTS) == (n_groups <= 2))]
    suggestions = []
    for test in candidates:
        problem = _compatibility(request.groups, design, test)
        suggestions.append({"id": test, "label": LABELS[test], "reason": problem or reasons[test], "recommended": test == recommended and problem is None, "compatible": problem is None})
    suggestions.sort(key=lambda s: (not s["recommended"], not s["compatible"]))
    notes = ["Experimental design and assumptions cannot be inferred from numbers alone. Suggestions indicate compatibility; they do not validate assumptions."]
    if any(len(g.observations) < 5 for g in request.groups):
        notes.append("Some groups have fewer than five observations; distribution assessment and asymptotic approximations are limited.")
    if design == "paired" and n_groups > 2:
        notes.append("For more than two paired conditions, this version offers Friedman. Repeated-measures ANOVA and mixed models are planned.")
    return {"suggestions": suggestions, "warnings": notes}


def adjust_pvalues(pvalues: list[float], method: str) -> list[float]:
    """Control the requested, explicit family of pairwise comparisons."""
    p = np.asarray(pvalues, dtype=float)
    n = len(p)
    if n == 0:
        return []
    if method == "none":
        return p.tolist()
    if method == "bonferroni":
        return np.minimum(1, p * n).tolist()
    order = np.argsort(p, kind="stable")
    ranked = p[order]
    if method == "holm":
        corrected = np.minimum(1, np.maximum.accumulate(ranked * (n - np.arange(n))))
    elif method == "bh":
        corrected = np.minimum(1, np.minimum.accumulate((ranked * n / np.arange(1, n + 1))[::-1])[::-1])
    else:
        raise ValueError("Unknown correction method.")
    output = np.empty(n)
    output[order] = corrected
    return output.tolist()


def stars(p: float) -> str:
    for threshold, label in [(0.0001, "****"), (0.001, "***"), (0.01, "**"), (0.05, "*")]:
        if p < threshold:
            return label
    return "ns"


def _finite(value: float, description: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{description} is not finite. Check variability and the number of observations.")
    return number


def _pair_result(a: np.ndarray, b: np.ndarray, test: str):
    if test in {"welch", "welch-anova"}:
        return stats.ttest_ind(a, b, equal_var=False, alternative="two-sided")
    if test in {"student", "anova", "anova-tukey"}:
        return stats.ttest_ind(a, b, equal_var=True, alternative="two-sided")
    if test == "paired-t":
        return stats.ttest_rel(a, b, alternative="two-sided")
    if test in {"mann-whitney", "kruskal"}:
        return stats.mannwhitneyu(a, b, alternative="two-sided", method="auto")
    if test in {"wilcoxon", "friedman"}:
        # zsplit handles all-zero differences (p=1) without dropping subjects.
        return stats.wilcoxon(a - b, alternative="two-sided", zero_method="zsplit", method="auto")
    raise ValueError("Test not implemented.")


def analyze(request: AnalyzeRequest) -> dict:
    excluded_count = sum(p.excluded for g in request.groups for p in g.observations)
    request = request.model_copy(update={"groups": _included_groups(request.groups)})
    config = request.config
    test = config.test
    if test not in LABELS:
        raise ValueError("Unknown test. Choose an available test.")
    problem = _compatibility(request.groups, config.design, test)
    if problem:
        raise ValueError(problem)
    groups = request.groups
    if config.comparisons == "control" and config.control not in {g.id for g in groups}:
        raise ValueError("Select a valid control group.")
    if test == "anova-tukey" and config.comparisons != "all":
        raise ValueError("Tukey HSD uses all pairwise comparisons. Select 'All pairs'.")
    arrays = _paired_arrays(groups) if config.design == "paired" else [np.array([p.value for p in g.observations]) for g in groups]
    notes = ([f"{excluded_count} explicitly excluded observations were omitted; original measurements remain in the project."] if excluded_count else [])
    if config.correction == "none" and len(groups) > 2 and test != "anova-tukey":
        notes.append("Comparisons are unadjusted; the risk of false positives increases with the number of comparisons.")
    if config.correction == "bh":
        notes.append("Benjamini–Hochberg controls the false discovery rate (FDR), not the family-wise error rate (FWER).")
    if config.alpha != 0.05:
        notes.append("Symbols use conventional thresholds 0.05 / 0.01 / 0.001 / 0.0001; the selected alpha does not change these thresholds.")
    if any(len(a) < 5 for a in arrays):
        notes.append("Some groups have n < 5; interpret assumptions and approximations carefully.")
    if test == "friedman" and (len(arrays[0]) <= 10 or len(groups) <= 6):
        notes.append("The Friedman p-value uses a chi-squared approximation, which may be inaccurate with few subjects or conditions.")
    if test in {"kruskal", "friedman", "mann-whitney", "wilcoxon"}:
        notes.append("Rank tests compare distributions or differences; they are not automatically tests of medians. Displayed mean differences are descriptive only.")
    if test == "anova-tukey":
        notes.append("Tukey HSD p-values and intervals already adjust for all pairs; the additional correction is not applied.")

    with python_warnings.catch_warnings(record=True) as caught:
        python_warnings.simplefilter("always")
        if test in {"anova", "anova-tukey"}:
            omnibus = stats.f_oneway(*arrays, equal_var=True)
        elif test == "welch-anova":
            omnibus = stats.f_oneway(*arrays, equal_var=False)
        elif test == "kruskal":
            omnibus = stats.kruskal(*arrays)
        elif test == "friedman":
            omnibus = stats.friedmanchisquare(*arrays)
        else:
            omnibus = _pair_result(arrays[0], arrays[1], test)
        statistic = _finite(omnibus.statistic, "The test statistic")
        pvalue = _finite(omnibus.pvalue, "The p-value")
        pair_indices = list(combinations(range(len(groups)), 2))
        if config.comparisons == "control":
            control_idx = next(i for i, g in enumerate(groups) if g.id == config.control)
            pair_indices = [(control_idx, j) for j in range(len(groups)) if j != control_idx]
        pair_data = []
        if test == "anova-tukey":
            tukey = stats.tukey_hsd(*arrays)
            tukey_ci = tukey.confidence_interval(confidence_level=1 - config.alpha)
        for i, j in pair_indices:
            if test == "anova-tukey":
                raw = None
                pp = _finite(tukey.pvalue[i, j], "The Tukey p-value")
                st = _finite(tukey.statistic[i, j], "The mean difference")
                ci = [_finite(tukey_ci.low[i, j], "The interval bound"), _finite(tukey_ci.high[i, j], "The interval bound")]
            else:
                raw = _pair_result(arrays[i], arrays[j], test)
                pp = _finite(raw.pvalue, "The comparison p-value")
                st = _finite(raw.statistic, "The comparison statistic")
                ci = None
                if hasattr(raw, "confidence_interval"):
                    interval = raw.confidence_interval(confidence_level=1 - config.alpha)
                    ci = [_finite(interval.low, "The interval bound"), _finite(interval.high, "The interval bound")]
            item = {"id": f"{groups[i].id}::{groups[j].id}", "groupA": groups[i].id, "groupB": groups[j].id, "p": pp, "statistic": st, "effect": _finite(np.mean(arrays[i]) - np.mean(arrays[j]), "The mean difference")}
            if ci is not None:
                item["ci"] = ci
            pair_data.append(item)
        adjusted = [p["p"] for p in pair_data] if test == "anova-tukey" else adjust_pvalues([p["p"] for p in pair_data], config.correction)
        for item, adjusted_p in zip(pair_data, adjusted):
            item["adjustedP"] = adjusted_p
            item["label"] = stars(adjusted_p)
        summaries = []
        for group, values in zip(groups, arrays):
            n = len(values)
            mean = _finite(np.mean(values), "The mean")
            sd = _finite(np.std(values, ddof=1), "The standard deviation")
            sem = sd / math.sqrt(n)
            half_ci = float(stats.t.ppf(0.975, n - 1)) * sem
            summaries.append({"group": group.id, "n": n, "mean": mean, "sd": sd, "sem": _finite(sem, "The standard error"), "ci95": [_finite(mean - half_ci, "The interval bound"), _finite(mean + half_ci, "The interval bound")]})
        for warning in caught:
            text = str(warning.message)
            if text not in notes:
                notes.append(text)
    if test != "anova-tukey" and any("ci" in p for p in pair_data) and len(pair_data) > 1:
        notes.append("Difference intervals are individual; adjusted p-values apply the correction to the selected comparison family.")
    return {"test": test, "testLabel": LABELS[test], "engine": f"SciPy {scipy.__version__}", "statistic": statistic, "p": pvalue, "comparisons": pair_data, "summaries": summaries, "warnings": notes, "fingerprint": request.fingerprint, "config": config.model_dump(), "createdAt": datetime.now(timezone.utc).isoformat()}
