"""Regenerate independent advanced-science reference fixtures (developer only).

Install statsmodels==0.15.0 in an isolated validation environment, then run this
script from the repository. Statsmodels/pandas are not PSL runtime dependencies.
The fixtures contain synthetic measurements only. No PSL analysis code is used.
"""
from pathlib import Path
import json
import math
import numpy as np
import pandas as pd
import statsmodels
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm, AnovaRM
ROOT=Path(__file__).resolve().parents[1]
complete=[{'id':f's{s}-c{c}','subject':str(s),'factorA':str(c),'y':10+2.3*c+1.1*s+.6*math.sin(2*s+c)+.25*math.cos(s-2*c)} for s in range(8) for c in range(3)]
mixed=[r for r in complete if (int(r['subject']),int(r['factorA'])) not in {(2,1),(5,2)}]
reference=smf.mixedlm('y ~ C(factorA)',pd.DataFrame(mixed),groups='subject').fit(reml=True,method='lbfgs',maxiter=1000)
x=np.column_stack([np.ones(len(mixed)),[[float(r['factorA']==level) for level in ['1','2']] for r in mixed]])
v=np.eye(len(mixed))*reference.scale
for i,a in enumerate(mixed):
    for j,b in enumerate(mixed):
        if a['subject']==b['subject']:v[i,j]+=reference.cov_re.iloc[0,0]
gls_errors=np.sqrt(np.diag(np.linalg.inv(x.T@np.linalg.solve(v,x))))
twoway=[{'id':f'a{a}-b{b}-{j}','factorA':str(a),'factorB':str(b),'y':3*a+1.7*b+.5*a*b+math.sin((j+1)*.8+a*.3-b*.2)*.6+j*.1} for a in range(2) for b in range(3) for j in range(2+a+b)]
aov=anova_lm(smf.ols('y ~ C(factorA, Sum)*C(factorB, Sum)',pd.DataFrame(twoway)).fit(),typ=3)
rm=AnovaRM(pd.DataFrame(complete),'y','subject',within=['factorA']).fit()
fixture={'reference':{'statsmodels':statsmodels.__version__,'methods':['MixedLM REML (lbfgs)','anova_lm typ=3 with Sum contrasts','AnovaRM','dense GLS covariance using reference variance components']},'mixed':{'rows':mixed,'coefficients':reference.fe_params.tolist(),'standardErrors':reference.bse_fe.tolist(),'conditionalGLSStandardErrors':gls_errors.tolist(),'residualVariance':reference.scale,'interceptVariance':reference.cov_re.iloc[0,0],'restrictedLogLikelihood':reference.llf},'twoWay':{'rows':twoway,'effects':[{'sumSquares':float(aov.loc[key,'sum_sq']),'df':float(aov.loc[key,'df']),'f':float(aov.loc[key,'F']),'p':float(aov.loc[key,'PR(>F)'])} for key in aov.index if key not in {'Intercept','Residual'}]},'repeated':{'rows':complete,'f':float(rm.anova_table.iloc[0]['F Value']),'p':float(rm.anova_table.iloc[0]['Pr > F'])}}
(ROOT/'tests/advanced_reference.json').write_text(json.dumps(fixture,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print('Independent statsmodels fixtures regenerated. Run tests/test_advanced.py to compare PSL results.')
