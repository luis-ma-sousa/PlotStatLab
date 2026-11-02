# PlotStatLab workspace workflow

The working model is **workspace → dataset → analysis and figure**. An analysis is a saved calculation. A figure is a view of selected columns, with its own appearance. Linking an analysis to a figure is an explicit action.

| Object | Owns | Main controls |
|---|---|---|
| Workspace | Datasets, saved tests, figures, presets and overview/publication layouts | Workspace name; **Switch / new workspace**; **Save workspace**; **Open** |
| Dataset | Named measurement columns, row IDs/labels, original values and exclusion state | **New dataset**; editable **Data** grid; **Paste table**; **Import files** |
| Analysis run | Dataset identity, selected columns, design, method, correction, alpha, timestamp and calculated results | **Run and save new analysis**; **Open saved result**; **Results CSV / JSON** |
| Figure | Dataset link, plotted columns, chart type, styling, point overrides and linked result | **New chart**; dataset/column selector in Editor; **Target figure → Add stars / ns to figure** |

Typing and pasting ranges edit the open dataset. Pasting a complete table with headings adds a new dataset. Importing several files adds several datasets; it does not replace the existing workspace.

Choose columns independently for analysis and plotting. A t-test can use two columns from a wider dataset. Adding comparisons automatically adds any missing compared columns to the target figure. Merely opening a figure or changing the next-test settings does not rerun a test or replace its saved result.

Exclusion is stored with the original observation and affects every figure and future analysis of that dataset. Excluded measurements remain visible and can be restored. Point styling belongs only to the figure and never excludes a measurement.

When source measurements or exclusions change, affected saved calculations remain available and are marked out of date. Their old comparisons are hidden on figures. Run a new analysis, review it, and explicitly attach it. Appearance changes do not make a calculation stale.

Workspace switching saves the current workspace in this browser's local library before opening another one. This is an explicit save action, including when Autosave is off. Browser storage is local to a profile/origin; `.psl` files are portable backups. SVG/PNG and result CSV/JSON exports serve presentation/reporting purposes and do not replace a complete workspace file.
