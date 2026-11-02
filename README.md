# PlotStatLab (PSL)

Free, local scientific plotting and statistics with a live vector editor and multi-dataset workspaces. MIT-licensed. **Development preview**: the repository remains private until the project is finalized.

## Download, extract, open

Download **PlotStatLab-0.3.0.zip** from [Releases](https://github.com/luis-ma-sousa/PlotStatLab/releases), extract the complete folder, then open:

| System | Launcher |
|---|---|
| Windows 10/11, 64-bit | `Start PlotStatLab.bat` |
| macOS | `Start PlotStatLab.command` |
| Linux | `sh start-plotstatlab.sh` |

**For first launch without Internet, choose the complete offline ZIP for your system/CPU.** It includes Python and pinned scientific wheels. The small universal ZIP instead needs Internet access on first launch to download a local Python runtime and pinned packages. You do not need to install Node.js, Python or a compiler yourself. Later launches verify the existing dependencies and start the app. Keep the terminal window open; Ctrl+C stops the local server. If your system asks for permission to execute a downloaded file, inspect the package and use the normal system approval flow.

The user download shows the launchers and a quick guide; application components live in a reserved `.psl` folder. Keep that folder with the launchers. Developer source is distributed separately through the repository. Extract the whole folder; running inside a ZIP or copying only a launcher will not work. Supported platforms must have binary wheels for the pinned scientific runtime. Clean installation and cached offline launch have passed on macOS, Windows and Linux in GitHub Actions, in addition to local Apple Silicon macOS testing. See the validation guide for the recorded run.

Open the app at **http://127.0.0.1:8765**. It works offline after initial installation. No paid service or cloud account is needed to analyze data. While this repository is private, authorized GitHub access is needed to download private releases; public anonymous distribution is prepared but has not been enabled.

## What you can do

- Import several CSV/TSV datasets or native Excel workbooks at once. Import adds datasets and preserves existing work.
- Keep multiple figures per dataset, retain several statistical test results, and compare them side by side in **Overview**.
- Choose which figures and analyses appear in the overview. Save the entire workspace as `.psl`, including datasets, results, formatting, individual point overrides and panel selections. Legacy `.labplot` projects open as one-dataset workspaces.
- Use 20 plot families: bar+swarm, bar, swarm, box, violin, raincloud, paired, XY scatter, XY line, histogram, density, ECDF, heatmap, grouped two-factor bar+swarm, regression, dose–response, Kaplan–Meier, forest, Bland–Altman and volcano.
- Click an observation to edit only that point. Enter HEX colors for every color control; copy complete or selective styles between figures.
- Run design-aware statistical comparisons, including Dunn and Dunnett, adjusted p-values and automatic draggable significance brackets.
- Analyze two-factor and repeated designs, fit a random-intercept mixed model, calculate correlations/regression, fit 4PL dose response and compare right-censored survival curves.
- Compose aligned multipanel figures, share typography, label A/B/C, apply journal size templates and batch-export SVG/PNG at precise physical size and DPI.
- Identify outliers with Grubbs or the published constant-model ROUT method. Review flags before explicitly excluding anything; original values remain saved. Numerical identity to proprietary GraphPad versions has not been certified.
- Export PNG at exact pixel dimensions or standalone SVG1.1 with editable text and separate vector objects for Illustrator.
- Toggle autosave. **Save workspace** also creates a portable backup independently of the toggle.

## Manuals, included offline

Open **Help** in the app, or read:

- [Super quick guide](docs/QUICK-START.md)
- [Beginner guide](docs/BEGINNER-GUIDE.md)
- [Expert guide](docs/EXPERT-GUIDE.md)
- [SVG and Illustrator](docs/SVG-ILLUSTRATOR.md)
- [Outlier methods and validation](docs/OUTLIER-METHODS.md)
- [Updates and recovery](docs/UPDATES.md)
- [Advanced methods](docs/ADVANCED-METHODS.md)
- [Publication and scientific typography](docs/PUBLICATION.md)
- [Excel import](docs/EXCEL-IMPORT.md)
- [Offline operation](docs/OFFLINE.md)
- [Installation](docs/INSTALLATION.md)

The complete interface and documentation are in English. User-supplied dataset names and imported historical notes retain their original text.

## Updates and previous work

Every normal launch checks the official GitHub releases when online. If a newer supported release is available, PSL verifies its ZIP and file hashes, prepares an isolated dependency environment, checks the staged app, and updates managed program files before opening the editor. Failed checks retain or restore the previous version. Previous dependency environments and program backups are retained.

A running editing session defers replacement until a full restart. Offline or unauthorized checks use the installed version. No scientific dataset, workspace file or browser autosave is uploaded or replaced by the updater. Save portable `.psl` backups; autosave is tied to the browser profile and local URL. Update compatibility is tested with a saved v0.1 project and multi-dataset roundtrips.

## Development and validation

For contributors only: Node24, pnpm11.25 and Python3.12.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-lock.txt
.venv/bin/python -m pytest tests/ -q --ignore=tests/e2e
.venv/bin/python scripts/package_release.py
```

Development uses `pnpm dev` on port5173 and `.venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8765` for the API. Browser storage is separate for different ports; use a `.psl` file to transfer work. See [Contributing](CONTRIBUTING.md), [validation](docs/VALIDATION.md), [roadmap](docs/ROADMAP.md), [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
