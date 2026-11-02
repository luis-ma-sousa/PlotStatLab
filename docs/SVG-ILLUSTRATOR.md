# Editable SVG in Adobe Illustrator

PlotStatLab exports self-contained SVG1.1. Points, bars, paths, axes, legends and comparisons remain separate vector objects. Labels remain editable text: PSL does not outline the text or embed a photograph of the chart.

## Open and edit

1. In PSL, finish a figure and choose **Export → SVG → Export SVG**.
2. In Illustrator, choose **File → Open** and select the SVG. Opening provides direct access to objects. A file placed as a linked image in another document must be embedded before its contents can be edited.
3. Open **Window → Layers**. Groups have names such as `PSL-data`, `PSL-point-…`, `PSL-statistics` and `PSL-axis-labels`. Depending on Illustrator, they may appear as groups within a layer.
4. Use **Direct Selection** to select a shape or observation, or the text tool to edit a label. Expand the group hierarchy as needed. A plot clipping group is intentional; release it only if you want to change the clipping behavior.
5. Save a separate `.ai` copy to preserve subsequent Illustrator editing.

## What survives export

- Unicode text, font family, size, weight, alignment and rotation.
- Explicit SVG fill and stroke attributes, including `fill="none"` on open lines.
- HEX colors, opacity, dimensions, positions and observation-specific overrides.
- Groups, paths and geometric clipping needed to keep data within the axes.
- Automatic or manually positioned statistical comparisons that are current at export time.

The file has no CSS dependency, external resources, scripts, raster images, `foreignObject` or library marker symbols. Invisible hit targets and selection outlines are removed. Each observation has its own editable object ID. Objects are grouped without changing paint order or transforms.

## Practical limits

The chosen font must be installed where Illustrator opens the file; otherwise it may be substituted. PSL deliberately keeps text editable. Converting text to outlines in Illustrator may be useful for a final print-delivery file but removes text editing.

Illustrator edits do not update PSL data or statistics. Keep the `.psl` scientific workspace and the SVG/AI presentation files. SVG is not a substitute for the workspace, nor does it contain a native `.ai` editing session. A raw SVG group is not guaranteed to become a separate native Illustrator layer.

Structural tests validate XML, objects, text, fonts, strokes, transforms and clipping. Import behavior can still vary between Illustrator versions. See [Adobe's SVG presentation-attribute guidance](https://helpx.adobe.com/illustrator/using/saving-artwork.html).
