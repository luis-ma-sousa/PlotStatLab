# PlotStatLab: super quick guide

**Download → extract the complete folder → open the launcher.** Windows: `Start PlotStatLab.bat`; macOS: `Start PlotStatLab.command`; Linux: `sh start-plotstatlab.sh`. Choose the **complete offline ZIP** for a first launch without Internet. The small universal ZIP instead downloads dependencies on first setup. All editing and analyses run locally.

| I want to… | Do this |
|---|---|
| Add several datasets | **Overview → Import datasets**, then select multiple CSV/TSV/XLSX files. Existing work stays intact. |
| Paste a table | **Data → Add pasted dataset**. First row contains group names; optional `Subject` and `X` columns preserve identities/coordinates. |
| Switch datasets | Choose the dataset in the left sidebar. Changes affect that dataset only. |
| Make a chart | Select a dataset, then **New chart → chart type**. Multiple figures can use one dataset. |
| Compare figures | **Overview → Choose figures**. Selected figures appear together; **Edit figure** opens one for detailed editing. |
| Run statistics | **Statistics** → experimental design → compatible test → comparisons/correction → **Analyze and annotate chart**. |
| Compare different tests | Run each test on its dataset. **Overview → Choose analyses** shows saved results side by side. |
| Find outliers | **Statistics → Find outliers** → ROUT/Q or Grubbs/alpha → **Detect outliers**. Review flags; exclusion is explicit and retains original values. |
| Edit one point | Click it in the editor; change its color/HEX, shape, size, opacity or outline. |
| Reuse formatting | **Apply style** copies another figure's style. **Save reusable style** creates a preset. |
| Move stars | Drag a comparison bracket, or select it and change **X offset / Y offset**. **Reset automatic position** restores automatic placement. |
| Export to Illustrator | **Export → SVG → Export SVG**. In Illustrator use **File → Open**; text and vector objects remain editable. The chosen font must be installed. |
| Export an image | **Export → PNG**, choose pixel scale, export. |
| Save all work | **Save workspace** downloads one `.psl` with datasets, tests, figures and selected panels. **Open** restores it or a legacy `.labplot`. |
| Control autosave | Use the **Autosave** switch. OFF stops automatic browser writes; save explicitly before closing. |

A `.psl` is the scientific workspace. SVG/PNG are presentation figures. Flags do not prove laboratory error, and suggestions do not establish experimental assumptions. Use portable workspace backups when moving browsers or computers. Detailed help is available offline under **Help**.

For two factors, XY fits or survival: **Data → Advanced table & scientific examples**, then **Statistics → Factorial, regression & survival → Run analysis**. Use **Create figure with this result** for the fitted graph. For a publication figure: **Publication → choose/order figures → print width/DPI → Export SVG/PNG**. Import `.xlsx` alongside CSV/TSV; each visible sheet becomes a dataset. All calculations and exports work offline after setup.
