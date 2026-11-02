# Advanced designs and methods

All calculations described here run in the local Python process. No measurements are sent to an online statistics service. Open **Statistics → Factorial, regression & survival**. Import a long-format CSV/TSV or Excel table, or open **Data → Advanced table & scientific examples**. Examples are synthetic and are added as separate datasets.

## Explicit table columns

Each row is one observation, with a stable internal identity. `y` is the response; aliases `response`, `value`, `time`, `estimate` and `p` are accepted during import. `x` is the predictor or first measurement. `factorA` and `factorB` are categorical assignments; `subject` identifies repeated observations; `group` provides a series/stratum name. `event` is explicitly **1 = event, 0 = right-censored**. `label`, `lower` and `upper` provide forest/volcano labels and supplied intervals. For volcano data, X must already be log2 fold change and Y must already be the chosen raw or adjusted p-value. PSL does not compute differential-expression p-values from expression matrices.

Use blanks for optional columns. A response cannot be blank. Missing measurements are represented by absent observation rows, never by zero. Import refuses unknown column names and malformed numbers rather than guessing their meaning. Edit any cell, or exclude an observation explicitly; original excluded measurements are retained.

## Two-way ANOVA

The full independent-errors model includes factor A, factor B and their interaction, with sum-to-zero contrasts and Type III partial F tests. Unequal cell sizes are supported; all factor combinations must be represented, the design must be full rank, and residual degrees of freedom and variance must be positive. Main effects in the interaction model compare equally weighted marginal means. These are not sequential Type I tests. Independent approximately Gaussian errors and equal residual variances are required. The result includes cell means, residuals and partial eta squared. There are no automatic pairwise claims from an overall factor or interaction p-value.

An unbalanced 2×3 design is checked against statsmodels `anova_lm(typ=3)` with `Sum` contrasts in `tests/advanced_reference.json`.

## Repeated-measures ANOVA

This is a **one-factor within-subject** ANOVA, with uncorrected results and the Greenhouse–Geisser correction. Each subject must have exactly one observation at every condition. Incomplete subjects and duplicate condition measurements are rejected; no averaging or deletion happens automatically. Subject IDs define pairing. The within-subject factor is selected explicitly. The corrected p-value is primary. The uncorrected F and p are independently checked against statsmodels `AnovaRM`; the Greenhouse–Geisser covariance equation and corrected degrees of freedom are checked numerically.

This procedure does not implement a two-factor repeated-measures ANOVA.

## Mixed model

The supported model is Gaussian with a **subject random intercept** and either categorical factor A or a numeric X fixed predictor. Estimation uses REML, a profiled variance ratio, and block covariance identities. Fixed-effect standard errors use plug-in GLS covariance with normal Wald tests. This differs from a profiled observed-Hessian covariance and from Satterthwaite or Kenward–Roger inference. The asymptotic tests can be unreliable with few subjects.

Only supplied, included rows are fitted. There is no imputation, interpolation or automatic complete-subject deletion; missingness must be plausibly missing at random. Random slopes, crossed random effects and generalized mixed models are outside this model. A missing-observation reference is checked against statsmodels `MixedLM` for coefficients, REML variances and likelihood; standard errors are checked against a separate full dense GLS covariance calculation. The stored fixture identifies the reference version.

## Correlation and linear regression

Pearson uses SciPy's two-sided null distribution and Fisher-z confidence interval. Spearman uses an exact two-sided permutation for up to eight pairs and an asymptotic approximation for larger samples, with the small-sample limitation reported. An unweighted ordinary least-squares line fits an intercept and slope. It reports coefficient intervals, slope p, R², residual SD, residual identity and a confidence band for the **mean response**, not an individual prediction interval. Residual Shapiro–Wilk and Koenker–Breusch–Pagan checks are descriptive diagnostics, not automatic approval of assumptions. Independent observations, appropriate error assumptions and negligible predictor measurement error remain the researcher's responsibility.

## Four-parameter dose response

The unweighted model is `Y = Bottom + (Top − Bottom) / [1 + (EC50 / dose)^HillSlope]`. Select increasing or decreasing response explicitly. At least six distinct positive doses are required. Zero-dose controls remain stored but must be explicitly excluded from this log-dose model. No logarithm of zero is invented. The fit reports convergence/identifiability problems, parameter estimates, local Jacobian/t intervals, residuals and a mean-response band, without extrapolation. These intervals are approximate, particularly with poor plateau coverage. Five-parameter models and a general equation editor are not implemented. Increasing and decreasing synthetic curves with known parameters are recovered in numerical tests.

## Survival

Kaplan–Meier estimates use explicit times, group assignments and right-censoring indicators. At tied times, events are processed before censor removal. Pointwise log-log Greenwood intervals are available. The overall unweighted log-rank comparison uses the full risk-set covariance and a chi-squared approximation. Two-group results are independently checked against SciPy `logrank(CensoredData, CensoredData)`. Delayed entry, competing risks, interval/left censoring and recurrent events are not modeled. Insufficient informative events or singular comparisons are rejected with an explanation. A survival curve is not evidence of proportional hazards or a hazard ratio estimate.

## Agreement, forest and volcano

Bland–Altman uses paired independent X/Y measurements, `Y − X` differences, their mean, sample SD and normal agreement limits; it supplies t-approximate intervals for bias and agreement limits. This is not a repeated-measurement agreement model. Forest plots display supplied point estimates and supplied intervals; they do not silently calculate a pooled meta-analysis. Volcano plots display supplied log2 fold changes and supplied probabilities, with editable thresholds. Zero or invalid probabilities are identified rather than replaced with arbitrary plotting values.

## Dunn and Dunnett post-tests

The group-comparison panel includes **Kruskal–Wallis + Dunn**, with ranks pooled across all included groups, average ranks for ties, tie-corrected rank variance and a two-sided normal approximation. Holm, Bonferroni, BH or no correction applies to the selected pair family. It is distinct from Kruskal–Wallis + Mann–Whitney. **ANOVA + Dunnett** uses SciPy's original single-step, two-sided treatment-versus-control test and simultaneous intervals. Its own family adjustment applies; another correction is not stacked on top. The control family is required. Reproducible multivariate-t integration uses a fixed random generator seed and may have small integration error.

## Result preservation

Every advanced run stores its method, engine version, alpha, model options, tables, fitted series, warnings, timestamp and data fingerprint. Different tests on the same dataset remain separate. Data, factor or exclusion edits mark their results out of date; stale fits and bands are not drawn. Use **Create figure with this result** to link a figure to a particular run. Choose several advanced results in **Overview** to compare them across datasets. Save the complete workspace as `.psl`.

## Primary references

- [SciPy statistical methods](https://docs.scipy.org/doc/scipy/reference/stats.html)
- [statsmodels Type III ANOVA](https://www.statsmodels.org/stable/generated/statsmodels.stats.anova.anova_lm.html)
- [statsmodels mixed models](https://www.statsmodels.org/stable/mixed_linear.html)
- [Greenhouse and Geisser](https://doi.org/10.1007/BF02289823)
- [SciPy nonlinear least squares](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html)
- [SciPy log-rank equations](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.logrank.html)
- [Bland and Altman](https://doi.org/10.1016/S0140-6736(86)90837-8)
- [Dunn, multiple comparisons using rank sums](https://doi.org/10.1080/00401706.1964.10490181)
- [SciPy original Dunnett test](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.dunnett.html)
