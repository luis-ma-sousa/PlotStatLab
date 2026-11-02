"""Independent references and scientific failure cases for each advanced method."""
from pathlib import Path
import json
import math
import numpy as np
import pytest
from scipy import stats
from server.advanced import analyze_advanced

REFERENCE = json.loads((Path(__file__).parent / 'advanced_reference.json').read_text())
def run(method, rows, **kwargs):
    return analyze_advanced({'method':method,'rows':rows,'fingerprint':'fixture-reference',**kwargs})
def xy(values):
    return [{'id':str(i),'x':x,'y':y} for i,(x,y) in enumerate(values)]

def test_two_way_type_three_unbalanced_against_independent_statsmodels_sum_contrasts():
    result=run('two-way-anova',REFERENCE['twoWay']['rows'])
    for actual,expected in zip(result['tables'][0]['rows'],REFERENCE['twoWay']['effects']):
        assert actual[1] == pytest.approx(expected['sumSquares'],rel=1e-10)
        assert actual[2] == expected['df']
        assert actual[4] == pytest.approx(expected['f'],rel=1e-10)
        assert actual[5] == pytest.approx(expected['p'],rel=1e-10)

def test_repeated_anova_f_matches_independent_anovarm_and_gg_corrects_df():
    result=run('repeated-anova',REFERENCE['repeated']['rows'])
    primary=result['estimates']
    assert primary['statistic']==pytest.approx(REFERENCE['repeated']['f'],rel=1e-10)
    assert result['tables'][0]['rows'][0][-1]==pytest.approx(REFERENCE['repeated']['p'],rel=1e-10)
    assert primary['epsilon']==pytest.approx(.6640284693085043,rel=1e-10)
    assert primary['p']==pytest.approx(9.386640373821724e-8,rel=1e-9)
    assert primary['p']>REFERENCE['repeated']['p']

def test_repeated_within_factor_b_is_explicit_and_does_not_delete_incomplete_subjects():
    rows=[{**r,'factorB':r['factorA'],'factorA':'Between'} for r in REFERENCE['repeated']['rows']]
    assert run('repeated-anova',rows,options={'withinFactor':'factorB'})['estimates']['statistic']==pytest.approx(REFERENCE['repeated']['f'])
    with pytest.raises(ValueError,match='complete subject'):
        run('repeated-anova',rows[:-1],options={'withinFactor':'factorB'})
    with pytest.raises(ValueError,match='exactly one'):
        run('repeated-anova',[*rows,{**rows[0],'id':'duplicate'}],options={'withinFactor':'factorB'})

def test_random_intercept_reml_missing_observations_against_statsmodels_mixedlm():
    reference=REFERENCE['mixed'];result=run('mixed-model',reference['rows'])
    fixed=result['tables'][0]['rows'];estimate=result['estimates']
    assert [r[1] for r in fixed]==pytest.approx(reference['coefficients'],rel=2e-5)
    assert [r[2] for r in fixed]==pytest.approx(reference['conditionalGLSStandardErrors'],rel=1e-4)
    assert estimate['residualVariance']==pytest.approx(reference['residualVariance'],rel=1e-4)
    assert estimate['interceptVariance']==pytest.approx(reference['interceptVariance'],rel=1e-4)
    assert estimate['restrictedLogLikelihood']==pytest.approx(reference['restrictedLogLikelihood'],abs=1e-7)
    assert estimate['n']==22
    assert result['parameters']['missingPolicy']=='observed rows; no imputation'

def test_linear_regression_closed_form_slope_intercept_intervals_and_residual_ids():
    rows=xy([(0,1),(1,2),(2,4),(3,4),(4,6)])
    result=run('linear-regression',rows)
    assert result['estimates']['slope']==pytest.approx(1.2)
    assert result['estimates']['intercept']==pytest.approx(1.0)
    assert result['estimates']['residualSD']==pytest.approx(math.sqrt(.8/3))
    assert result['estimates']['rSquared']==pytest.approx(14.4/15.2)
    series={s['kind']:s for s in result['series']}
    assert {p['id'] for p in series['residuals']['points']}=={r['id'] for r in rows}
    assert all(p['lower']<=p['y']<=p['upper'] for p in series['fit']['points'])

def test_pearson_known_coefficient_and_exact_spearman_small_sample():
    rows=xy([(1,1),(2,2),(3,3),(4,4),(5,5)])
    assert run('pearson',rows)['estimates']['coefficient']==pytest.approx(1)
    spearman=run('spearman',rows)
    assert spearman['estimates']['coefficient']==pytest.approx(1)
    assert spearman['estimates']['p']==pytest.approx(2/math.factorial(5))
    assert 'exact' in spearman['parameters']['pValueMethod']

