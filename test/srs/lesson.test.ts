import { describe, expect, it } from 'vitest';
import { answerLesson, firstTryCount, lessonDone, RETRY_GAP, startLesson } from '~core/srs/lesson';

const identity = () => 0.999;

describe('startLesson', () => {
  it('queues every id once', () => {
    const state = startLesson(['a', 'b', 'a', 'c'], Math.random);
    expect([...state.queue].sort()).toEqual(['a', 'b', 'c']);
    expect(state.learned).toEqual([]);
  });

  it('shuffles with the given random source', () => {
    expect(startLesson(['a', 'b', 'c'], identity).queue).toEqual(['a', 'b', 'c']);
    expect(startLesson(['a', 'b', 'c'], () => 0).queue).not.toEqual(['a', 'b', 'c']);
  });
});

describe('answerLesson', () => {
  const start = startLesson(['a', 'b', 'c', 'd', 'e'], identity);

  it('learns a card answered right', () => {
    const next = answerLesson(start, 'a', true);
    expect(next.queue).toEqual(['b', 'c', 'd', 'e']);
    expect(next.learned).toEqual(['a']);
  });

  it(`puts a missed card back ${RETRY_GAP} places on`, () => {
    const next = answerLesson(start, 'a', false);
    expect(next.queue).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(next.misses).toEqual({ a: 1 });
  });

  it('puts a missed card last when fewer cards remain', () => {
    const two = startLesson(['a', 'b'], identity);
    expect(answerLesson(two, 'a', false).queue).toEqual(['b', 'a']);
    const one = startLesson(['a'], identity);
    expect(answerLesson(one, 'a', false).queue).toEqual(['a']);
  });

  it('ignores an answer for a card that is not up', () => {
    expect(answerLesson(start, 'c', true)).toBe(start);
  });

  it('ends once every card is answered right, counting first tries', () => {
    let state = startLesson(['a', 'b'], identity);
    state = answerLesson(state, 'a', false);
    state = answerLesson(state, 'b', true);
    state = answerLesson(state, 'a', true);
    expect(lessonDone(state)).toBe(true);
    expect(state.learned).toEqual(['b', 'a']);
    expect(firstTryCount(state)).toBe(1);
  });
});
