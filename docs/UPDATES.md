# Offline operation, updates and recovery

## Normal launches

The platform launcher first verifies that the compiled editor is present. It uses an existing local runtime when healthy; otherwise it installs the official pinned uv tooling, managed CPython3.12 and pinned binary scientific packages under `.runtime/`. No administrator privileges, system PATH changes or global Python installation are required.

Every normal launch then checks the official GitHub release channel. A network failure, no newer stable release or lack of private-repository authorization retains the installed version. Private updates can use `PSL_GITHUB_TOKEN`, `GH_TOKEN`, or an existing authenticated GitHub CLI. Tokens are not written into release packages or workspaces. Do not put tokens in a downloaded source file.

Once dependencies are installed, all data editing, statistics, plotting, saving, SVG/PNG export and included manuals work offline. The first installation and downloading an update require Internet access.

## Automatic installation

A candidate release must be newer and support project schema1. The updater verifies the ZIP SHA256, validates the internal manifest and every managed file, rejects unsafe archive paths/symlinks, installs any new dependencies into a separate hash-keyed environment, and starts a temporary local health check. Only then does it replace program files.

The replacement has a recovery journal and a program-file backup in `.updates/backup-*`. The promoted application is checked again. Failure restores the previous managed files; the previous dependency environment remains available. An interrupted transaction is recovered at the next launch before a new update is attempted.

If an editor is already running at port8765, the updater defers replacement until that session has been closed. Launching again may reopen that existing session. This prevents an update from replacing resources while unsaved work is being edited.

## What is preserved

- User `.psl` workspaces and legacy `.labplot` files.
- Browser autosave and its preference, because the local origin remains127.0.0.1:8765.
- Original measurements, IDs, exclusions, styles and saved analysis settings.
- Unmanaged exports or other user files in the installation folder.
- Older runtime environments and managed-program backups.

Opening a legacy project creates a one-dataset workspace. It does not replace the original file. A workspace update is not a scientific reanalysis: results remain tied to their recorded data and settings, and changed measurements mark the affected results out of date.

## Troubleshooting

Keep the terminal error text and the `.updates` folder if an update cannot recover automatically. Do not delete your workspaces. A fresh release extracted to a separate folder can open portable `.psl` backups without using the damaged program installation. Preserve your original installation for recovery.

The launchers accept `--offline` to use installed/cached resources and skip the release check, `--no-update` to skip the check once, `--check` to verify installation without opening the editor, and `--no-browser` to run the local server without opening a browser. These options are useful for troubleshooting and automated validation; ordinary users can double-click the launcher.

Checksums verify integrity relative to the published release; they are not an independent cryptographic signature. Numerical equivalence to a proprietary application and universal OS compatibility are not implied by a successful update.
