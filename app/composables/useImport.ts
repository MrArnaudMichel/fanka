import { type Delimiter, detectDelimiter, parseDelimited } from '~core/import/parse';
import { type Mapping, applyMapping, guessMapping } from '~core/import/mapping';
import { type CardDraft, type Validated, validateCard } from '~core/import/validate';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { db } from '~core/db/db';
import { cards, decks as deckRepository } from '~core/db/repositories';
import { type Card, type Deck, type Direction, type Item, type OutboxEntry, itemId } from '~core/db/schema';
import { newSrsState } from '~core/srs';
import { refreshDueCounts } from '~/composables/useDueCounts';

export type SourceMode = 'file' | 'paste';

/**
 * Step 1's own state: only the choice of source *kind*. The raw text (a
 * `File`'s contents or the pasted string) is not kept here — the page reads
 * it (through `file.text()` or the textarea's value) and hands it straight
 * to `load()`, which is the only place it needs to exist.
 */
export interface ImportSource {
  mode: SourceMode;
}

export interface ImportCounts {
  valid: number;
  warnings: number;
  errors: number;
}

const DUPLICATE_MESSAGE = 'Already in this deck';

function uid(): string {
  return crypto.randomUUID();
}

function outboxEntry(entity: OutboxEntry['entity'], entityId: string, op: OutboxEntry['op'], at: number): OutboxEntry {
  return { id: uid(), entity, entityId, op, at };
}

const ALL_DIRECTIONS: Direction[] = ['recognition', 'production'];

/**
 * Thrown by `commit()` when a batch transaction fails. `createdSoFar` is
 * every card created by batches that already committed before the failing
 * one — those stay; nothing from the failing batch is created. The caller
 * (the page) reads this to word its error toast (ruling 7,
 * task-14-report.md).
 */
export class ImportCommitError extends Error {
  readonly createdSoFar: number;

  constructor(createdSoFar: number, cause?: unknown) {
    super('Import failed partway through.');
    this.name = 'ImportCommitError';
    this.createdSoFar = createdSoFar;
    this.cause = cause;
  }
}

/** Normalises a pinyin string (numbered or diacritic) to the joined diacritic form the schema stores — same conversion useCardEditor.ts applies. */
function normalisePinyinText(text: string): string {
  return parsePinyin(text)
    .map((s) => s.text)
    .join(' ');
}

/**
 * One batch, one Dexie transaction, outbox entries included. `existingHanzi`
 * is read fresh at the start of this transaction — not carried over from
 * `verify()` — so a card created by an earlier batch in the same commit, or
 * by anything else entirely, is always seen (ruling 2, task-14-report.md:
 * "commit re-checks against the database inside each batch transaction").
 * A hanzi already present is skipped, never overwritten.
 */
async function commitBatch(deckId: string, batch: Validated[], now: number): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  await db.transaction('rw', db.cards, db.items, db.outbox, async () => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    const existingHanzi = new Set(deckCards.filter((c) => c.deletedAt === null).map((c) => c.hanzi));

    for (const row of batch) {
      const draft = row.draft;
      if (existingHanzi.has(draft.hanzi)) {
        skipped += 1;
        continue;
      }
      existingHanzi.add(draft.hanzi);

      const pinyin = parsePinyin(draft.pinyin);
      // Ruling 3: the mapped zhuyin column wins when present and non-empty;
      // otherwise it is derived.
      const zhuyin = draft.zhuyin && draft.zhuyin.length > 0 ? draft.zhuyin : toZhuyin(pinyin);

      const card: Card = {
        id: uid(),
        deckId,
        hanzi: draft.hanzi,
        pinyin,
        zhuyin,
        translation: draft.translation,
        // Not a mapped field (CardField has no 'pos') — every importable
        // row needs one, and 'noun' is the same default useCardEditor.ts's
        // emptyDraft() picks for a fresh card the editor collects no part
        // of speech for either. A learner can change it afterwards.
        pos: 'noun',
        example: draft.example ?? '',
        examplePinyin: draft.examplePinyin ? normalisePinyinText(draft.examplePinyin) : '',
        exampleTranslation: draft.exampleTranslation ?? '',
        tags: draft.tags ?? [],
        note: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.cards.put(card);
      await db.outbox.put(outboxEntry('card', card.id, 'put', now));

      // Ruling 3: both directions are always enabled for an imported card.
      for (const dir of ALL_DIRECTIONS) {
        const item: Item = { ...newSrsState(now), id: itemId(card.id, dir), cardId: card.id, dir, suspended: false, updatedAt: now };
        await db.items.put(item);
        await db.outbox.put(outboxEntry('item', item.id, 'put', now));
      }
      created += 1;
    }
  });

  return { created, skipped };
}

const BATCH_SIZE = 200;

/**
 * The CSV/TSV and pasted-text importer (Task 14). This is the one seam
 * `/import` reaches the database through — pages never touch `~core/db`
 * directly (CLAUDE.md), and this composable is the sole exception that
 * does, for the batched commit transactions `~core/db/repositories` has no
 * bulk API for.
 *
 * Steps are driven by the page: `load()` parses a source into `rows` and a
 * guessed `mapping` (step 1 → 2), `setMapping()` + `verify()` validates
 * every row against the target deck (step 2 → 3), and `commit()` writes the
 * valid ones (step 3 → done).
 */
