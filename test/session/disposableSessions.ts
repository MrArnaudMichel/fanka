import { type EffectScope, effectScope } from 'vue';
import { afterEach, beforeEach } from 'vitest';
import type { SessionMode } from '~core/db/session';
import { useReviewSession } from '~/composables/useReviewSession';

/**
 * Registers per-test hooks so that every session a test creates is disposed
 * when that test ends, and returns the factory tests should use instead of
 * calling `useReviewSession()` directly. Sessions default to Review mode.
 *
 * A session registers a real `visibilitychange` listener on `document` once
 * it starts, and only removes it when the session ends or its effect scope is
 * disposed. Called bare, outside any effect scope, there is nothing to
 * dispose: the listener outlives its test and stays registered for the rest
 * of the file (happy-dom shares one `document` across a file's tests). A
 * later test that dispatches `visibilitychange` then runs every leftover
 * listener too, in registration order — ahead of its own session's — which
 * can consume a one-shot mock meant for that test's session and quietly turn
 * its assertion into a no-op.
 *
 * Creating each session inside one effect scope per test, and stopping that
 * scope in `afterEach`, runs the composable's own `onScopeDispose` cleanup,
 * exactly as unmounting a page would.
 */
export function useDisposableSessions(): (mode?: SessionMode) => ReturnType<typeof useReviewSession> {
  let scope: EffectScope | null = null;

  beforeEach(() => {
    scope = effectScope(true);
  });

  afterEach(() => {
    scope?.stop();
    scope = null;
  });

  return (mode = 'review') => {
    if (!scope) throw new Error('useDisposableSessions: a session can only be created inside a test');
    return scope.run(() => useReviewSession(mode))!;
  };
}
