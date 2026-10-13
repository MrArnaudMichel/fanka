import { describe, expect, it } from 'vitest';
import { focusCardIds } from '~/utils/focus';

describe('focusCardIds', () => {
  it('reads a comma-separated list, dropping empty entries', () => {
    expect(focusCardIds('a,b,,c')).toEqual(['a', 'b', 'c']);
  });

  it('is undefined without a usable list', () => {
    expect(focusCardIds(undefined)).toBeUndefined();
    expect(focusCardIds('')).toBeUndefined();
    expect(focusCardIds(['a', 'b'])).toBeUndefined();
  });
});
