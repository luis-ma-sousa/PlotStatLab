"""Excel import references use real OOXML workbooks and independently edited caches."""
import base64
import csv
import datetime as dt
import io
import re
import zipfile
from xml.etree import ElementTree as ET

import pytest
from openpyxl import Workbook

from server import excel_import as excel


def workbook_bytes(build=None):
    workbook = Workbook()
    if build:
        build(workbook)
    else:
        workbook.active.append(["Control", "Treatment"])
        workbook.active.append([1.25, 2.5])
        workbook.active.append([2.75, 4])
    stream = io.BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()


def encoded(content):
    return base64.b64encode(content).decode("ascii")


def modify_zip(content, transform):
    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(content)) as original, zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as updated:
        for entry in original.infolist():
            updated.writestr(entry.filename, transform(entry.filename, original.read(entry)))
    return result.getvalue()


def set_cache(content, value, error=False):
    namespace = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    tree = ET.fromstring(content)
    cell = next(c for c in tree.iter(namespace + 'c') if c.get('r') == 'B2')
    if error:
        cell.set('t', 'e')
    cache = cell.find(namespace + 'v')
    if cache is None:
        cache = ET.SubElement(cell, namespace + 'v')
    cache.text = value
    return ET.tostring(tree, encoding='utf-8')


def read_rows(result, index=0):
    return list(csv.reader(io.StringIO(result["sheets"][index]["csv"])))


def test_numeric_table_and_sheet_name_round_trip_without_formatting_loss():
    def build(workbook):
        sheet = workbook.active
        sheet.title = "Drug μM"
        sheet.append(["Control", "Drug, high"])
        sheet.append([1.25, -2.5])
        sheet.append([1e-7, 4])
        sheet["A2"].number_format = "0%"  # underlying number, not the display string
    result = excel.import_excel(encoded(workbook_bytes(build)), "experiment.XLSX")
    assert result["sheets"][0]["name"] == "Drug μM"
    assert read_rows(result) == [["Control", "Drug, high"], ["1.25", "-2.5"], ["1e-07", "4"]]
    assert result["warnings"] == []


def test_all_visible_nonempty_sheets_and_hidden_data_policy():
    def build(workbook):
        first = workbook.active
        first.title = "First"
        first.append(["Group", "Value"])
        first.append(["Control", 1])
        first.row_dimensions[2].hidden = True
        second = workbook.create_sheet("Second")
        second.append(["A", "B"])
        second.append([3, 4])
        workbook.create_sheet("Empty")
        hidden = workbook.create_sheet("Hidden")
        hidden.append(["Secret", 99])
        hidden.sheet_state = "hidden"
        very_hidden = workbook.create_sheet("Very hidden")
        very_hidden.sheet_state = "veryHidden"
    result = excel.import_excel(encoded(workbook_bytes(build)))
    assert [sheet["name"] for sheet in result["sheets"]] == ["First", "Second"]
    assert read_rows(result)[1] == ["Control", "1"]
    assert any("2 hidden" in warning for warning in result["warnings"])
    assert any("1 empty" in warning for warning in result["warnings"])


def test_outer_empty_margins_are_trimmed_but_internal_blanks_and_subject_ids_survive():
    def build(workbook):
        sheet = workbook.active
        sheet.append([])
        sheet.append([None, "group", "subject", "value"])
        sheet.append([None, "Control", "S01", 3])
        sheet.append([])
        sheet.append([None, "Treatment", "S01", 4])
        sheet["H8"].number_format = "0.0"  # formatted-only trailing blank
    result = excel.import_excel(encoded(workbook_bytes(build)))
    assert read_rows(result) == [["group", "subject", "value"], ["Control", "S01", "3"], ["", "", ""], ["Treatment", "S01", "4"]]


def test_cached_formula_uses_saved_value_and_reports_no_recalculation():
    def build(workbook):
        sheet = workbook.active
        sheet.append(["Control", "Treatment"])
        sheet.append([2, "=A2*3"])
    raw = workbook_bytes(build)
    def cache(name, content):
        if name == "xl/worksheets/sheet1.xml":
            content = set_cache(content, '6')
        return content
    result = excel.import_excel(encoded(modify_zip(raw, cache)))
    assert read_rows(result)[1] == ["2", "6"]
    assert any("1 formula" in warning and "saved cached results" in warning for warning in result["warnings"])


