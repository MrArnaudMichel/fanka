import { describe, expect, it } from 'vitest';
import { createOllama } from '../../../scripts/content/lib/ollama.mjs';

describe('createOllama', () => {
  it('gives the model-load timeout to the first request and to the first after a failure', async () => {
    const timeouts: number[] = [];
    const outcomes = ['ok', 'ok', 'fail', 'ok', 'ok'];
    const fetch = async () => {
      if (outcomes.shift() === 'fail') throw new Error('connect ECONNREFUSED');
      return new Response(JSON.stringify({ message: { content: '{}' } }));
    };
    const client = createOllama({ timeoutMs: 60_000, fetch, timeoutSignal: (ms: number) => { timeouts.push(ms); return new AbortController().signal; } });
    await client.chat('a');
    await client.chat('b');
    await expect(client.chat('c')).rejects.toThrow(/ECONNREFUSED/);
    await client.chat('d');
    await client.chat('e');
    expect(timeouts).toEqual([180_000, 60_000, 60_000, 180_000, 60_000]);
  });
});
