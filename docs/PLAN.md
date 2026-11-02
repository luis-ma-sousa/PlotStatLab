# PlotStatLab — product and execution plan

This plan records the initial scientific workbench scope. The current application is named **PlotStatLab (PSL)**. It uses its own implementation and identity while drawing inspiration from the GraphPad Prism workflow.

Approved priorities: figure quality, click-based editing, a broad chart catalog, assisted statistics, automatic significance annotations with manual adjustment, PNG/SVG export and fully editable saved projects.

## Incorporated requirements

1. Transfer formatting between figures and save presets. Apply the full style or selected colors, typography, axes or points without replacing data, analyses or individual visual exceptions.
2. Provide a broad catalog: bar + swarm is a minimum. The first delivery includes bar, swarm, box, violin, raincloud, paired, XY scatter, XY lines, histogram, density, ECDF and heatmap. Dose–response, Kaplan–Meier, forest, Bland–Altman, volcano, grouped two-factor charts and multipanel figures are later stages.
3. Give every observation a stable ID. Preserve individual color, shape, size, opacity and outline editing in saved projects. Appearance changes must not alter scientific values.
4. Suggest compatible tests and request experimental-design information explicitly. Do not infer pairing, independence or validity from numbers alone, and do not choose a test using an automatic preliminary normality decision.
5. Derive significance marks from real comparisons, using adjusted p-values and an explicit correction method. Provide automatic bracket spacing/headroom, dragging, numeric offsets and a reset to automatic placement. Data/configuration changes make previous results stale.
6. Save data, settings, results, styles, observation overrides and manual positions in a versioned `.psl` workspace. Provide autosave, undo/redo and portable files.
7. Export vector SVG and dimension-controlled PNG. Editor selections and controls must not appear in exports.

## Stages and completion criteria

| Stage | Delivery and completion criterion |
|---|---|
| Foundation | React/TypeScript + SVG, local Python/SciPy engine, visual identity and project format. Navigate between data, figures and analyses. |
| Functional workflow | Initial catalog, editable/imported data, style transfer, analysis, annotations, export and reopening. Complete the full workflow with real input. |
| Broader science | Two-factor designs, mixed models, correlation/regression, dose–response and survival. Add each only with its own validated analysis and interface. |
| Publication | Multipanel layouts, advanced scientific typography, journal presets and batch export. |
| Distribution | Desktop installation, migrations/recovery, accessibility and larger-dataset performance. |

## Initial statistical scope

Independent Welch and Student t-tests, paired t, Mann–Whitney, Wilcoxon, one-way ANOVA, Welch ANOVA, ANOVA/Tukey, Kruskal–Wallis and Friedman where validated. Planned pairwise comparisons use the named pair tests and Holm/Bonferroni/BH adjustment; Tukey uses its own family adjustment. Paired analyses require subject identities.

## Validation

Use independent numerical references and invalid-input cases. Verify pairing by ID, multiple-testing adjustment, point/bracket collisions, persistent individual edits, project round trips and style transfer without data changes. Stale analyses must not generate annotations. Manual positions must survive saving/reopening. Exports must match dimensions and exclude editor controls. Verify the complete workflow in a browser.

## Explicit limits of the initial delivery

The initial version was a local browser application without a native installer. Its own project format preserves editability; PNG, SVG or Prism files cannot guarantee reconstruction of data and analysis. Specialized charts and analyses above were planned work, not completed functions. Data/autosave remain local; GitHub receives source and synthetic demonstration data.

The 0.2 revision adds the PlotStatLab identity, MIT licensing, English guides, autosave control, HEX color entry, Illustrator-oriented SVG and distribution/update preparation. The 0.3 workbench implements the broader scientific and publication stages with the exact supported models documented in [Advanced methods](ADVANCED-METHODS.md), and native installation wrappers documented in [Installation](INSTALLATION.md). Consult the current [roadmap](ROADMAP.md), [changelog](../CHANGELOG.md) and validation records for implementation status.

## References

- [SciPy statistical functions](https://docs.scipy.org/doc/scipy/reference/stats.html)
- [Prism pairwise-comparison annotations](https://www.graphpad.com/guides/prism/latest/user-guide/simple_pairwise_comparisons.htm)
- [Prism adjusted comparison p-values](https://www.graphpad.com/guides/prism/latest/statistics/stat_exact_p_values_from_multiple_c.htm)
- [React event handling](https://react.dev/learn/responding-to-events)
- [Vite guide](https://vite.dev/guide/)


## Multiple datasets and side-by-side review

Use **Overview → Import datasets** to select several CSV/TSV files in one operation. Each becomes a named dataset with its own table and initial figure. Imports are validated before they are added; the existing workspace is preserved if a file is invalid. Use the sidebar to select a dataset. Figures retain an explicit dataset link, so applying a style from another dataset transfers the appearance without replacing measurements.

Every successful statistical run is kept in the analysis history, including its dataset, test, correction, alpha, results and timestamp. Run different tests or analyze different datasets, then use **Overview → Choose analyses** to display selected results side by side. Each historical result is checked against its own recorded configuration and current dataset measurements. Changing the assistant's next-test controls does not rewrite previous tests.

Use **Choose figures** to select several figures from the same or different datasets. Preview cards show the dataset name and provide **Edit figure**. The complete selection is saved in **Save workspace → .psl**, along with every dataset, test and figure. Legacy `.labplot` files remain supported and convert to a one-dataset workspace. CSV export contains raw measurements; use `.psl` to preserve exclusions and the complete analysis state.
