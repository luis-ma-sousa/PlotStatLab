# PlotStatLab — expert guide

**PSL 0.3.0 · Data, statistics, vector editing and reproducibility**

This guide describes the current workflow and its limits. The [roadmap](ROADMAP.md) separates implemented functions from planned work. For the basic clicks, use the [beginner's guide](BEGINNER-GUIDE.md).

## 1. Project model

A workspace contains multiple datasets, each with its own groups and analysis settings, plus figures, saved analysis runs and reusable styles. Figures linked to the same dataset share that table; different datasets remain independent. Each figure retains its own chart type, titles, visual settings, per-observation overrides, attached analysis and manual comparison positions.

| Artifact | What it preserves |
|---|---|
| `.psl` | The versioned, editable PSL project: data, results, settings and figures |
| Browser autosave | A local browser copy, not cloud synchronization or a shared file |
| SVG | Editable text and vector objects for external graphic editing |
| PNG | A raster image at explicit pixel dimensions |

Opening `.psl` restores a complete workspace. Legacy `.labplot` files become single-dataset workspaces. Importing one or several CSV files adds datasets and figures without replacing existing work. Exporting a figure does not back up the statistical project.

## 2. Data layout and identity

### Wide input format

The importer expects headers and one numeric column per group. An optional subject column and X column have special meanings:

```csv
Subject,X,Control,Treatment
A01,0,12.2,13.1
A02,5,14.0,18.8
A03,10,11.7,20.4
```

| Column | Interpretation |
|---|---|
| `Subject` | Subject identity; not a numeric group |
| `X` | X coordinate shared by values in that row |
| Other columns | Groups of Y observations |

The importer also recognizes common ID header variants, including `Subject ID`, `ID` and the legacy localized aliases supported by the parser. Headers must be nonempty and unique. When an X column exists, rows containing observations require an X value.

Comma, semicolon and tab delimiters are supported. Decimal commas require an unambiguous delimiter, such as semicolon. Scientific notation is accepted; nonnumeric and nonfinite values are rejected.

### Missing values and zeros

An empty cell does not create an observation. Zero creates a measurement equal to zero. Independent groups may have unequal sample sizes. Import requires at least one number per group, and the implemented group tests require at least two observations per group.

The app does not impute missing observations or automatically discard incomplete pairs. Do not replace missing values with zeros.

### Pairing

Paired analyses require the same complete set of subjects in every group, with a nonempty, unique subject ID per group. The engine aligns observations by subject ID, not row order.

```csv
Subject,Before,After
P01,18.0,21.2
P02,22.4,25.0
P03,19.7,24.5
P04,24.1,26.2
```

IDs generated to organize a table without `Subject` do not establish experimental pairing. Supply genuine subject IDs and confirm that they represent the same experimental unit across conditions. Selecting a paired design is a statement about the experiment, not an inference made by the software.

A paired chart can connect matching IDs even when the data are not suitable for a paired statistical test. Visual connections and valid assumptions are separate questions.

### Internal observation identity

Each observation also has an internal stable ID, separate from group names and subject labels. Visual overrides attach to that ID. Editing an existing measurement preserves its identity; deleting an observation removes orphan visual overrides when the project is reconciled/saved. A fresh import must not be used to transfer old point overrides to unrelated measurements.

## 3. Charts and conventions

| Chart | Current representation |
|---|---|
| Bar + swarm | Mean, optional error bars and individually editable observations with deterministic horizontal packing |
| Bar | Mean and optional error bars |
| Swarm | Observations, mean and optional error bars |
| Box plot | Median, quartiles, Tukey whiskers at 1.5×IQR and overlaid observations |
| Violin | Density estimate, quartile/median summary and observations |
| Raincloud | Partial density, summary and observations |
| Paired | Subject-linked observations, summary and optional errors |
| XY scatter | Y observations at their X coordinates |
| XY lines | Observations ordered by X and connected within group |
| Histogram | Bin counts overlaid by group |
| Density | Smoothed density estimate by group |
| ECDF | Empirical cumulative distribution with observations |
| Heatmap | Values by group and observation/subject identity, retaining gaps |

Without explicit X, XY uses the observation's index within its group. With missing values, those indices may not correspond to experimental times or doses; import explicit X when coordinates carry scientific meaning. The current wide format uses one X column shared per row. More complex independent XY schemes may require data preparation.

Logarithmic Y applies to compatible group and XY charts. Values ≤ 0 are omitted from that visual representation with an editor warning; their original measurements remain in the data and analysis. Histograms, densities, ECDFs and heatmaps use their own axis conventions. A log display does not transform the statistical input automatically.

With dense data, the swarm seeks nonoverlapping positions and may expand beyond its initially allotted group width. Inspect dense figures and increase dimensions or reduce symbol size when needed.

## 4. Error bars

| Setting | Calculation within a group |
|---|---|
| SD | Sample standard deviation, denominator n−1 |
| SEM | SD / √n |
| 95% CI | Mean ± Student-t critical value at 97.5%, n−1 degrees of freedom × SEM |
| None | No error bars |

Fewer than two observations do not yield an estimated sample error. These summaries use arithmetic means of stored values; selecting a log axis does not produce geometric means or a transformed-data analysis.

Graphical mean intervals use 95%. Intervals for differences in statistical results use the analysis's selected `1−α` level. These settings are distinct.

## 5. Statistical assistant

Compatibility checks cover group/sample counts, selected design, pairing identity and degenerate cases. The default suggestion favors Welch for compatible independent mean comparisons and a paired procedure when that design is declared.

A suggestion does **not** validate sampling, independence, pseudoreplication, normality, symmetry, residual distributions or scientific relevance. PSL does not choose a test by automatically dichotomizing a preliminary normality test.

### Implemented procedures

| Procedure | Design and scope | Main interpretation/assumptions |
|---|---|---|
| Welch t-test | Two independent groups | Mean comparison without equal-variance assumption; independence and model adequacy remain necessary |
| Student t-test | Two independent groups | Mean comparison assuming equal population variances and approximately normal errors |
| Paired t-test | Two conditions on the same subjects | Mean paired difference, with an appropriate model for the differences |
| Mann–Whitney U | Two independent groups | Rank-based distribution comparison; not automatically a median test |
| Paired Wilcoxon | Two conditions on the same subjects | Signed ranks of differences; symmetry matters for a location interpretation |
| One-way ANOVA + Student t-tests | Three or more independent groups | Equal-variance global F; pairs use Student t-tests with the chosen correction |
| Welch ANOVA + Welch t-tests | Three or more independent groups | Global Welch F; pairs use Welch t-tests with the chosen correction |
| One-way ANOVA + Tukey HSD | Three or more independent groups | All pairs, equal-variance model, Tukey family adjustment and simultaneous intervals |
| Kruskal–Wallis + Mann–Whitney | Three or more independent groups | Global rank test; pairs use Mann–Whitney with the chosen correction |
| Friedman + Wilcoxon | Three or more conditions on the same subjects | Global repeated-condition rank test; pairs use Wilcoxon with the chosen correction; global approximation can be inaccurate with small subject/condition counts |

These group tests are two-sided in this version. Selecting an XY chart does not automatically request correlation or regression.

**Kruskal–Wallis + Mann–Whitney is not Dunn's post-test. Adjusted t-tests against a control are not Dunnett's test.** Report the complete procedure and correction.

### Comparison families

- **Each group versus control:** selected reference versus every other group; correction applies to that family.
- **All pairs:** correction applies to all group combinations.
- **Tukey HSD:** always uses all pairs and its own adjustment; it does not apply a second Holm/Bonferroni/BH correction.

The chosen family should reflect the scientific question. PSL calculates the selected pairs without requiring a significant omnibus p-value first; plan and report your inferential strategy.

### Multiple testing

| Method | Control target |
|---|---|
| Holm | Family-wise error rate, sequential adjustment |
| Bonferroni | Family-wise error rate using the number of comparisons |
| Benjamini–Hochberg | False discovery rate, FDR |
| None | Individual p-values without family adjustment |

The adjustment covers the selected family, not every analysis performed across projects. Repeatedly trying analyses and selecting results afterwards is not automatically corrected.

### Results and intervals

The results table includes individual and adjusted p-values, test statistic, mean difference and intervals when available. A mean difference is descriptive in a rank-based test; it is not necessarily the parameter tested.

Difference intervals from t-tests are individual intervals even when the associated p-values are adjusted across multiple pairs. Do not describe them as simultaneous adjusted intervals. Tukey intervals already correspond to its comparison family. Read the notes attached to each analysis.

Constant inputs, inadequate sample sizes, overflow and nonfinite results are rejected rather than returned as apparently valid analyses. Check the original measurements and the error explanation.

## Outliers, flags and exclusions

Use **Find outliers** to choose **ROUT** or **Grubbs**, then **Detect outliers**. ROUT exposes **Q (false discovery rate)** at 0.1%, 1%, 5% or 10%; Grubbs exposes **Alpha** at 0.05 or 0.01. Results list flagged observations by group; current flags have an amber ring. Detection does not automatically exclude observations. The selected-point **Exclude from analysis** checkbox is explicit and reversible: original measurements remain stored and excluded points are faded/crossed. Data or exclusion edits make detection results stale, requiring a new detection run.

An outlier procedure identifies observations that deserve review under a specified model. It does not establish that a measurement is erroneous. A flag, a visual highlight and an exclusion have different consequences:

| Action | Consequence |
|---|---|
| Visual override | Changes appearance only; the measurement still contributes to statistics |
| Review flag | Records that an observation needs attention; the original measurement must remain preserved |
| Explicit exclusion | Changes the observations used by an analysis; retain the original value and record the reason |

Do not infer exclusion from opacity, symbol color or whether a point is easy to see. Review exclusions explicitly and report the rule, method, threshold, affected observations and results with/without exclusions when appropriate.

Named outlier methods are not interchangeable. Grubbs tests and ROUT use different assumptions and procedures. A result should identify the method actually implemented and its parameters; do not assume equivalence to GraphPad's implementation from a similar name or interface. The outlier implementations are experimental until their method-specific validation is recorded; consult the current method documentation and validation notes before using a detection result in a final analysis. Never delete original measurements automatically as part of review.

## 6. Significance annotations

Each comparison retains the identity of its two groups. Labels use `adjustedP`, including the original p-value when no adjustment is applied. Conventional thresholds are strict:

| Threshold | Mark |
|---|---|
| p < 0.0001 | `****` |
| p < 0.001 | `***` |
| p < 0.01 | `**` |
| p < 0.05 | `*` |
| Otherwise | `ns` |

The selected α controls filtering, not the conventional star thresholds. For example, α = 0.01 can hide a comparison with adjusted p = 0.03 even though its conventional label would be `*`. Prefer numeric labels and a clear caption where needed.

Brackets appear on categorical charts: bar, bar + swarm, swarm, box, violin, raincloud and paired. They are not projected onto arbitrary XY coordinates or histogram bins.

Automatic layout reserves space above data/error bars and separates comparisons into levels. Point size and outline width contribute to clearance. Many comparisons can require a larger figure or a more focused comparison family. Inspect manual axis limits and manual offsets before export.

Select a comparison to drag it, edit X/Y offsets or use arrow keys; `Shift` uses larger arrow-key steps. X moves the label while endpoints remain anchored to groups; Y moves the bracket. Resetting removes the manual override.

### Result freshness

PSL compares current dataset measurements with each analysis's recorded configuration and fingerprint. Changes to values, IDs, X coordinates, observations or exclusions make affected results stale. Selecting the next test in the assistant does not rewrite or invalidate a historical run; each run retains its own configuration. Stale annotations are hidden, including during export. Appearance-only edits do not recalculate statistics.

Recalculating updates that figure's attached results and resets its manual comparison positions; the previous run remains in the overview history. Each run is retained in the workspace analysis history, linked to its dataset and recorded configuration. The current figure attaches the latest run made for that figure. Other figures and earlier runs retain their results; data/exclusion changes mark only the affected dataset results stale.

## 7. Visual overrides and reusable styles

General formatting covers palette, typography, axes, symbols, opacity, bar width, lines, dimensions and error settings. Point-level overrides can change color, size, shape, outline, outline width and opacity.

The precedence is **figure/group style → observation override**. Applying a style preserves destination observation overrides. **Reset to group style** removes the selected point's exception.

HEX fields accept three or six digits, with or without `#`. Opacity has its own control; do not use an alpha HEX value as a substitute.

| Copy scope | Main properties |
|---|---|
| Complete | All general formatting, including dimensions and axis options |
| Colors | Palette, background, axis color and bar opacity |
| Typography | Font family and text/title sizes |
| Axes | Limits, scale, grid and line width |
| Points | General point size, shape and opacity |

Copying a style preserves data, titles, results and individual overrides. Saved presets belong to the project and travel in `.psl`.

## 8. Editable SVG in Illustrator

SVG export favors a simple, self-contained vector structure: separate primitives, text retained as text, explicit presentation properties and identifiable groups. Editor selection/control overlays are excluded. SVG is not a native `.ai` document or a format for restoring PSL statistics.

Recommended workflow:

1. Set dimensions and appearance in PSL.
2. Save the scientific source as `.psl`.
3. Export **SVG**.
4. In Illustrator, use **File → Open**, rather than treating the figure only as a placed image.
5. Inspect text, symbols, comparisons and clipping. Use Layers and **Ungroup** when necessary to reach individual objects.
6. Keep the original fonts installed. After font substitution, review alignment and spacing.
7. Save an `.ai` working copy and the publication format required by your destination.

Editable text depends on available fonts. Converting text to outlines in a later delivery can preserve its appearance but removes text editing; PSL retains text to favor editability.

Clipping groups constrain data to the plotting region. Releasing a clipping mask can reveal objects outside axis limits, so inspect the result before removing one. The contained objects remain vector objects.

Illustrator edits do not modify the `.psl` data/results, and there is no synchronization back to PSL.

## 9. PNG and physical size

PNG is rasterized from the same SVG representation at figure dimensions multiplied by the export scale. The dialog shows final pixels. For example, 800 × 560 at 3× produces 2400 × 1680 pixels.

Do not assume an editorial DPI preset is embedded. Required pixels = intended width in inches × DPI. SVG avoids raster-resolution limits, but final physical size and readable typography still matter.

## 10. Persistence and recovery

The `.psl` format uses `schemaVersion: 1`. Loading validates structure, enums, finite numbers, IDs and formatting. Unsupported schema versions are rejected. Initial-version projects remain on this schema.

Autosave is scoped to a browser profile and local origin. Disabling it stops subsequent automatic project writes; it does not erase an older stored copy. The toggle preference persists. **Save workspace** creates a portable file independently of that preference.

If a stored browser project is corrupt, recovery attempts to preserve its raw content before starting a demonstration project and reports the issue. If preserving the original fails, automatic saving is suspended rather than silently overwriting it.

Keep explicit versions such as `study-01-data.psl`, `study-02-analysis.psl` and `study-03-final-figure.psl`. PSL is not an immutable audit trail of every scientific decision.

## 11. Offline operation and updates

The distribution includes the compiled interface. Launchers prepare local Python dependencies without requiring Node.js from end users. Initial setup and update downloads require Internet; a prepared installation can run offline.

Online launches check for available GitHub releases. An update is prepared before opening the editor, with package verification and a recovery copy of the previous installation. An interrupted or invalid update should preserve the previously usable version. Updates are deferred when a session is already active to protect unsaved work.

Updates must not replace user `.psl` files or browser storage. Save your project before closing or changing computers. While the repository is private, authorized GitHub access is required for private release downloads and updates.

The server listens on `127.0.0.1`, port 8765. It is not configured as a public network service. Statistical computation is local; chart data do not need to be sent to an external analysis service.

## 12. Reproducibility and limits

Retain the original measurements and experimental unit; the `.psl`; the full design, test, comparison family, correction, α and error-bar definition; PSL/engine versions; and data-preparation or external graphic-editing decisions.

PSL includes numerical and project tests but does not claim complete GraphPad Prism equivalence or validate a scientific design automatically. Mixed models, two-factor/repeated-measures parametric ANOVA, regression, dose–response, survival and additional specialized charts are future work. See the [roadmap](ROADMAP.md).

Technical references: [SciPy statistical functions](https://docs.scipy.org/doc/scipy/reference/stats.html), [Welch/Student t-tests](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_ind.html), [Tukey HSD](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.tukey_hsd.html).


## Multiple datasets and side-by-side review

Use **Overview → Import datasets** to select several CSV/TSV files in one operation. Each becomes a named dataset with its own table and initial figure. Imports are validated before they are added; the existing workspace is preserved if a file is invalid. Use the sidebar to select a dataset. Figures retain an explicit dataset link, so applying a style from another dataset transfers the appearance without replacing measurements.

Every successful statistical run is kept in the analysis history, including its dataset, test, correction, alpha, results and timestamp. Run different tests or analyze different datasets, then use **Overview → Choose analyses** to display selected results side by side. Each historical result is checked against its own recorded configuration and current dataset measurements. Changing the assistant's next-test controls does not rewrite previous tests.

Use **Choose figures** to select several figures from the same or different datasets. Preview cards show the dataset name and provide **Edit figure**. The complete selection is saved in **Save workspace → .psl**, along with every dataset, test and figure. Legacy `.labplot` files remain supported and convert to a one-dataset workspace. CSV export contains raw measurements; use `.psl` to preserve exclusions and the complete analysis state.

## Broader designs in the 0.3 workbench

The advanced panel now supports Type III two-factor ANOVA, one-factor repeated-measures ANOVA with Greenhouse–Geisser, a Gaussian subject-random-intercept REML model, Pearson/Spearman, OLS, unweighted 4PL fitting, Kaplan–Meier/log-rank and Bland–Altman. These are precisely scoped procedures; consult [Advanced methods and independent validation](ADVANCED-METHODS.md) before choosing the model. Dunn pooled-rank post-tests and original single-step Dunnett control comparisons are available in the group panel. Dunnett/Tukey retain their own intrinsic family adjustments.

Long-format tables make factors, subjects, numeric predictors and censoring explicit. [Native Excel import](EXCEL-IMPORT.md) supports multiple sheets and saved formula results while rejecting absent caches. Advanced runs remain independently selectable across datasets and are saved with the workspace. Current fitted curves and confidence bands are linked to a particular preserved result; stale curves are omitted.

The [Publication workbench](PUBLICATION.md) provides aligned panels, shared typography in final points, physical dimensions, size templates and batch vectors/PNGs with resolution metadata. Publication templates are starting dimensions, not a certification of a journal's current submission requirements. SVG interoperability is structurally tested; live Illustrator validation remains deferred by the user.
