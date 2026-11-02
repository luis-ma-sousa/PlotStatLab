"""Reference checks and invariants for non-destructive outlier detection."""
from copy import deepcopy
import json
import math

import numpy as np
import pytest
from scipy import stats

from server.outliers import _robust_location, _rsdr, detect_outliers


def request(values, method="rout", **overrides):
    return {"groups": [{"id": "g", "name": "Control", "observations": [{"id": f"p{i}", "value": value} for i, value in enumerate(values)]}], "method": method, "fingerprint": "fixture", **overrides}


def group_result(payload):
    return detect_outliers(payload)["groups"][0]


def test_grubbs_nist_uranium_reference_statistic_and_two_sided_critical():
    # NIST's worked example reports G=2.4687 (one-sided critical differs).
    result = group_result(request([199.31,199.53,200.19,200.82,201.92,201.95,202.18,245.57], "grubbs"))
    assert result["flaggedIds"] == ["p7"]
    assert result["details"]["statistic"] == pytest.approx(2.4687646112, rel=1e-9)
    assert result["details"]["criticalValue"] == pytest.approx(2.1266450872, rel=1e-9)
    assert result["details"]["p"] == pytest.approx(3.002638682e-7, rel=1e-6)
    assert result["details"]["iterations"] == 1


def test_rout_symmetric_constant_fit_and_scale_have_hand_calculated_solution():
    # Sorted absolute residuals [0,1,1,2,2]; interpolated P68.27=1.7308.
    center, scale, _, converged = _robust_location(np.array([1.,2.,3.,4.,5.]))
    assert converged
    assert center == 3
    assert scale == pytest.approx(1.7308 * 5 / 4, abs=1e-12)
    assert _rsdr(np.array([-2.,-1.,0.,1.,2.])) == pytest.approx(2.1635, abs=1e-12)
    assert not group_result(request([1,2,3,4,5]))["flaggedIds"]


def test_rout_finds_multiple_contaminants_that_mask_grubbs():
    values=[9.8,10,10.1,10.2,9.9,10.05,10.15,9.95,30,31]
    assert group_result(request(values,"grubbs"))["flaggedIds"] == []
    rout=group_result(request(values))
    assert set(rout["flaggedIds"]) == {"p8","p9"}
    assert rout["details"]["robustMean"] == pytest.approx(10, abs=.05)
    assert rout["details"]["model"] == "Y = M"
    assert rout["details"]["degreesOfFreedom"] == 9
    assert rout["details"]["converged"]


def test_rout_uses_published_rank_thresholds_and_student_t_residuals():
    result=group_result(request([9.8,10,10.1,10.2,9.9,10.05,10.15,9.95,30,31],q=.01))
    points=result["details"]["points"]
    assert [p["rank"] for p in points] == [8,9,10]
    assert [p["threshold"] for p in points] == pytest.approx([.003,.002,.001])
    for point in points:
        assert point["p"] == pytest.approx(2*stats.t.sf(point["standardizedResidual"],9),rel=1e-12)


@pytest.mark.parametrize("method", ["grubbs","rout"])
def test_flagging_never_mutates_input_or_exclusion_state(method):
    payload=request([1,2,3,4,100],method)
    original=deepcopy(payload)
    result=detect_outliers(payload)
    assert payload == original
    assert result["fingerprint"] == "fixture"
    assert "createdAt" in result
    assert all("excluded" not in o for o in payload["groups"][0]["observations"])


@pytest.mark.parametrize("method", ["grubbs","rout"])
def test_identity_and_flags_are_invariant_to_input_order_shift_and_scale(method):
    payload=request([9.8,10,10.1,10.2,9.9,10.05,10.15,9.95,30,31],method)
    expected=set(group_result(payload)["flaggedIds"])
    for scale,offset in [(10.,-110.),(-3.,8.),(1e100,0),(1e-100,0)]:
        altered=deepcopy(payload)
        altered["groups"][0]["observations"].reverse()
        for observation in altered["groups"][0]["observations"]:
            observation["value"]=observation["value"]*scale+offset
        assert set(group_result(altered)["flaggedIds"]) == expected


