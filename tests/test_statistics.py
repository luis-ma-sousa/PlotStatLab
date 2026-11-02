"""Regression references from R's PlantGrowth and SciPy's published examples.

Tests exercise scientific outcomes, pairing identity, multiplicity and API
rejection paths rather than reproduce implementation calculations.
"""
import math
import pytest
from fastapi.testclient import TestClient
from server.app import app
from server.statistics import AnalyzeRequest, SuggestRequest, adjust_pvalues, analyze, stars, suggest


def groups(*values, subjects=False):
    return [{"id": f"g{i}", "name": f"Group {i}", "observations": [{"id": f"p{i}-{j}", "value": v, **({"subject": f"s{j}"} if subjects else {})} for j, v in enumerate(vals)]} for i, vals in enumerate(values)]


def request(data, test="welch", design="independent", correction="holm", comparisons="all"):
    return AnalyzeRequest(groups=data, config={"test": test, "design": design, "comparisons": comparisons, "correction": correction, "control": "g0", "alpha": 0.05}, fingerprint="reference-dataset")


def test_student_reference_and_confidence_interval():
    # R: t.test(1:3,4:6,var.equal=TRUE)
    result = analyze(request(groups([1,2,3], [4,5,6]), test="student"))
    assert result["statistic"] == pytest.approx(-3.6742346141747673)
    assert result["p"] == pytest.approx(0.021311641128756727)
    ci = result["comparisons"][0]["ci"]
    assert ci == pytest.approx([-5.266957935527524, -0.7330420644724769])
    assert result["comparisons"][0]["label"] == "*"


def test_welch_reference():
    # Same equal-size/equal-variance samples have Welch df=4, t=-3.674234614.
    result = analyze(request(groups([1,2,3], [4,5,6])))
    assert result["p"] == pytest.approx(0.021311641128756727)
    assert result["fingerprint"] == "reference-dataset"
    assert result["summaries"][0]["n"] == 3
    assert result["summaries"][0]["sd"] == 1


def test_mann_whitney_published_example():
    # https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html
    result = analyze(request(groups([19,22,16,29,24], [20,11,17,12]), test="mann-whitney"))
    assert result["statistic"] == 17
    assert result["p"] == pytest.approx(0.1111111111111111)


def test_wilcoxon_published_example():
    # Corn-plant height differences, SciPy wilcoxon documentation.
    d = [6,8,14,16,23,24,28,29,41,-48,49,56,60,-67,75]
    data = groups([100+x for x in d], [100]*len(d), subjects=True)
    result = analyze(request(data, test="wilcoxon", design="paired"))
    assert result["statistic"] == 24
    assert result["p"] == pytest.approx(0.041259765625)


def test_pairing_uses_subject_identity_not_row_order():
    data = groups([1,2,3,4,5], [1,3,2,5,7], subjects=True)
    expected = analyze(request(data, test="paired-t", design="paired"))
    data[1]["observations"].reverse()
    actual = analyze(request(data, test="paired-t", design="paired"))
    assert actual["p"] == expected["p"]
    assert actual["statistic"] == expected["statistic"]


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "incomplete"])
def test_pairing_rejects_missing_duplicate_or_unmatched_subjects(mutation):
    data = groups([1,2,3], [2,4,3], subjects=True)
    if mutation == "missing":
        del data[0]["observations"][0]["subject"]
    elif mutation == "duplicate":
        data[0]["observations"][0]["subject"] = "s1"
    else:
        data[0]["observations"][0]["subject"] = "different"
    with pytest.raises(ValueError, match="subject|Paired"):
        analyze(request(data, test="paired-t", design="paired"))


PLANT_GROWTH = groups(
    [4.17,5.58,5.18,6.11,4.50,4.61,5.17,4.53,5.33,5.14],
    [4.81,4.17,4.41,3.59,5.87,3.83,6.03,4.89,4.32,4.69],
    [6.31,5.12,5.54,5.50,5.37,5.29,4.92,6.15,5.80,5.26],
)


def test_anova_plantgrowth_r_reference():
    # R: summary(aov(weight ~ group, data=PlantGrowth))
    result = analyze(request(PLANT_GROWTH, test="anova"))
    assert result["statistic"] == pytest.approx(4.846087862380136)
    assert result["p"] == pytest.approx(0.0159099583256229)
    assert len(result["comparisons"]) == 3


def test_tukey_plantgrowth_r_reference():
    # R: TukeyHSD(aov(weight ~ group, data=PlantGrowth))
    result = analyze(request(PLANT_GROWTH, test="anova-tukey"))
    last = result["comparisons"][2]
    assert last["adjustedP"] == pytest.approx(0.012006424, abs=1e-7)
    assert last["effect"] == pytest.approx(-0.865)
    assert last["ci"][1] < 0
    assert any("Tukey HSD" in warning for warning in result["warnings"])


def test_friedman_published_example():
    data = groups([72,96,88,92,74,76,82], [120,120,132,120,101,96,112], [76,95,104,96,84,72,76], subjects=True)
    result = analyze(request(data, test="friedman", design="paired"))
    assert result["statistic"] == pytest.approx(10.57142857142857)
    assert result["p"] == pytest.approx(0.005063414171757498)
    assert any("approximation" in note for note in result["warnings"])


@pytest.mark.parametrize("method,expected", [("none", [.01,.04,.03]), ("bonferroni", [.03,.12,.09]), ("holm", [.03,.06,.06]), ("bh", [.03,.04,.04])])
def test_multiplicity_known_family(method, expected):
    assert adjust_pvalues([.01,.04,.03], method) == pytest.approx(expected)


