# PlotStatLab: super quick guide

**Download → extract the complete folder → open the launcher.** Windows: `Start PlotStatLab.bat`; macOS: `Start PlotStatLab.command`; Linux: `sh start-plotstatlab.sh`. Choose the **complete offline ZIP** for a first launch without Internet. The small universal ZIP downloads dependencies on first setup. Editing, analyses and exports run locally.

**The usual path: create a dataset → enter data → save an analysis → choose a figure → add comparisons.** A workspace keeps all of these together.

| I want to… | Do this |
|---|---|
| Start with an empty table | **New dataset → Create blank table**. Name the dataset, rename its column headings, then type into cells. Use **+ Column / + Rows** when needed. |
| Paste numbers from Excel | Copy a range **without headings**, click its starting numeric cell in **Data**, then `Ctrl+V` on Windows or `⌘V` on Mac. Paste row IDs into **Row label / Subject ID**. |
| Paste a whole table with headings | **Paste new dataset** or **Paste table** → paste the table → **Import table**. This adds a dataset. Text columns remain labels; numeric columns become measurement groups. |
| Clear several measurements | Drag across numeric cells, or click the first and **Shift-click** the last → **Clear selected values**. Delete/Backspace also clears a selected range; **Undo** restores the operation. |
| Remove several advanced observations | In an **Advanced table**, select row checkboxes → **Remove selected rows**. The heading checkbox selects all rows across pages. |
| Keep values but omit them from analysis | Select numeric cells → **Exclude selected**. Use **Restore selected** to include them again. |
| Import several files | **Import files**, then select CSV, TSV, TXT, JSON, XLSX, XLSM or ODS files. Each visible nonempty Excel sheet becomes a dataset. |
| Choose the dataset to edit or analyze | Use **Dataset** above Data/Statistics, or select it in the sidebar. |
| Make a chart | **New chart** → choose **Dataset for the new figure** and **Columns to plot** → choose a chart type. One dataset can have many figures. |
| Change an existing figure's data | Open the figure and use its dataset selector and column checkboxes. Switching to another dataset removes that figure's old analysis/point overrides. |
| Run a t-test on two of many columns | **Statistics → Choose columns and design** → select those two columns → choose the design and a compatible test → **Run and save new analysis**. |
| Keep several tests on the same data | Run another test. Use **Open saved result** to revisit any run; earlier results remain saved. |
| Put stars on a figure | Open a saved result → choose **Target figure** → **Add stars / ns to figure** → **Open figure**. Missing compared columns are added to that figure automatically. |
| Save test results outside PSL | In **Saved results**, choose **Results CSV** or **Results JSON**. Save a `.psl` as well to retain the complete editable workspace. |
| Compare figures or tests together | **Overview → Choose figures / Choose analyses**. Select panels from the same or different datasets. |
| Edit one point | Click it, or right-click → **Format this point**. Change its color/HEX, shape, size, opacity or outline. |
| Make letters italic or bold | **Text & axes → Chart title / X axis title / Y axis title** → select words in the visual text editor → **Italic** or **Bold**. You can also click the title in the figure. |
| Add a subscript or superscript | Select the characters in the title editor → **x₂ — Subscript** or **x² — Superscript**. No formatting codes are needed. |
| Make a title use several lines | Open its text editor using **Text & axes**, place the cursor at the break, then press **Enter**. |
| Change the Y-title spacing | **Text & axes → Y axis title → Move closer / Move farther**, or adjust **Distance from Y axis · px**. |
| Exclude a point without deleting it | Right-click a table value or plotted point → **Exclude … from analysis**. Crossed-out values remain in Data; plotted points remain hollow and crossed. Use the same menu to restore them, then run a new analysis. |
| Find outliers | **Statistics → Find outliers** → ROUT/Q or Grubbs/alpha → **Detect outliers**. Detection flags observations; exclusions are a separate choice. |
| Reuse formatting | **Apply style** copies another figure's style. **Save reusable style** creates a preset. |
| Move stars | Drag a comparison bracket, or select it and change **X offset / Y offset**. Arrow keys also work; `Shift` makes larger steps. Right-click → **Reset automatic position** restores placement. |
| Export to Illustrator | **Export → SVG → Export SVG**. Open the SVG in Illustrator; text and vector objects remain editable. Keep the chosen font installed. |
| Export an image | **Export → PNG**, choose pixel scale, export. |
| Switch or create workspaces | Click the workspace name at the top, or **Switch / new workspace**. Choose an existing workspace or **Create blank workspace**. Switching checkpoints the current work on this device. |
| Delete a dataset | **Data → Delete dataset**, or its **Overview** card → **Delete dataset**. Review its related figures/results, choose **Cancel** or **Delete dataset**, and use **Undo** to restore if needed. |
| Keep a portable backup | **Save workspace** downloads one `.psl` containing datasets, tests, figures and selected panels. **Open** restores it. |
| Control autosave | Use **Autosave**. OFF stops automatic edit checkpoints; explicit save and workspace switching still save the current work. |

Blank/NA cells mean missing measurements; **zero is a measurement**. A text-only column is a label column. If a measurement column mixes numbers and unrelated text, move the labels to a separate label column or correct the cell; PSL reports the problem rather than silently dropping it. Only choose paired analyses when IDs identify the same experimental units across conditions.

For title formatting, spacing and table selections, see [everyday editing](EDITING-GUIDE.md). For two factors, XY fits or survival, use **Data → Advanced table & scientific examples**, then **Statistics → Factorial, regression & survival → Run analysis**. For layouts, use **Publication**. The [beginner guide](BEGINNER-GUIDE.md) walks through an example; the [expert guide](EXPERT-GUIDE.md) explains methods and reproducibility. All manuals are available offline in **Help**.
