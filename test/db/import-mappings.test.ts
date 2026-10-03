import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { findImportMapping, saveImportMapping } from '~core/db/import-mappings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('import mappings', () => {
  it('returns null for an unknown signature and the columns once saved', async () => {
    expect(await findImportMapping('x')).toBeNull();
    await saveImportMapping('x', ['hanzi', 'ignore', 'translation'], 1);
    expect(await findImportMapping('x')).toEqual(['hanzi', 'ignore', 'translation']);
  });
});
