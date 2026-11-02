# Importing native Excel workbooks

Choose **Import datasets** and select an Excel Workbook (`.xlsx`). PSL reads the workbook locally using openpyxl; Excel, Microsoft 365 and an internet connection are not required. Every visible, nonempty worksheet becomes a separate dataset. You can select several workbooks and CSV/TSV files in the same import operation.

## Prepare the tables

Use one rectangular table per worksheet, with a header row followed by observations. Wide tables have a group name at the top of each measurement column. Long tables use the column names supported by PSL's data importer, such as `group`, `value`, `subject` and `x`. Use explicit subject IDs for paired measurements; row order does not establish pairing.

PSL trims empty rows and columns around the outside of each table. It retains internal blank cells and rows. Hidden worksheets are skipped and reported. Hidden rows and columns inside a visible worksheet are retained, so hiding a measurement in Excel does not silently exclude it from analysis.

Underlying cell values are imported, rather than Excel's display formatting. A numeric value displayed as a percentage remains its underlying fraction. Dates/times are represented in ISO format, durations as duration text, and booleans as `TRUE`/`FALSE`; these are not silently converted into scientific measurements. For a time interval to be analyzed numerically, convert it to an explicit numeric unit in the source table first. Excel formatting, charts, drawings and macros are not imported.

Merged cells supply only their top-left value. Unmerge cells and repeat any required headers before importing. Put notes on a separate sheet or below a clearly separate table; the importer does not guess which rows are scientific data.

## Formulas

PSL never executes or recalculates spreadsheet formulas. It imports the cached values saved in the workbook and reports that choice. Recalculate and save in Excel or LibreOffice first when formulas or their inputs have changed.

A formula without a saved result causes an explicit error identifying its sheet and cell. This avoids turning an uncalculated scientific value into a silent blank. To resolve it:

1. Open the workbook in Excel or LibreOffice.
2. Recalculate the workbook and save it as `.xlsx`.
3. Import it again.

Alternatively, copy the required table into a new workbook using **Paste Special → Values** and save that workbook. Formula and ordinary cells containing errors such as `#DIV/0!` must be corrected before import. External workbook links are not followed; any linked formula value comes from its saved cache.

## Supported files and bounds

Import ordinary `.xlsx` workbooks. Save legacy `.xls`, binary `.xlsb`, macro-enabled `.xlsm` and template workbooks as a new **Excel Workbook (.xlsx)** first. Remove password protection before importing. Renaming the extension is insufficient.

The current limits are 20 MB uploaded, 100 MB expanded archive data, 50 MB per archive part, 64 worksheets, 100,000 rows, 512 columns and 1,000,000 cells across the workbook/imported rectangular grids. Distant formatting, sparse cells far outside the table and unusually large shared-string parts can exceed these bounds. Copy the required data range to a smaller workbook or export smaller CSV tables in that case.

These limits are enforced before or during reading. Damaged archives, malformed cell references and XML entity declarations are rejected. Workbook bytes are never modified.

## Method reference

The two read-only passes use openpyxl's documented `data_only` behavior: one reads saved values, and the other identifies formulas so missing results cannot disappear silently. See the [official openpyxl loading guide](https://openpyxl.readthedocs.io/en/stable/tutorial.html#loading-from-a-file) and [load_workbook API](https://openpyxl.readthedocs.io/en/stable/api/openpyxl.reader.excel.html).