export function useImport() {
  const step = ref<1 | 2 | 3>(1);
  const source = reactive<ImportSource>({ mode: 'file' });
  const rows = ref<string[][]>([]);
  const mapping = ref<Mapping | null>(null);
  const results = ref<Validated[]>([]);
  const targetDeckId = ref<string | null>(null);
  const decks = ref<Deck[]>([]);
  const decksLoading = ref(true);
  /** The destination-deck list could not be read — the page shows Retry, never "no decks" (final review I3). */
  const decksError = ref(false);

  /** Never rejects: a failure lands in `decksError`, and `decks` keeps whatever it last held. */
  async function loadDecks(): Promise<void> {
    decksLoading.value = true;
    decksError.value = false;
    try {
      decks.value = await deckRepository.listAll();
    } catch (err) {
      console.error('useImport: failed to load the deck list', err);
      decksError.value = true;
    } finally {
      decksLoading.value = false;
    }
  }

  const counts = computed<ImportCounts>(() => {
    let valid = 0;
    let warnings = 0;
    let errors = 0;
    for (const row of results.value) {
      if (row.ok) {
        valid += 1;
        if (row.issues.some((issue) => issue.severity === 'warning')) warnings += 1;
      } else {
        errors += 1;
      }
    }
    return { valid, warnings, errors };
  });

  // Ruling 5: changing the deck after verifying invalidates the results —
  // duplicate-checking depends on which deck's cards `existingHanzi` reads.
  // Changing the source does the same, but through `load()` itself below,
  // since that is the one function that actually reads a new source.
  // `flush: 'sync'`: this runs outside any component's render cycle, so the
  // default deferred flush would not clear `results` until a later tick —
  // a caller reading `results` right after setting `targetDeckId` (as the
  // "invalidates" ruling demands) must see it already empty.
  watch(targetDeckId, () => {
    results.value = [];
  }, { flush: 'sync' });

  /**
   * Detects the delimiter, parses `text` into `rows`, and guesses a
   * `mapping` from it. Throws (and touches neither `rows` nor `mapping`) on
   * fewer than one data row — the caller shows that inline (ruling 4).
   */
  function load(text: string): void {
    const delimiter: Delimiter = detectDelimiter(text);
    const parsed = parseDelimited(text, delimiter);
    const guessed = guessMapping(parsed);
    const dataRowCount = guessed.hasHeader ? parsed.length - 1 : parsed.length;
    if (dataRowCount < 1) {
      throw new Error('No data rows found in that source.');
    }
    rows.value = parsed;
    mapping.value = guessed;
    results.value = [];
  }

  function setMapping(m: Mapping): void {
    mapping.value = m;
  }

  /**
   * Ruling 1/2: validates every mapped row against the destination deck's
   * *visible* cards, growing that set as each row is accepted — so a
   * duplicate later in the same file is caught too, not just one already in
   * the deck.
   */
  async function verify(): Promise<void> {
    if (!mapping.value || !targetDeckId.value) {
      results.value = [];
      return;
    }
    const drafts: CardDraft[] = applyMapping(rows.value, mapping.value);
    const deckCards = await cards.forDeck(targetDeckId.value);
    const existingHanzi = new Set(deckCards.map((c) => c.hanzi));

    const validated: Validated[] = [];
    for (const draft of drafts) {
      const validation = validateCard(draft, existingHanzi);
      validated.push(validation);
      if (validation.ok) existingHanzi.add(validation.draft.hanzi);
    }
    results.value = validated;
  }

  /**
   * Writes every valid row in batches of `BATCH_SIZE`, each its own
   * transaction. `skipped` (ruling 2) starts from the duplicates `verify()`
   * already turned away — rows whose only reason for not being `ok` is the
   * "Already in this deck" issue — and grows with whatever a batch's own
   * re-check turns away too. A batch that throws leaves every earlier batch
   * committed and creates nothing itself; `ImportCommitError` carries how
   * many cards exist so far so the caller can say so.
   */
  async function commit(): Promise<{ created: number; skipped: number }> {
    const deckId = targetDeckId.value;
    if (!deckId) throw new Error('No destination deck selected.');

    const validRows = results.value.filter((row) => row.ok);
    const duplicatesFromVerify = results.value.filter((row) =>
      row.issues.some((issue) => issue.field === 'hanzi' && issue.message === DUPLICATE_MESSAGE),
    ).length;

    let created = 0;
    let skipped = duplicatesFromVerify;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      try {
        const result = await commitBatch(deckId, batch, Date.now());
        created += result.created;
        skipped += result.skipped;
      } catch (err) {
        // Earlier batches did land — their cards count toward today's work
        // even though this one failed.
        if (created > 0) await refreshDueCounts();
        throw new ImportCommitError(created, err);
      }
    }

    await refreshDueCounts();
    return { created, skipped };
  }

  return {
    step,
    source,
    rows,
    mapping,
    results,
    counts,
    targetDeckId,
    decks,
    decksLoading,
    decksError,
    loadDecks,
    load,
    setMapping,
    verify,
    commit,
  };
}
