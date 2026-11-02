# Publication layouts and scientific typography

The **Publication** workspace composes figures from any loaded dataset into one editable figure. Its settings are stored in the `.psl` workspace. The original figures retain their own styling.

## Make a multipanel figure

1. Open **Publication** and select the figures to include.
2. Use the up/down buttons to set their order. Panel letters follow that order: A, B, C, and so on.
3. Choose the number of columns. Set the drawing width, drawing height, gap and outer margin. All panels use identical drawing dimensions. The common legend setting keeps the top plot edges aligned.
4. Enable **Use the same fonts** to use one typeface and final print size throughout the composition. Font sizes here are points at the chosen physical print width, rather than screen pixels.
5. Set the total print width in millimetres. The height follows the layout aspect ratio. The export toolbar shows the final physical and raster dimensions.
6. Export **SVG** for editable vector artwork or **PNG** for a raster image.

For example, an 180 mm figure at 300 DPI has a width of approximately 2126 pixels. Increasing DPI increases the raster dimensions; it does not make the printed figure physically wider. SVG contains physical millimetre dimensions and a separate drawing-coordinate viewBox. PNG contains standard pHYs print-resolution metadata as well as exact pixel dimensions.

Keep text readable at its final printed size. If many narrow panels crowd the labels, increase the print width, reduce the column count or adjust the typography. PSL warns when a chosen print size produces unusually large text within a drawing panel. It does not automatically shrink scientific labels below the requested size.

## Publication size templates

Templates set a convenient starting width and PNG resolution. They do not certify a file for a journal or convert SVG/PNG into another file format.

| Template | Width | Starting resolution |
|---|---:|---:|
| Generic single column | 85 mm | 300 DPI |
| Generic double column | 180 mm | 300 DPI |
| Nature single / double column | 90 / 180 mm | 300 DPI |
| PLOS text / full width | 132 / 190.5 mm | 300 DPI |
| Presentation | 254 mm | 150 DPI |

The Nature widths follow the publisher's [formatting guide](https://www.nature.com/nature/for-authors/formatting-guide). The PLOS widths follow its [figure guidance](https://journals.plos.org/plosone/s/figures). These pages were checked on 2 November 2026. Journal pages and article types may specify different widths, text sizes, maximum heights, file sizes and submission formats. In particular, the linked PLOS guidance requires TIFF or EPS for final submission; PSL's SVG/PNG exports can be used as editable artwork or raster intermediates for those workflows.

## Batch export

Choose **Batch export → SVG panels (.zip)** or **PNG panels (.zip)**. The archive contains one numbered file per selected panel, in the saved publication order. The number prevents collisions when two figures have the same name. Each panel uses the size and shared typography shown in the publication layout. SVG files keep separate vectors and live text. PNG files receive the selected DPI metadata.

Batch files contain individual panels; the main **Export SVG/PNG** buttons produce the complete labelled composition. A ZIP avoids a series of browser download prompts. Very large PNGs are limited to 80 megapixels per image; batch archives are limited to 150 MB to avoid exhausting browser memory.

## Scientific text

In figure titles, axis labels, legends and category labels, use:

| Input | Meaning |
|---|---|
| `H_{2}O` | Subscript 2 |
| `10^{−3}` | Superscript −3 |
| `*P*` | Italic P |
| `**Signal**` | Bold Signal |
| `\*literal\*` | Literal asterisks |
| `x\^{2}` | Literal superscript notation |

Use braces around the complete superscript or subscript. This intentionally small grammar does not evaluate LaTeX or mathematical expressions. Unbalanced or unsupported notation stays literal. Unicode Greek letters, mathematical symbols and minus signs may be typed directly, subject to the chosen font's glyph support.

SVG exports keep these labels as text and `tspan` objects with font and baseline attributes. They remain text-editable in vector software. The chosen font must be installed when opening the export elsewhere. See [Editable SVG in Adobe Illustrator](SVG-ILLUSTRATOR.md) for the interoperability scope and practical limits.