def test_control_family_contains_only_requested_comparisons():
    result = analyze(request(PLANT_GROWTH, test="welch-anova", comparisons="control"))
    assert len(result["comparisons"]) == 2
    assert all(item["groupA"] == "g0" for item in result["comparisons"])
    assert all(item["adjustedP"] >= item["p"] for item in result["comparisons"])


@pytest.mark.parametrize("p,label", [(.05,"ns"), (.049,"*"), (.01,"*"), (.009,"**"), (.001,"**"), (.0009,"***"), (.0001,"***"), (.00009,"****"), (0,"****")])
def test_stars_use_strict_conventional_thresholds(p, label):
    assert stars(p) == label


def test_suggestions_change_with_group_count_and_design():
    result = suggest(SuggestRequest(groups=PLANT_GROWTH))
    assert result["suggestions"][0]["id"] == "welch-anova"
    assert result["suggestions"][0]["recommended"]
    assert all(s["id"] not in {"paired-t", "welch"} for s in result["suggestions"])
    paired = suggest(SuggestRequest(groups=groups([1,2,3], [2,4,5], subjects=True), design="paired"))
    assert paired["suggestions"][0]["id"] == "paired-t"
    unpaired = suggest(SuggestRequest(groups=groups([1,2,3], [2,4,5]), design="paired"))
    assert all(not s["compatible"] for s in unpaired["suggestions"])


def test_constants_rejected_instead_of_nonfinite_results():
    with pytest.raises(ValueError, match="variability"):
        analyze(request(groups([1,1,1], [2,2,2])))


def test_wrong_design_rejected():
    with pytest.raises(ValueError, match="design"):
        analyze(request(groups([1,2,3], [3,4,6]), test="paired-t"))


def test_http_health_and_invalid_nonfinite_data():
    client = TestClient(app)
    assert client.get("/api/health").json()["status"] == "ok"
    response = client.post("/api/analyze", json={"groups": groups([1,2,3], [4,5,6]), "config": {"test": "unknown", "control": "g0"}, "fingerprint": "x"})
    assert response.status_code == 422
    assert "Unknown test" in response.json()["detail"]
    # JSON encoders correctly refuse NaN; validate the model boundary directly.
    with pytest.raises(ValueError):
        request(groups([1,math.inf,3], [4,5,6]))


def test_duplicate_point_ids_rejected():
    data = groups([1,2,3], [2,4,6])
    data[1]["observations"][0]["id"] = data[0]["observations"][0]["id"]
    with pytest.raises(ValueError, match="Observation identifiers"):
        request(data)


def test_numeric_overflow_rejected_before_json_serialization():
    with pytest.raises(ValueError, match="finite"):
        analyze(request(groups([1e308,1e308], [-1e308,-1e308]), test="mann-whitney"))


def test_explicit_exclusion_preserves_originals_and_changes_inference():
    data = groups([1,2,3,100], [3,4,5,6])
    data[0]["observations"][-1]["excluded"] = True
    result = analyze(request(data, test="welch"))
    assert result["summaries"][0]["n"] == 3
    assert result["summaries"][0]["mean"] == 2
    assert data[0]["observations"][-1]["value"] == 100
    assert any("excluded" in warning for warning in result["warnings"])


def test_outlier_http_endpoint_preserves_observation_identity():
    client = TestClient(app)
    payload = {"groups": groups([1,2,3,4,5,6,7,100]), "method": "grubbs", "fingerprint": "fixture"}
    result = client.post("/api/outliers", json=payload)
    assert result.status_code == 200
    assert result.json()["groups"][0]["flaggedIds"] == [payload["groups"][0]["observations"][-1]["id"]]
    assert payload["groups"][0]["observations"][-1]["value"] == 100


def test_dunnett_published_blood_count_example_and_intrinsic_correction():
    # SciPy published Dunnett tutorial, original two-sided control family.
    data=groups([7.40,8.50,7.20,8.24,9.84,8.32],[9.76,8.80,7.68,9.36],[12.80,9.68,12.16,9.20,10.55])
    result=analyze(request(data,test='anova-dunnett',comparisons='control',correction='bonferroni'))
    assert [p['adjustedP'] for p in result['comparisons']]==pytest.approx([.62014638,.00593493],abs=5e-5)
    assert all(p['adjustedP']==p['p'] for p in result['comparisons'])
    assert all(p['groupA']=='g0' for p in result['comparisons'])
    assert result['comparisons'][1]['label']=='**'
    assert result['comparisons'][1]['ci'][1]<0  # control − treatment
    with pytest.raises(ValueError,match='Control pairs'):
        analyze(request(data,test='anova-dunnett',comparisons='all'))


def test_dunn_pooled_ranks_tie_correction_and_holm_control_family():
    # Hand-ranked samples pooled ranks [1,2.5,2.5,4,5.5,5.5,7,8,9].
    # Rank variance = 9*10/12 − ((2³−2)+(2³−2))/(12*(9−1)) = 7.375.
    data=groups([1,2,2],[3,4,4],[5,6,7])
    result=analyze(request(data,test='kruskal-dunn',comparisons='control',correction='holm'))
    z01=(2-5)/math.sqrt(7.375*2/3)
    z02=(2-8)/math.sqrt(7.375*2/3)
    expected=[math.erfc(abs(z01)/math.sqrt(2)),math.erfc(abs(z02)/math.sqrt(2))]
    assert [p['statistic'] for p in result['comparisons']]==pytest.approx([z01,z02])
    assert [p['p'] for p in result['comparisons']]==pytest.approx(expected)
    assert [p['adjustedP'] for p in result['comparisons']]==pytest.approx([expected[0],2*expected[1]])
    assert all('ci' not in p for p in result['comparisons'])
