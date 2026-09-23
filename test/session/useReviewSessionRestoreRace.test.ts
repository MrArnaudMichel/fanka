import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import { loadSession } from '~core/db/session';
import { seedIfNeeded } from '~core/seed/seed';
import { useDisposableSessions } from './disposableSessions';

const NOW = Date.parse('2026-09-16T08:00:00Z');

// A gate that blocks the *next* call to loadSession('review') until released. Kept
// in its own file with its own `vi.mock`, rather than folded into
// useReviewSession.test.ts, so this mock never applies to the other 20+
// tests there, which need the real loadSession/saveSession/clearSession.
//
// This replaces an earlier version of the "restore-or-start fired
// together" test that raced against real Dexie/IndexedDB timing: it
// happened to pass against every buggy version of the guard too, because
// in this environment a dropped restore()'s subsequent start() attempt
// consistently landed *before* the first call's real restoreCore() had
// finished, rather than after — the narrow window the described bug
// actually depends on. Gating loadSession('review') directly makes that window
// exact and deterministic instead of hoping for it.
const { gateState } = vi.hoisted(() => {
  let resolveGate: (() => void) | null = null;
  return {
    gateState: {
      armed: false,
      gate: null as Promise<void> | null,
      arm(): void {
        this.gate = new Promise<void>((resolve) => {
          resolveGate = resolve;
        });
        this.armed = true;
      },
      release(): void {
        resolveGate?.();
      },
    },
  };
});

vi.mock('~core/db/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~core/db/session')>();
  return {
    ...actual,
    loadSession: vi.fn(async () => {
      if (gateState.armed) {
        gateState.armed = false;
        await gateState.gate;
      }
      return actual.loadSession('review');
    }),
  };
});

const createSession = useDisposableSessions();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded(NOW);
  gateState.armed = false;
});

// Disarms and releases the gate even when a test fails before doing so
// itself, so a blocked or still-armed loadSession('review') cannot leak into the
// next test.
afterEach(() => {
  gateState.armed = false;
  gateState.release();
  vi.restoreAllMocks();
});

describe("useReviewSession — a restore()-then-start() fallback does not clobber a slower, real restore()", () => {
  it('leaves the restored progress intact when a duplicate restore-or-start attempt is only evaluated after the first one unblocks', async () => {
    // A prior session with real, resumable progress.
    const priorSession = createSession();
    await priorSession.start();
    priorSession.reveal();
    await priorSession.grade(3);
    priorSession.reveal();
    await priorSession.grade(3);
    expect(priorSession.index.value).toBe(2);

    const session = createSession();

    // Flow A: the page's own restore-or-start pattern. Its restore()'s
    // loadSession('review') read is gated — it will not resolve until released.
    gateState.arm();
    const flowA = (async () => {
      if (!(await session.restore())) await session.start();
    })();

    // A second restore() attempt — e.g. a duplicate mount — fired while
    // flow A's read is still blocked. Under the fixed guard this is
    // queued behind flow A, not dropped, so it does not even call
    // loadSession('review') itself until flow A's restoreCore() has fully run.
    const secondRestore = session.restore();

    // Flow A's blocked read completes now.
    gateState.release();
    await flowA;

    // Only now does the second attempt's own fallback run, exactly as the
    // page's `if (!(await restore())) await start()` pattern would.
    if (!(await secondRestore)) await session.start();

    expect(session.index.value).toBe(2);
    const stored = await loadSession('review');
    expect(stored?.index).toBe(2);
  });
});
