"""Explicit-design analyses for the advanced scientific workbench.

Long-form rows retain observation identities. Pairing, censoring and factor
assignments are explicit. The mixed model is a Gaussian random-intercept model,
not a substitute for every repeated-measures design.
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
import math
import warnings
import numpy as np
import scipy
from scipy import optimize, special, stats
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

METHODS = {
    "two-way-anova": "Two-way ANOVA (Type III, sum contrasts)",
    "repeated-anova": "One-way repeated-measures ANOVA (Greenhouse–Geisser)",
    "mixed-model": "Gaussian random-intercept mixed model (REML)",
    "pearson": "Pearson correlation",
    "spearman": "Spearman rank correlation",
    "linear-regression": "Ordinary least-squares linear regression",
    "dose-response": "Four-parameter logistic dose–response",
    "survival": "Kaplan–Meier + log-rank survival analysis",
    "bland-altman": "Bland–Altman agreement analysis",
}

class AdvancedRow(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="ignore")
    id: str = Field(min_length=1, max_length=300)
    y: float
    x: float | None = None
    factorA: str | None = Field(default=None, max_length=300)
    factorB: str | None = Field(default=None, max_length=300)
    subject: str | None = Field(default=None, max_length=300)
    group: str | None = Field(default=None, max_length=300)
    groupId: str | None = Field(default=None, max_length=300)
    event: StrictBool | None = None
    excluded: StrictBool = False

    @model_validator(mode="before")
    @classmethod
    def response_alias(cls, value):
        if isinstance(value, dict) and "y" not in value:
            value = dict(value)
            if "time" in value:
                value["y"] = value["time"]
            elif "value" in value:
                value["y"] = value["value"]
        return value

class AdvancedRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="ignore")
    method: str
    rows: list[AdvancedRow] = Field(min_length=1, max_length=100000)
    alpha: float = Field(default=.05, gt=0, lt=1)
    fingerprint: str = Field(min_length=1, max_length=1000000)
    options: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({r.id for r in self.rows}) != len(self.rows):
            raise ValueError("Observation identifiers must be unique.")
        return self

def _number(value, description="A result"):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f"{description} is not finite. Check scaling, variability and model identifiability.")
    return value

def _table(title, columns, rows):
    return {"title": title, "columns": columns, "rows": rows}

def _factor(rows, name):
    values = [getattr(r, name) for r in rows]
    if any(not isinstance(x, str) or not x.strip() for x in values):
        raise ValueError(f"Every included row requires an explicit {name} assignment.")
    return values, sorted(set(values))

def _xy(rows, minimum=3):
    if len(rows) < minimum or any(r.x is None for r in rows):
        raise ValueError(f"This analysis requires at least {minimum} complete, explicit X/Y pairs.")
    x = np.array([r.x for r in rows], dtype=float)
    y = np.array([r.y for r in rows], dtype=float)
    if np.ptp(x) == 0 or np.ptp(y) == 0:
        raise ValueError("Both X and Y require variability for this analysis.")
    return x, y

def _sum_contrasts(values, levels):
    return np.array([[1. if value == level else -1. if value == levels[-1] else 0.
                      for level in levels[:-1]] for value in values], dtype=float)

def _two_way(rows, alpha, options):
    av, al = _factor(rows, "factorA")
    bv, bl = _factor(rows, "factorB")
    if len(al) < 2 or len(bl) < 2:
        raise ValueError("Two-way ANOVA requires at least two levels of each factor.")
    if len(al) * len(bl) > 200:
        raise ValueError("Two-way ANOVA supports at most 200 factor combinations.")
    if len(set(zip(av, bv))) != len(al) * len(bl):
        raise ValueError("Every factor combination must have observations; empty cells make this full interaction model non-estimable.")
    a, b = _sum_contrasts(av, al), _sum_contrasts(bv, bl)
    ab = np.einsum("ij,ik->ijk", a, b).reshape(len(rows), -1)
    X = np.column_stack([np.ones(len(rows)), a, b, ab])
    y = np.array([r.y for r in rows])
    rank = int(np.linalg.matrix_rank(X))
    if rank != X.shape[1] or len(rows) <= rank:
        raise ValueError("The full interaction model requires residual degrees of freedom and a full-rank design.")
    coef = np.linalg.lstsq(X, y, rcond=None)[0]
    residual = y - X @ coef
    sse = _number(residual @ residual, "Residual sum of squares")
    if sse <= np.finfo(float).eps * max(1., float(y @ y)):
        raise ValueError("The residual variance is zero or numerically negligible; ANOVA F tests are undefined.")
    df_error = len(rows) - rank
    mse = sse / df_error
    ranges = [range(1, 1 + a.shape[1]), range(1 + a.shape[1], 1 + a.shape[1] + b.shape[1]), range(1 + a.shape[1] + b.shape[1], X.shape[1])]
    effects = []
    for name, indices in zip(["Factor A", "Factor B", "A × B interaction"], ranges):
        reduced = np.delete(X, list(indices), axis=1)
        er = y - reduced @ np.linalg.lstsq(reduced, y, rcond=None)[0]
        ss = max(0., _number(er @ er - sse, "Effect sum of squares"))
        df = len(indices)
        f = ss / df / mse
        effects.append([name, ss, df, ss / df, f, float(stats.f.sf(f, df, df_error)), ss / (ss + sse)])
    effects.append(["Residual", sse, df_error, mse, None, None, None])
    cells = []
    for alevel in al:
        for blevel in bl:
            values = [r.y for r in rows if r.factorA == alevel and r.factorB == blevel]
            cells.append([alevel, blevel, len(values), float(np.mean(values))])
    return {
        "tables": [_table("Type III ANOVA", ["Effect", "SS", "df", "MS", "F", "p", "Partial η²"], effects), _table("Observed cell means", ["Factor A", "Factor B", "n", "Mean"], cells)],
        "estimates": {"n": len(rows), "residualDf": df_error, "residualSD": math.sqrt(mse)},
        "series": [{"name": "Residuals", "kind": "residuals", "points": [{"id": r.id, "x": _number(fitted), "y": _number(err)} for r, fitted, err in zip(rows, X @ coef, residual)]}],
        "warnings": ["Independent Gaussian errors and equal residual variance are assumed. A full interaction is fitted. Type III partial F tests use sum-to-zero contrasts; with an interaction, main effects compare marginal means averaged equally over the other factor. These are not Type I or Type II tests."],
        "parameters": {"sumSquares": "Type III", "contrasts": "sum-to-zero", "interaction": True, "factorALevels": al, "factorBLevels": bl},
        "reference": "https://www.statsmodels.org/stable/generated/statsmodels.stats.anova.anova_lm.html",
    }

def _repeated(rows, alpha, options):
    within = options.get("withinFactor", "factorA")
    if within not in {"factorA", "factorB"}:
        raise ValueError("Repeated-measures withinFactor must be 'factorA' or 'factorB'.")
    if within == "factorB":
        rows = [r.model_copy(update={"factorA": r.factorB}) for r in rows]
    _, levels = _factor(rows, "factorA")
    _, subjects = _factor(rows, "subject")
    if len(levels) < 2 or len(subjects) < 3:
        raise ValueError("Repeated-measures ANOVA requires at least three subjects and two conditions.")
    mapping = {}
    for row in rows:
        key = (row.subject, row.factorA)
        if key in mapping:
            raise ValueError("Each subject must have exactly one observation per condition; replicate aggregation is never automatic.")
        mapping[key] = row.y
    if len(mapping) != len(levels) * len(subjects):
        raise ValueError("Repeated-measures ANOVA requires a complete subject × condition table. Incomplete subjects are never dropped automatically; use an appropriate mixed model for missing observations.")
    Y = np.array([[mapping[s, a] for a in levels] for s in subjects])
    n, k = Y.shape
    grand = np.mean(Y)
    ss_effect = float(n * np.sum((Y.mean(axis=0) - grand) ** 2))
    residual = Y - Y.mean(axis=0)[None, :] - Y.mean(axis=1)[:, None] + grand
    ss_error = float(np.sum(residual ** 2))
    if ss_error <= np.finfo(float).eps * max(1., float(np.sum(Y ** 2))):
        raise ValueError("The within-subject residual variance is zero or numerically negligible.")
    df1, df2 = k - 1, (n - 1) * (k - 1)
    f = _number((ss_effect / df1) / (ss_error / df2), "The F statistic")
    C = np.eye(k) - np.ones((k, k)) / k
    covariance = C @ np.cov(Y, rowvar=False, ddof=1) @ C
    epsilon = min(1., max(1. / (k - 1), float(np.trace(covariance) ** 2 / ((k - 1) * np.trace(covariance @ covariance)))))
    p = float(stats.f.sf(f, df1, df2))
    corrected = float(stats.f.sf(f, epsilon * df1, epsilon * df2))
    return {
        "tables": [_table("Repeated-measures ANOVA", ["Inference", "F", "Numerator df", "Denominator df", "p"], [["Uncorrected (requires sphericity)", f, df1, df2, p], ["Greenhouse–Geisser", f, epsilon * df1, epsilon * df2, corrected]]), _table("Condition means", ["Condition", "Subjects", "Mean"], [[a, n, float(Y[:, i].mean())] for i, a in enumerate(levels)])],
        "estimates": {"n": len(rows), "subjects": n, "conditions": k, "statistic": f, "p": corrected, "epsilon": epsilon, "partialEtaSquared": ss_effect / (ss_effect + ss_error)},
        "series": [], "parameters": {"withinFactor": within, "missingPolicy": "reject incomplete subjects", "primaryCorrection": "Greenhouse–Geisser", "levels": levels},
        "warnings": ["This is a one-factor within-subject ANOVA. Subjects are independent; errors must be approximately Gaussian. The primary p-value uses the Greenhouse–Geisser sphericity correction. For two conditions epsilon is one."],
        "reference": "https://doi.org/10.1007/BF02289823",
    }

def _mixed(rows, alpha, options):
    _, subjects = _factor(rows, "subject")
    if len(rows) > 10000:
        raise ValueError("The mixed-model workbench currently supports at most 10,000 included observations.")
    if len(subjects) < 3 or sum(sum(r.subject == s for r in rows) > 1 for s in subjects) < 3:
        raise ValueError("A random-intercept model requires at least three subjects with repeated observations.")
    predictor = options.get("predictor", "factorA")
    if predictor not in {"factorA", "x"}:
        raise ValueError("Mixed-model predictor must be 'factorA' or 'x'.")
    if predictor == "x":
        if any(r.x is None for r in rows) or np.ptp([r.x for r in rows]) == 0:
            raise ValueError("Every included mixed-model row requires a varying explicit X predictor.")
        X = np.column_stack([np.ones(len(rows)), [r.x for r in rows]])
        labels, levels = ["Intercept", "X slope"], []
    else:
        values, levels = _factor(rows, "factorA")
        if len(levels) < 2 or len(levels) > 30:
            raise ValueError("Mixed-model condition factor requires between two and 30 levels.")
        X = np.column_stack([np.ones(len(rows)), [[float(v == level) for level in levels[1:]] for v in values]])
        labels = [f"Intercept ({levels[0]})"] + [f"{level} − {levels[0]}" for level in levels[1:]]
    y = np.array([r.y for r in rows])
    n, p = X.shape
    if n <= p + 1 or np.linalg.matrix_rank(X) != p:
        raise ValueError("The mixed-model fixed-effect design is not estimable.")
    blocks = [np.array([i for i, r in enumerate(rows) if r.subject == s]) for s in subjects]

    def fit_ratio(ratio, details=False):
        # Sherman–Morrison inversion of each I + ratio*11' block avoids N² memory.
        vix, viy = X.copy(), y.copy()
        logdet = 0.
        for index in blocks:
            multiplier = ratio / (1. + len(index) * ratio)
            vix[index] -= multiplier * X[index].sum(axis=0)
            viy[index] -= multiplier * y[index].sum()
            logdet += math.log1p(len(index) * ratio)
        xtvix = X.T @ vix
        sign, logdetx = np.linalg.slogdet(xtvix)
        if sign <= 0:
            return math.inf
        beta = np.linalg.solve(xtvix, X.T @ viy)
        error = y - X @ beta
        rss = float(error @ (viy - vix @ beta))
        if rss <= np.finfo(float).eps * max(1., float(y @ y)):
            return math.inf
        sigma = rss / (n - p)
        objective = .5 * ((n - p) * (math.log(2 * math.pi) + 1 + math.log(sigma)) + logdet + logdetx)
        return (objective, beta, sigma, sigma * np.linalg.inv(xtvix), error) if details else objective

    optimum = optimize.minimize_scalar(lambda logratio: fit_ratio(math.exp(logratio)), bounds=(-18., 18.), method="bounded", options={"xatol": 1e-9})
    if not optimum.success:
        raise ValueError("The REML optimizer did not converge. Check scaling and model suitability.")
    ratio = math.exp(float(optimum.x))
    if fit_ratio(0.) <= optimum.fun:
        ratio = 0.
    fitted = fit_ratio(ratio, details=True)
    if not isinstance(fitted, tuple):
        raise ValueError("The mixed-model residual variance is zero or numerically negligible.")
    objective, beta, sigma, covariance, errors = fitted
    if ratio > math.exp(17.9):
        raise ValueError("The estimated variance ratio reached the optimization boundary; the model is not reliably identifiable.")
    zcrit = float(stats.norm.ppf(1 - alpha / 2))
    table = []
    for label, b, se in zip(labels, beta, np.sqrt(np.diag(covariance))):
        z = _number(b / se, "The Wald statistic")
        table.append([label, _number(b), _number(se), z, float(2 * stats.norm.sf(abs(z))), _number(b - zcrit * se), _number(b + zcrit * se)])
    notes = ["Gaussian random intercepts and independent Gaussian residuals are assumed; residual variance is constant and no random slope is fitted. Fixed-effect inference uses plug-in GLS covariance and asymptotic normal Wald tests, not Satterthwaite/Kenward–Roger degrees of freedom or a profiled observed-Hessian covariance. Small numbers of subjects can make these p-values unreliable.", "Missing-observation policy: only explicitly supplied, non-excluded rows are fitted under a missing-at-random assumption. No interpolation, imputation or complete-subject deletion is performed. Missingness mechanisms must be assessed by the researcher."]
    if ratio < 1e-6:
        notes.append("The random-intercept variance is on or near the zero boundary; the fit approaches an ordinary linear model.")
    return {"tables": [_table("Fixed effects (normal Wald inference)", ["Coefficient", "Estimate", "SE", "z", "p", "CI lower", "CI upper"], table)],
            "estimates": {"n": n, "subjects": len(subjects), "residualVariance": _number(sigma), "interceptVariance": _number(ratio * sigma), "restrictedLogLikelihood": _number(-objective), "icc": ratio / (1 + ratio)},
            "series": [{"name": "Marginal residuals", "kind": "residuals", "points": [{"id": r.id, "x": _number(mu), "y": _number(e)} for r, mu, e in zip(rows, X @ beta, errors)]}],
            "warnings": notes, "parameters": {"estimation": "REML", "randomEffects": "subject intercept", "predictor": predictor, "levels": levels, "missingPolicy": "observed rows; no imputation", "inference": "normal Wald"},
            "reference": "https://www.statsmodels.org/stable/mixed_linear.html"}

def _correlation(rows, alpha, method):
    x, y = _xy(rows)
    notes = ["Each row must be an independent, correctly matched X/Y pair. Correlation does not establish causation."]
    if method == "pearson":
        result = stats.pearsonr(x, y)
        interval = result.confidence_interval(confidence_level=1 - alpha)
        low, high = float(interval.low), float(interval.high)
        pmethod = "two-sided beta-distribution null; Fisher-z interval"
        notes.append("Pearson's p-value assumes bivariate normality under the null; its confidence interval uses Fisher's transformation.")
    else:
        result = stats.spearmanr(x, y)
        low = high = None
        pmethod = "two-sided asymptotic t approximation"
        if len(x) <= 8:
            xr, yr = stats.rankdata(x), stats.rankdata(y)
            observed = float(np.corrcoef(xr, yr)[0, 1])
            def statistic(permuted):
                return float(np.corrcoef(xr, permuted)[0, 1])
            perm = stats.permutation_test((yr,), statistic, permutation_type="pairings", n_resamples=np.inf, alternative="two-sided")
            result = (observed, float(perm.pvalue))
            pmethod = "exact two-sided permutation of one rank margin"
        elif len(x) < 500:
            notes.append("Spearman's p-value is an asymptotic approximation and can be inaccurate for fewer than 500 pairs. Exact permutation inference is used only for at most eight pairs in this workbench.")
        notes.append("Spearman measures a monotone association. A confidence interval is not supplied by this procedure.")
    coefficient, pvalue = _number(result[0], "The correlation"), _number(result[1], "The correlation p-value")
    return {"tables": [_table("Correlation", ["Pairs", "Coefficient", "p", "CI lower", "CI upper"], [[len(x), coefficient, pvalue, low, high]])],
            "estimates": {"n": len(x), "coefficient": coefficient, "p": pvalue, "lower": low, "upper": high}, "series": [], "warnings": notes,
            "parameters": {"pValueMethod": pmethod}, "reference": f"https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.{'pearsonr' if method == 'pearson' else 'spearmanr'}.html"}

def _linear(rows, alpha, options):
    x, y = _xy(rows)
    n, xm = len(x), float(np.mean(x))
    sx = float(np.sum((x - xm) ** 2))
    fit = stats.linregress(x, y)
    yhat = fit.intercept + fit.slope * x
    residual = y - yhat
    sse = _number(residual @ residual, "Residual sum of squares")
    sigma = math.sqrt(sse / (n - 2))
    critical = float(stats.t.ppf(1 - alpha / 2, n - 2))
    coeffs = [["Intercept", float(fit.intercept), float(fit.intercept_stderr), float(fit.intercept - critical * fit.intercept_stderr), float(fit.intercept + critical * fit.intercept_stderr)], ["Slope", float(fit.slope), float(fit.stderr), float(fit.slope - critical * fit.stderr), float(fit.slope + critical * fit.stderr)]]
    points = []
    for xx in np.linspace(float(np.min(x)), float(np.max(x)), 101):
        mu = fit.intercept + fit.slope * xx
        half = critical * sigma * math.sqrt(1 / n + (xx - xm) ** 2 / sx)
        points.append({"x": float(xx), "y": _number(mu), "lower": _number(mu - half), "upper": _number(mu + half)})
    diagnostic = []
    if n <= 5000 and sigma > 0:
        shapiro = stats.shapiro(residual)
        diagnostic.append(["Shapiro–Wilk residual normality", float(shapiro.statistic), float(shapiro.pvalue)])
    if n >= 5 and sigma > 0 and np.ptp(residual ** 2) > 0:
        auxiliary = stats.linregress(x, residual ** 2)
        lm = float(n * auxiliary.rvalue ** 2)
        diagnostic.append(["Koenker–Breusch–Pagan (1 df)", lm, float(stats.chi2.sf(lm, 1))])
    tables = [_table("OLS coefficients", ["Coefficient", "Estimate", "SE", "CI lower", "CI upper"], coeffs)]
    if diagnostic:
        tables.append(_table("Diagnostics (descriptive checks)", ["Check", "Statistic", "p"], diagnostic))
    return {"tables": tables,
            "estimates": {"n": n, "slope": _number(fit.slope), "intercept": _number(fit.intercept), "rSquared": _number(fit.rvalue ** 2), "residualSD": sigma, "slopeP": _number(fit.pvalue), "residualDf": n - 2},
            "series": [{"name": "Linear fit", "kind": "fit", "points": points}, {"name": "Residuals versus fitted", "kind": "residuals", "points": [{"id": r.id, "x": _number(mu), "y": _number(e)} for r, mu, e in zip(rows, yhat, residual)]}],
            "parameters": {"intercept": "fitted", "weights": "equal", "band": f"{100 * (1 - alpha):g}% confidence band for the mean response"},
            "warnings": ["OLS assumes independent errors, a linear mean relationship and constant residual variance; classical t inference also assumes Gaussian errors. X is treated as measured without material error. The band is for the mean response, not a prediction interval. Diagnostic p-values do not automatically validate the model."],
            "reference": "https://www.itl.nist.gov/div898/handbook/pmd/section4/pmd431.htm"}

def _dose(rows, alpha, options):
    x, y = _xy(rows, 6)
    if np.min(x) <= 0 or len(set(x)) < 6:
        raise ValueError("Four-parameter logistic fitting requires at least six distinct positive doses. Zero-dose controls remain in the dataset but must be explicitly excluded from this log-dose model.")
    direction = options.get("direction", "increasing")
    if direction not in {"increasing", "decreasing"}:
        raise ValueError("Dose-response direction must be 'increasing' or 'decreasing'.")
    sign = 1. if direction == "increasing" else -1.
    logx = np.log(x)
    origin, scale = float(np.median(y)), float(np.ptp(y))
    yn = (y - origin) / scale
    span = max(1., float(np.ptp(logx)))
    lower = [-10., -8., float(logx.min() - 4 * span), -6.]
    upper = [10., 8., float(logx.max() + 4 * span), 6.]
    def model(theta, lx):
        bottom, logamp, logec, loghill = theta
        return bottom + math.exp(logamp) * special.expit(sign * math.exp(loghill) * (lx - logec))
    best = None
    for slope in [.5, 1., 2.]:
        fit = optimize.least_squares(lambda theta: model(theta, logx) - yn, [float(yn.min()), 0., float(np.median(logx)), math.log(slope)], bounds=(lower, upper), max_nfev=15000, ftol=1e-11, xtol=1e-11, gtol=1e-11)
        if fit.success and (best is None or fit.cost < best.cost):
            best = fit
    if best is None or np.linalg.matrix_rank(best.jac) < 4:
        raise ValueError("The four-parameter fit did not converge to an identifiable model. Add doses spanning both plateaus and the transition.")
    theta = best.x
    if np.any(np.minimum(theta - np.array(lower), np.array(upper) - theta) < 1e-5):
        raise ValueError("The four-parameter fit reached a parameter bound and is not reliably identifiable. Check direction and dose coverage.")
    df = len(rows) - 4
    covariance = np.linalg.pinv(best.jac.T @ best.jac) * (2 * best.cost / df)
    bottom = origin + scale * theta[0]
    amp = scale * math.exp(theta[1])
    top, ec50, hill = bottom + amp, math.exp(theta[2]), sign * math.exp(theta[3])
    transform = np.array([[scale, 0, 0, 0], [scale, amp, 0, 0], [0, 0, ec50, 0], [0, 0, 0, hill]])
    errors = np.sqrt(np.maximum(0, np.diag(transform @ covariance @ transform.T)))
    critical = float(stats.t.ppf(1 - alpha / 2, df))
    parameter_rows = [[name, _number(value), _number(se), _number(value - critical * se), _number(value + critical * se)] for name, value, se in zip(["Bottom", "Top", "EC50", "Hill slope"], [bottom, top, ec50, hill], errors)]
    points = []
    for lx in np.linspace(logx.min(), logx.max(), 161):
        fitted = origin + scale * model(theta, lx)
        gradient = np.zeros(4)
        for j in range(4):
            delta = 1e-5 * max(1., abs(theta[j]))
            high, low = theta.copy(), theta.copy()
            high[j] += delta
            low[j] -= delta
            gradient[j] = scale * (model(high, lx) - model(low, lx)) / (2 * delta)
        half = critical * math.sqrt(max(0., float(gradient @ covariance @ gradient)))
        points.append({"x": float(math.exp(lx)), "y": _number(fitted), "lower": _number(fitted - half), "upper": _number(fitted + half)})
    prediction = origin + scale * model(theta, logx)
    residual = y - prediction
    sse = float(residual @ residual)
    notes = ["Model: y = Bottom + (Top − Bottom) / [1 + (EC50 / dose)^HillSlope]. Positive doses, independent Gaussian errors and equal response variance are assumed. The direction is explicitly selected. Parameter intervals and the mean-response band use a local Jacobian/t approximation, not profile-likelihood intervals; plateau coverage is essential.", "This is an unweighted four-parameter logistic model, not a five-parameter model or a general nonlinear equation editor. No extrapolation is drawn outside the observed dose range."]
    if np.linalg.cond(best.jac.T @ best.jac) > 1e8:
        notes.append("The fitted parameters are strongly correlated or weakly identified; interpret EC50 and local intervals cautiously.")
    return {"tables": [_table("4PL parameters (local approximate intervals)", ["Parameter", "Estimate", "SE", "CI lower", "CI upper"], parameter_rows)],
            "estimates": {"n": len(rows), "bottom": _number(bottom), "top": _number(top), "ec50": _number(ec50), "hillSlope": _number(hill), "residualSD": math.sqrt(sse / df), "rSquared": _number(1 - sse / float(np.sum((y - y.mean()) ** 2))), "residualDf": df},
            "series": [{"name": "4PL fit", "kind": "fit", "points": points}, {"name": "Residuals", "kind": "residuals", "points": [{"id": r.id, "x": _number(mu), "y": _number(err)} for r, mu, err in zip(rows, prediction, residual)]}],
            "parameters": {"direction": direction, "weights": "equal", "model": "4PL", "intervals": "local Jacobian/t approximation"}, "warnings": notes,
            "reference": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html"}

def _survival(rows, alpha, options):
    if any(r.y < 0 or r.event is None for r in rows):
        raise ValueError("Survival analysis requires nonnegative times and an explicit event=true/false for every included subject. Censoring is never inferred.")
    grouped = {}
    for row in rows:
        name = row.factorA or row.group or row.groupId or "All observations"
        grouped.setdefault(name, []).append(row)
    if len(grouped) > 30 or any(len(rs) < 2 for rs in grouped.values()):
        raise ValueError("Survival analysis supports up to 30 groups with at least two subjects each.")
    ids = [r.subject for r in rows if r.subject]
    if len(ids) != len(set(ids)):
        raise ValueError("Survival analysis requires one independent time/event row per subject; repeated events are not supported.")
    zcrit = float(stats.norm.ppf(1 - alpha / 2))
    series, summary = [], []
    for name in sorted(grouped):
        rs = grouped[name]
        times = np.array([r.y for r in rs])
        events = np.array([r.event for r in rs], dtype=bool)
        survival, greenwood, median = 1., 0., None
        points = [{"x": 0., "y": 1., "lower": 1., "upper": 1., "nRisk": len(rs), "events": 0}]
        censors = []
        for time in sorted(set(times)):
            risk = int(np.count_nonzero(times >= time))
            deaths = int(np.count_nonzero((times == time) & events))
            if deaths:
                survival *= 1 - deaths / risk
                if risk > deaths:
                    greenwood += deaths / (risk * (risk - deaths))
            if survival <= .5 and median is None:
                median = float(time)
            low = high = survival
            if 0 < survival < 1 and greenwood > 0:
                loglog = math.log(-math.log(survival))
                se = math.sqrt(greenwood) / abs(math.log(survival))
                low = math.exp(-math.exp(min(700., loglog + zcrit * se)))
                high = math.exp(-math.exp(max(-700., loglog - zcrit * se)))
            points.append({"x": float(time), "y": float(survival), "lower": low, "upper": high, "nRisk": risk, "events": deaths})
            censors.extend({"id": r.id, "x": float(time), "y": float(survival)} for r in rs if r.y == time and not r.event)
        series.extend([{"name": name, "group": name, "kind": "survival", "points": points}, {"name": f"{name} censors", "group": name, "kind": "censors", "points": censors}])
        summary.append([name, len(rs), int(events.sum()), int((~events).sum()), median])
    tables = [_table("Kaplan–Meier summary", ["Group", "Subjects", "Events", "Censored", "Median survival (not reached = blank)"], summary)]
    estimates = {"n": len(rows), "groups": len(grouped), "events": sum(bool(r.event) for r in rows)}
    if len(grouped) > 1:
        names = sorted(grouped)
        k = len(names)
        observed_minus_expected = np.zeros(k)
        covariance = np.zeros((k, k))
        for time in sorted({r.y for r in rows if r.event}):
            risk = np.array([sum(r.y >= time for r in grouped[name]) for name in names], dtype=float)
            deaths = np.array([sum(r.y == time and r.event for r in grouped[name]) for name in names], dtype=float)
            n, d = risk.sum(), deaths.sum()
            probabilities = risk / n
            observed_minus_expected += deaths - d * probabilities
            if n > 1:
                covariance += d * (n - d) / (n - 1) * (np.diag(probabilities) - np.outer(probabilities, probabilities))
        reduced = covariance[:-1, :-1]
        if np.linalg.matrix_rank(reduced) != k - 1:
            raise ValueError("The log-rank covariance is singular: insufficient informative events or risk-set overlap to compare every group.")
        chi = _number(observed_minus_expected[:-1] @ np.linalg.solve(reduced, observed_minus_expected[:-1]), "The log-rank statistic")
        p = float(stats.chi2.sf(max(0., chi), k - 1))
        tables.append(_table("Overall log-rank comparison", ["χ²", "df", "p"], [[chi, k - 1, p]]))
        estimates.update({"statistic": chi, "df": k - 1, "p": p})
    return {"tables": tables, "estimates": estimates, "series": series,
            "parameters": {"censoring": "right censored", "eventCoding": "true = event; false = right censor", "confidenceInterval": "pointwise log-log Greenwood", "comparison": "unweighted overall log-rank"},
            "warnings": ["Times start at a shared origin, subjects are independent, and censoring is non-informative. Delayed entry, interval/left censoring, competing risks and recurrent events are not modeled. At tied times events precede censor removals. Confidence bands are pointwise, not simultaneous. Log-rank inference uses a chi-squared approximation; crossing hazards and few events limit interpretation."],
            "reference": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.logrank.html"}

def _agreement(rows, alpha, options):
    if len(rows) < 3 or any(r.x is None for r in rows):
        raise ValueError("Agreement analysis requires at least three complete, explicit X/Y pairs.")
    x, y = np.array([r.x for r in rows]), np.array([r.y for r in rows])
    ids = [r.subject for r in rows if r.subject]
    if len(set(ids)) != len(ids):
        raise ValueError("This Bland–Altman procedure requires independent pairs, not repeated measurements of a subject.")
    differences, averages = y - x, (x + y) / 2
    n = len(rows)
    bias, sd = float(differences.mean()), float(differences.std(ddof=1))
    z = float(stats.norm.ppf(1 - alpha / 2))
    t = float(stats.t.ppf(1 - alpha / 2, n - 1))
    lower, upper = bias - z * sd, bias + z * sd
    bias_half = t * sd / math.sqrt(n)
    loa_half = t * sd * math.sqrt(1 / n + z * z / (2 * (n - 1)))
    table = [["Bias (method Y − method X)", bias, bias - bias_half, bias + bias_half], ["Lower agreement limit", lower, lower - loa_half, lower + loa_half], ["Upper agreement limit", upper, upper - loa_half, upper + loa_half]]
    estimates = {"n": n, "bias": bias, "differenceSD": sd, "lowerAgreement": lower, "upperAgreement": upper}
    if np.ptp(averages) > 0 and np.ptp(differences) > 0:
        fit = stats.linregress(averages, differences)
        estimates.update({"proportionalBiasSlope": _number(fit.slope), "proportionalBiasP": _number(fit.pvalue)})
    return {"tables": [_table("Agreement estimates", ["Estimate", "Value", "CI lower", "CI upper"], table)], "estimates": estimates,
            "series": [{"name": "Differences versus means", "kind": "agreement", "points": [{"id": r.id, "x": _number(a), "y": _number(d)} for r, a, d in zip(rows, averages, differences)]}],
            "parameters": {"difference": "Y − X", "agreementCoverage": 1 - alpha, "intervals": "t approximate intervals for bias and agreement limits"},
            "warnings": ["Independent paired measurements, approximately Gaussian differences and stable difference variance across the measurement range are assumed. Limits describe agreement, not correlation or evidence of equivalence. Acceptance limits must be defined scientifically. Agreement-limit intervals use the standard large-sample approximation and may be poor for small samples."],
            "reference": "https://doi.org/10.1016/S0140-6736(86)90837-8"}

def analyze_advanced(payload: dict | AdvancedRequest) -> dict:
    request = payload if isinstance(payload, AdvancedRequest) else AdvancedRequest.model_validate(payload)
    if request.method not in METHODS:
        raise ValueError("Unknown advanced analysis method.")
    rows = [r for r in request.rows if not r.excluded]
    if not rows:
        raise ValueError("No included observations remain for analysis.")
    dispatch = {"two-way-anova": _two_way, "repeated-anova": _repeated, "mixed-model": _mixed,
                "linear-regression": _linear, "dose-response": _dose, "survival": _survival, "bland-altman": _agreement}
    with np.errstate(over="raise", invalid="raise", divide="raise"), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            result = _correlation(rows, request.alpha, request.method) if request.method in {"pearson", "spearman"} else dispatch[request.method](rows, request.alpha, request.options)
        except (FloatingPointError, np.linalg.LinAlgError, OverflowError) as exc:
            raise ValueError("Numerical overflow or a non-estimable model occurred. Check units, scaling and variability.") from exc
    if len(rows) != len(request.rows):
        result["warnings"].insert(0, f"{len(request.rows) - len(rows)} explicitly excluded observations were omitted; original measurements remain unchanged.")
    for warning in caught:
        message = str(warning.message)
        if message not in result["warnings"]:
            result["warnings"].append(message)
    result.update({"method": request.method, "methodLabel": METHODS[request.method], "engine": f"SciPy {scipy.__version__} / NumPy {np.__version__}", "fingerprint": request.fingerprint, "createdAt": datetime.now(timezone.utc).isoformat()})
    result["parameters"] = {"alpha": request.alpha, **result["parameters"]}
    try:
        json.dumps(result, allow_nan=False)
    except ValueError as exc:
        raise ValueError("The analysis produced a non-finite result; check scaling and model suitability.") from exc
    return result
