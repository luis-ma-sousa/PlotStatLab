# Installation on Windows and macOS

PSL is free software under the MIT license. Use the application downloads under GitHub Releases; the repository source download is intended for development.

## Graphical installers

**Windows:** download `PlotStatLab-VERSION-Windows-Setup.exe`, run it through your normal system approval process, choose a destination and install. It uses your own Local AppData folder, creates Start menu/Desktop shortcuts, and does not require administrator rights or alter global Python installations. Start **PlotStatLab** from its shortcut. The local terminal shows startup progress; keep it open while working. A per-user uninstaller removes known application files and shortcuts while preserving unknown files, runtime caches and update recovery copies. Workspace files and browser autosave are preserved.

**macOS 14 or newer, Apple Silicon/Intel:** download `PlotStatLab-VERSION-macOS.dmg`, open it and drag **PlotStatLab.app** to Applications (or your own Applications folder). Launch it using your normal system approval process. The immutable application launcher seeds an updatable local application under `~/Library/Application Support/PlotStatLab/application`. The terminal displays initial setup and local startup progress. The launcher is ad-hoc signed and verified for local integrity. This does not certify the publisher's identity or constitute Apple notarization. Runtime updates occur outside the signed application bundle, keeping its integrity signature intact.

The small installers include the compiled editor and offline manuals. Their first setup downloads a local Python runtime and pinned dependencies; allow Internet access for that setup. Later use is independent of Internet access. See [offline operation](OFFLINE.md).

## Complete offline package

Download the ZIP containing **offline** and your operating system/architecture in its filename for a first launch without Internet access. It includes Python, uv and exact binary wheels. Extract the complete folder and use the normal launcher; `--offline --no-update` explicitly skips startup network checks too. The small installers/portable ZIP below remain options for users who prefer a smaller download and online initial setup.

## Portable download

Extract `PlotStatLab-VERSION.zip` completely. Open `Start PlotStatLab.bat` on Windows, `Start PlotStatLab.command` on macOS, or run `sh start-plotstatlab.sh` on Linux. Keep the reserved `.psl` folder beside the launchers. You do not need to preinstall Node.js, Python, package managers or compilers. A moved installation may need to recreate its local environment; keep its runtime cache if you intend to move it without Internet.

## Integrity and publisher signing

Each release download has a `.sha256` companion. The updater checks ZIP and per-file hashes, validates project-format support, prepares an isolated environment, verifies the staged app and rolls back failed promotion. These are integrity/recovery checks, not a publisher identity certificate.

The free build provides an unsigned Windows installer and an ad-hoc-signed macOS application. Windows/Apple may display an unknown-publisher or downloaded-app warning. PSL does not disable system security or remove quarantine metadata. Trusted publisher signing/notarization requires separate publisher credentials; no such credentials are bundled, generated on your behalf or claimed by this release.

## Compatibility and previous work

CI builds the real installers on macOS and Windows, then installs/starts each in a path containing spaces and verifies a second cached launch with network-disabled dependency resolution. The portable launcher is checked on macOS, Windows and Linux. Scientific/project tests run on all three systems. Existing schema-1 `.labplot` and `.psl` projects remain supported, including point overrides and analysis history. Advanced data, results and publication settings are additive schema-1 extensions.

Autosave belongs to the browser profile and `http://127.0.0.1:8765`; changing browser can show a different local autosave. Use **Save workspace** and **Open** to move work between browsers or computers. Keep independent `.psl` backups before updating or reinstalling.
