import { type Delimiter, detectDelimiter, parseDelimited } from '~core/import/parse';
import { type Mapping, applyMapping, guessMapping, headerSignature } from '~core/import/mapping';
import type { CardDraft } from '~core/import/validate';
import { type DuplicatePolicy, type ImportRow, normalisePinyinText, updatedCardFromDraft, validateImportRows } from '~core/import/rows';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { db } from '~core/db/db';
import { findImportMapping, saveImportMapping } from '~core/db/import-mappings';
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
  duplicates: number;
}

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

/**
 * One batch, one Dexie transaction, outbox entries included. The deck's live
 * cards are read fresh inside this transaction — not carried over from
 * `verify()` — so a card created by an earlier batch, or by anything else,
 * is always seen (ruling 2). A hanzi already present is skipped or updated
 * per `policy`; updating rewrites the card only, so its items keep their
 * progress.
 */
async function commitBatch(
  deckId: string,
  batch: ImportRow[],
  policy: DuplicatePolicy,
  now: number,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction('rw', db.cards, db.items, db.outbox, async () => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    const byHanzi = new Map(deckCards.filter((c) => c.deletedAt === null).map((c) => [c.hanzi, c]));

    for (const row of batch) {
      const draft = row.draft;
      const existing = byHanzi.get(draft.hanzi);
      if (existing) {
        if (policy === 'skip') {
          skipped += 1;
          continue;
        }
        const next = updatedCardFromDraft(existing, draft, now);
        await db.cards.put(next);
        await db.outbox.put(outboxEntry('card', next.id, 'put', now));
        byHanzi.set(next.hanzi, next);
        updated += 1;
        continue;
      }

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
        // `draft` comes out of the reactive `results`, so `tags` is a Vue
        // proxy; IndexedDB cannot structured-clone one (DataCloneError).
        tags: [...(draft.tags ?? [])],
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
      byHanzi.set(card.hanzi, card);
      created += 1;
    }
  });

  return { created, updated, skipped };
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
  const results = ref<ImportRow[]>([]);
  const duplicatePolicy = ref<DuplicatePolicy>('skip');
  /** The drafts and deck hanzi the current results were built from, so one row can be fixed and everything re-checked. */
  let drafts: CardDraft[] = [];
  let deckHanzi: ReadonlySet<string> = new Set();
  const targetDeckId = ref<string | null>(null);
  const decks = ref<Deck[]>([]);
  const decksLoading = ref(true);
  /** The destination-deck list could not be read — the page shows Retry, never "no decks" (final review I3). */
  const decksError = ref(false);
  const mappingRemembered = ref(false);

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
    let duplicates = 0;
    for (const row of results.value) {
      if (!row.ok) {
        errors += 1;
        continue;
      }
      if (row.duplicate) duplicates += 1;
      else valid += 1;
      if (row.issues.some((issue) => issue.severity === 'warning')) warnings += 1;
    }
    return { valid, warnings, errors, duplicates };
  });

  // Ruling 5: changing the deck after verifying invalidates the results —
  // duplicate-checking depends on which deck's cards `deckHanzi` (the deck's cards) reads.
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
   * Detects the delimiter, parses `text` into `rows`, and picks a mapping:
   * the one saved for this header when its column count still fits,
   * otherwise a guess. Throws (and touches neither `rows` nor `mapping`) on
   * fewer than one data row — the caller shows that inline (ruling 4).
   */
  async function load(text: string): Promise<void> {
    const delimiter: Delimiter = detectDelimiter(text);
    const parsed = parseDelimited(text, delimiter);
    const guessed = guessMapping(parsed);
    const saved = parsed[0] ? await findImportMapping(headerSignature(parsed[0])).catch(() => null) : null;
    const remembered = saved !== null && saved.length === parsed[0]!.length;
    const chosen: Mapping = remembered ? { columns: saved, hasHeader: true } : guessed;
    const dataRowCount = chosen.hasHeader ? parsed.length - 1 : parsed.length;
    if (dataRowCount < 1) {
      throw new Error('No data rows found in that source.');
    }
    rows.value = parsed;
    mapping.value = chosen;
    mappingRemembered.value = remembered;
    results.value = [];
  }

  /** Sets the mapping step 3 verifies, and remembers it for this header. A failed save is logged, never thrown. */
  async function setMapping(m: Mapping): Promise<void> {
    mapping.value = m;
    const header = rows.value[0];
    if (!m.hasHeader || !header) return;
    try {
      await saveImportMapping(headerSignature(header), m.columns, Date.now());
    } catch (err) {
      console.error('useImport: could not remember the mapping', err);
    }
  }

  /**
   * Validates every mapped row against the destination deck's live cards.
   * A hanzi already in the deck is a duplicate (skip or update at commit);
   * the same hanzi twice in the file is an error.
   */
  async function verify(): Promise<void> {
    if (!mapping.value || !targetDeckId.value) {
      results.value = [];
      return;
    }
    drafts = applyMapping(rows.value, mapping.value);
    deckHanzi = new Set((await cards.forDeck(targetDeckId.value)).map((c) => c.hanzi));
    results.value = validateImportRows(drafts, deckHanzi);
  }

  /** Step 3's side panel: replaces one row's draft and re-checks every row, so a fix that clashes with another row is caught. */
  function fixRow(index: number, draft: CardDraft): void {
    drafts = drafts.map((d, i) => (i === index ? draft : d));
    results.value = validateImportRows(drafts, deckHanzi);
  }

  /**
   * Writes every valid row in batches of `BATCH_SIZE`, each its own
   * transaction. `skipped` counts duplicates left alone under Skip; rows with
   * an error are never counted — the page already shows them as errors. A
   * batch that throws leaves every earlier batch committed and writes nothing
   * itself; `ImportCommitError` carries how many cards exist so far so the
   * caller can say so.
   */
  async function commit(): Promise<{ created: number; updated: number; skipped: number }> {
    const deckId = targetDeckId.value;
    if (!deckId) throw new Error('No destination deck selected.');

    const validRows = results.value.filter((row) => row.ok);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      try {
        const result = await commitBatch(deckId, batch, duplicatePolicy.value, Date.now());
        created += result.created;
        updated += result.updated;
        skipped += result.skipped;
      } catch (err) {
        if (created > 0) await refreshDueCounts();
        throw new ImportCommitError(created, err);
      }
    }

    await refreshDueCounts();
    return { created, updated, skipped };
  }

  return {
    step,
    source,
    rows,
    mapping,
    results,
    counts,
    duplicatePolicy,
    targetDeckId,
    decks,
    decksLoading,
    decksError,
    mappingRemembered,
    loadDecks,
    load,
    setMapping,
    verify,
    fixRow,
    commit,
  };
}
