import { describe, expect, it } from 'vitest';
import { attemptVerdict, journalRows } from '~core/stats/journal';
import { NOW, aCard, aDeck, anAttempt, local } from './fixtures';

const f = {
  attempts: [
    anAttempt('old', { at: local(9, 20), grade: 1, correct: false }),
    anAttempt('new', { at: local(9, 29), source: 'practice' }),
    anAttempt('orphan', { at: local(9, 28), cardId: 'gone', deckId: 'gone' }),
  ],
  cardsById: new Map([['c1', aCard('c1', 'd1')]]),
  decksById: new Map([['d1', aDeck('d1')]]),
};

describe('journalRows', () => {
  it('lists answers newest first, and survives a deleted card and deck', () => {
    const rows = journalRows(f, '30d', NOW, { source: null, result: null });
    expect(rows.map((r) => r.id)).toEqual(['new', 'orphan', 'old']);
    expect(rows[1]).toMatchObject({ hanzi: '—', deckName: '—' });
    expect(rows[0]).toMatchObject({ hanzi: '學', deckName: 'D1', source: 'practice' });
  });

  it('filters by source and result', () => {
    expect(journalRows(f, '30d', NOW, { source: 'practice', result: null }).map((r) => r.id)).toEqual(['new']);
    expect(journalRows(f, '30d', NOW, { source: null, result: 'wrong' }).map((r) => r.id)).toEqual(['old']);
  });
});

describe('attemptVerdict', () => {
  const w = (shapeCorrect: boolean, orderCorrect: boolean) => ({ character: '學', shapeCorrect, orderCorrect, error: null, strokeIndex: null, expected: 1, drawn: 1 });
  it('describes a checked drawing', () => {
    expect(attemptVerdict({ mode: 'writing', checked: true, writing: [w(true, true)] })).toBe('Character right · order right');
    expect(attemptVerdict({ mode: 'writing', checked: true, writing: [w(true, false)] })).toBe('Character right · order wrong');
    expect(attemptVerdict({ mode: 'writing', checked: true, writing: [w(false, false)] })).toBe('Character wrong · order not checked');
  });
  it('says when a writing answer was self-graded, and nothing for review', () => {
    expect(attemptVerdict({ mode: 'writing', checked: false, writing: null })).toBe('Self-graded');
    expect(attemptVerdict({ mode: 'review', checked: false, writing: null })).toBe('');
  });
});
