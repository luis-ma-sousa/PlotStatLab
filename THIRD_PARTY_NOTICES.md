# Third-party notices

PlotStatLab code is MIT-licensed. Dependencies retain their own licenses. Complete available license texts for the JavaScript libraries included in the compiled editor are in [licenses/frontend](licenses/frontend); Python runtime notices are in [licenses/python](licenses/python). These inventories describe the pinned dependencies used for this build.

## Compiled editor

| Package | Version | License |
|---|---|---|
| d3-array | 3.2.4 | ISC |
| d3-color | 3.1.0 | ISC |
| d3-format | 3.1.2 | ISC |
| d3-interpolate | 3.0.1 | ISC |
| d3-path | 3.1.0 | ISC |
| d3-scale | 4.0.2 | ISC |
| d3-shape | 3.2.0 | ISC |
| d3-time | 3.1.0 | ISC |
| d3-time-format | 4.1.0 | ISC |
| internmap | 2.0.3 | ISC |
| lucide-react | 0.468.0 | ISC |
| papaparse | 5.7.0 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |

## Installed runtime

The launcher obtains uv from the official Astral distribution (MIT / Apache-2.0), managed CPython (Python Software Foundation license), and the pinned PyPI packages listed in requirements-runtime.txt. Their licenses are supplied by their respective distributions. SciPy and NumPy include additional notices for bundled numerical libraries; see the full copied notices. No Python interpreter or compiled scientific wheel is embedded in the source ZIP.

## Fonts and scientific references

System fonts are referenced and are not redistributed. Exported SVG retains editable text and requires the chosen font to be available in the destination application. GraphPad Prism is a reference for workflows and published statistical methods; PlotStatLab does not distribute GraphPad code or claim affiliation. Statistical method references appear in the expert and outlier guides.
