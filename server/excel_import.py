"""Bounded, read-only Excel extraction for PSL's existing table import pipeline.

No formula is evaluated. openpyxl's data_only pass supplies saved cached results;
a second formula pass makes absent/error caches explicit instead of losing data.
Reference: https://openpyxl.readthedocs.io/en/stable/tutorial.html#loading-from-a-file
"""
from __future__ import annotations

import base64
import binascii
import csv
import datetime as dt
import io
import math
from pathlib import PurePosixPath
import re
import zipfile
from xml.etree import ElementTree as ET

from openpyxl import load_workbook

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_ENTRY_BYTES = 50 * 1024 * 1024
MAX_ZIP_ENTRIES = 4000
MAX_SHEETS = 64
MAX_ROWS = 100_000
MAX_COLUMNS = 512
MAX_CELLS = 1_000_000
_CELL_REFERENCE = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
_DANGEROUS_XML = re.compile(br"<!\s*(?:DOCTYPE|ENTITY)\b", re.IGNORECASE)
_LEGACY_MESSAGE = "Save the workbook as Excel Workbook (.xlsx), then import that file. Legacy .xls/.xlsb files are not supported; .xlsx, .xlsm and .ods workbooks are accepted."


def _column_number(letters: str) -> int:
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


def _inspect_archive(content: bytes, ods: bool = False) -> dict:
    """Inspect OOXML before openpyxl allocates worksheet/shared-string objects."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_ENTRIES:
                raise ValueError(f"This workbook has too many archive entries (limit {MAX_ZIP_ENTRIES}). Export the required tables as CSV or a smaller .xlsx workbook.")
            total_size = 0
            names: set[str] = set()
            sheet_count = 0
            actual_cells = 0
            merged_sheets: set[str] = set()
            external_links = False
            macros = False
            for entry in entries:
                name = entry.filename
                path = PurePosixPath(name)
                if not name or "\\" in name or path.is_absolute() or ".." in path.parts or "\x00" in name or name.casefold() in names:
                    raise ValueError("The Excel archive contains an invalid or duplicate part name. Save a fresh .xlsx copy and try again.")
                names.add(name.casefold())
                if entry.flag_bits & 1:
                    raise ValueError("Password-protected Excel archives cannot be imported. Save an unencrypted .xlsx copy first.")
                total_size += entry.file_size
                if entry.file_size > MAX_ENTRY_BYTES or total_size > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError("The expanded workbook exceeds the 100 MB safety limit (50 MB per part). Export the required tables into a smaller .xlsx file or CSV.")
                lower = name.casefold()
                macros |= "vbaproject" in lower
                if lower.endswith(".xlsb"):
                    raise ValueError(_LEGACY_MESSAGE)
                external_links |= lower.startswith("xl/externallinks/")
                if not lower.endswith((".xml", ".rels")):
                    continue
                xml = archive.read(entry)
                macros |= lower == "[content_types].xml" and b"macroenabled" in xml.lower()
                # Excel OOXML has no need for DTD declarations or custom entities.
                # Checking every XML/rels part also protects the non-worksheet readers.
                # NUL removal also exposes declarations in UTF-16/32 XML.
                if _DANGEROUS_XML.search(xml.replace(b"\x00", b"")):
                    raise ValueError("This workbook contains unsupported XML entity declarations. Save a fresh .xlsx copy before importing.")
                if not (lower.startswith("xl/worksheets/") and lower.endswith(".xml")):
                    continue
                sheet_count += 1
                if sheet_count > MAX_SHEETS:
                    raise ValueError(f"This workbook exceeds the {MAX_SHEETS}-worksheet limit. Import smaller workbooks.")
                for _event, element in ET.iterparse(io.BytesIO(xml), events=("end",)):
                    tag = element.tag.rsplit("}", 1)[-1]
                    if tag == "c":
                        actual_cells += 1
                        reference = element.get("r", "")
                        match = _CELL_REFERENCE.fullmatch(reference)
                        if not match:
                            raise ValueError("A worksheet contains an invalid cell reference. Save a fresh .xlsx copy and try again.")
                        if int(match[2]) > MAX_ROWS or _column_number(match[1]) > MAX_COLUMNS:
                            raise ValueError(f"Cell {reference} exceeds PSL's import bounds ({MAX_ROWS:,} rows, {MAX_COLUMNS} columns). Copy the required table to a smaller workbook or export CSV.")
                        if actual_cells > MAX_CELLS:
                            raise ValueError(f"This workbook exceeds the {MAX_CELLS:,}-cell import limit. Split the workbook or export smaller tables as CSV.")
                    elif tag == "mergeCell":
                        merged_sheets.add(name)
                    element.clear()
            if ods and "content.xml" not in names:
                raise ValueError("This file is not a valid OpenDocument spreadsheet (.ods).")
            if not ods and ("[content_types].xml" not in names or "xl/workbook.xml" not in names):
                raise ValueError("This file is not a valid Excel .xlsx workbook. " + _LEGACY_MESSAGE)
            return {"merged": bool(merged_sheets), "externalLinks": external_links, "macros": macros}
    except (zipfile.BadZipFile, zipfile.LargeZipFile, ET.ParseError, RuntimeError, OSError, EOFError) as exc:
        raise ValueError("The .xlsx archive is damaged or invalid. Save a fresh Excel Workbook (.xlsx) copy and try again.") from exc


def _cell_text(cell, sheet_name: str) -> str:
    value = cell.value
    coordinate = getattr(cell, "coordinate", "unknown cell")
    if cell.data_type == "e":
        raise ValueError(f"Sheet '{sheet_name}', cell {coordinate} contains Excel error {value}. Correct the cell and save the workbook before importing.")
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        try:
            finite = math.isfinite(value)
        except OverflowError:
            finite = False
        if not finite:
            raise ValueError(f"Sheet '{sheet_name}', cell {coordinate} is not a finite number. Correct it before importing.")
        return str(value)
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, dt.timedelta):
        # Keep duration text rather than silently selecting seconds/days as units.
        return str(value)
    return str(value)


def _import_ods(content: bytes) -> dict:
    """Read ODS cached values without LibreOffice, network access or formula execution."""
    ns = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
          "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
          "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0"}
    attr = lambda prefix, name: f"{{{ns[prefix]}}}{name}"
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            root = ET.fromstring(archive.read("content.xml"))
    except (KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        raise ValueError("Could not read this OpenDocument spreadsheet. Save a fresh .ods or .xlsx copy and retry.") from exc
    spreadsheet = root.find("office:body/office:spreadsheet", ns)
    if spreadsheet is None:
        raise ValueError("This ODS file does not contain a spreadsheet.")
    tables = spreadsheet.findall("table:table", ns)
    if len(tables) > MAX_SHEETS:
        raise ValueError(f"This workbook exceeds the {MAX_SHEETS}-worksheet limit.")
    sheets, warnings = [], []
    expanded_cells = 0
    formulas = 0
    for table in tables:
        if table.get(attr("table", "display")) == "false":
            continue
        name = table.get(attr("table", "name"), "Sheet")
        rows: list[list[str]] = []
        pending_empty_rows = 0
        for row in table.iter(attr("table", "table-row")):
            try:
                repeats = int(row.get(attr("table", "number-rows-repeated"), "1"))
            except ValueError as exc:
                raise ValueError(f"Sheet '{name}' has an invalid repeated row count.") from exc
            if repeats < 1:
                raise ValueError(f"Sheet '{name}' has an invalid repeated row count.")
            values: list[str] = []
            pending_empty_columns = 0
            for cell in row:
                if cell.tag not in {attr("table", "table-cell"), attr("table", "covered-table-cell")}:
                    continue
                try:
                    count = int(cell.get(attr("table", "number-columns-repeated"), "1"))
                except ValueError as exc:
                    raise ValueError(f"Sheet '{name}' has an invalid repeated column count.") from exc
                if count < 1:
                    raise ValueError(f"Sheet '{name}' has an invalid repeated column count.")
                kind = cell.get(attr("office", "value-type"), "")
                numeric = cell.get(attr("office", "value"))
                texts = ["".join(paragraph.itertext()) for paragraph in cell.findall("text:p", ns)]
                text = "\n".join(texts)
                if kind in {"float", "percentage", "currency"}:
                    try:
                        if numeric is None or not math.isfinite(float(numeric)):
                            raise ValueError()
                    except (ValueError, TypeError) as exc:
                        raise ValueError(f"Sheet '{name}' has a numeric cell without a finite saved value.") from exc
                    text = numeric
                elif kind == "boolean":
                    text = cell.get(attr("office", "boolean-value"), text)
                elif kind == "date":
                    text = cell.get(attr("office", "date-value"), text)
                elif kind == "time":
                    text = cell.get(attr("office", "time-value"), text)
                else:
                    text = cell.get(attr("office", "string-value"), text)
                if cell.get(attr("table", "formula")):
                    formulas += count * repeats
                    if not kind or (not text and numeric is None):
                        raise ValueError(f"Sheet '{name}' has a formula without a saved result. Recalculate and save in LibreOffice or Excel before importing.")
                if not text:
                    pending_empty_columns += count
                    continue
                if len(values) + pending_empty_columns + count > MAX_COLUMNS:
                    raise ValueError(f"Sheet '{name}' exceeds PSL's import bounds ({MAX_COLUMNS} columns).")
                values.extend([""] * pending_empty_columns)
                pending_empty_columns = 0
                values.extend([text] * count)
            if not values:
                pending_empty_rows += repeats
                continue
            if len(rows) + pending_empty_rows + repeats > MAX_ROWS:
                raise ValueError(f"Sheet '{name}' exceeds PSL's import bounds ({MAX_ROWS:,} rows).")
            expanded_cells += (len(values) * repeats) + pending_empty_rows
            if expanded_cells > MAX_CELLS:
                raise ValueError(f"The worksheet grid exceeds PSL's {MAX_CELLS:,}-cell import limit.")
            if rows:
                rows.extend([[] for _ in range(pending_empty_rows)])
            pending_empty_rows = 0
            rows.extend([values.copy() for _ in range(repeats)])
        if not rows:
            continue
        width = max(map(len, rows))
        expanded_cells += sum(width - len(row) for row in rows)
        if expanded_cells > MAX_CELLS:
            raise ValueError(f"The worksheet grid exceeds PSL's {MAX_CELLS:,}-cell import limit.")
        output = io.StringIO(newline="")
        writer = csv.writer(output, lineterminator="\n")
        writer.writerows(row + [""] * (width-len(row)) for row in rows)
        sheets.append({"name": name, "csv": output.getvalue()})
    if not sheets:
        raise ValueError("This workbook has no visible, nonempty worksheets.")
    if formulas:
        warnings.append(f"Imported {formulas} formula cells using saved results. PSL did not recalculate formulas; recalculate and save in LibreOffice/Excel when values may have changed.")
    return {"sheets": sheets, "warnings": warnings}


def import_excel(content_base64: str, filename: str = "Workbook.xlsx") -> dict:
    """Return every visible, nonempty worksheet as UTF-8-compatible CSV text.

    Bounds cover both actual cells and the expanded rectangular grid, including
    sparse row gaps. Hidden rows/columns remain data; hidden sheets are skipped.
    The source workbook is never modified, formulas/macros are never executed.
    """
    if not isinstance(filename, str) or not filename.lower().endswith((".xlsx", ".xlsm", ".ods")):
        raise ValueError(_LEGACY_MESSAGE)
    if not isinstance(content_base64, str) or not content_base64:
        raise ValueError("Choose a nonempty Excel Workbook (.xlsx) file.")
    if len(content_base64) > ((MAX_FILE_BYTES + 2) // 3) * 4:
        raise ValueError("The workbook exceeds the 20 MB upload limit. Export smaller tables as .xlsx or CSV.")
    try:
        content = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("The workbook upload is not valid base64. Select the .xlsx file again.") from exc
    if not content or len(content) > MAX_FILE_BYTES:
        raise ValueError("Choose a nonempty workbook smaller than 20 MB.")
    if content.startswith(b"\xd0\xcf\x11\xe0"):
        raise ValueError(_LEGACY_MESSAGE)
    archive_info = _inspect_archive(content, ods=filename.lower().endswith('.ods'))
    if filename.lower().endswith('.ods'):
        return _import_ods(content)
    formulas = values = None
    try:
        formulas = load_workbook(io.BytesIO(content), read_only=True, data_only=False, keep_links=False)
        values = load_workbook(io.BytesIO(content), read_only=True, data_only=True, keep_links=False)
        sheets = []
        warnings = []
        if filename.lower().endswith('.xlsm') or archive_info['macros']:
            warnings.append("Imported saved cell values from a macro-enabled workbook. Macros were ignored and never executed.")
        hidden_count = 0
        empty_count = 0
        formula_count = 0
        grid_cells = 0
        for worksheet in formulas.worksheets:
            if worksheet.sheet_state != "visible":
                hidden_count += 1
                continue
            cached = values[worksheet.title]
            # Some producers declare a giant/stale dimension. Actual worksheet
            # XML coordinates were bounded above; iterate those rather than the hint.
            worksheet.reset_dimensions()
            cached.reset_dimensions()
            rows: list[list[str]] = []
            first_column = MAX_COLUMNS
            last_column = 0
            last_nonempty_row = 0
            first_nonempty_row = None
            for row_index, (formula_row, value_row) in enumerate(zip(worksheet.iter_rows(), cached.iter_rows()), start=1):
                grid_cells += len(formula_row)
                if row_index > MAX_ROWS or len(formula_row) > MAX_COLUMNS or grid_cells > MAX_CELLS:
                    raise ValueError(f"The worksheet grid exceeds PSL's {MAX_CELLS:,}-cell import limit. Remove distant formatting/empty ranges or import a smaller table.")
                row: list[str] = []
                for column_index, (formula_cell, cached_cell) in enumerate(zip(formula_row, value_row)):
                    if formula_cell.data_type == "f":
                        formula_count += 1
                        if cached_cell.value is None:
                            raise ValueError(f"Sheet '{worksheet.title}', cell {formula_cell.coordinate} has a formula without a saved result. Open the file in Excel or LibreOffice, recalculate, save and retry; alternatively copy the table and Paste Special → Values into a new .xlsx workbook. PSL does not evaluate formulas.")
                    text = _cell_text(cached_cell, worksheet.title)
                    row.append(text)
                    if text != "":
                        first_column = min(first_column, column_index)
                        last_column = max(last_column, column_index + 1)
                        last_nonempty_row = row_index
                        if first_nonempty_row is None:
                            first_nonempty_row = row_index - 1
                rows.append(row)
            if first_nonempty_row is None:
                empty_count += 1
                continue
            output = io.StringIO(newline="")
            writer = csv.writer(output, lineterminator="\n")
            for row in rows[first_nonempty_row:last_nonempty_row]:
                padded = row + [""] * max(0, last_column - len(row))
                writer.writerow(padded[first_column:last_column])
            sheets.append({"name": worksheet.title, "csv": output.getvalue()})
        if not sheets:
            raise ValueError("This workbook has no visible, nonempty worksheets. Unhide a sheet containing a table and save the workbook.")
        if formula_count:
            warnings.append(f"Imported {formula_count} formula cells using their saved cached results. PSL did not recalculate formulas; recalculate and save in Excel/LibreOffice before import when values may have changed.")
        if hidden_count:
            warnings.append(f"Skipped {hidden_count} hidden worksheets. Hidden rows and columns within visible worksheets were retained.")
        if empty_count:
            warnings.append(f"Skipped {empty_count} empty worksheets.")
        if archive_info["merged"]:
            warnings.append("Merged cells contribute their top-left value only. Unmerge and repeat table headers before import if needed.")
        if archive_info["externalLinks"]:
            warnings.append("External workbook links were not followed. Any formula results came from the saved cache.")
        return {"sheets": sheets, "warnings": warnings}
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Could not read this Excel workbook. Save a fresh .xlsx copy with a header row and rectangular data tables, then try again.") from exc
    finally:
        if formulas is not None:
            formulas.close()
        if values is not None:
            values.close()
