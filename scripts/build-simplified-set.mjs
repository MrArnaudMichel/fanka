#!/usr/bin/env node
/**
 * Builds core/chinese/data/simplified-only.json and traditional-only.json from OpenCC's character
 * tables, vendored unmodified by the `opencc-data` devDependency
 * (https://github.com/BYVoid/OpenCC, Apache-2.0).
 *
 * A character `c` is simplified-only when it is a key in STCharacters.txt
 * (simplified -> traditional) whose targets do not include `c`, and `c` is
 * not itself a key in TSCharacters.txt (traditional -> simplified). This
 * excludes characters such as 后, 干 and 里 that are both a simplified form
 * and a standalone traditional character. A character TWVariants.txt maps
 * to is Taiwan's standard form (牀 -> 床), so it is excluded too.
 *
 * The app ships this generated JSON, never the dictionary: `opencc-data` is
 * a devDependency only, read here at build time and not imported at runtime.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dataDir = path.join(root, 'node_modules', 'opencc-data', 'data');

/** Parses an OpenCC dictionary table into a Map from key to its targets. */
function parseTable(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const map = new Map();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [key, targetsField] = trimmed.split('\t');
    if (!key || !targetsField) continue;
    const targets = targetsField.split(' ').filter((target) => target.length > 0);
    map.set(key, targets);
  }
  return map;
}

const stMap = parseTable(path.join(dataDir, 'STCharacters.txt'));
const tsMap = parseTable(path.join(dataDir, 'TSCharacters.txt'));
const taiwanForms = new Set([...parseTable(path.join(dataDir, 'TWVariants.txt')).values()].flat());

const flagged = [];
for (const [character, targets] of stMap) {
  if (!targets.includes(character) && !tsMap.has(character) && !taiwanForms.has(character)) {
    flagged.push(character);
  }
}
flagged.sort();

const openccDataVersion = JSON.parse(
  readFileSync(path.join(root, 'node_modules', 'opencc-data', 'package.json'), 'utf8'),
).version;

const output = {
  source: 'https://github.com/BYVoid/OpenCC (data/STCharacters.txt, data/TSCharacters.txt), vendored via npm opencc-data',
  version: `opencc-data@${openccDataVersion}`,
  licence: 'Apache-2.0',
  // Date only (YYYY-MM-DD), so a regeneration on the same day is byte-stable.
  generatedAt: new Date().toISOString().slice(0, 10),
  characters: flagged,
};

const outPath = path.join(root, 'core', 'chinese', 'data', 'simplified-only.json');
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Wrote ${flagged.length} simplified-only characters to ${path.relative(root, outPath)}`);

// Traditional-only: a key in TSCharacters.txt (traditional -> simplified)
// whose targets do not include itself, and not a key in STCharacters.txt.
// The mirror of the rule above, for guarding a Mainland (simplified) bundle.
const traditionalOnly = [];
for (const [character, targets] of tsMap) {
  if (!targets.includes(character) && !stMap.has(character)) traditionalOnly.push(character);
}
traditionalOnly.sort();

const traditionalOutPath = path.join(root, 'core', 'chinese', 'data', 'traditional-only.json');
writeFileSync(traditionalOutPath, `${JSON.stringify({ ...output, characters: traditionalOnly }, null, 2)}\n`);

console.log(`Wrote ${traditionalOnly.length} traditional-only characters to ${path.relative(root, traditionalOutPath)}`);
