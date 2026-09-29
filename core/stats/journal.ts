import type { Attempt, AttemptSource, StudyMode } from '~core/db/schema';
import type { Grade } from '~core/srs';
import type { FilteredSnapshot } from './filter';
import { type StatsWindow, inWindow } from './time';

export interface JournalFilter {
  source: AttemptSource | null;
  result: 'right' | 'wrong' | null;
}

export interface JournalRow {
  id: string;
  at: number;
  cardId: string;
  hanzi: string;
  deckName: string;
  mode: StudyMode;
  source: AttemptSource;
  grade: Grade;
  durationMs: number;
  verdict: string;
}

/** One line on how a writing answer was judged; empty for Review. */
export function attemptVerdict(a: Pick<Attempt, 'mode' | 'checked' | 'writing'>): string {
  if (a.mode !== 'writing') return '';
  if (!a.checked || !a.writing) return 'Self-graded';
  const shape = a.writing.every((r) => r.shapeCorrect);
  const order = a.writing.every((r) => r.orderCorrect) ? 'order right' : a.writing.some((r) => r.shapeCorrect && !r.orderCorrect) ? 'order wrong' : 'order not checked';
  return `Character ${shape ? 'right' : 'wrong'} · ${order}`;
}

/** Every answer in the window, newest first. A deleted card or deck shows as "—". */
export function journalRows(
  f: Pick<FilteredSnapshot, 'attempts' | 'cardsById' | 'decksById'>,
  window: StatsWindow,
  now: number,
  filter: JournalFilter,
): JournalRow[] {
  return f.attempts
    .filter((a) => inWindow(a.at, window, now))
    .filter((a) => filter.source === null || a.source === filter.source)
    .filter((a) => filter.result === null || a.correct === (filter.result === 'right'))
    .sort((a, b) => b.at - a.at)
    .map((a) => ({
      id: a.id,
      at: a.at,
      cardId: a.cardId,
      hanzi: f.cardsById.get(a.cardId)?.hanzi ?? '—',
      deckName: f.decksById.get(a.deckId)?.name ?? '—',
      mode: a.mode,
      source: a.source,
      grade: a.grade,
      durationMs: a.durationMs,
      verdict: attemptVerdict(a),
    }));
}
