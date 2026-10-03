import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounced } from '~/utils/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounced', () => {
  it('runs once, after the last request has been quiet for the delay', () => {
    const run = vi.fn();
    const d = debounced(run, 1000);
    d.request();
    vi.advanceTimersByTime(600);
    d.request();
    vi.advanceTimersByTime(600);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flush runs a pending request now, and does nothing when none is pending', () => {
    const run = vi.fn();
    const d = debounced(run, 1000);
    expect(d.flush()).toBe(false);
    expect(run).not.toHaveBeenCalled();
    d.request();
    expect(d.flush()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
