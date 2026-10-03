import type { Target } from '~core/import/mapping';
import { db } from './db';

export type { ImportMappingRow } from './db';

export async function findImportMapping(signature: string): Promise<Target[] | null> {
  return (await db.importMappings.get(signature))?.columns ?? null;
}

/** `columns` may be a reactive array; it is copied so IndexedDB can clone it. */
export async function saveImportMapping(signature: string, columns: readonly Target[], now: number): Promise<void> {
  await db.importMappings.put({ signature, columns: [...columns], updatedAt: now });
}
