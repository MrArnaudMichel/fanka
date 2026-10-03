import { describe, expect, it } from 'vitest';
import { importSummary } from '~/utils/importSummary';

describe('importSummary', () => {
  it('leads with what was created', () => {
    expect(importSummary({ created: 3, updated: 0, skipped: 0 }, 'skip')).toEqual({ heading: 'Imported 3 cards' });
    expect(importSummary({ created: 1, updated: 2, skipped: 1 }, 'update')).toEqual({ heading: 'Imported 1 card', description: '2 updated, 1 unchanged' });
  });

  it('leads with updates when nothing was created', () => {
    expect(importSummary({ created: 0, updated: 2, skipped: 0 }, 'update')).toEqual({ heading: 'Updated 2 cards' });
  });

  it('says skipped cards were already in the deck under Skip, and unchanged under Update', () => {
    expect(importSummary({ created: 2, updated: 0, skipped: 1 }, 'skip')).toEqual({ heading: 'Imported 2 cards', description: '1 already in the deck skipped' });
    expect(importSummary({ created: 2, updated: 0, skipped: 3 }, 'update')).toEqual({ heading: 'Imported 2 cards', description: '3 unchanged' });
  });

  it('says nothing changed when every row was already there', () => {
    expect(importSummary({ created: 0, updated: 0, skipped: 4 }, 'update')).toEqual({ heading: 'Nothing to change', description: '4 cards already up to date' });
    expect(importSummary({ created: 0, updated: 0, skipped: 4 }, 'skip')).toEqual({ heading: 'Nothing imported', description: '4 already in the deck skipped' });
  });
});
