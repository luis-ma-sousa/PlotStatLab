# Changelog

## 0.5.0 — visible text and data editing

- Click a chart or axis title to open a visual text editor, with visible bold, italic, subscript and superscript controls. Enter creates editable SVG lines without requiring formatting codes.
- Adjust the Y-axis title distance live with a slider, numeric field and Move closer / Move farther buttons. Multiline titles reserve space in classic and specialized charts.
- Delete datasets from visible Data and Overview controls, review dependent figures/results before deleting, and restore the whole action with Undo.
- Select numeric cell ranges by dragging, Shift-clicking, or choosing row/column headers. Clear selected values, exclude/restore, copy/cut and use Undo in one operation. Selection actions stay visible while scrolling.
- Keep empty rows, labels and row order in workspace files after clearing measurements. Corrected scalar blank clearing and pasted row identity collisions.
- Select and remove multiple advanced observations, including the final row, with Undo support.
- Updated English quick-start, beginner, expert and editing guides; retained existing workspace and SVG compatibility.

## 0.4.0 — connected data, analyses and figures

- Blank spreadsheet tables, direct range paste, editable text labels, decimal commas, and CSV/TSV/JSON/XLSX/XLSM/ODS imports. Mixed-validity file batches retain successful imports and explain failures.
- Choose datasets and columns for each figure and each statistical analysis; selected-pair t-tests work within larger datasets.
- Multiple named saved analyses per dataset, persistent tab state, CSV/JSON result exports and explicit figure annotation with stars or ns.
- Point and row context menus, precise swarm point selection, reversible visible exclusions, per-point formatting and stale-analysis protection.
- Device workspace library with explicit switching, blank workspaces, portable .psl files and preservation of the current snapshot when opening an older revision.
- Stable advanced-data group identities and chart palettes when editing or selecting columns.
- Updated English manuals and integrated workflow regression tests.

## 0.3.1 — specialized axis defaults

- Newly created specialized figures use the chart family's semantic axis labels, including survival probability and transformed volcano p-values.
- Switching a default response chart to a specialized type resets the initial placeholder Y label; saved custom workspace formatting is preserved.
- Added renderer/factory integration checks for survival and volcano labels.

## 0.3.0 — broader science and publication

- Seven specialized chart families (20 total), explicit long-format scientific tables and native Excel multi-sheet import.
- Two-factor Type III ANOVA, Greenhouse–Geisser repeated-measures ANOVA, random-intercept REML, correlation, OLS, 4PL, Kaplan–Meier/log-rank and Bland–Altman analyses.
- Genuine Dunn and Dunnett post-tests.
- Preserved multi-dataset advanced histories, current/stale fit handling and per-observation editing.
- Publication layouts, physical sizes, journal templates, scientific scripts, editable vector batch ZIP and PNG print metadata.
- Faster exact swarms, paginated tables, modal keyboard focus, native installation wrapper build pipeline and explicit offline validation.

Native installers and cross-platform checks are validated in CI before release. Publisher-trusted signatures require publisher credentials; local macOS integrity signing is not Apple notarization.


## 0.2.0 — development preview

- Renamed the application **PlotStatLab (PSL)**.
- Added MIT licensing and user/contributor documentation.
- Prepared editable SVG export for Illustrator, retaining text/vector objects and explicit presentation properties.
- Added outlier review controls and explicit reversible exclusions while preserving original measurements; method-specific validation remains explicit.
- Added a persistent autosave control and HEX entry alongside color controls.
- Added Windows, macOS and Linux setup/launch workflows with a compiled interface in distributions.
- Prepared offline use after setup and GitHub-release update handling.
- Added beginner, expert and quick-start guides in English.
- Added test and release-packaging workflows.

This is a development release. Publication, supported-platform claims and new statistical methods must follow the validation recorded for the final build.

## 0.1.0

- Initial local workbench with 13 chart types and a live SVG editor.
- Individual point styling and selective style transfer.
- Ten statistical procedures with compatibility suggestions and multiple-comparison corrections.
- Result-linked significance marks, automatic layout and persistent manual positioning.
- CSV/TSV import, editable data, `.labplot` projects, autosave and undo/redo.
- SVG and PNG export.

- Multi-dataset workspaces, multi-file import, independent data editing and dataset-linked figures.
- Persistent analysis history and selectable side-by-side figure/result panels.
- Portable `.psl` workspace files with legacy `.labplot` compatibility.
- Local cross-platform bootstrap, dependency-keyed runtime caches and transactional GitHub updates with rollback.
- Offline English HTML manuals, dependency notices and CI/release workflows.