def test_formula_without_cache_is_an_actionable_error_instead_of_a_silent_blank():
    def build(workbook):
        workbook.active.append(["Control", "Treatment"])
        workbook.active.append([2, "=A2*3"])
    with pytest.raises(ValueError, match="cell B2 has a formula without a saved result") as error:
        excel.import_excel(encoded(workbook_bytes(build)))
    assert "recalculate" in str(error.value)
    assert "Paste Special" in str(error.value)


def test_zero_formula_cache_is_not_mistaken_for_a_missing_result():
    def build(workbook):
        workbook.active.append(["Control", "Treatment"])
        workbook.active.append([2, "=A2-A2"])
    def cache(name, content):
        return set_cache(content, '0') if name == "xl/worksheets/sheet1.xml" else content
    result = excel.import_excel(encoded(modify_zip(workbook_bytes(build), cache)))
    assert read_rows(result)[1] == ["2", "0"]


@pytest.mark.parametrize("formula", [False, True])
def test_excel_error_cells_including_cached_formula_errors_are_rejected(formula):
    def build(workbook):
        workbook.active.append(["Group", "Value"])
        workbook.active.append(["A", "=1/0" if formula else "#DIV/0!"])
    raw = workbook_bytes(build)
    if formula:
        def error_cache(name, content):
            if name == "xl/worksheets/sheet1.xml":
                return set_cache(content, '#DIV/0!', error=True)
            return content
        raw = modify_zip(raw, error_cache)
    with pytest.raises(ValueError, match="cell B2 contains Excel error #DIV/0!"):
        excel.import_excel(encoded(raw))


def test_strings_newlines_dates_and_booleans_preserve_their_meaning():
    def build(workbook):
        workbook.active.append(["Label", "When", "Confirmed"])
        workbook.active.append(['quoted "value", new\nline', dt.datetime(2026, 11, 2, 12, 30), True])
    result = excel.import_excel(encoded(workbook_bytes(build)))
    assert read_rows(result)[1] == ['quoted "value", new\nline', "2026-11-02T12:30:00", "TRUE"]


def test_duration_cells_do_not_silently_choose_a_numeric_unit():
    def build(workbook):
        workbook.active.append(["Label", "Elapsed"])
        workbook.active.append(["Sample", dt.timedelta(hours=2)])
        workbook.active["B2"].number_format = "[hh]:mm:ss"
    result = excel.import_excel(encoded(workbook_bytes(build)))
    assert read_rows(result)[1] == ["Sample", "2:00:00"]


def test_merged_cells_are_reported_and_only_top_left_value_is_emitted():
    def build(workbook):
        workbook.active.append(["Group", "Value"])
        workbook.active.append(["Control", 2])
        workbook.active.merge_cells("A3:B3")
        workbook.active["A3"] = "Note"
    result = excel.import_excel(encoded(workbook_bytes(build)))
    assert read_rows(result)[2] == ["Note", ""]
    assert any("Merged cells" in warning for warning in result["warnings"])


def test_misleading_dimension_does_not_allocate_or_import_a_giant_empty_grid():
    raw = modify_zip(workbook_bytes(), lambda name, content: re.sub(br'<dimension ref="[^"]+"', b'<dimension ref="A1:XFD1048576"', content) if name == "xl/worksheets/sheet1.xml" else content)
    assert read_rows(excel.import_excel(encoded(raw))) == [["Control", "Treatment"], ["1.25", "2.5"], ["2.75", "4"]]


@pytest.mark.parametrize("filename", ["data.xls", "data.xlsb", "data.xltx", None])
def test_unsupported_workbook_formats_explain_conversion(filename):
    with pytest.raises(ValueError, match=r"Save the workbook as Excel Workbook \(.xlsx\)"):
        excel.import_excel(encoded(workbook_bytes()), filename)


@pytest.mark.parametrize("content", ["", None, "%%%", "μ", encoded(b"not a zip"), encoded(b"\xd0\xcf\x11\xe0bad")])
def test_invalid_uploads_are_clear_value_errors(content):
    with pytest.raises(ValueError):
        excel.import_excel(content)


def test_empty_workbook_is_rejected():
    with pytest.raises(ValueError, match="no visible, nonempty worksheets"):
        excel.import_excel(encoded(workbook_bytes(lambda _workbook: None)))


