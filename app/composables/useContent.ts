import { ref } from 'vue';
import type { Bundle, ContentIndex, Word } from '~core/curriculum/types';

/**
 * Per bundle and per file, one request per app run. A failed request is
 * dropped from the cache so `retry` can try again. Level files are keyed with
 * the index version, so a new content version never serves stale words.
 */
const indexes = new Map<Bundle, Promise<ContentIndex>>();
const levels = new Map<string, Promise<Word[]>>();

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

function memoIndex(bundle: Bundle): Promise<ContentIndex> {
  let pending = indexes.get(bundle);
  if (!pending) {
    pending = fetchJson<ContentIndex>(`/content/${bundle}/index.json`);
    indexes.set(bundle, pending);
    pending.catch(() => indexes.delete(bundle));
  }
  return pending;
}

/**
 * A bundle's lesson index and level word files, from `public/content/` so
 * they work offline in the app. Loaded on demand, never at startup.
 */
export function useContent() {
  const index = ref<ContentIndex | null>(null);
  const error = ref<string | null>(null);
  let retryAction: (() => Promise<unknown>) | null = null;

  async function run<T>(action: () => Promise<T>): Promise<T> {
    retryAction = action;
    try {
      const result = await action();
      error.value = null;
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function loadIndex(bundle: Bundle): Promise<void> {
    try {
      await run(async () => {
        index.value = await memoIndex(bundle);
      });
    } catch {
      // `error` carries it; callers show a retry.
    }
  }

  async function levelWords(bundle: Bundle, level: number): Promise<Word[]> {
    return run(async () => {
      const content = await memoIndex(bundle);
      index.value = content;
      const ref = content.levels.find((entry) => entry.level === level);
      if (!ref) throw new Error(`${bundle} has no level ${level}`);
      const key = `${bundle}/${content.version}/${ref.file}`;
      let pending = levels.get(key);
      if (!pending) {
        pending = fetchJson<Word[]>(`/content/${bundle}/${ref.file}`);
        levels.set(key, pending);
        pending.catch(() => levels.delete(key));
      }
      return pending;
    });
  }

  async function retry(): Promise<void> {
    if (!retryAction) return;
    try {
      await run(retryAction);
    } catch {
      // `error` carries it.
    }
  }

  return { index, error, loadIndex, levelWords, retry };
}
