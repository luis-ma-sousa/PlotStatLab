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
            raise ValueError("Os identificadores dos grupos têm de ser únicos.")
        if len(point_ids) != len(set(point_ids)):
            raise ValueError("Os identificadores dos pontos têm de ser únicos.")
        return self


class AnalyzeRequest(SuggestRequest):
    config: AnalysisConfig
    fingerprint: str = Field(min_length=1, max_length=1000000)


LABELS = {
    "welch": "Teste t de Welch",
    "student": "Teste t de Student",
    "paired-t": "Teste t emparelhado",
    "mann-whitney": "Mann–Whitney U",
    "wilcoxon": "Wilcoxon emparelhado",
    "anova": "ANOVA de um fator + testes t de Student",
    "anova-tukey": "ANOVA de um fator + Tukey HSD",
    "welch-anova": "ANOVA de Welch + testes t de Welch",
    "kruskal": "Kruskal–Wallis + Mann–Whitney",
    "friedman": "Friedman + Wilcoxon emparelhado",
}
PAIRED_TESTS = {"paired-t", "wilcoxon", "friedman"}
TWO_TESTS = {"welch", "student", "paired-t", "mann-whitney", "wilcoxon"}
MULTI_TESTS = set(LABELS) - TWO_TESTS


def _paired_arrays(groups: list[Group]) -> list[np.ndarray]:
    maps = []
    for group in groups:
        subjects = [p.subject.strip() if p.subject else "" for p in group.observations]
        if not all(subjects):
            raise ValueError("Dados emparelhados exigem um identificador de indivíduo em cada ponto.")
        if len(subjects) != len(set(subjects)):
            raise ValueError(f"O grupo {group.name} repete identificadores de indivíduos.")
        maps.append(dict(zip(subjects, [p.value for p in group.observations])))
    expected = set(maps[0])
    if any(set(m) != expected for m in maps[1:]):
        raise ValueError("Os grupos emparelhados têm de conter os mesmos indivíduos; não são eliminados pares incompletos automaticamente.")
    order = sorted(expected)
    return [np.array([m[key] for key in order], dtype=float) for m in maps]


def _compatibility(groups: list[Group], design: str, test: str) -> str | None:
    if len(groups) < 2:
        return "São necessários pelo menos dois grupos."
    if any(len(g.observations) < 2 for g in groups):
        return "Cada grupo necessita de pelo menos duas observações."
    if test in TWO_TESTS and len(groups) != 2:
        return "Este teste compara exatamente dois grupos."
    if test in MULTI_TESTS and len(groups) < 3:
        return "Este procedimento requer pelo menos três grupos."
    if (test in PAIRED_TESTS) != (design == "paired"):
        return "Este teste não corresponde ao desenho experimental selecionado."
    try:
        arrays = _paired_arrays(groups) if design == "paired" else [np.array([p.value for p in g.observations]) for g in groups]
    except ValueError as exc:
        return str(exc)
    if test == "paired-t" and np.std(arrays[0] - arrays[1], ddof=1) == 0:
        return "O teste t emparelhado necessita de variabilidade nas diferenças entre pares."
    if test == "welch-anova" and any(np.std(a, ddof=1) == 0 for a in arrays):
        return "A ANOVA de Welch necessita de variância positiva em todos os grupos."
    if test in {"welch", "student", "anova", "anova-tukey"} and all(np.std(a, ddof=1) == 0 for a in arrays):
        return "Estes dados não têm variabilidade suficiente para o teste paramétrico."
    if test == "kruskal" and np.ptp(np.concatenate(arrays)) == 0:
        return "Kruskal–Wallis não está definido quando todos os valores são iguais."
    if test == "friedman" and all(np.ptp(row) == 0 for row in np.stack(arrays, axis=1)):
        return "Friedman não está definido quando todos os indivíduos têm valores iguais em todos os grupos."
    return None


def suggest(request: SuggestRequest) -> dict:
    design = request.design
    n_groups = len(request.groups)
    recommended = ("paired-t" if n_groups == 2 else "friedman") if design == "paired" else ("welch" if n_groups == 2 else "welch-anova")
    reasons = {
        "welch": "Compara médias de dois grupos independentes sem exigir variâncias iguais; confirmar independência e adequação do modelo.",
        "student": "Compara médias de dois grupos independentes, assumindo variâncias populacionais iguais e erros aproximadamente normais.",
        "paired-t": "Compara a média das diferenças dos mesmos indivíduos; requer diferenças aproximadamente normais.",
        "mann-whitney": "Compara distribuições de dois grupos independentes por postos; não equivale sempre a um teste de medianas.",
        "wilcoxon": "Compara diferenças emparelhadas por postos; assume simetria das diferenças para interpretação como localização.",
        "anova": "Compara médias de grupos independentes com variâncias iguais; comparações planeadas usam testes t e a correção selecionada.",
        "anova-tukey": "Compara médias com variâncias iguais e controla a família de todas as comparações através de Tukey HSD.",
        "welch-anova": "Compara médias de vários grupos independentes sem exigir variâncias iguais; comparações usam testes t de Welch e a correção selecionada.",
        "kruskal": "Compara distribuições de vários grupos independentes por postos; comparações usam Mann–Whitney com a correção selecionada.",
        "friedman": "Compara condições repetidas dos mesmos indivíduos por postos; comparações usam Wilcoxon com a correção selecionada. A aproximação pode ser fraca em amostras pequenas.",
    }
    candidates = [key for key in LABELS if (key in PAIRED_TESTS) == (design == "paired") and ((key in TWO_TESTS) == (n_groups <= 2))]
    suggestions = []
    for test in candidates:
        problem = _compatibility(request.groups, design, test)
        suggestions.append({"id": test, "label": LABELS[test], "reason": problem or reasons[test], "recommended": test == recommended and problem is None, "compatible": problem is None})
    suggestions.sort(key=lambda s: (not s["recommended"], not s["compatible"]))
    notes = ["O desenho experimental e os pressupostos não podem ser deduzidos apenas dos números. As sugestões indicam compatibilidade, não validam os pressupostos."]
    if any(len(g.observations) < 5 for g in request.groups):
        notes.append("Há grupos com menos de cinco observações; a avaliação da distribuição e as aproximações assintóticas são limitadas.")
    if design == "paired" and n_groups > 2:
        notes.append("Nesta versão, o teste disponível para mais de duas condições emparelhadas é Friedman. ANOVA de medidas repetidas e modelos mistos estão planeados.")
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
        raise ValueError("Método de correção desconhecido.")
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
        raise ValueError(f"{description} não é finito. Verifica a variabilidade e o número de observações.")
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
    raise ValueError("Teste não implementado.")