def test_macro_enabled_content_imports_saved_values_without_running_macros():
    raw = modify_zip(workbook_bytes(), lambda name, content: content.replace(b"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", b"application/vnd.ms-excel.sheet.macroEnabled.main+xml") if name == "[Content_Types].xml" else content)
    result = excel.import_excel(encoded(raw), 'values.xlsm')
    assert read_rows(result)[1] == ['1.25', '2.5']
    assert any('never executed' in warning for warning in result['warnings'])


@pytest.mark.parametrize("utf16", [False, True])
def test_xml_entity_declarations_are_rejected_in_all_parts(utf16):
    def malicious(name, content):
        if name == "xl/workbook.xml":
            content = b'<!DOCTYPE workbook [<!ENTITY bomb "unexpected">]>' + content
            if utf16:
                content = content.decode().encode("utf-16")
        return content
    with pytest.raises(ValueError, match="XML entity declarations"):
        excel.import_excel(encoded(modify_zip(workbook_bytes(), malicious)))


def test_actual_cell_coordinates_and_total_rectangular_grid_are_bounded(monkeypatch):
    raw = modify_zip(workbook_bytes(), lambda name, content: content.replace(b'r="B3"', b'r="B100001"') if name == "xl/worksheets/sheet1.xml" else content)
    with pytest.raises(ValueError, match="exceeds PSL's import bounds"):
        excel.import_excel(encoded(raw))
    monkeypatch.setattr(excel, "MAX_CELLS", 5)
    with pytest.raises(ValueError, match="cell import limit"):
        excel.import_excel(encoded(workbook_bytes()))


def test_sparse_rectangular_grid_is_bounded_separately_from_actual_cells(monkeypatch):
    def build(workbook):
        workbook.active["A1"] = "Header"
        workbook.active["D2"] = 2
    monkeypatch.setattr(excel, "MAX_CELLS", 4)
    with pytest.raises(ValueError, match="worksheet grid exceeds"):
        excel.import_excel(encoded(workbook_bytes(build)))


def test_nonfinite_numeric_cells_do_not_enter_the_scientific_table():
    raw = modify_zip(workbook_bytes(), lambda name, content: content.replace(b"<v>1.25</v>", b"<v>1e309</v>") if name == "xl/worksheets/sheet1.xml" else content)
    with pytest.raises(ValueError, match="cell A2 is not a finite number"):
        excel.import_excel(encoded(raw))


def test_zip_entry_count_and_uncompressed_size_are_bounded(monkeypatch):
    raw = workbook_bytes()
    monkeypatch.setattr(excel, "MAX_ZIP_ENTRIES", 1)
    with pytest.raises(ValueError, match="too many archive entries"):
        excel.import_excel(encoded(raw))
    monkeypatch.setattr(excel, "MAX_ZIP_ENTRIES", 4000)
    monkeypatch.setattr(excel, "MAX_UNCOMPRESSED_BYTES", 100)
    with pytest.raises(ValueError, match="expanded workbook"):
        excel.import_excel(encoded(raw))


def test_archive_path_and_duplicate_names_are_rejected():
    def archive_with(extra_name):
        result = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(workbook_bytes())) as original, zipfile.ZipFile(result, "w") as updated:
            for entry in original.infolist():
                updated.writestr(entry.filename, original.read(entry))
            updated.writestr(extra_name, b"ignored")
        return result.getvalue()
    for extra in ["../outside.xml", "XL/WORKBOOK.XML", "\\escape.xml"]:
        with pytest.raises(ValueError, match="invalid or duplicate part name"):
            excel.import_excel(encoded(archive_with(extra)))


def test_upload_and_worksheet_count_limits(monkeypatch):
    monkeypatch.setattr(excel, "MAX_FILE_BYTES", 2)
    with pytest.raises(ValueError, match="upload limit"):
        excel.import_excel(encoded(workbook_bytes()))
    monkeypatch.setattr(excel, "MAX_FILE_BYTES", 20 * 1024 * 1024)
    monkeypatch.setattr(excel, "MAX_SHEETS", 0)
    with pytest.raises(ValueError, match="worksheet limit"):
        excel.import_excel(encoded(workbook_bytes()))
