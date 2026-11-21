import { db } from './db';

const KEY = 'bundleFollowedFor';

/** The account whose studied bundle this device last followed, kept so a restart is not mistaken for a sign-in. */
export async function followedUser(): Promise<string | null> {
  const value = (await db.syncState.get(KEY))?.value;
  return typeof value === 'string' ? value : null;
}

export async function markFollowed(userId: string): Promise<void> {
  await db.syncState.put({ key: KEY, value: userId });
}

export async function clearFollowed(): Promise<void> {
  await db.syncState.delete(KEY);
}
