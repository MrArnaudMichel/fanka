import { appendFileSync, existsSync, mkdirSync, readFileSync, truncateSync } from 'node:fs';
import path from 'node:path';

/** Prefix of a rejection reason that records a transport failure, not a verdict. */
export const TRANSPORT = 'error:';

/**
 * Append-only JSONL cache, one record per word per prompt version. The last
 * record for an id and version wins. A partial final line (an interrupted
 * write) is ignored.
 * @param {string} file
 */
export function openCache(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  /** @type {Map<string, any>} */
  const records = new Map();
  /** @type {Set<string>} */
  const withExample = new Set();
  if (existsSync(file)) {
    const buf = readFileSync(file);
    // Bytes after the last newline are a partial write: cut them off so the
    // next appended record starts on its own line.
    const keep = buf.lastIndexOf(0x0a) + 1;
    if (keep < buf.length) truncateSync(file, keep);
    const lines = buf.subarray(0, keep).toString('utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        records.set(`${rec.id}|${rec.v}`, rec);
        if (rec.example) withExample.add(rec.id);
      } catch {
        // skip corrupt line
      }
    }
  }
  return {
    has: (/** @type {string} */ id, /** @type {string} */ v) => records.has(`${id}|${v}`),
    get: (/** @type {string} */ id, /** @type {string} */ v) => records.get(`${id}|${v}`),
    /** An accepted example from any prompt version. */
    hasExample: (/** @type {string} */ id) => withExample.has(id),
    /** Done for this version: a record exists and is not only transport errors. */
    isDone(/** @type {string} */ id, /** @type {string} */ v) {
      const rec = records.get(`${id}|${v}`);
      if (!rec) return false;
      const r = rec.rejected;
      return !(Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === 'string' && x.startsWith(TRANSPORT)));
    },
    all: () => [...records.values()],
    append(/** @type {any} */ rec) {
      appendFileSync(file, `${JSON.stringify(rec)}\n`);
      records.set(`${rec.id}|${rec.v}`, rec);
      if (rec.example) withExample.add(rec.id);
    },
  };
}
