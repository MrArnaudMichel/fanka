import { type Radical, radicalForms, radicalId } from './index';

/**
 * - `meaning`: see the radical, pick its meaning.
 * - `form`: see the meaning, pick the radical.
 * - `spot`: see a character, pick the radical it is filed under.
 */
export type QuizKind = 'meaning' | 'form' | 'spot';

export const QUIZ_KINDS: QuizKind[] = ['meaning', 'form', 'spot'];

export interface QuizQuestion {
  kind: QuizKind;
  radicalId: string;
  /** What is shown: a radical, a meaning, or a character. */
  prompt: string;
  /** Pinyin and meaning of a `spot` character; the pinyin of a `meaning` radical. */
  detail: string;
  /** What `speak` should read aloud for this prompt, if anything. */
  spoken: string | null;
  /** Whether the prompt and choices are hanzi, which the page sets larger. */
  hanziPrompt: boolean;
  hanziChoices: boolean;
  choices: string[];
  answer: number;
}

export const CHOICE_COUNT = 4;

type Random = () => number;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)]!;
}

/** The radical's face in a choice: the full form with its variants, "人 亻". */
function formLabel(radical: Radical): string {
  return radicalForms(radical).join(' ');
}

function question(kind: QuizKind, target: Radical, pool: readonly Radical[], random: Random): QuizQuestion {
  const label = kind === 'meaning' ? (r: Radical) => r.meaning : formLabel;
  const others = shuffle(
    pool.filter((r) => r.number !== target.number && label(r) !== label(target)),
    random,
  );
  // Distinct labels only, so two choices can never both be right.
  const distractors: string[] = [];
  for (const r of others) {
    if (distractors.length === CHOICE_COUNT - 1) break;
    if (!distractors.includes(label(r))) distractors.push(label(r));
  }
  const choices = shuffle([label(target), ...distractors], random);
  const base = { kind, radicalId: radicalId(target), choices, answer: choices.indexOf(label(target)) };

  if (kind === 'meaning') return { ...base, prompt: formLabel(target), detail: target.pinyin, spoken: target.radical, hanziPrompt: true, hanziChoices: false };
  if (kind === 'form') return { ...base, prompt: target.meaning, detail: '', spoken: null, hanziPrompt: false, hanziChoices: true };
  const example = pick(target.examples, random);
  return { ...base, prompt: example.hanzi, detail: `${example.pinyin} · ${example.meaning}`, spoken: example.hanzi, hanziPrompt: true, hanziChoices: true };
}

/**
 * A round of questions on `targets`, each radical asked once (or cycled
 * through again if `length` is larger), with wrong choices drawn from
 * `pool`. Pure given `random`, so tests pass a seeded one.
 */
export function buildQuiz(
  targets: readonly Radical[],
  pool: readonly Radical[],
  { kinds, length }: { kinds: readonly QuizKind[]; length: number },
  random: Random = Math.random,
): QuizQuestion[] {
  if (targets.length === 0 || kinds.length === 0) return [];
  const order: Radical[] = [];
  while (order.length < length) order.push(...shuffle(targets, random));
  return order.slice(0, length).map((target) => question(pick(kinds, random), target, pool, random));
}
