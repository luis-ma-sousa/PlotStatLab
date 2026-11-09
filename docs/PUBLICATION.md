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

Edit the individual figure before composing or exporting its publication panel. Click its title or axis title, or choose **Chart title**, **X axis title** or **Y axis title** in **Text & axes**. The visual editor shows the formatted text while you work.

Select the characters you want to change, then use the visible formatting buttons:

| Goal | Button and action |
|---|---|
| Italic letters | Select the letters, then **I — Italic** |
| Bold text | Select the words, then **B — Bold** |
| Chemical subscript | Type H2O, select only the 2, then **x₂ — Subscript** |
| Superscript or power | Type 10−3, select −3, then **x² — Superscript** |
| A second title line | Place the cursor at the break and press **Enter** |

Formatting applies to the selected text. To change the entire title, select all text inside that editor first. You can type Unicode Greek letters, mathematical symbols and minus signs directly, subject to the chosen font's glyph support. Newly typed asterisks, braces and other notation are literal text; use the buttons to format new labels.

For a multiline Y-axis title, choose **Y axis title** and use **Move closer**, **Move farther**, the distance slider or **Distance from Y axis · px**. If the labels crowd a small publication panel, increase the panel height or drawing width before export. See the [everyday editing guide](EDITING-GUIDE.md) for the short workflow.

### Older saved labels

PSL continues to read scientific notation already stored in older projects, including `H_{2}O`, `10^{−3}`, `*P*` and `**Signal**`. This preserves their original presentation when reopened. It is a compatibility format for saved labels, rather than the way to enter formatting in the visual editor.

SVG exports keep labels as text and styled `tspan` objects, including line positions and subscript/superscript baselines. They remain text-editable in vector software. The chosen font must be installed when opening the export elsewhere. See [Editable SVG in Adobe Illustrator](SVG-ILLUSTRATOR.md) for the interoperability scope and practical limits.
