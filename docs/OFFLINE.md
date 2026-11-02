# Offline operation

PlotStatLab is a local application. The interface, chart renderer, statistics, outlier detection, CSV/TSV/Excel import, workspace storage, scientific fitting, SVG/PNG export, publication composition and manuals run on your own computer. They do not need a cloud statistics service, online AI, remote fonts, CDN libraries, account, API key or subscription. Scientific data are never uploaded by PSL.

The browser talks to a Python service at `127.0.0.1:8765`, which is your own machine. This local connection works without Internet access. Keep the local app running while using the editor.

## Complete offline download

For a first launch without Internet access, download the **offline** ZIP for your operating system and architecture (Windows x64, macOS 14+ arm64/x64 or Linux x64). It includes a managed Python runtime, local installer and exact binary scientific wheels. Extract it completely, then open the normal launcher. A fresh environment is created at the final folder path using the bundled wheels, without an existing cache or downloaded dependencies. The offline package is larger than the small universal ZIP. Do not substitute a package for another operating system/CPU.

## Connections that PSL uses

1. **Initial portable setup:** the small cross-platform ZIP obtains the pinned Python installer, Python runtime and scientific dependencies from their official distribution channels. This requires Internet access on the first setup. Once installed and verified, the same installation works offline.
2. **Startup updates:** normal launches check the official GitHub release endpoint. An unavailable connection, inaccessible private repository or unsuccessful download keeps the installed version. Checks have timeouts; GitHub is never required to edit or analyze local work. Updates finish before opening the editor and defer replacement while another editing session is running.
3. **Optional external references:** clicking a scientific reference opens its publisher's website. The included explanation and manuals remain readable offline.

There are no online-only analyses or editing features. A normal offline session can import local data, run every included method, edit every figure, save/reopen the entire workspace and export publication figures.

To skip update requests explicitly, run the launcher with `--offline --no-update`, or set `PSL_NO_UPDATE=1`. For example: `Start PlotStatLab.bat --offline --no-update` on Windows, or `sh "Start PlotStatLab.command" --offline --no-update` on macOS. Do not delete the reserved application or runtime folders when moving an installation. Save `.psl` files as portable backups; browser autosave belongs to the browser profile and local URL.

Automated checks include clean setup followed by a cached launch with `UV_OFFLINE=1` on macOS, Windows and Linux, plus a browser workflow that rejects every non-local HTTP request while importing, calculating, reopening and exporting.
