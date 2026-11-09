# PlotStatLab — expert guide

**Data, statistics, vector editing and reproducibility**

This guide describes the current workflow and its limits. The [roadmap](ROADMAP.md) separates implemented functions from planned work. For the basic clicks, use the [beginner's guide](BEGINNER-GUIDE.md).

## 1. Project model

A workspace contains multiple datasets, each with its own groups and analysis settings, plus figures, saved analysis runs and reusable styles. Figures linked to the same dataset share that table; different datasets remain independent. Each figure retains its own chart type, titles, visual settings, per-observation overrides, attached analysis and manual comparison positions.

The workflow separates three actions: edit a dataset, calculate and save a result, then attach that result to a chosen figure. A figure explicitly selects its source dataset and plotted columns; an analysis separately selects its input columns. A t-test can therefore use two columns from a wider dataset while another figure or analysis uses more columns. See the [workflow reference](UX-WORKFLOW.md) for the object model.

| Artifact | What it preserves |
|---|---|
| `.psl` | The versioned, editable PSL project: data, results, settings and figures |
| Browser autosave | A local browser copy, not cloud synchronization or a shared file |
| Results CSV / JSON | A selected analysis's report or structured result; not the complete dataset/workspace |
| SVG | Editable text and vector objects for external graphic editing |
| PNG | A raster image at explicit pixel dimensions |

Opening `.psl` restores a complete workspace. Legacy `.labplot` files become single-dataset workspaces. **Switch / new workspace** opens the local workspace library and checkpoints current work before switching. The same action is available by clicking the workspace name at the top. Importing tables adds datasets without replacing the open workspace. Exporting a figure does not back up the statistical project.

## 2. Data layout and identity

### Wide input format

Use **New dataset → Create blank table** to enter data without importing. Rename numeric column headings and type into cells, or paste a rectangular range starting at a chosen cell. Direct grid paste takes values without headings and updates the selected range; validation happens before any range is applied. Existing observation IDs and exclusion flags survive value edits. **Paste table / Paste new dataset** takes a complete table with headers and adds a dataset.

Wide table import expects headers and one numeric column per measurement group. Subject, X and label columns have separate meanings:

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
| Text-only columns | Retained label metadata; not statistical measurement groups |
| Conventional label headings, such as `Label`, `Sample`, `Sex`, `Notes` | Label metadata even when labels contain numeric codes |
| Remaining numeric columns | Groups of Y observations |

The importer recognizes subject-ID header variants, including `Subject ID`, `ID` and legacy localized aliases. Explicit subject IDs are checked for duplicates. Without an explicit subject-ID column, label text supplies a row label, with disambiguation where necessary. Generated or disambiguated labels organize the table; they do not establish valid pairing. Blank headings receive column names; headings must be unique. When an X column exists, rows containing observations require an X value.

CSV, TSV, TXT, JSON, XLSX, XLSM and ODS are supported. Visible nonempty workbook sheets become separate datasets. XLSM imports read stored cell values without executing macros. Legacy XLS/XLSB require conversion to XLSX or CSV. JSON accepts arrays of row records, named arrays of numbers, or a `groups` structure with `values`/`observations`. Use **Open** for a `.psl` workspace and **Import files** for a JSON data table.

Comma, semicolon and tab delimiters are supported. Decimal commas require an unambiguous delimiter, such as semicolon. Scientific notation is accepted. An unrecognized column that mixes numeric measurements and unrelated text is rejected with the row/column location and guidance. It is not silently converted to missing data or a label column. Move metadata into a clearly named label column, or correct the invalid measurement.

### Missing values and zeros

Blank, `NA`, `N/A`, `null`, `missing` and `NaN` wide-table cells do not create observations. Zero creates a measurement equal to zero. Nonfinite values are not valid measurements. Independent groups may have unequal sample sizes. Import requires at least one number per measurement group; a new editable table may remain empty until data are entered. Implemented group tests require at least two included observations per selected group.

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

Text-label metadata are retained with observations and stored in `.psl`. They do not become numeric covariates, factors or analysis inputs automatically. The advanced table has explicit scientific roles when a model requires them.

### Clearing ranges and removing datasets

In the Data grid, drag or Shift-click numeric cells to select a rectangle. The selection bar exposes **Clear selected values**, **Exclude selected** and **Restore selected**. Row-number and column-selection controls select larger ranges; **Select all values** selects every measurement cell. Delete/Backspace clears a selected range. Double-click or F2 enters single-cell character editing, where ordinary text-selection and deletion keys retain their usual meaning.

Clearing turns selected measurements into missing cells and removes their observation objects. Text labels and row positions remain available. Exclusion keeps the observations, values and IDs but changes their inclusion state. Clearing or excluding observations can invalidate analyses that used those observations. One **Undo** restores a complete range operation, including the prior values and inclusion state.

Advanced long-format tables select complete observations with row checkboxes. **Remove selected rows** removes the chosen observation rows in one operation, including their explicit predictors, response and factor/censoring fields. The header checkbox includes rows on other pages. **Exclude selected** and **Restore selected** change inclusion flags while retaining the full observations.

**Delete dataset** is visible in Data and on Overview's dataset cards. Its review reports the associated measurements, figures, saved analyses and publication panels before confirmation. Removing the dataset also removes those dependent objects and layout references; unrelated datasets and results remain intact. **Undo** restores the full operation. The final dataset is replaced by a blank table and an editable figure, rather than demonstration data.

## 3. Charts and conventions

Every **New chart** dialog exposes **Dataset for the new figure** and **Columns to plot**. The editor also exposes the source link and plotted-column selection. Changing plotted columns does not change the dataset or other figures. Relinking a figure to a different dataset clears its old attached results and individual observation overrides; saved analysis history and other figures remain in the workspace.

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

In Statistics, first choose the dataset and input columns. Compatibility checks use those selected columns, included sample counts, selected design, pairing identity and degenerate cases. Two selected columns expose t-tests even when the dataset contains additional columns. The default suggestion favors Welch for compatible independent mean comparisons and a paired procedure when that design is declared.

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
| One-way ANOVA + Dunnett | Three or more independent groups | Treatment-versus-control comparisons under an equal-variance model, with Dunnett family adjustment |
| Kruskal–Wallis + Mann–Whitney | Three or more independent groups | Global rank test; pairs use Mann–Whitney with the chosen correction |
| Kruskal–Wallis + Dunn | Three or more independent groups | Global rank test; pairwise Dunn tests use pooled ranks and the selected correction |
| Friedman + Wilcoxon | Three or more conditions on the same subjects | Global repeated-condition rank test; pairs use Wilcoxon with the chosen correction; global approximation can be inaccurate with small subject/condition counts |

These group tests are two-sided in this version. Selecting an XY chart does not automatically request correlation or regression.

**Kruskal–Wallis + Mann–Whitney is not Dunn's post-test. Adjusted t-tests against a control are not Dunnett's test.** Report the complete procedure and correction.

### Comparison families

- **Each group versus control:** selected reference versus every other group; correction applies to that family.
- **All pairs:** correction applies to all group combinations.
- **Tukey HSD:** always uses all pairs and its own adjustment; it does not apply a second Holm/Bonferroni/BH correction.
- **Dunnett:** uses control comparisons and its own family adjustment.

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

**Run and save new analysis** creates a separate run, retaining dataset identity, selected columns, design, test, correction, alpha, engine, timestamp and fingerprint. Runs persist when leaving the Statistics view and are included in `.psl`. **Open saved result** selects among runs for the current dataset; **Result name** renames one. Changing next-test settings does not modify a previous calculation.

**Results CSV** exports a selected run's settings, comparison rows, summaries and warnings. **Results JSON** preserves its structured representation with dataset identity and group-name metadata. These are reporting exports, not substitutes for a complete `.psl` file. Use Overview's selected analyses for side-by-side review across datasets.

Difference intervals from t-tests are individual intervals even when the associated p-values are adjusted across multiple pairs. Do not describe them as simultaneous adjusted intervals. Tukey intervals already correspond to its comparison family. Read the notes attached to each analysis.

Constant inputs, inadequate sample sizes, overflow and nonfinite results are rejected rather than returned as apparently valid analyses. Check the original measurements and the error explanation.

## Outliers, flags and exclusions

Use **Find outliers** to choose **ROUT** or **Grubbs**, then **Detect outliers**. ROUT exposes **Q (false discovery rate)** at 0.1%, 1%, 5% or 10%; Grubbs exposes **Alpha** at 0.05 or 0.01. Results list flagged observations by group; current flags have an amber ring. Detection does not automatically exclude observations.

Exclusion is explicit and reversible: right-click a table value or plotted point to exclude/restore it, or use the selected-point **Exclude from analysis** checkbox. The table row menu can exclude/restore all values in a row; **Restore all** restores the dataset's excluded observations. Original values and IDs remain stored. Excluded cells are crossed out and plotted observations remain hollow/crossed and selectable. Exclusions belong to the dataset, not a single figure, and affect summaries and future calculations. Paired tests still require complete included subject sets; excluding one member of a pair does not silently create or impute its missing counterpart. Data or exclusion edits make affected stored results stale.

An outlier procedure identifies observations that deserve review under a specified model. It does not establish that a measurement is erroneous. A flag, a visual highlight and an exclusion have different consequences:

| Action | Consequence |
|---|---|
| Visual override | Changes appearance only; the measurement still contributes to statistics |
| Review flag | Records that an observation needs attention; the original measurement must remain preserved |
| Explicit exclusion | Changes the observations used by an analysis; retain the original value and record the reason |

Do not infer exclusion from opacity, symbol color or whether a point is easy to see. Review exclusions explicitly and report the rule, method, threshold, affected observations and results with/without exclusions when appropriate.

Named outlier methods are not interchangeable. Grubbs tests and ROUT use different assumptions and procedures. A result should identify the method actually implemented and its parameters; do not assume equivalence to GraphPad's implementation from a similar name or interface. Published-method references, numerical cases and current implementation limits are recorded in the outlier-method and validation guides; consult those records before choosing a detection method. Never delete original measurements automatically as part of review.

## 6. Significance annotations

Select a saved result, choose **Target figure**, then **Add stars / ns to figure**. Compatible targets use the same dataset and a categorical chart type. Attachment adds any missing compared columns to the figure's plotted selection and enables significance and non-significant labels, so a valid nonsignificant test has a visible `ns` result. You can subsequently turn **Show non-significant** off. A result can be attached to more than one compatible figure; running a test alone does not replace another figure's annotations.

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

Select a comparison to drag it, edit X/Y offsets or use arrow keys; `Shift` uses larger arrow-key steps. X moves the label while endpoints remain anchored to groups; Y moves the bracket. Right-click **Reset automatic position**, or the formatting panel's reset action, removes the manual override.

### Result freshness

PSL compares current measurements in the selected input columns with each analysis's recorded configuration and fingerprint. Changes to values, IDs, X coordinates, observations or exclusions in those columns make results stale. Edits to unrelated, unselected measurement columns do not invalidate that run. Selecting the next test in the assistant does not rewrite or invalidate a historical run; each run retains its own configuration. Stale annotations are hidden, including during export. Appearance-only edits do not recalculate statistics.

Recalculation creates another saved run. Explicitly attaching it updates the chosen figure's result and resets manual comparison offsets; the earlier run remains in history. Other figures retain their attached result until you choose to replace it. This keeps statistical calculation, result review and visual presentation separate.

## 7. Visual overrides and reusable styles

General formatting covers palette, typography, axes, symbols, opacity, bar width, lines, dimensions and error settings. Point-level overrides can change color, size, shape, outline, outline width and opacity.

### Titles, emphasis and line breaks

Use the visible **Text & axes** toolbar to select **Chart title**, **X axis title** or **Y axis title**, or click the corresponding text in the figure. The visual editor applies **I — Italic**, **B — Bold**, **x₂ — Subscript** and **x² — Superscript** to the selected characters. For example, type H2O, select 2 and choose Subscript. Enter inserts a line break. Newly typed formatting notation is retained as literal text; use the buttons for new edits. Formatting changes the presentation and does not recalculate a saved analysis.

**Y axis title** also exposes **Distance from Y axis · px**, a slider, **Move closer**, **Move farther** and **Reset**. Distances use figure coordinates; exported SVG and PNG preserve the chosen layout. Increasing the distance reserves additional plot margin, so review the available plot width for small publication panels.

Text styles and line breaks are stored with the figure. SVG keeps text as editable text and uses styled text spans for emphasis and line positioning. Existing scientific subscript, superscript and emphasis syntax in older projects remains supported. The [everyday editing guide](EDITING-GUIDE.md) gives the short UI workflow.

Click an individual point or right-click **Format this point** to open its controls. Right-click also provides exclusion/restore and data-table navigation. Dataset and figure entries have contextual navigation actions. A point's context action uses its stable observation ID, including after a value edit or reversible exclusion.

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

The local workspace library stores separate workspaces in that same browser/origin. **Switch / new workspace** checkpoints the current project before opening another entry or creating a blank workspace. This explicit save also occurs when Autosave is off. Opening a `.psl` uses the same switching flow, preserving the previous workspace in the local library. If checkpointing fails, switching stops and the current work remains open; download a `.psl` backup before proceeding.

If a stored browser project is corrupt, recovery attempts to preserve its raw content before starting a demonstration project and reports the issue. If preserving the original fails, automatic saving is suspended rather than silently overwriting it.

Keep explicit versions such as `study-01-data.psl`, `study-02-analysis.psl` and `study-03-final-figure.psl`. PSL is not an immutable audit trail of every scientific decision.

## 11. Offline operation and updates

The distribution includes the compiled interface. Launchers prepare local Python dependencies without requiring Node.js from end users. A complete offline package supports first setup without Internet; the smaller universal ZIP downloads dependencies during its first setup. Update downloads require Internet; a prepared installation can run offline.

Online launches check for available GitHub releases. An update is prepared before opening the editor, with package verification and a recovery copy of the previous installation. An interrupted or invalid update should preserve the previously usable version. Updates are deferred when a session is already active to protect unsaved work.

Updates must not replace user `.psl` files or browser storage. Save your project before closing or changing computers. Releases are available from the public GitHub repository without a PSL account.

The server listens on `127.0.0.1`, port 8765. It is not configured as a public network service. Statistical computation is local; chart data do not need to be sent to an external analysis service.

## 12. Reproducibility and limits

Retain the original measurements and experimental unit; the `.psl`; the full design, test, comparison family, correction, α and error-bar definition; PSL/engine versions; and data-preparation or external graphic-editing decisions.

PSL includes numerical and project tests but does not claim complete GraphPad Prism equivalence or validate a scientific design automatically. Mixed models, two-factor/repeated-measures ANOVA, regression, dose–response, survival and specialized charts are covered by the [advanced methods guide](ADVANCED-METHODS.md); check its implementation scope and assumptions for the chosen method. See the [roadmap](ROADMAP.md) for future work.

Technical references: [SciPy statistical functions](https://docs.scipy.org/doc/scipy/reference/stats.html), [Welch/Student t-tests](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_ind.html), [Tukey HSD](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.tukey_hsd.html).


## Multiple datasets and side-by-side review

Use **Overview → Import datasets** to select several CSV/TSV files in one operation. Each becomes a named dataset with its own table and initial figure. Imports are validated before they are added; the existing workspace is preserved if a file is invalid. Use the sidebar to select a dataset. Figures retain an explicit dataset link, so applying a style from another dataset transfers the appearance without replacing measurements.

Every successful statistical run is kept in the analysis history, including its dataset, test, correction, alpha, results and timestamp. Run different tests or analyze different datasets, then use **Overview → Choose analyses** to display selected results side by side. Each historical result is checked against its own recorded configuration and current dataset measurements. Changing the assistant's next-test controls does not rewrite previous tests.

Use **Choose figures** to select several figures from the same or different datasets. Preview cards show the dataset name and provide **Edit figure**. The complete selection is saved in **Save workspace → .psl**, along with every dataset, test and figure. Legacy `.labplot` files remain supported and convert to a one-dataset workspace. CSV export contains raw measurements; use `.psl` to preserve exclusions and the complete analysis state.

## Broader designs in the 0.3 workbench

The advanced panel now supports Type III two-factor ANOVA, one-factor repeated-measures ANOVA with Greenhouse–Geisser, a Gaussian subject-random-intercept REML model, Pearson/Spearman, OLS, unweighted 4PL fitting, Kaplan–Meier/log-rank and Bland–Altman. These are precisely scoped procedures; consult [Advanced methods and independent validation](ADVANCED-METHODS.md) before choosing the model. Dunn pooled-rank post-tests and original single-step Dunnett control comparisons are available in the group panel. Dunnett/Tukey retain their own intrinsic family adjustments.

Long-format tables make factors, subjects, numeric predictors and censoring explicit. [Native Excel import](EXCEL-IMPORT.md) supports multiple sheets and saved formula results while rejecting absent caches. Advanced runs remain independently selectable across datasets and are saved with the workspace. Current fitted curves and confidence bands are linked to a particular preserved result; stale curves are omitted.

The [Publication workbench](PUBLICATION.md) provides aligned panels, shared typography in final points, physical dimensions, size templates and batch vectors/PNGs with resolution metadata. Publication templates are starting dimensions, not a certification of a journal's current submission requirements. SVG interoperability is structurally tested; live Illustrator validation remains deferred by the user.
