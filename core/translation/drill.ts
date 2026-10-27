/**
 * The translation drill: a word's meaning from its hanzi, or its hanzi from
 * its meaning, out of a few choices. Pure given `random`, so tests pass a
 * seeded one.
 */

export interface DrillCard {
  id: string;
  hanzi: string;
  /** Pinyin as read, shown once the question is answered. */
  pinyin: string;
  translation: string;
}

/**
 * - `meaning`: see the hanzi, pick the translation.
 * - `hanzi`: see the translation, pick the hanzi.
 */
export type DrillDirection = 'meaning' | 'hanzi';

export interface DrillQuestion {
  cardId: string;
  direction: DrillDirection;
  prompt: string;
  choices: string[];
  answer: number;
}

export const DRILL_CHOICES = 4;

type Random = () => number;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const answerOf = (card: DrillCard, direction: DrillDirection) => (direction === 'meaning' ? card.translation.trim() : card.hanzi.trim());
const promptOf = (card: DrillCard, direction: DrillDirection) => (direction === 'meaning' ? card.hanzi.trim() : card.translation.trim());

/**
 * One question per card of `targets`, in a shuffled order and cycled again if
 * `length` asks for more, with wrong choices drawn from `pool`. Choices are
 * distinct, so two can never both be right; a card whose answer every other
 * card shares cannot be asked, and is skipped.
 */
export function buildDrill(
  targets: readonly DrillCard[],
  pool: readonly DrillCard[],
  { directions, length }: { directions: readonly DrillDirection[]; length: number },
  random: Random = Math.random,
): DrillQuestion[] {
  if (directions.length === 0) return [];
  const askable = targets.filter((card) => directions.some((d) => pool.some((other) => answerOf(other, d) !== answerOf(card, d))));
  if (askable.length === 0) return [];

  const order: DrillCard[] = [];
  while (order.length < length) order.push(...shuffle(askable, random));

  return order.slice(0, length).map((card) => {
    const possible = directions.filter((d) => pool.some((other) => answerOf(other, d) !== answerOf(card, d)));
    const direction = possible[Math.floor(random() * possible.length)]!;
    const right = answerOf(card, direction);
    const wrong: string[] = [];
    for (const other of shuffle(pool, random)) {
      if (wrong.length === DRILL_CHOICES - 1) break;
      const label = answerOf(other, direction);
      if (label && label !== right && !wrong.includes(label)) wrong.push(label);
    }
    const choices = shuffle([right, ...wrong], random);
    return { cardId: card.id, direction, prompt: promptOf(card, direction), choices, answer: choices.indexOf(right) };
  });
}
