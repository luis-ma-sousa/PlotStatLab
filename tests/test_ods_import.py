"""OpenDocument import operates on stored cell values without LibreOffice."""
import base64
import csv
import io
import zipfile

import pytest

from server.excel_import import import_excel


def workbook(tables):
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
    <office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
       xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
       xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
       <office:body><office:spreadsheet>{tables}</office:spreadsheet></office:body>
    </office:document-content>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        archive.writestr('mimetype', 'application/vnd.oasis.opendocument.spreadsheet')
        archive.writestr('content.xml', xml)
    return base64.b64encode(output.getvalue()).decode('ascii')


def text(value):
    return f'<table:table-cell office:value-type="string"><text:p>{value}</text:p></table:table-cell>'


def number(value, extra=''):
    return f'<table:table-cell office:value-type="float" office:value="{value}" {extra}><text:p>{value}</text:p></table:table-cell>'


def row(cells, extra=''):
    return f'<table:table-row {extra}>{cells}</table:table-row>'


def read(result):
    return list(csv.reader(io.StringIO(result['sheets'][0]['csv'])))


def test_multiple_sheets_keep_labels_unicode_and_missing_cell_alignment():
    table = row(text('Mouse') + text('Control') + text('Treated'))
    table += row(text('μ1') + number('1.25') + number('2.5'))
    table += row(text('μ2') + '<table:table-cell/>' + number('4'))
    content = f'<table:table table:name="Study A">{table}</table:table>'
    content += f'<table:table table:name="Study B">{table}</table:table>'
    result = import_excel(workbook(content), 'experiment.ods')
    assert [sheet['name'] for sheet in result['sheets']] == ['Study A', 'Study B']
    assert read(result) == [['Mouse', 'Control', 'Treated'], ['μ1', '1.25', '2.5'], ['μ2', '', '4']]


def test_repeated_cells_rows_and_trailing_empty_formatting_are_bounded():
    table = row(text('A')+text('B')) + row(number('3', 'table:number-columns-repeated="2"'), 'table:number-rows-repeated="3"')
    table += row('<table:table-cell table:number-columns-repeated="16384"/>', 'table:number-rows-repeated="1048576"')
    result = import_excel(workbook(f'<table:table table:name="Study">{table}</table:table>'), 'repeats.ods')
    assert read(result) == [['A', 'B'], ['3', '3'], ['3', '3'], ['3', '3']]


def test_formula_uses_cache_and_does_not_execute_formula_text():
    table = row(text('A')) + row(number('2', 'table:formula="of:=1+1"'))
    result = import_excel(workbook(f'<table:table table:name="Study">{table}</table:table>'), 'cached.ods')
    assert read(result)[1] == ['2']
    assert 'saved results' in result['warnings'][0]
    missing = row(text('A')) + row('<table:table-cell table:formula="of:=1+1"/>')
    with pytest.raises(ValueError, match='without a saved result'):
        import_excel(workbook(f'<table:table table:name="Study">{missing}</table:table>'), 'missing.ods')


@pytest.mark.parametrize('cells', [number('nan'), number('inf'), number('1', 'table:number-columns-repeated="513"')])
def test_invalid_numbers_and_expanded_column_bounds_fail_clearly(cells):
    with pytest.raises(ValueError, match='finite|import bounds'):
        import_excel(workbook(f'<table:table table:name="Study">{row(cells)}</table:table>'), 'invalid.ods')
