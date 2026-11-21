import type { Word } from './types';

export type ExerciseKind =
  | 'meaning-to-hanzi'
  | 'hanzi-to-meaning'
  | 'reading'
  | 'listening'
  | 'cloze'
  | 'order'
  | 'writing';

export interface Exercise {
  kind: ExerciseKind;
  wordId: string;
  prompt: string;
  choices?: string[];
  answer: string | string[];
}

const CHOICES = 4;
const MAX_EXERCISES = 12;
const CLOZE_GAP = '＿';

/** Deterministic generator (mulberry32) seeded from a string (FNV-1a). */
export function seededRng(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const HAN = /\p{Script=Han}/u;

/** The word's first Han character, the one a lesson asks to draw. */
function firstHan(word: Word): string | null {
  return [...word.hanzi].find((ch) => HAN.test(ch)) ?? null;
}

const meaningOf = (word: Word): string => word.readings[0]?.meanings[0] ?? '';
const pinyinOf = (word: Word): string => word.readings[0]?.pinyin ?? '';

/** The form of the word that appears in its example, if any. */
function formInExample(word: Word): string | null {
  const text = word.example?.text;
  if (!text) return null;
  return [word.hanzi, ...(word.variants ?? [])].find((form) => text.includes(form)) ?? null;
}

/** The answer plus distractors drawn from the lesson first, then the level. */
function pickChoices(
  answer: string,
  word: Word,
  lesson: Word[],
  level: Word[],
  value: (w: Word) => string,
  rng: () => number,
  /** A word that would also be a right answer, so it must not be offered. */
  alsoRight: (other: Word) => boolean = () => false,
): string[] {
  const seen = new Set([answer]);
  const picked: string[] = [];
  for (const pool of [shuffled(lesson, rng), shuffled(level, rng)]) {
    for (const other of pool) {
      if (picked.length === CHOICES - 1) break;
      if (other.id === word.id || alsoRight(other)) continue;
      const candidate = value(other);
      if (candidate === '' || seen.has(candidate)) continue;
      seen.add(candidate);
      picked.push(candidate);
    }
  }
  return shuffled([answer, ...picked], rng);
}

function readingChoices(word: Word, rng: () => number): string[] {
  const answer = pinyinOf(word);
  const syllables = answer.split(/\s+/);
  const first = syllables[0] ?? '';
  const known = new Set(word.readings.map((reading) => reading.pinyin));
  const own = first.slice(-1);
  const distractors: string[] = [];
  for (const tone of shuffled(['1', '2', '3', '4', '5'], rng)) {
    if (tone === own || !/\d$/.test(first)) continue;
    const candidate = [`${first.slice(0, -1)}${tone}`, ...syllables.slice(1)].join(' ');
    if (!known.has(candidate)) distractors.push(candidate);
    if (distractors.length === CHOICES - 1) break;
  }
  return shuffled([answer, ...distractors], rng);
}

function build(
  kind: ExerciseKind,
  word: Word,
  lesson: Word[],
  level: Word[],
  rng: () => number,
): Exercise {
  const base = { kind, wordId: word.id };
  switch (kind) {
    case 'meaning-to-hanzi':
      return {
        ...base,
        prompt: meaningOf(word),
        choices: pickChoices(word.hanzi, word, lesson, level, (w) => w.hanzi, rng, (w) => meaningOf(w) === meaningOf(word)),
        answer: word.hanzi,
      };
    case 'hanzi-to-meaning':
      return {
        ...base,
        prompt: word.hanzi,
        choices: pickChoices(meaningOf(word), word, lesson, level, meaningOf, rng),
        answer: meaningOf(word),
      };
    case 'reading':
      return { ...base, prompt: word.hanzi, choices: readingChoices(word, rng), answer: pinyinOf(word) };
    case 'listening':
      return {
        ...base,
        prompt: word.hanzi,
        choices: pickChoices(word.hanzi, word, lesson, level, (w) => w.hanzi, rng, (w) => pinyinOf(w) === pinyinOf(word)),
        answer: word.hanzi,
      };
    case 'cloze': {
      const form = formInExample(word) ?? word.hanzi;
      return {
        ...base,
        prompt: (word.example?.text ?? '').replace(form, CLOZE_GAP),
        choices: pickChoices(form, word, lesson, level, (w) => w.hanzi, rng),
        answer: form,
      };
    }
    case 'order': {
      const segments = word.example?.segments ?? [];
      return {
        ...base,
        prompt: word.example?.translation ?? '',
        choices: shuffled(segments, rng),
        answer: segments,
      };
    }
    case 'writing':
      return { ...base, prompt: meaningOf(word), answer: firstHan(word) ?? word.hanzi };
  }
}

function kindsFor(word: Word, listening: boolean): ExerciseKind[] {
  const kinds: ExerciseKind[] = ['reading'];
  if (meaningOf(word) !== '') kinds.push('meaning-to-hanzi', 'hanzi-to-meaning');
  if (listening) kinds.push('listening');
  if (word.example && formInExample(word)) kinds.push('cloze');
  if (word.example && word.example.segments.length > 1) kinds.push('order');
  return kinds;
}

/**
 * A lesson's exercises: every word at least once, a couple of repeats up to
 * twelve, at most one writing exercise (the first character of a word that
 * has stroke data), and no kind three times in a row.
 */
export function buildExercises(
  lesson: Word[],
  level: Word[],
  rng: () => number,
  opts: { listening: boolean; hasStrokes: (ch: string) => boolean },
): Exercise[] {
  if (lesson.length === 0) return [];
  const count = Math.max(lesson.length, Math.min(MAX_EXERCISES, lesson.length + 2));
  const slots = shuffled(lesson, rng);
  while (slots.length < count) {
    slots.push(...shuffled(lesson, rng).slice(0, count - slots.length));
  }
  const drawable = slots.flatMap((w, i) => {
    const first = firstHan(w);
    return first !== null && opts.hasStrokes(first) ? [i] : [];
  });
  const writingSlot = drawable.length > 0 ? drawable[Math.floor(rng() * drawable.length)]! : -1;

  const used = new Map<ExerciseKind, number>();
  const perWord = new Map<string, Set<ExerciseKind>>();
  const out: Exercise[] = [];
  slots.forEach((word, i) => {
    const seenForWord = perWord.get(word.id) ?? new Set<ExerciseKind>();
    perWord.set(word.id, seenForWord);
    let kind: ExerciseKind;
    if (i === writingSlot) {
      kind = 'writing';
    } else {
      const last = out.slice(-2).map((e) => e.kind);
      const runs = last.length === 2 && last[0] === last[1] ? last[0] : null;
      const all = kindsFor(word, opts.listening);
      const spaced = all.filter((k) => k !== runs);
      // A word with one possible kind may have to repeat it rather than throw.
      const options = spaced.length > 0 ? spaced : all;
      const scored = options.map((k) => ({
        k,
        score: (seenForWord.has(k) ? 1000 : 0) + (used.get(k) ?? 0) * 10 + rng(),
      }));
      kind = scored.sort((a, b) => a.score - b.score)[0]!.k;
    }
    seenForWord.add(kind);
    used.set(kind, (used.get(kind) ?? 0) + 1);
    out.push(build(kind, word, lesson, level, rng));
  });
  return out;
}
