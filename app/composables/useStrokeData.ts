import type { CharacterStrokes } from '~core/chinese/strokes';

/**
 * One request per character per app run, shared by every caller: a word
 * drawn twice in a session, or 學 in both 學習 and 學生, is fetched once.
 * Failures are cached too (as `null`) — a character with no stroke data will
 * not grow some between two cards.
 */
const cache = new Map<string, Promise<CharacterStrokes | null>>();

/** `public/strokes/` names each file by code point: 學 → 5b78.json. */
export function strokeFileFor(character: string): string {
  return `${character.codePointAt(0)!.toString(16)}.json`;
}

async function fetchStrokes(character: string): Promise<CharacterStrokes | null> {
  try {
    const response = await fetch(`/strokes/${strokeFileFor(character)}`);
    if (!response.ok) return null;
    return (await response.json()) as CharacterStrokes;
  } catch (err) {
    console.error(`useStrokeData: failed to load strokes for ${character}`, err);
    return null;
  }
}

/**
 * Stroke data for writing practice, built by `scripts/build-stroke-data.mjs`
 * and bundled under `public/strokes/`, so it works offline in the app.
 * `null` for a character the data does not cover — the caller falls back to
 * self-grading.
 */
export function useStrokeData() {
  function load(character: string): Promise<CharacterStrokes | null> {
    let pending = cache.get(character);
    if (!pending) {
      pending = fetchStrokes(character);
      cache.set(character, pending);
    }
    return pending;
  }

  return { load };
}
