// Minimal xlsx reader: first sheet only, text and numbers, no formulas.
// The input is untrusted data: it is only parsed, never executed.
import { strFromU8, unzipSync } from 'fflate';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** @param {string} s */
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()];
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/** Concatenate the <t> runs of a string item, ignoring phonetic (<rPh>) runs. */
/** @param {string} xml */
function textOf(xml) {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += decode(m[1]);
  return out;
}

/** @param {string} ref e.g. "AB12" -> zero-based column index */
function columnIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/**
 * @param {Uint8Array} buffer
 * @returns {string[][]}
 */
export function readXlsxRows(buffer) {
  const files = unzipSync(buffer);
  const sheetPath = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))[0];
  if (!sheetPath) throw new Error('xlsx: no worksheet found');

  /** @type {string[]} */
  const shared = [];
  const sst = files['xl/sharedStrings.xml'];
  if (sst) {
    for (const m of strFromU8(sst).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }

  /** @type {string[][]} */
  const rows = [];
  const sheet = strFromU8(files[sheetPath]);
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    /** @type {string[]} */
    const row = [];
    let next = 0;
    for (const c of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      let value = '';
      const inner = c[2] ?? '';
      if (type === 'inlineStr') value = textOf(inner);
      else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) value = type === 's' ? (shared[parseInt(v, 10)] ?? '') : decode(v);
      }
      while (row.length < col) row.push('');
      row[col] = value;
      next = col + 1;
    }
    rows.push(row);
  }
  return rows;
}
