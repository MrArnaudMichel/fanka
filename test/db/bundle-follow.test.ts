import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { clearFollowed, followedUser, markFollowed } from '~core/db/bundle-follow';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('bundle follow marker', () => {
  it('is empty, then remembers the account, then forgets it', async () => {
    expect(await followedUser()).toBeNull();
    await markFollowed('u1');
    expect(await followedUser()).toBe('u1');
    await clearFollowed();
    expect(await followedUser()).toBeNull();
  });
});
