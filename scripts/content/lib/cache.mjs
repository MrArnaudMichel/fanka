import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    // A final element without a trailing newline is a partial write.
    lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        records.set(`${rec.id}|${rec.v}`, rec);
      } catch {
        // skip corrupt line
      }
    }
  }
  return {
    has: (/** @type {string} */ id, /** @type {string} */ v) => records.has(`${id}|${v}`),
    get: (/** @type {string} */ id, /** @type {string} */ v) => records.get(`${id}|${v}`),
    all: () => [...records.values()],
    append(/** @type {any} */ rec) {
      appendFileSync(file, `${JSON.stringify(rec)}\n`);
      records.set(`${rec.id}|${rec.v}`, rec);
    },
  };
}
