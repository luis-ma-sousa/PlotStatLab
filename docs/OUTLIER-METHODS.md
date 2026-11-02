# Outlier detection in PlotStatLab

PSL offers **Grubbs** and **ROUT**, the two principal methods available for column outlier detection in GraphPad Prism. These are separate from the quartile whiskers shown in a box plot. Detection is performed within each column; columns are never pooled. See [GraphPad's method overview](https://www.graphpad.com/guides/prism/latest/statistics/stat_how_to_removing_outliers.htm).

## Grubbs: one potential outlier

The two-sided statistic is the largest absolute departure from the sample mean divided by the sample standard deviation. PSL uses the Student-t critical value with `n−2` degrees of freedom and tail probability `alpha/(2n)`. It flags at most one observation in a column and does not automatically repeat after removing that observation. The observations should be independent and otherwise approximately normally distributed. Multiple contaminants can hide each other from this single-outlier test. See the [NIST definition and worked example](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h1.htm).

## ROUT: potential multiple outliers

For column values, PSL fits the constant model `Y = M` using the published adaptive Lorentzian method. The residual scale is the linearly interpolated 68.27th percentile of absolute residuals, multiplied by `n/(n−1)`. Each fitting update compares old and new merit scores using the same updated scale. The final absolute residuals, divided by that scale, receive two-sided Student-t probabilities with `n−1` degrees of freedom. A modified FDR step-up rule tests the largest 30% of residuals, rounding the candidate count up. Set Q to the desired false-discovery-rate parameter: 0.1%, 1%, 5% or 10% in the interface; smaller Q is stricter.

Reference: Motulsky HJ and Brown RE (2006), *Detecting outliers when fitting data with nonlinear regression — a new method based on robust nonlinear regression and the false discovery rate*, BMC Bioinformatics 7:123. [Open-access paper, including equations1 and8–18](https://doi.org/10.1186/1471-2105-7-123).

## What “comparable to Prism” means here

PSL implements the published methods, rather than a generic median/MAD cutoff renamed ROUT. Its ROUT fit is a deterministic one-parameter numerical implementation, with explicit linear percentile interpolation. **Numerical equivalence to a particular GraphPad Prism version has not been certified.** No proprietary Prism code or proprietary reference datasets were used. Differences close to a rejection boundary can result from optimizer convergence or percentile conventions. Regression-residual outlier detection for nonlinear curves is outside this column-analysis implementation.

The tests include NIST's uranium measurements: Grubbs identifies245.57, with `G ≈2.4687646112` and the two-sided 5% critical value `≈2.1266450872`. NIST's example prints a one-sided critical value; PSL intentionally uses the two-sided test. ROUT is checked against a hand-calculated symmetric location/scale solution, its published Student-t/FDR equations, scale/shift/order invariance, tiny samples, multiple-contaminant masking and preservation of measurement IDs. These checks support correctness of the implementation; they do not substitute for a vendor comparison.

## Flags, exclusions and previous work

Detection returns stable observation IDs and diagnostics. It does **not** change a value, delete a row or automatically exclude anything. Already-excluded observations are omitted from a new detection run and counted in its report. Exclusion is a separate, explicit user decision; the original measurements remain in the project. Changing measurements or exclusions requires re-running analyses and detection so that the displayed flags cannot silently refer to an old dataset.

Groups with fewer than three included measurements receive an `insufficient-data` status. Constant groups have no flags. If robust fitting fails to converge or the residual scale collapses numerically, PSL returns no ROUT flags and explains the limitation. This is preferable to manufacturing extreme probabilities from an undefined scale.

A flag is evidence relative to a chosen model, not proof of a laboratory error. Review experimental records and biological variation before excluding a measurement. An inappropriate model, pooled populations or dependent technical replicates can produce misleading flags. For paired analyses, a unilateral exclusion can create incomplete pairs; PSL does not silently discard the matching partner.
