# PlotStatLab — beginner's guide

**From download to a saved analysis and figure, without programming**

This guide uses fictional measurements. For the shortest list of clicks, use the [quick guide](QUICK-START.md). For method details, see the [expert guide](EXPERT-GUIDE.md).

## 1. Download and open

1. Download a package from [PlotStatLab Releases](https://github.com/luis-ma-sousa/PlotStatLab/releases/latest). Choose the **complete offline ZIP** matching your system and CPU for first launch without Internet. The small universal ZIP needs Internet during initial setup. Windows Setup and macOS DMG are also available; see [installation](INSTALLATION.md).
2. Extract the complete ZIP into a writable folder. Do not run the launcher from inside the ZIP.
3. Open `Start PlotStatLab.bat` on Windows, `Start PlotStatLab.command` on macOS, or `start-plotstatlab.sh` on Linux.
4. Let setup finish. The app opens in your browser at `http://127.0.0.1:8765`. Keep the launcher's terminal window open while working.

Later launches reuse installed dependencies. Editing, statistical calculations, imports and exports run locally after setup. Online launches check GitHub for updates; an already running session is protected from being updated mid-session. You need no PSL account, subscription or separate Node.js installation. The source is licensed under [MIT](../LICENSE).

## 2. Understand the three things you work with

A **dataset** is a table of measurements. An **analysis** is a saved statistical result from selected columns of that dataset. A **figure** displays selected columns, with its own styling. Your **workspace** keeps all datasets, analyses and figures together.

| Area | Use it to… |
|---|---|
| **Data** | Type, paste, import and review measurements |
| **Statistics** | Select columns, run tests and reopen saved results |
| **Editor** | Choose a figure's source data and format its appearance |
| **Overview** | See several figures and analyses together |
| **Publication** | Arrange figures into a multi-panel layout |
| Workspace name / **Switch / new workspace** | Open another workspace or create a blank one |
| **Save workspace / Open** | Download or restore a portable `.psl` file |
| **Export** | Save the current figure as SVG or PNG |

Select a dataset in the sidebar, or in the **Dataset** selector above Data and Statistics. Selecting another dataset leaves the others in the workspace. Figure cards show their linked dataset name.

## 3. Enter data without importing a file

### Type into a blank table

1. Choose **New dataset**, enter a name such as `Dose experiment`, then **Create blank table**.
2. In **Data**, rename `Group A` to `Control` and `Group B` to `Low dose` by editing their column headings.
3. Choose **+ Column** and name the extra column `High dose`.
4. Click a numeric cell and type a measurement. Press Enter to continue down the column; Tab moves between fields.
5. Use **+ Rows** when you need more space.

Each measurement column represents a group. **Row label / Subject ID** identifies a row; use genuine subject IDs if the same experimental units were measured in several conditions. Row order alone does not establish valid pairing.

### Copy and paste a range from Excel

You can paste straight into the table, as you would in a spreadsheet:

1. Copy a rectangular range of numbers **without its headings**.
2. Click the starting numeric cell in PSL.
3. Press `Ctrl+V` on Windows or `⌘V` on Mac.
4. Review the pasted values. The range can extend into new rows and columns.

To paste row IDs as well, include them as the first column and start in **Row label / Subject ID**. Existing text-label columns also occupy their own positions in the table. If you copied column headings, use the complete-table option below.

### Paste a complete table with headings

Choose **Paste new dataset** or **Paste table**, paste the complete table, then **Import table**. This creates a new dataset and keeps earlier work. Try this fictional example:

```csv
Sample,Control,Low dose,High dose
Mouse 1,20,30,41
Mouse 2,22,33,45
Mouse 3,19,28,39
Mouse 4,23,35,47
Mouse 5,21,31,43
Mouse 6,24,34,46
```

`Sample` remains a label column; the three numeric columns become measurement groups. Check that each group has six observations.

### Import existing files

Use **Import files** and select one or several CSV, TSV, TXT, JSON, XLSX, XLSM or ODS files. Visible nonempty workbook sheets become separate datasets. XLSM imports read stored values; PSL does not run macros. Convert older `.xls`/`.xlsb` workbooks to `.xlsx` or CSV first.

Text-only columns are retained as labels, rather than being forced into statistical measurements. Conventional names such as `Sample`, `Label`, `Sex` and `Notes` identify label columns even when some labels contain numbers. Extra labels remain visible in the data grid.

Blank, `NA`, `N/A`, `null`, `missing` and `NaN` cells mean missing measurements. **Zero is a real measurement.** A column that mixes numbers with unrelated text needs review: move the labels to a separate label column or correct the cell. The import reports the location instead of silently dropping it.

Commas, semicolons and tabs are supported as separators. For decimal commas, use an unambiguous separator, for example:

```csv
Sample;Control;Treatment
A;20,5;31,2
B;22,1;33,4
```

## 4. Choose a dataset and columns for each figure

1. Choose **New chart** or **Create figure from this data**.
2. Check **Dataset for the new figure**.
3. Select the **Columns to plot**.
4. Choose a chart type, for example **Bar + swarm**.

One dataset can have several figures. Each figure keeps its own dataset link and chosen columns. In the Editor, use the figure's dataset selector and column checkboxes to review or change that link. Switching a figure to another dataset clears its former analysis and point-specific styling, because those belonged to different observations. Other figures and saved analysis runs remain available.

To change only the current figure's type, open **New chart** and use **Change current chart type** at the bottom of the gallery.

| I want to show… | A starting point |
|---|---|
| Every observation and a summary | **Bar + swarm** or **Swarm** |
| Median and spread | **Box plot** |
| Distribution shape | **Violin**, **Raincloud** or **Density** |
| Counts in intervals | **Histogram** |
| A relationship between X and Y | **XY scatter** or **Regression** |
| Values ordered by X | **XY lines** |
| Changes in the same individuals | **Paired**, using genuine subject IDs |
| Cumulative probability | **ECDF** |
| A matrix of measurements | **Heatmap** |

There are 20 chart families. Grouped, regression, dose–response, Kaplan–Meier, forest, Bland–Altman and volcano charts use explicit scientific columns; see [advanced methods](ADVANCED-METHODS.md).

## 5. Run and keep several statistical tests

For this exercise, assume the three fictional columns are independent groups. This is a software example, not a recommended analysis for every experiment.

1. Open **Statistics** and check the **Dataset** selector.
2. Under **Choose columns and design**, select `Control`, `Low dose` and `High dose`.
3. Choose **Independent groups** and a compatible test. For this example, choose **Welch ANOVA + Welch t-tests**.
4. Choose **Each selected group versus control**, with `Control` as reference. Keep **Holm** correction and alpha **0.05** for this exercise.
5. Choose **Run and save new analysis**.
6. Scroll to **Saved results** to review the calculated comparison table, timestamp and method notes.

The result remains in this workspace when you leave Statistics. To run a t-test on just two of the columns, select those two columns, choose a compatible t-test and **Run and save new analysis** again. Both results remain available in **Open saved result**; a new run does not overwrite the previous one. Rename a result with **Result name** if that helps organize it.

**Results CSV** exports a readable results table; **Results JSON** exports the structured result. To preserve datasets, all runs and figures together, also use **Save workspace**.

The app suggests tests compatible with the selected columns and design. It cannot infer independence, pseudoreplication, valid pairing or scientific assumptions from numbers alone. For paired tests, every selected column needs the same complete set of unique subject IDs representing the same experimental units.

## 6. Add stars to the figure you choose

Running a test and drawing its comparisons are separate actions:

1. In **Saved results**, select the run you want.
2. Under **Add comparisons to a figure**, choose **Target figure**.
3. Choose **Add stars / ns to figure**.
4. Choose **Open figure** to inspect the result.

The figure must use the same dataset. If it currently hides a compared column, adding the result also adds that column to the figure. Group figures such as Bar + swarm support comparison brackets; XY plots and histograms do not use these categorical brackets. Create an appropriate figure if the target list is empty.

Significance marks use adjusted p-values where a correction applies:

| Adjusted p-value | Mark |
|---|---|
| p < 0.05 | `*` |
| p < 0.01 | `**` |
| p < 0.001 | `***` |
| p < 0.0001 | `****` |
| Otherwise | `ns` |

The attach action includes `ns`, so a successful nonsignificant test does not leave an unexplained blank chart. Use **Show non-significant** to hide them if preferred, or **Display** to show numeric adjusted p-values. A bracket identifies a comparison between two groups.

Drag a bracket to move it. You can also click it and adjust **X offset / Y offset**, or use arrow keys (`Shift` for larger steps). Horizontal movement shifts the label while the bracket ends stay anchored. Right-click → **Reset automatic position** restores the calculated layout.

If measurements or exclusions change, old results remain saved and become out of date. Their old brackets are hidden. Run a new analysis, review it and attach that new result. Merely changing the next-test controls does not rewrite a saved result.

## 7. Edit or exclude an individual point

### Change just one point's appearance

Click a point, or right-click → **Format this point**. Check its label in **Selected observation**, then change color, HEX code, size, shape, outline or opacity. The formatting panel opens for that point. **Reset to group style** removes only its visual overrides.

Pick colors visually or type a three- or six-digit HEX code, with or without `#`. Styling a point does not change its measurement or exclude it.

### Exclude without deleting

Right-click a numeric cell in **Data** → **Exclude value from analysis**, or right-click its plotted point → **Exclude from analysis**. The original value stays in the dataset. Table values are crossed out; plotted points stay visible as hollow, crossed markers. Right-click again to restore the value. The Data table also offers **Restore all**.

A table row menu can exclude or restore an entire row. Exclusions apply to the dataset, so linked figures and future analyses use the same inclusion state. Old analyses remain as historical results and are marked out of date. Run a new analysis after changing exclusions.

### Review outliers

Under **Statistics → Find outliers**, choose ROUT with its **Q** threshold or Grubbs with **Alpha**, then **Detect outliers**. Current flags receive an amber ring. A flag does not exclude the point automatically. Review the measurement and scientific reason before excluding it, and record/report that reason. See [outlier methods](OUTLIER-METHODS.md) for implementation limits.

## 8. Finish the appearance and reuse it

**Format figure** controls titles, axes, colors, fonts, symbols, error bars and dimensions. In a narrow window, choose **Format** to open the drawer.

| Error-bar option | Meaning |
|---|---|
| SD | Sample standard deviation |
| SEM | Standard error of the mean |
| 95% CI | 95% confidence interval for the mean |
| None | No error bars |

State the error-bar definition in the caption. To copy a style, open the destination figure → **Apply style** → choose a source figure and scope → apply. Destination point overrides remain intact. **Save reusable style** stores a preset in the workspace.

## 9. Switch workspaces and save a backup

Click the workspace name at the top or **Switch / new workspace** in the sidebar. Choose a saved workspace, or enter a name and **Create blank workspace**. The current work is checkpointed on this device before switching, including when Autosave is off. **Open workspace file** loads a portable `.psl` into the same workflow.

**Autosave On** saves edits automatically in this browser. **Autosave Off** stops automatic edit checkpoints; explicit save and workspace switching still save the current work. Switching it off does not erase an earlier saved copy.

Use **Save workspace** regularly. It downloads one `.psl` with datasets, exclusions, saved tests, figures, styles and panel choices. **Open** restores it, including individual point styling and comparison positions. Legacy `.labplot` files are supported.

The workspace library belongs to this browser profile and local address. Clearing browser data or changing browser/computer can make it unavailable. A `.psl` file is your portable backup; SVG/PNG and result CSV/JSON exports do not replace it.

## 10. Export a figure or publication layout

Choose **Export → PNG** for images or **Export → SVG** for vector editing. PNG offers 1× to 4×; 800 × 560 px at 3× becomes 2400 × 1680 px.

For Illustrator, export SVG, then use **File → Open** in Illustrator. Text remains text and points remain separate vector objects. Use Layers/Ungroup as needed and keep the original font installed. Save an `.ai` copy if desired. External changes do not update the PSL dataset or analysis; reopen `.psl` in PSL to recalculate.

For several panels, use **Publication** to select/order figures across datasets, choose columns and print dimensions, and export the layout. Scientific titles accept `H_{2}O`, `X^{2}`, `*italic*` and `**bold**`.

## 11. Common problems

| Situation | What to check |
|---|---|
| A whole-table paste reports text in a measurement cell | Use **Paste table** for headings; paste only values directly into numeric cells |
| Labels are treated as data | Give the label column a clear name such as `Sample` or `Label`; keep measurements in separate columns |
| A mixed column is rejected | The error identifies the cell; move unrelated text to a label column or leave a missing measurement blank |
| A t-test is unavailable with many columns | Select only the two columns to compare in Statistics |
| A saved result seems to have disappeared | Check **Dataset**, then **Open saved result**; the result belongs to its source dataset |
| No target figure is offered | Use a group figure from the same dataset containing every compared column |
| A successful test shows `ns` | The comparison did not cross the selected significance threshold; inspect its adjusted p-value |
| Stars disappeared after editing data | The attached result is out of date; run and attach a new result |
| A point disappears on a log axis | Zero and negative values cannot be represented on that scale; they remain in Data |
| A point stays different after style transfer | Use **Reset to group style** to remove its individual override |
| The wrong measurements appear in a figure | Check its dataset selector and plotted-column checkboxes |
| A workspace is missing on another computer | Use **Open** to load its saved `.psl` file |
| The browser does not open | Keep the launcher running and try `http://127.0.0.1:8765` |
| Illustrator changes text spacing | Install the original font and review the figure after substitution |

For bug reports, include OS, PSL version, steps and error text. Use a small fictional dataset instead of confidential measurements where possible.
