import type { DuplicatePolicy } from '~core/import/rows';
import { plural } from '~/utils/format';

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * The import toast's wording. Under Skip, a skipped row was already in the
 * deck; under Update, it was already identical, so it is "unchanged".
 */
export function importSummary({ created, updated, skipped }: ImportResult, policy: DuplicatePolicy): { heading: string; description?: string } {
  const skippedText = policy === 'update' ? `${skipped} unchanged` : `${skipped} already in the deck skipped`;

  if (created === 0 && updated === 0) {
    if (policy === 'update') return { heading: 'Nothing to change', description: `${plural(skipped, 'card')} already up to date` };
    return { heading: 'Nothing imported', description: skippedText };
  }

  const heading = created > 0 ? `Imported ${plural(created, 'card')}` : `Updated ${plural(updated, 'card')}`;
  const parts = [created > 0 && updated > 0 ? `${updated} updated` : '', skipped > 0 ? skippedText : ''].filter(Boolean);
  return parts.length > 0 ? { heading, description: parts.join(', ') } : { heading };
}
