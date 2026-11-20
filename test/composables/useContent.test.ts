import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentIndex, Word } from '~core/curriculum/types';

function indexFor(bundle: 'mainland' | 'taiwan', version = 'v1'): ContentIndex {
  return {
    bundle,
    version,
    levels: [{ level: 1, name: 'L1', file: 'level-1.json', units: [], lessons: [], wordCount: 1 }],
  };
}
const words = [{ id: 'w-1' }] as unknown as Word[];

let failing: boolean;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  failing = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (failing) return { ok: false, status: 500, json: async () => ({}) };
    const body = url.endsWith('index.json')
      ? indexFor(url.includes('/taiwan/') ? 'taiwan' : 'mainland')
      : words;
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
});

async function load() {
  const { useContent } = await import('../../app/composables/useContent');
  return useContent();
}

describe('useContent', () => {
  it('memoises the index and level files', async () => {
    const a = await load();
    const b = await load();
    await a.loadIndex('mainland');
    await b.loadIndex('mainland');
    expect(await a.levelWords('mainland', 1)).toEqual(words);
    await b.levelWords('mainland', 1);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/content/mainland/index.json',
      '/content/mainland/level-1.json',
    ]);
    expect(a.index.value?.bundle).toBe('mainland');
  });

  it('sets error on a failing fetch and recovers on retry', async () => {
    const content = await load();
    failing = true;
    await content.loadIndex('mainland');
    expect(content.error.value).toContain('500');
    expect(content.index.value).toBeNull();
    failing = false;
    await content.retry();
    expect(content.error.value).toBeNull();
    expect(content.index.value?.version).toBe('v1');
  });

  it('retries a failed level file', async () => {
    const content = await load();
    await content.loadIndex('mainland');
    failing = true;
    await expect(content.levelWords('mainland', 1)).rejects.toThrow();
    expect(content.error.value).not.toBeNull();
    failing = false;
    await content.retry();
    expect(content.error.value).toBeNull();
    expect(await content.levelWords('mainland', 1)).toEqual(words);
  });

  it('loads its own index for a different bundle', async () => {
    const content = await load();
    await content.loadIndex('mainland');
    await content.loadIndex('taiwan');
    expect(content.index.value?.bundle).toBe('taiwan');
    expect(fetchMock).toHaveBeenCalledWith('/content/taiwan/index.json');
  });

  it('rejects an unknown level', async () => {
    const content = await load();
    await expect(content.levelWords('taiwan', 9)).rejects.toThrow('no level 9');
  });
});
