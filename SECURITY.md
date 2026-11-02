# Security and data handling

PlotStatLab is a local scientific application. The server binds to `127.0.0.1`; datasets and workspace autosaves remain on the user's computer. There is no account requirement, analytics service or automatic upload of measurements.

The first installation downloads the official local Python tooling and pinned dependencies. Subsequent launches check the configured GitHub repository for releases. Offline or unauthorized checks retain the installed version. Update requests contain application/version information and ordinary HTTP connection metadata, not scientific datasets.

Release ZIPs have SHA256 checksums and an internal per-file manifest. The updater rejects unsafe paths, symlinks, unsupported project schemas and altered files, validates a staged runtime/server, and applies only managed program files. It retains program backups and previous dependency environments. These checks protect integrity; a checksum published beside an archive is not an independent signature.

An active local editing session prevents replacement until a later full start. Never add project files or exports to the managed-file manifest. Tests exercise rollback and interrupted-update recovery.

To report a vulnerability, use the repository's private vulnerability reporting facility when available: https://github.com/luis-ma-sousa/PlotStatLab/security/advisories/new. Include the application version and reproduction steps using synthetic data. Do not include private research data or authentication tokens in a public issue.

Save portable `.psl` workspace files for backups. Browser autosave is not a substitute for file backups. Unsupported formats are rejected rather than silently rewritten.
