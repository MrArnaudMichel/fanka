import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../../scripts/content/examples.mjs';
import { openCache } from '../../../scripts/content/lib/cache.mjs';

const words = [
  { id: 'hsk1-0001', hanzi: '我', readings: [{ pinyin: 'wo3', meanings: ['I'] }], level: 1 },
  { id: 'hsk1-0002', hanzi: '朋友', readings: [{ pinyin: 'peng2 you5', meanings: ['friend'] }], level: 1 },
  { id: 'hsk1-0003', hanzi: '的', readings: [{ pinyin: 'de5', meanings: [] }], level: 1, needsMeaning: true },
  { id: 'hsk1-0004', hanzi: '很', readings: [{ pinyin: 'hen3', meanings: ['very'] }], level: 1 },
  { id: 'hsk1-0005', hanzi: '好', readings: [{ pinyin: 'hao3', meanings: ['good'] }], level: 1 },
];
const valid = JSON.stringify({ text: '我的朋友很好。', pinyin: 'wǒ de péngyou hěn hǎo', translation: 'My friend is good.' });
const file = () => path.join(mkdtempSync(path.join(tmpdir(), 'ex-')), 'out.jsonl');
const run = (replies: string[], f: string, only = ['hsk1-0002']) => {
  const pre = openCache(f);
  for (const w of words) if (!only.includes(w.id) && !pre.has(w.id, 'v2')) pre.append({ id: w.id, v: 'v2', rejected: [] });
  const calls: string[] = [];
  const client = { chat: async (p: string) => { calls.push(p); return replies.shift() ?? 'nope'; } };
  const cache = openCache(f);
  return generate(words, { bundle: 'mainland', client, cache, promptVersion: 'v2', attempts: 3 }).then(() => calls);
};
const lines = (f: string) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('generate', () => {
  it('retries after invalid JSON and writes the example', async () => {
    const f = file();
    await run(['not json', valid], f);
    const out = lines(f).filter((l) => l.id === 'hsk1-0002');
    expect(out).toHaveLength(1);
    expect(out[0].rejected).toBeUndefined(); expect(out[0].example.pinyin).toBe('wo3 de5 peng2 you5 hen3 hao3');
    expect(out[0].rejected).toBeUndefined();
  });
  it('skips a cached id', async () => {
    const f = file();
    writeFileSync(f, `${JSON.stringify({ id: 'hsk1-0002', v: 'v2', rejected: [] })}\n`);
    expect(await run([valid], f)).toHaveLength(0);
    expect(lines(f).filter((l) => l.id === 'hsk1-0002')).toHaveLength(1);
  });
  it('ignores a partial final line', async () => {
    const f = file();
    writeFileSync(f, '');
    appendFileSync(f, '{"id":"hsk1-0002","v":"v1","exa');
    expect(openCache(f).has('hsk1-0002', 'v2')).toBe(false);
  });
  it('records rejected reasons after three failures', async () => {
    const f = file();
    await run(['bad', 'bad', 'bad'], f);
    const out = lines(f).filter((l) => l.id === 'hsk1-0002');
    expect(out[0].example).toBeUndefined();
    expect(out[0].rejected).toHaveLength(3);
  });
  it('fills a missing meaning', async () => {
    const f = file();
    await run([JSON.stringify({ meanings: ['of'] }), valid], f, ['hsk1-0003']);
    expect(lines(f).find((l) => l.id === 'hsk1-0003').meaning).toEqual(['of']);
  });
});
