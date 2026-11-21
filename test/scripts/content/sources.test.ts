import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..', '..');
const sources = JSON.parse(readFileSync(path.join(root, 'scripts/content/sources.json'), 'utf8'));

describe('pinned CC-CEDICT', () => {
  it('is kept in the repository, byte for byte the pinned export', () => {
    const file = path.join(root, sources.cedict.local);
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sources.cedict.sha256);
    const date = /^#! date=(\S+)/m.exec(gunzipSync(bytes).toString('utf8'))?.[1];
    expect(date).toBe(sources.cedict.date);
  });

  it('carries its licence note next to it', () => {
    const note = readFileSync(path.join(path.dirname(path.join(root, sources.cedict.local)), 'CC-CEDICT-LICENCE.txt'), 'utf8');
    expect(note).toMatch(/CC BY-SA 4\.0/);
  });
});
