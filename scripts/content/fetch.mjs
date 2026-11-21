// Download the pinned content sources into .cache/content/ (untracked) and
// check them by SHA-256 recorded in sources.json on first download.
// Downloaded files are untrusted data: they are only hashed and written.
// CC-CEDICT is read from the copy kept in the repository (sources.json
// `local`): MDBG republishes its export daily, so the pinned bytes cannot be
// downloaded again later.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '../..');
const cacheDir = path.join(root, '.cache/content');
const sourcesPath = path.join(import.meta.dirname, 'sources.json');

const SOURCES = {
  hsk: {
    url: 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/7ac65bf1a6387d35f1ade478906172a19311c7f9/complete.json',
    file: 'hsk-complete.json',
  },
  tbcl: {
    url: 'https://coct.naer.edu.tw/file/files/14452%E8%A9%9E%E8%AA%9E%E8%A1%A8202504.xlsx',
    file: 'tbcl.xlsx',
  },
  cedict: {
    url: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',
    file: 'cedict.txt',
    gunzip: true,
  },
};

const sha256 = (/** @type {Uint8Array} */ bytes) => createHash('sha256').update(bytes).digest('hex');

const recorded = existsSync(sourcesPath) ? JSON.parse(readFileSync(sourcesPath, 'utf8')) : {};
mkdirSync(cacheDir, { recursive: true });
let failed = false;

for (const [name, src] of Object.entries(SOURCES)) {
  const target = path.join(cacheDir, src.file);
  if (existsSync(target)) {
    console.log(`${name}: cached`);
    continue;
  }
  const local = recorded[name]?.local;
  /** @type {Uint8Array} */
  let raw;
  if (local) {
    console.log(`${name}: reading ${local}`);
    raw = new Uint8Array(readFileSync(path.join(root, local)));
  } else {
    console.log(`${name}: downloading ${src.url}`);
    const res = await fetch(src.url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    raw = new Uint8Array(await res.arrayBuffer());
  }
  const hash = sha256(raw);
  const known = recorded[name]?.sha256;
  if (!known) recorded[name] = { url: src.url, sha256: hash };
  else if (known !== hash) {
    console.error(`${name}: SHA-256 mismatch\n  recorded ${known}\n  received ${hash}`);
    failed = true;
    continue;
  }
  writeFileSync(target, src.gunzip ? gunzipSync(raw) : raw);
  console.log(`${name}: ok ${hash}`);
}

writeFileSync(sourcesPath, JSON.stringify(recorded, null, 2) + '\n');
if (failed) process.exit(1);
