import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readXlsxRows } from '../../../scripts/content/lib/xlsx.mjs';

function fixture(): Uint8Array {
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2"><v>42</v></c></row>
  </sheetData></worksheet>`;
  const strings = `<?xml version="1.0"?><sst><si><t>word</t></si><si><r><t>le</t></r><r><t>vel</t></r></si></sst>`;
  return zipSync({
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(strings),
  });
}

describe('readXlsxRows', () => {
  it('reads rows in order, resolving shared strings', () => {
    expect(readXlsxRows(fixture())[0]).toEqual(['word', 'level']);
  });

  it('fills empty cells with empty strings and keeps literal values', () => {
    expect(readXlsxRows(fixture())[1]).toEqual(['word', '', '42']);
  });
});