def analyze(request: AnalyzeRequest) -> dict:
    config = request.config
    test = config.test
    if test not in LABELS:
        raise ValueError("Teste desconhecido. Escolhe um dos testes disponíveis.")
    problem = _compatibility(request.groups, config.design, test)
    if problem:
        raise ValueError(problem)
    groups = request.groups
    if config.comparisons == "control" and config.control not in {g.id for g in groups}:
        raise ValueError("Seleciona um grupo de controlo válido.")
    if test == "anova-tukey" and config.comparisons != "all":
        raise ValueError("Tukey HSD utiliza a família de todas as comparações. Seleciona 'Todos os pares'.")
    arrays = _paired_arrays(groups) if config.design == "paired" else [np.array([p.value for p in g.observations]) for g in groups]
    notes = []
    if config.correction == "none" and len(groups) > 2 and test != "anova-tukey":
        notes.append("Comparações sem correção de multiplicidade; a probabilidade de falsos positivos aumenta com o número de comparações.")
    if config.correction == "bh":
        notes.append("Benjamini–Hochberg controla a taxa de falsas descobertas (FDR), não o erro familiar (FWER).")
    if config.alpha != 0.05:
        notes.append("Os símbolos usam os limiares convencionais 0,05 / 0,01 / 0,001 / 0,0001; o alfa escolhido não altera estes limiares.")
    if any(len(a) < 5 for a in arrays):
        notes.append("Há grupos com n < 5; interpretar pressupostos e aproximações com cuidado.")
    if test == "friedman" and (len(arrays[0]) <= 10 or len(groups) <= 6):
        notes.append("O p-value de Friedman usa uma aproximação qui-quadrado, que pode ser imprecisa com poucos indivíduos ou condições.")
    if test in {"kruskal", "friedman", "mann-whitney", "wilcoxon"}:
        notes.append("Testes por postos comparam distribuições/diferenças; não são automaticamente testes de medianas. As diferenças de médias apresentadas são apenas descritivas.")
    if test == "anova-tukey":
        notes.append("Os p-values e intervalos de Tukey HSD já são ajustados para todas as comparações; a correção adicional selecionada não é aplicada.")

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
        statistic = _finite(omnibus.statistic, "A estatística do teste")
        pvalue = _finite(omnibus.pvalue, "O p-value")
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
                pp = _finite(tukey.pvalue[i, j], "O p-value de Tukey")
                st = _finite(tukey.statistic[i, j], "A diferença de médias")
                ci = [_finite(tukey_ci.low[i, j], "O limite do intervalo"), _finite(tukey_ci.high[i, j], "O limite do intervalo")]
            else:
                raw = _pair_result(arrays[i], arrays[j], test)
                pp = _finite(raw.pvalue, "O p-value da comparação")
                st = _finite(raw.statistic, "A estatística da comparação")
                ci = None
                if hasattr(raw, "confidence_interval"):
                    interval = raw.confidence_interval(confidence_level=1 - config.alpha)
                    ci = [_finite(interval.low, "O limite do intervalo"), _finite(interval.high, "O limite do intervalo")]
            item = {"id": f"{groups[i].id}::{groups[j].id}", "groupA": groups[i].id, "groupB": groups[j].id, "p": pp, "statistic": st, "effect": _finite(np.mean(arrays[i]) - np.mean(arrays[j]), "A diferença de médias")}
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
            mean = _finite(np.mean(values), "A média")
            sd = _finite(np.std(values, ddof=1), "O desvio padrão")
            sem = sd / math.sqrt(n)
            half_ci = float(stats.t.ppf(0.975, n - 1)) * sem
            summaries.append({"group": group.id, "n": n, "mean": mean, "sd": sd, "sem": _finite(sem, "O erro padrão"), "ci95": [_finite(mean - half_ci, "O limite do intervalo"), _finite(mean + half_ci, "O limite do intervalo")]})
        for warning in caught:
            text = str(warning.message)
            if text not in notes:
                notes.append(text)
    if test != "anova-tukey" and any("ci" in p for p in pair_data) and len(pair_data) > 1:
        notes.append("Os intervalos das diferenças são individuais; os p-values ajustados aplicam a correção à família de comparações selecionada.")
    return {"test": test, "testLabel": LABELS[test], "engine": f"SciPy {scipy.__version__}", "statistic": statistic, "p": pvalue, "comparisons": pair_data, "summaries": summaries, "warnings": notes, "fingerprint": request.fingerprint, "config": config.model_dump(), "createdAt": datetime.now(timezone.utc).isoformat()}
