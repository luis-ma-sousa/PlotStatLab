# PlotStatLab — super quick guide

**PSL 0.2.0 · The essential clicks**

Download the complete GitHub ZIP, **extract it**, then open:

| Windows | macOS | Linux |
|---|---|---|
| `Start PlotStatLab.bat` | `Start PlotStatLab.command` | `start-plotstatlab.sh` |

Initial setup needs Internet. A prepared installation works offline. Online launches check for updates; an active session is protected until a full restart. Private downloads require authorized GitHub access.

| Goal | Clicks |
|---|---|
| **Import data** | **Data → Import CSV** or **Paste data**. First row = group names; one column per group. Empty = missing; `0` = zero. |
| **Choose a chart** | **New chart → type**. The selector at the gallery's bottom changes the current figure instead. Figures share the project table. |
| **Format it** | **Editor → Format figure**. Edit titles, axes, fonts, symbols, dimensions and colors; enter HEX beside each color picker. |
| **Change one point** | Click the point → color, size, shape, outline or opacity. **Reset to group style** removes its override. |
| **Reuse a style** | Open the destination → **Apply style → Copy style from → scope → Apply**. Individual destination overrides remain. |
| **Analyze** | **Statistics → design → compatible test → comparisons → correction → Analyze and annotate chart**. Use real `Subject` IDs for paired data. |
| **Review outliers** | **Find outliers → ROUT/Grubbs → threshold → Detect outliers**. Flags do not exclude automatically. An explicit **Exclude from analysis** decision preserves the original value. |
| **Move comparisons** | Click and drag a bracket, or set **X/Y offset**. **Reset automatic position** removes the offset. Recalculate after data/options change. |
| **Save for later** | **Save project → `.labplot`**. **Open** restores data, analyses and formatting. **Autosave** controls automatic browser storage. |
| **Export** | **PNG** for an image; **SVG** for editable vectors. In Illustrator: **File → Open**, then ungroup as needed. Install the chosen font. |

**Remember:** `.labplot` is the scientific project; SVG/PNG are figures. Making a point invisible does not exclude it. Suggestions do not validate experimental assumptions. Keep original measurements and record exclusion decisions.

[Beginner's guide](BEGINNER-GUIDE.md) · [Expert guide](EXPERT-GUIDE.md) · [Roadmap](ROADMAP.md)
