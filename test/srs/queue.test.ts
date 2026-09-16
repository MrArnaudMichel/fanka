import { describe, expect, it } from 'vitest';
import type { Item } from '~core/db/schema';
import { buildQueue } from '~core/srs/queue';
import { newSrsState } from '~core/srs';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const item = (id: string, over: Partial<Item> = {}): Item => ({
  ...newSrsState(NOW),
  id,
  cardId: id.split(':')[0]!,
  dir: 'recognition',
  suspended: false,
  updatedAt: NOW,
  ...over,
});

describe('buildQueue', () => {
  it('returns nothing when there is nothing to do', () => {
    expect(buildQueue({ due: [], fresh: [], newPerDay: 15, introducedToday: 0 })).toEqual([]);
  });

  it('includes every due item', () => {
    const due = [item('a:recognition'), item('b:recognition')];
    expect(buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 })).toHaveLength(2);
  });

  it('caps new items at the daily allowance', () => {
    const fresh = Array.from({ length: 10 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due: [], fresh, newPerDay: 3, introducedToday: 0 });
    expect(queue).toHaveLength(3);
  });

  it('subtracts what was already introduced today', () => {
    const fresh = Array.from({ length: 10 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    expect(buildQueue({ due: [], fresh, newPerDay: 5, introducedToday: 4 })).toHaveLength(1);
  });

  it('introduces nothing once the allowance is spent', () => {
    const fresh = [item('n0:recognition', { state: 'new' })];
    expect(buildQueue({ due: [], fresh, newPerDay: 5, introducedToday: 5 })).toEqual([]);
  });

  it('never places the two directions of one card next to each other', () => {
    const due = [
      item('a:recognition', { cardId: 'a', dir: 'recognition' }),
      item('a:production', { cardId: 'a', dir: 'production' }),
      item('b:recognition', { cardId: 'b', dir: 'recognition' }),
      item('b:production', { cardId: 'b', dir: 'production' }),
    ];
    const queue = buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 });
    for (let i = 1; i < queue.length; i += 1) {
      expect(queue[i]!.cardId).not.toBe(queue[i - 1]!.cardId);
    }
  });

  it('spreads new items through the session rather than front-loading them', () => {
    const due = Array.from({ length: 8 }, (_, i) => item(`d${i}:recognition`, { state: 'review' }));
    const fresh = Array.from({ length: 2 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due, fresh, newPerDay: 2, introducedToday: 0 });
    const positions = queue.map((q, i) => (q.state === 'new' ? i : -1)).filter((i) => i >= 0);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[1]! - positions[0]!).toBeGreaterThan(1);
  });

  it('keeps every item exactly once', () => {
    const due = Array.from({ length: 5 }, (_, i) => item(`d${i}:recognition`, { state: 'review' }));
    const fresh = Array.from({ length: 3 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due, fresh, newPerDay: 3, introducedToday: 0 });
    expect(new Set(queue.map((q) => q.id)).size).toBe(8);
  });

  // The tests below are not in the brief. They cover two defects found by
  // hand-tracing the brief's own algorithms against adversarial input: a
  // same-card pair that lands as the queue's last two items was never
  // separated (separateDirections only searched forward), and a session with
  // few review items relative to new ones back-loaded every leftover new
  // item into one clump at the end (the opposite of spreading them).

  it('separates a same-card pair even when it falls at the very end of the queue', () => {
    // Three cards, each contributing two adjacent items, deliberately
    // arranged so the third pair is the queue's last two elements — the one
    // case a forward-only swap search cannot fix.
    const due = [
      item('a:recognition', { cardId: 'a', dir: 'recognition' }),
      item('a:production', { cardId: 'a', dir: 'production' }),
      item('b:recognition', { cardId: 'b', dir: 'recognition' }),
      item('b:production', { cardId: 'b', dir: 'production' }),
      item('c:recognition', { cardId: 'c', dir: 'recognition' }),
      item('c:production', { cardId: 'c', dir: 'production' }),
    ];
    const queue = buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 });
    for (let i = 1; i < queue.length; i += 1) {
      expect(queue[i]!.cardId).not.toBe(queue[i - 1]!.cardId);
    }
    expect(new Set(queue.map((q) => q.id)).size).toBe(6);
  });

  it('leaves a two-item queue of one card adjacent when nothing else exists to separate them', () => {
    const due = [
      item('a:recognition', { cardId: 'a', dir: 'recognition' }),
      item('a:production', { cardId: 'a', dir: 'production' }),
    ];
    const queue = buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 });
    expect(queue.map((q) => q.id)).toEqual(['a:recognition', 'a:production']);
  });

  it('spreads new items even when there are far fewer review items than new ones', () => {
    const due = [item('r0:recognition', { state: 'review' })];
    const fresh = Array.from({ length: 5 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due, fresh, newPerDay: 5, introducedToday: 0 });
    // The lone review item must not have every new item dumped after it.
    const reviewPosition = queue.findIndex((q) => q.id === 'r0:recognition');
    expect(reviewPosition).toBeGreaterThan(0);
    expect(reviewPosition).toBeLessThan(queue.length - 1);
  });

  // These cases all use disjoint cardIds between due and fresh (the `d`/`n`
  // id prefixes never collide), which is the only shape under which
  // spread()'s bound is a guarantee rather than a best effort — see the
  // shared-card tests below for what happens when that assumption doesn't
  // hold.
  it.each([
    { due: 3, fresh: 3 },
    { due: 2, fresh: 10 },
    { due: 1, fresh: 5 },
    { due: 0, fresh: 4 }, // no review items to spread across: the bound degenerates to fresh.length, which is correct and unavoidable
    { due: 4, fresh: 0 },
  ])(
    'keeps the longest run of new items within the even-spread bound on disjoint cards (due=$due, fresh=$fresh)',
    ({ due: dueCount, fresh: freshCount }) => {
      const due = Array.from({ length: dueCount }, (_, i) => item(`d${i}:recognition`, { state: 'review' }));
      const fresh = Array.from({ length: freshCount }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
      const queue = buildQueue({ due, fresh, newPerDay: freshCount, introducedToday: 0 });
      let maxRun = 0;
      let run = 0;
      for (const q of queue) {
        run = q.state === 'new' ? run + 1 : 0;
        maxRun = Math.max(maxRun, run);
      }
      // spread() guarantees new items land in reviewing.length + 1 gaps whose
      // sizes differ by at most one, so no run of consecutive new items can
      // exceed the size of the largest gap: ceil(fresh / (due + 1)).
      expect(maxRun).toBeLessThanOrEqual(Math.ceil(fresh.length / (due.length + 1)));
    },
  );

  it('does not crash or drop items when every item shares one card (impossible to fully separate)', () => {
    const due = Array.from({ length: 5 }, (_, i) => item(`a:${i}`, { cardId: 'a', dir: 'recognition' }));
    const queue = buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 });
    expect(new Set(queue.map((q) => q.id)).size).toBe(5);
  });

  // due and fresh sharing a cardId is not exotic: a card with one direction
  // due and the other still new is the ordinary state of a partially-learned
  // card, and nothing in the repository layer stops both from landing in the
  // same session. When resolving same-card adjacency forces a choice between
  // the two rules, adjacency always wins — these two tests cover that case
  // with the same repro: three cards, each due in one direction and new in
  // the other, with the fresh order (c0, c2, c1) chosen so that the naive
  // nearest-swap-partner choice cascades into a run of new items.

  it('separates same-card items even when due and fresh share a card', () => {
    const due = [
      item('c0:recognition', { cardId: 'c0', dir: 'recognition', state: 'review' }),
      item('c1:recognition', { cardId: 'c1', dir: 'recognition', state: 'review' }),
      item('c2:recognition', { cardId: 'c2', dir: 'recognition', state: 'review' }),
    ];
    const fresh = [
      item('c0:production', { cardId: 'c0', dir: 'production', state: 'new' }),
      item('c2:production', { cardId: 'c2', dir: 'production', state: 'new' }),
      item('c1:production', { cardId: 'c1', dir: 'production', state: 'new' }),
    ];
    const queue = buildQueue({ due, fresh, newPerDay: 3, introducedToday: 0 });
    // Adjacency is the hard invariant: it must hold no matter what that
    // costs the new-item spread on this input.
    for (let i = 1; i < queue.length; i += 1) {
      expect(queue[i]!.cardId).not.toBe(queue[i - 1]!.cardId);
    }
    expect(new Set(queue.map((q) => q.id)).size).toBe(6);
  });

  it('prefers a swap partner that keeps the new-item run within the spread bound, when adjacency allows it', () => {
    const due = [
      item('c0:recognition', { cardId: 'c0', dir: 'recognition', state: 'review' }),
      item('c1:recognition', { cardId: 'c1', dir: 'recognition', state: 'review' }),
      item('c2:recognition', { cardId: 'c2', dir: 'recognition', state: 'review' }),
    ];
    const fresh = [
      item('c0:production', { cardId: 'c0', dir: 'production', state: 'new' }),
      item('c2:production', { cardId: 'c2', dir: 'production', state: 'new' }),
      item('c1:production', { cardId: 'c1', dir: 'production', state: 'new' }),
    ];
    const queue = buildQueue({ due, fresh, newPerDay: 3, introducedToday: 0 });
    let maxRun = 0;
    let run = 0;
    for (const q of queue) {
      run = q.state === 'new' ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
    }
    // Not a guaranteed bound on shared-card inputs — adjacency wins over the
    // spread when the two conflict, so this records what separateDirections'
    // bound-aware candidate choice actually achieves for this input, rather
    // than asserting a bound the contract no longer promises. For this input
    // it happens to fully recover spread()'s own bound (1): a bound-satisfying
    // swap partner exists at every conflict here, so the preference finds it.
    // Before that preference existed, the naive nearest-candidate choice gave
    // a run of 3 for this exact input (see task-9-report.md, fix round 2, RED
    // evidence) — this assertion is what catches a regression back to that.
    expect(maxRun).toBe(1);
  });
});
