# PlotStatLab — current scope and roadmap

This page distinguishes implemented functionality from planned work. Priority can change with user needs and scientific validation.

## Current 0.2 line

- Thirteen charts: bar + swarm, bar, swarm, box, violin, raincloud, paired, XY scatter, XY lines, histogram, density, ECDF and heatmap.
- Per-observation styling, selective style transfer and project presets.
- Outlier review with ROUT/Grubbs options, preserved original measurements, visual flags and explicit reversible exclusions; method-specific validation must be reported.
- Ten group procedures: Welch, Student, paired t, Mann–Whitney, Wilcoxon, one-way ANOVA, Welch ANOVA, ANOVA/Tukey HSD, Kruskal–Wallis and Friedman, with pairwise methods named explicitly in the expert guide.
- Holm/Bonferroni/BH or Tukey's own adjustment, automatic significance annotations and manual positioning.
- CSV/TSV, editable tables, versioned projects, controllable autosave and PNG/editable SVG export.
- Setup/launch workflows, compiled interface and documentation for use under MIT.

## Broader experimental designs

- Two-factor tables and grouped charts.
- Two-way ANOVA and parametric repeated-measures ANOVA.
- Mixed models with explicit missing-observation policy.
- Correlation, linear regression and diagnostics.
- Independent validation of each analysis, result format and recommendation.

## Specialized charts and analyses

- Dose–response and nonlinear regression.
- Kaplan–Meier and survival comparisons.
- Forest, Bland–Altman and volcano plots.
- Additional post-tests with their own names/assumptions, including evaluation of Dunn and Dunnett.
- Further validation and reporting of outlier detection, flagging and explicit exclusion workflows; preserving original measurements is required.

These specialized chart/analysis items are not part of the 13-chart catalog.

## Publication workflows

- Multipanel layouts with alignment and A/B/C labels.
- Batch export, physical dimensions and journal presets.
- Broader scientific typography, including superscripts and subscripts.
- Vector interoperability tests across more versions/platforms.

## Data and distribution

- Native Excel import and more flexible XY schemas.
- Larger-dataset and accessibility testing.
- Signed desktop packages and graphical installation, complementing current launchers.
- Format migrations, recovery and verified update behavior across more environments.

Importing native GraphPad Prism projects requires separate investigation. PNG and SVG cannot reconstruct an earlier figure's underlying data and analysis automatically.