@pytest.mark.parametrize("method", ["grubbs","rout"])
def test_constant_and_undersized_groups_have_no_false_flags(method):
    assert group_result(request([7,7,7,7],method))["status"] == "constant"
    result=detect_outliers(request([1,100],method))
    assert result["groups"][0]["status"] == "insufficient-data"
    assert result["groups"][0]["flaggedIds"] == []
    assert any("at least 3" in warning for warning in result["warnings"])


def test_already_excluded_points_are_ignored_and_reported():
    payload=request([9,10,11,1000],"grubbs")
    payload["groups"][0]["observations"][-1]["excluded"]=True
    result=detect_outliers(payload)
    assert result["groups"][0]["n"] == 3
    assert result["groups"][0]["excludedN"] == 1
    assert result["groups"][0]["flaggedIds"] == []
    assert any("explicitly excluded" in warning for warning in result["warnings"])


def test_independent_columns_are_never_pooled():
    payload=request([1,2,3,4,5],"grubbs")
    payload["groups"].append({"id":"g2","name":"Second","observations":[{"id":f"s{i}","value":100+v} for i,v in enumerate([1,2,3,4,5])]})
    assert all(not g["flaggedIds"] for g in detect_outliers(payload)["groups"])


def test_small_sample_rout_does_not_claim_arbitrary_far_third_value_is_detectable():
    result=group_result(request([1,2,1e8]))
    assert result["flaggedIds"] == []


def test_q_changes_threshold_not_the_robust_fit():
    values=[9.8,10,10.1,10.2,9.9,10.05,10.15,9.95,11,12]
    lower=group_result(request(values,q=.001))
    higher=group_result(request(values,q=.1))
    assert set(lower["flaggedIds"]) <= set(higher["flaggedIds"])
    assert lower["details"]["robustMean"] == higher["details"]["robustMean"]
    assert higher["details"]["points"][-1]["threshold"] == pytest.approx(.01)


@pytest.mark.parametrize("change", [
    {"method":"mad"},{"method":{}},{"alpha":0},{"alpha":1},{"q":0},{"q":.11},{"q":True},{"groups":[]},
])
def test_invalid_requests_are_rejected(change):
    payload=request([1,2,3]);payload.update(change)
    with pytest.raises(ValueError):detect_outliers(payload)


@pytest.mark.parametrize("bad", [float("nan"),float("inf"),True,"4",None])
def test_nonfinite_or_non_numeric_measurements_are_rejected_even_when_excluded(bad):
    payload=request([1,2,3]);payload["groups"][0]["observations"][0].update(value=bad,excluded=True)
    with pytest.raises(ValueError):detect_outliers(payload)


def test_duplicate_group_and_observation_ids_are_rejected():
    payload=request([1,2,3]);payload["groups"].append(deepcopy(payload["groups"][0]))
    with pytest.raises(ValueError,match="Group IDs"):detect_outliers(payload)
    payload=request([1,2,3]);payload["groups"][0]["observations"][1]["id"]="p0"
    with pytest.raises(ValueError,match="Observation IDs"):detect_outliers(payload)


@pytest.mark.parametrize("method", ["grubbs","rout"])
def test_extreme_finite_values_produce_json_safe_results(method):
    result=detect_outliers(request([-1e308,-.9e308,0,.9e308,1e308],method))
    serialized=json.dumps(result,allow_nan=False)
    assert "NaN" not in serialized


def test_extremely_small_alpha_does_not_overflow_the_critical_value():
    result=detect_outliers(request([1,2,3,100],"grubbs",alpha=1e-300))
    json.dumps(result,allow_nan=False)
    assert result["groups"][0]["flaggedIds"] == []
