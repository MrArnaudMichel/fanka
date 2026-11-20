import { describe, expect, it } from 'vitest';
import { segment } from '../../../scripts/content/lib/segment.mjs';

describe('segment', () => {
  const vocab = new Set(['我', '的', '朋友', '朋', '友', '很', '好']);
  it('matches greedily and keeps punctuation apart', () => {
    expect(segment('我的朋友很好。', vocab)).toEqual(['我', '的', '朋友', '很', '好', '。']);
  });
  it('leaves an unknown Han character on its own', () => {
    expect(segment('我龘好', vocab)).toEqual(['我', '龘', '好']);
  });
});
