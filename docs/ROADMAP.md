# PlotStatLab — delivery roadmap and acceptance record

The 0.3 line implements the scientific and publication stages below. A checked implementation is not a claim of numerical identity with proprietary GraphPad Prism, support for every possible statistical model, or completion of external certification. Each method's exact scope is documented in [Advanced methods](ADVANCED-METHODS.md).

| Stage | Implemented delivery | Acceptance evidence |
|---|---|---|
| Foundation | Local React/TypeScript SVG editor, local SciPy engine, MIT licensing, English UI/manuals | TypeScript/build, numerical references, local browser workflow |
| Core figures | Bar+swarm, bar, swarm, box, violin, raincloud, paired, scatter, lines, histogram, density, ECDF, heatmap | Stable point identities, collision tests, per-point edits, style transfer and saved-project roundtrips |
| Workspace | Simultaneous datasets, figures and independent group/advanced result histories, chosen overview panels | Legacy and multi-dataset file roundtrips, stale-result checks |
| Broader science | Two-factor tables/grouped plots, Type III two-way ANOVA, one-factor repeated ANOVA with Greenhouse–Geisser, random-intercept REML, Pearson/Spearman and OLS/diagnostics | Independent statsmodels fixtures, closed-form references and invalid-design cases |
| Specialized science | 4PL dose response, Kaplan–Meier/log-rank, forest, Bland–Altman, volcano, genuine Dunn and Dunnett | Known nonlinear parameters, independent log-rank reference, pooled tied-rank reference, SciPy published Dunnett example, chart render/export tests |
| Outliers | Constant-model ROUT, Grubbs, preserved originals, review flags and reversible explicit exclusions | Published equations/NIST reference, masking/invariance/exclusion tests; proprietary numerical identity is not certified |
| Publication | Aligned multipanel layouts, A/B/C labels, shared fonts, scientific scripts/italics/bold, journal size templates, mm/DPI and batch export | Editable multipanel SVG, unique clipping IDs, ZIP CRC, PNG resolution metadata and UI tests |
| Import | CSV/TSV, long XY/factor/censoring schemas, native Excel multi-sheet import | Real OOXML fixtures including formulas/caches, malformed archives, limits and no silent missing-response conversion |
| Accessibility/performance | Keyboard point/annotation editing, modal focus containment/restoration, paginated tables, optimized exact swarm | Keyboard browser tests, 10,000-point identity/finite-coordinate test, tied heterogeneous-marker collision test |
| Distribution | Small portable ZIP, complete per-platform offline runtime ZIP, per-user Windows graphical installer, drag-to-Applications macOS DMG/application, hidden runtime components | Native Windows/macOS build + actual install/start and cached offline start in CI; portable macOS/Windows/Linux checks; fresh offline runtime relocation tests |
| Updates/recovery | Startup release checks, offline fallback, isolated dependency preparation, verified staged app, atomic promotion, rollback/crash recovery, schema-1 compatibility | Updater transaction/security/recovery tests and previous-format fixtures |

## Release gate

Before changing repository visibility, require all scientific/unit checks, the browser workflow, clean installation and cached offline checks to pass for the release commit. Native installer builds must also pass. The maintainer records run links in [Validation](VALIDATION.md). An online statistics service, account, subscription or API key is not required for any analysis/editor feature; see [Offline operation](OFFLINE.md).

## External validation and publisher credentials

- SVG exports are checked as standalone editable vectors and live text. Actual Illustrator testing is deferred at the user's request; no Illustrator access is assumed. Further checks across Illustrator releases can be recorded when the user provides feedback.
- The macOS application has an ad-hoc local integrity signature. Windows trusted publisher signing and Apple Developer ID/notarization require publisher credentials that are not available. These must not be described as completed or silently substituted with checksums. The owner explicitly chose the free distribution without publisher certificates, Apple/Microsoft publishing accounts or notarization on 2026-11-02. Those external credentials are excluded from the initial public-release gate.
- Native GraphPad project import was an investigation item rather than an approved implemented file format. PSL currently reopens its own `.psl`/legacy `.labplot` projects. PNG/SVG cannot reconstruct missing measurements or analysis history.

## Explicit scientific boundaries

The mixed model is a Gaussian random intercept with one fixed predictor; repeated ANOVA is one within-subject factor; 4PL uses positive doses and unweighted errors; survival supports independent right-censored observations. Forest/volcano plots display supplied estimates/probabilities. Advanced ANOVA overall effects are not automatically converted into pairwise significance brackets. These boundaries are visible in the interface/manuals and invalid inputs are rejected. Additional model families are future extensions, not claims about this release.
