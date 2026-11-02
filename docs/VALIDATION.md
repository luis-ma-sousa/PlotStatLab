# Historical validation — first functional version

**Date: 2 November 2026 · Initial version 0.1.0**

This record covers the original functional workbench, now named PlotStatLab (PSL). It is not a claim that every subsequent feature or platform has passed the same checks. Record 0.2-specific verification separately.

## Automated checks — passed

- Strict TypeScript compilation and production Vite build.
- 31 Python tests: R PlantGrowth ANOVA/Tukey references, published SciPy Mann–Whitney/Wilcoxon/Friedman examples, t-tests, multiplicity corrections, subject-ID alignment, invalid/constant inputs, API and overflow.
- 22 TypeScript tests: Student-t quantiles, nonoverlapping swarm including variable sizes, eight-bracket layout, KDE, heatmap identity, logarithmic fallback, project recovery/roundtrip, CSV, selective style transfer, fingerprints and orphan-override reconciliation.
- **Total: 53 automated tests passed.** The Starlette/httpx deprecation warning did not change the results.

## Interactive checks — completed in the integrated browser

- All 13 chart types were selected through the gallery and rendered demonstration data without NaN/Infinity coordinates.
- Observation `point-1-1` was set to size 11 and color `#cc2288`; its neighbor retained its original color. Changes survived a reload.
- Welch ANOVA with control comparisons and Holm produced global p ≈ 1.31e−17. Non-significant Vehicle comparison was omitted; Low dose and High dose received separate `****` brackets above the data.
- A pointer-capture selection defect was found and fixed: clicking/dragging a comparison no longer removed its selection, and a stationary click no longer created a zero manual offset.
- Manual Y = 14 survived reload. Real dragging changed dx/dy to approximately 15.31/29.31. Resetting automatic position was checked.
- Georgia typography was transferred from Treatment response to Distribution through Apply style. The individually customized source point retained `#cc2288`.
- A real exported SVG parsed as XML, measured 800 × 560, preserved the custom color and contained no editor-only overlays.
- A real exported PNG had a valid signature and measured 2400 × 1680 pixels, approximately 203 KB.
- A downloaded `.labplot` was reopened through the file chooser: two figures, 48 observations, results and the individual point customization were preserved.
- Editing 28 to 28.5 hid comparison annotations and displayed a stale-analysis message.
- Narrow and desktop layouts were observed. At narrow widths, formatting opened as a drawer so that the figure retained usable space.

## Validation limit

The included Playwright end-to-end suite did not pass its startup stage in that environment: the macOS agent sandbox prevented Chromium's MachPort service from starting from the terminal. Those tests were not counted as passing. The interactive checks above used the integrated browser.

Specialized publication cases, large datasets and planned analyses still require additional validation. This record does not establish complete GraphPad Prism equivalence or claim that Illustrator interoperability was tested in the initial version.