@pytest.mark.parametrize('direction,hill',[('increasing',1.3),('decreasing',-1.3)])
def test_four_parameter_model_recovers_known_curve(direction,hill):
    doses=np.logspace(-2,2,11)
    rows=xy([(float(x),float(5+95/(1+(2/x)**hill))) for x in doses])
    result=run('dose-response',rows,options={'direction':direction})
    assert result['estimates']['bottom']==pytest.approx(5,abs=1e-5)
    assert result['estimates']['top']==pytest.approx(100,abs=1e-5)
    assert result['estimates']['ec50']==pytest.approx(2,rel=1e-5)
    assert result['estimates']['hillSlope']==pytest.approx(hill,rel=1e-5)
    assert min(p['x'] for p in result['series'][0]['points'])==pytest.approx(.01)
    assert max(p['x'] for p in result['series'][0]['points'])==pytest.approx(100)

def test_survival_km_ties_censoring_and_logrank_against_scipy_independent_procedure():
    rows=[{'id':str(i),'y':t,'event':e,'group':g} for i,(t,e,g) in enumerate([(2,True,'A'),(2,False,'A'),(4,True,'A'),(6,False,'A'),(3,True,'B'),(5,False,'B'),(7,True,'B'),(8,False,'B')])]
    result=run('survival',rows)
    curve=next(s for s in result['series'] if s['kind']=='survival' and s['group']=='A')
    assert curve['points'][1]['y']==pytest.approx(.75)
    assert curve['points'][1]['nRisk']==4
    assert curve['points'][2]['y']==pytest.approx(.375)
    a=stats.CensoredData(uncensored=[2,4],right=[2,6]);b=stats.CensoredData(uncensored=[3,7],right=[5,8]);reference=stats.logrank(a,b)
    assert result['estimates']['statistic']==pytest.approx(reference.statistic**2,rel=1e-12)
    assert result['estimates']['p']==pytest.approx(reference.pvalue,rel=1e-12)
    for series in result['series']:
        if series['kind']=='survival':
            assert all(0<=p['lower']<=p['y']<=p['upper']<=1 for p in series['points'])

def test_bland_altman_uses_sample_sd_not_population_and_y_minus_x():
    result=run('bland-altman',xy([(10,11),(20,19),(30,32),(40,42),(50,51)]))
    assert result['estimates']['bias']==pytest.approx(1)
    assert result['estimates']['differenceSD']==pytest.approx(math.sqrt(1.5))
    assert result['estimates']['lowerAgreement']==pytest.approx(1-1.959963984540054*math.sqrt(1.5))
    assert result['series'][0]['points'][0]=={'id':'0','x':10.5,'y':1.0}

@pytest.mark.parametrize('method,rows,options,message',[
 ('pearson',xy([(1,2),(1,3),(1,4)]),{},'variability'),
 ('linear-regression',xy([(1,2),(2,4)]),{},'at least 3'),
 ('dose-response',xy([(0,1),(1,2),(2,3),(3,4),(4,5),(5,6)]),{},'positive doses'),
 ('dose-response',xy([(1,1),(2,2),(3,3),(4,4),(5,5),(6,6)]),{'direction':'unknown'},'direction'),
 ('survival',[{'id':'a','y':3},{'id':'b','y':4}],{},'event=true/false'),
 ('survival',[{'id':'a','y':-1,'event':True},{'id':'b','y':4,'event':False}],{},'nonnegative'),
 ('mixed-model',xy([(1,1),(2,3),(3,4)]),{},'subject'),
 ('two-way-anova',[{'id':str(i),'y':i,'factorA':'A','factorB':'B'} for i in range(4)],{},'two levels'),
])
def test_invalid_or_incompatible_designs_fail_with_explanation(method,rows,options,message):
    with pytest.raises(ValueError,match=message):run(method,rows,options=options)

def test_exclusion_is_explicit_reversible_and_preserves_original_rows():
    rows=xy([(0,1),(1,2),(2,4),(3,4),(4,6)])+[{'id':'out','x':5,'y':100,'excluded':True}]
    before=json.dumps(rows)
    result=run('linear-regression',rows)
    assert result['estimates']['n']==5
    assert '1 explicitly excluded' in result['warnings'][0]
    assert json.dumps(rows)==before
    assert result['fingerprint']=='fixture-reference'

def test_request_validation_and_no_nonfinite_serialization():
    for rows in [[{'id':'a','y':float('nan'),'x':1}],[{'id':'a','y':2},{'id':'a','y':3}]]:
        with pytest.raises(ValueError):run('pearson',rows)
    with pytest.raises(ValueError,match='Unknown'):run('not-a-method',xy([(1,1),(2,2),(3,3)]))
