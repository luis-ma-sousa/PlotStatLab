# PlotStatLab — beginner's guide

**PSL 0.2.0 · From download to your first figure, without programming**

This guide uses fictional data so you can learn the workflow before entering your own measurements. If you only need the clicks, use the [quick start](QUICK-START.md). For methods and file formats, use the [expert guide](EXPERT-GUIDE.md).

## 1. Download and open

1. Download the complete package from the [PlotStatLab GitHub repository](https://github.com/luis-ma-sousa/PlotStatLab). Use the intended release package when one is available, or **Code → Download ZIP** for the repository contents.
2. **Extract the ZIP** into a folder where you can save files. Do not run the launcher from inside the ZIP.
3. Open the launcher for your operating system:

| System | Launcher |
|---|---|
| Windows | `Start PlotStatLab.bat` |
| macOS | `Start PlotStatLab.command` |
| Linux | `start-plotstatlab.sh` |

4. On the first run, stay connected to the Internet and let setup finish. The package includes the compiled interface; using it does not require a separate Node.js installation.
5. The app opens in your browser at `http://127.0.0.1:8765`.

Later launches reuse compatible installed dependencies. After initial setup, the installed version can run offline. Online launches check GitHub for available updates; a change in dependencies may require another setup step. If a session is already running, updates are deferred until a later full start to protect unfinished work.

Keep the terminal window open while using the app. `Ctrl+C` in that window stops the local server. You do not need a PlotStatLab account. The source is licensed under [MIT](../LICENSE); while the GitHub repository is private, downloading and checking private updates still requires authorized GitHub access.

## 2. Find your way around

| Area | Purpose |
|---|---|
| **Data** | Import and edit measurements |
| **Statistics** | Describe the experiment and run an analysis |
| **Editor** | View and format the figure |
| **Figures**, on the left | Switch between figures in this project |
| **Format figure** | Edit the selection and general appearance |
| **Save project / Open** | Save and reopen the complete editable project |
| **Export** | Create the final SVG or PNG figure |

In a narrow window, use **Format** to open the formatting drawer. Clicking an editable element can also open it.

**All figures in a project share the same data table.** Changing a measurement updates every figure that uses that project table.

## 3. Make your first figure

We will compare three fictional independent groups. This is a software exercise, not a recommended analysis for every experiment.

1. Open **Data**.
2. Choose **Paste data**.
3. Paste the complete table, including its first line:

```csv
Control,Low dose,High dose
20,30,41
22,33,45
19,28,39
23,35,47
21,31,43
24,34,46
```

4. Choose **Import table**. Importing replaces the project's current table. Save a `.labplot` first if you need to keep the previous work.
5. Check that there are three groups, with six observations per group.
6. Open **Editor**. The bar + swarm figure shows a summary and every observation.

Each column is a group. Each numeric cell is an observation. An empty cell is missing data; **zero is a real value**, not a missing-value marker.

You can also use **Import CSV** for an Excel export. Commas, semicolons and tabs are supported as column separators. For decimal commas, use a separator that keeps columns unambiguous, such as a semicolon:

```csv
Control;Treatment
20,5;31,2
22,1;33,4
```

## 4. Choose a chart

Choose **New chart**, then a chart in the gallery. The new figure appears in the sidebar and uses the same project data.

To change the current figure instead of adding another one, open the gallery and use **Change current figure type** at the bottom.

| I want to show… | A useful starting point |
|---|---|
| Observations and a group summary | **Bar + swarm** or **Swarm** |
| Median and spread | **Box plot** |
| Distribution shape | **Violin**, **Raincloud** or **Density** |
| Counts within intervals | **Histogram** |
| A relationship between X and Y | **XY scatter** |
| Values ordered by X | **XY lines** |
| Changes in the same individuals | **Paired**, using real subject IDs |
| Cumulative probability | **ECDF** |
| A matrix of measurements | **Heatmap** |

This version has 13 chart types. Specialized charts such as dose–response and Kaplan–Meier are listed separately in the [roadmap](ROADMAP.md).

## 5. Format the figure

Use **Format figure** for titles, axes, colors, fonts, symbols, error bars and dimensions.

Pick a color visually or enter its **HEX** value beside the color picker. For example, `#0072B2` is blue. The fields accept three- or six-digit HEX, with or without `#`, and normalize valid values when applied.

### Change just one point

1. Click the point.
2. Check its group and subject in **Selected observation**.
3. Change its color, size, shape, outline or opacity.
4. Confirm that neighboring points kept their appearance.

**Reset to group style** removes that point's visual overrides. Changing how a point looks does not change its measurement and does not exclude it from an analysis.

### Choose error bars

| Option | Meaning |
|---|---|
| **SD** | Sample standard deviation |
| **SEM** | Standard error of the mean |
| **95% CI** | A 95% confidence interval for the mean |
| **None** | No error bars |

SD, SEM and CI answer different questions. State which one you used in the figure caption.

### Reuse formatting

1. Format a source figure.
2. Open the figure that should receive its style.
3. Choose **Apply style**.
4. Select the source in **Copy style from**.
5. Choose everything, or just colors, typography, axes or point symbols.
6. Apply the style.

Individual point overrides in the destination figure are preserved. **Save reusable style** stores a preset inside the project.

## 6. Run statistics and add significance marks

For this fictional exercise, assume **independent groups**: different individuals belong to each group.

1. Open **Statistics**.
2. Select **Independent groups**.
3. Read the explanations under **Compatible tests**. For this exercise, choose **Welch ANOVA + Welch t-tests**.
4. Select **Each group versus control** as the comparison family.
5. Select **Control** as the reference group.
6. Keep **Holm** correction and α = **0.05** for the exercise.
7. Choose **Analyze and annotate chart**.
8. Read the results and notes, then choose **View on chart**.

The app suggests procedures compatible with the number of groups and the design you selected. **It cannot infer independence, valid pairing or scientific assumptions just from the numbers.** For real work, use your experimental design and analysis plan.

Significance marks use the adjusted p-value when a correction applies:

| Result | Mark |
|---|---|
| p < 0.05 | `*` |
| p < 0.01 | `**` |
| p < 0.001 | `***` |
| p < 0.0001 | `****` |
| Otherwise, under these conventional thresholds | `ns` |

Non-significant comparisons are hidden by default. Use **Show non-significant** to include them, or choose numeric p-values in **Display**. A mark belongs to a comparison, not to an isolated column.

### Move a comparison

Click a bracket or its mark, then drag it or use **X offset / Y offset**. **Reset automatic position** removes the manual offset.

The horizontal adjustment moves the label; the bracket ends stay attached to the compared groups. If data or statistical options change, old significance annotations are hidden until you recalculate.

### Find and review outliers

1. Choose **Find outliers** and select **ROUT** or **Grubbs**.
2. For ROUT, choose **Q (false discovery rate)**: 0.1%, 1%, 5% or 10%. For Grubbs, choose **Alpha**: 0.05 or 0.01.
3. Choose **Detect outliers** and review the flagged observations by group. Current flags receive an amber ring in the figure.
4. Decide whether a flagged measurement is scientifically justified. Detection does **not** exclude it automatically.
5. To explicitly exclude a point, select it and use **Exclude from analysis**. The original value is retained; excluded points are faded and crossed.

An unusual-looking point is not automatically an error. Preserve the original measurement, record any exclusion reason and report it with the analysis. Color or opacity alone is never an exclusion. Editing data or exclusions makes detection results stale; run detection again. The methods are local implementations, not a claim of exact GraphPad equivalence. See the [expert guide](EXPERT-GUIDE.md#outliers-flags-and-exclusions).

## 7. Save your work and control autosave

The **Autosave** toggle controls automatic writes to this browser's local storage:

- **On:** changes are saved automatically in this browser and local origin.
- **Off:** you can try changes without automatically saving the project state. The preference persists between launches.

Switching autosave off does not delete an older saved copy. **Save project** downloads a portable `.labplot` containing data, analyses, figures and customizations. Use it for a backup, a previous version or another computer; autosave is not a replacement for that file.

To continue older work, choose **Open** and select its `.labplot`. Individual point styles and manual comparison positions are restored.

Clearing browser data can remove autosave. Another browser or local origin uses separate storage. Save a `.labplot` before changing environments.

## 8. Export PNG or an editable SVG

Choose **Export**, then the format:

| Format | Use it for… |
|---|---|
| **PNG** | Slides, documents and sharing an image |
| **SVG** | Vector quality and editing objects in Illustrator |

For PNG, choose 1× to 4×. A figure sized 800 × 560 px exported at 3× becomes 2400 × 1680 px.

### Continue in Adobe Illustrator

1. Export **SVG** from PSL.
2. In Illustrator, use **File → Open** and select the SVG.
3. Select objects to change their colors or shapes. Use **Ungroup** if needed to reach individual elements.
4. Use the text tool to edit words. Install the original font on that computer; otherwise Illustrator may substitute another font.
5. Save an `.ai` working copy if you want to continue in Illustrator's native format.

The SVG preserves editable text and vector objects. It is a figure, not a PSL statistical project. Reopen the `.labplot` in PSL to change chart types or recalculate analyses. PNG cannot recover a figure's data or editable objects.

## 9. Common problems

| Situation | What to check |
|---|---|
| First setup does not finish | Internet, a writable extracted folder and messages in the terminal |
| Browser does not open | Keep the server running and try `http://127.0.0.1:8765` |
| Port is occupied | Close the previous PSL session or the other program using the port; the launcher should not terminate unrelated programs |
| CSV is rejected | Unique headers, aligned columns and numeric group values |
| A test is unavailable | Number of groups, at least two observations per group and selected design |
| Paired data are rejected | Missing/duplicate subject IDs or different subjects between groups |
| Significance marks disappeared | Data/options changed; recalculate the analysis |
| A point disappears on a log axis | Zero and negative values cannot be represented on that scale |
| A point stays different after style transfer | It has an individual override; use **Reset to group style** |
| Illustrator changes the font | Install the original font or choose one available in both applications |
| You are offline | Use the already prepared installation; updates wait for a connection |
| A private GitHub update cannot be downloaded | Confirm that you have authorized access; the existing installed version should remain usable |

For a bug report, include OS, PSL version, steps and error text. Prefer a small fictional example over personal or confidential data.
