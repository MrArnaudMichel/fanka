import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A faked Supabase client's `auth` namespace. `emit` stands in for a real
 * `onAuthStateChange` event (sign-in, sign-out, a token refresh) so tests
 * can drive `useAuth()`'s `user` ref without a network call.
 */
type FakeSession = { user: { id: string; email: string; user_metadata?: { display_name?: string } } } | null;
type FakeAuthError = { message: string } | null;

const { authStub, getSupabaseClient } = vi.hoisted(() => {
  const listeners: ((event: string, session: FakeSession) => void)[] = [];
  const authStub = {
    getSession: vi.fn(async (): Promise<{ data: { session: FakeSession }; error: FakeAuthError }> => ({
      data: { session: null },
      error: null,
    })),
    onAuthStateChange: vi.fn((cb: (event: string, session: FakeSession) => void) => {
      listeners.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithOtp: vi.fn(async (): Promise<{ error: FakeAuthError }> => ({ error: null })),
    signOut: vi.fn(async (): Promise<{ error: FakeAuthError }> => ({ error: null })),
    updateUser: vi.fn(async (attrs: { data: { display_name: string } }): Promise<{ data: { user: unknown }; error: FakeAuthError }> => ({
      data: { user: { id: 'u1', email: 'arnaud@example.com', user_metadata: { display_name: attrs.data.display_name } } },
      error: null,
    })),
    exchangeCodeForSession: vi.fn(async (): Promise<{ error: FakeAuthError }> => ({ error: null })),
    emit(event: string, session: FakeSession) {
      for (const cb of listeners) cb(event, session);
    },
  };
  const getSupabaseClient = vi.fn(() => ({ auth: authStub }));
  return { authStub, getSupabaseClient };
});

vi.mock('~/utils/supabaseClient', () => ({ getSupabaseClient }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

/** Lets queued promise callbacks (the faked async client calls) settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

// Module-scope state (`user`/`loading`/`error`, and the one `onAuthStateChange`
// subscription registered on the first call) is shared across tests in this
// file, the same convention `test/composables/useSeedStatus.test.ts` uses —
// each test leaves things in a state the next one can build on.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAuth', () => {
  it('starts signed out and resolves the initial session without throwing', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const { user, loading } = useAuth();
    await flush();

    expect(user.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(authStub.getSession).toHaveBeenCalledTimes(1);
  });

  it('rejects an obviously invalid email locally, without calling the network', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const { signIn, error } = useAuth();
    authStub.signInWithOtp.mockClear();

    await signIn('not-an-email');

    expect(error.value).toBe('Enter a valid email address.');
    expect(authStub.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends a magic link for a valid email and clears any previous error', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const { signIn, error } = useAuth();
    authStub.signInWithOtp.mockClear();
    authStub.signInWithOtp.mockResolvedValueOnce({ error: null });

    await signIn('  learner@example.com  ');

    expect(authStub.signInWithOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      options: { emailRedirectTo: expect.any(String) },
    });
    expect(error.value).toBe('');
  });

  it('surfaces a rejection Supabase itself returns, rather than crashing', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const { signIn, error } = useAuth();
    authStub.signInWithOtp.mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } });

    await signIn('learner@example.com');

    expect(error.value).toBe('Email rate limit exceeded');
  });

  it('updates the user ref when the underlying client reports a sign-in', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const { user } = useAuth();

    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'learner@example.com' } });
    await flush();

    expect(user.value).toMatchObject({ id: 'u1' });

    // Leave signed out for any test file that reuses this module elsewhere.
    authStub.emit('SIGNED_OUT', null);
    await flush();
  });

  it('signOut clears the session but never touches local data, and never throws on failure', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const { signOut, error } = useAuth();
    authStub.signOut.mockRejectedValueOnce(new Error('network down'));

    await expect(signOut()).resolves.toBeUndefined();
    expect(error.value).toBe('network down');
  });
});

describe('profile', () => {
  it('falls back to the email local part without a display name', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    expect(auth.displayName.value).toBe('arnaud');
  });

  it('saves a trimmed display name and shows it', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    expect(await auth.updateProfile('  Arnaud  ')).toBe(true);
    expect(authStub.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Arnaud' } });
    expect(auth.displayName.value).toBe('Arnaud');
  });

  it('reports a failed update in error and returns false', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Network down' } });
    expect(await auth.updateProfile('X')).toBe(false);
    expect(auth.error.value).toBe('Network down');
  });
});
