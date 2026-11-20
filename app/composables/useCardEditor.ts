import type { Bundle } from '~core/chinese/script';
import { type PinyinSyllable, parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { cards, decks as deckRepository, items } from '~core/db/repositories';
import type { Card, Deck, Direction, PartOfSpeech } from '~core/db/schema';
import { type CardDraft, type Issue, validateCard } from '~core/import/validate';
import { refreshDueCounts } from '~/composables/useDueCounts';

function uid(): string {
  return crypto.randomUUID();
}

export interface CardEditorDraft {
  deckId: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
  note: string;
}

export interface CardEditorDirections {
  recognition: boolean;
  production: boolean;
}

export interface CardPreview {
  pinyin: PinyinSyllable[];
  zhuyin: string;
}

/** The fields `cards.update`/`cards.create` need, all concrete — never `undefined` — so clearing an optional field always sends `''`, never drops the key. */
interface EditedFields {
  deckId: string;
  hanzi: string;
  pinyin: PinyinSyllable[];
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
  note: string;
}

function emptyDraft(): CardEditorDraft {
  return {
    deckId: '',
    hanzi: '',
    pinyin: '',
    translation: '',
    pos: 'noun',
    example: '',
    examplePinyin: '',
    exampleTranslation: '',
    tags: [],
    note: '',
  };
}

function toCardDraft(draft: CardEditorDraft): CardDraft {
  return {
    hanzi: draft.hanzi,
    pinyin: draft.pinyin,
    translation: draft.translation,
    example: draft.example,
    examplePinyin: draft.examplePinyin,
    exampleTranslation: draft.exampleTranslation,
    tags: draft.tags,
  };
}

/** Normalises a pinyin string (numbered or diacritic) to the joined diacritic form the schema stores — the same conversion the seed applies to `examplePinyin`. */
function normalisePinyinText(text: string): string {
  return parsePinyin(text)
    .map((s) => s.text)
    .join(' ');
}

function directionList(directions: CardEditorDirections): Direction[] {
  const list: Direction[] = [];
  if (directions.recognition) list.push('recognition');
  if (directions.production) list.push('production');
  return list;
}

/**
 * The card editor: loads an existing card (or defaults a new one), tracks
 * the draft and its live validation, and saves through the repositories.
 * This is the one seam `/cards/new` and `/cards/:id` (via `CardForm`) reach
 * the database through — see CLAUDE.md's "pages never touch Dexie directly".
 *
 * A fresh instance per call, the same as `useReviewSession` — never a module
 * singleton, since a new-card draft and an edit-card draft must never share
 * state.
 */
export function useCardEditor(id?: string) {
  const draft = reactive<CardEditorDraft>(emptyDraft());
  /** The form as last loaded or saved; null for a new card until it is first saved. */
  const baseline = ref<string | null>(null);
  const directions = reactive<CardEditorDirections>({ recognition: true, production: true });
  const loading = ref(true);
  const saving = ref(false);
  const notFound = ref(false);
  /**
   * The card or the deck list could not be read. The form must then never
   * render, and `save()` refuses — an empty draft saved from here would
   * create an orphan card with `deckId ''` (final review I3).
   */
  const error = ref(false);
  const deckList = ref<Deck[]>([]);
  const allTags = ref<string[]>([]);
  const existingHanzi = ref<Set<string>>(new Set());
  const existingCard = ref<Card | null>(null);
  /**
   * True when every one of the card's items is suspended — Browse's
   * Suspend. Suspension is Browse's to change, not the editor's: the
   * toggles then show the directions the card has items for (so they are
   * never all off), and a save leaves the items alone entirely.
   */
  const suspended = ref(false);
  /** The toggles as loaded, so `save()` can tell whether the learner actually changed a direction. */
  const loadedDirections = ref<CardEditorDirections | null>(null);
  /** Set by the first save attempt, so the "no direction" reason only shows once the learner has tried to save. */
  const saveAttempted = ref(false);

  const directionsError = computed(() =>
    saveAttempted.value && directionList(directions).length === 0 ? 'Turn on at least one direction.' : '',
  );

  function directionsChanged(): boolean {
    const loaded = loadedDirections.value;
    if (!loaded) return true;
    return loaded.recognition !== directions.recognition || loaded.production !== directions.production;
  }

  const preview = computed<CardPreview>(() => {
    const syllables = parsePinyin(draft.pinyin);
    return { pinyin: syllables, zhuyin: toZhuyin(syllables) };
  });

  /** The script the card must be written in: the target deck's bundle. */
  const bundle = computed<Bundle>(() => deckList.value.find((d) => d.id === draft.deckId)?.bundle ?? 'taiwan');

  const issues = computed<Issue[]>(() => validateCard(toCardDraft(draft), existingHanzi.value, bundle.value).issues);

  /**
   * Rebuilt from the target deck's visible cards, excluding the card being
   * edited — so re-saving a card unchanged is never flagged as a duplicate
   * of itself, and moving a card to another deck checks duplicates against
   * that deck (task-11-report.md's controller ruling 1). Watched so the
   * duplicate check follows the deck picker live, and re-read fresh inside
   * `save()` so a race with that watcher never saves against a stale set.
   */
  async function refreshExistingHanzi(): Promise<void> {
    if (!draft.deckId) {
      existingHanzi.value = new Set();
      return;
    }
    const deckCards = await cards.forDeck(draft.deckId);
    existingHanzi.value = new Set(deckCards.filter((c) => c.id !== existingCard.value?.id).map((c) => c.hanzi));
  }

  // `save()` re-reads the set itself, so a failure here only costs the
  // live duplicate hint until then — logged, never thrown into the watcher.
  watch(
    () => draft.deckId,
    () => refreshExistingHanzi().catch((err: unknown) => console.error('useCardEditor: failed to check duplicates', err)),
  );

  function formSnapshot(): string {
    return JSON.stringify({ draft, directions });
  }

  /** Never rejects — a failed read lands in `error`, for the page's Retry. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = false;
    notFound.value = false;
    try {
      const [liveDecks, allRows] = await Promise.all([deckRepository.listAll(), cards.list({ now: Date.now() })]);
      deckList.value = liveDecks;
      allTags.value = [...new Set(allRows.flatMap((row) => row.card.tags))].sort((a, b) => a.localeCompare(b));

      if (id) {
        const card = await cards.get(id);
        if (!card || card.deletedAt !== null) {
          notFound.value = true;
          return;
        }
        existingCard.value = card;
        draft.deckId = card.deckId;
        draft.hanzi = card.hanzi;
        draft.pinyin = card.pinyin.map((s) => s.text).join(' ');
        draft.translation = card.translation;
        draft.pos = card.pos;
        draft.example = card.example;
        draft.examplePinyin = card.examplePinyin;
        draft.exampleTranslation = card.exampleTranslation;
        draft.tags = [...card.tags];
        draft.note = card.note;

        const cardItems = await items.forCard(id);
        const byDir = new Map(cardItems.map((item) => [item.dir, item]));
        suspended.value = cardItems.length > 0 && cardItems.every((item) => item.suspended);
        // A fully suspended card shows the directions it has items for;
        // otherwise a toggle is on only while its item is live, and a
        // direction disabled through the editor shows off.
        const shows = (dir: Direction): boolean => {
          const item = byDir.get(dir);
          return Boolean(item && (suspended.value || !item.suspended));
        };
        directions.recognition = shows('recognition');
        directions.production = shows('production');
        loadedDirections.value = { recognition: directions.recognition, production: directions.production };
        baseline.value = formSnapshot();
      } else {
        // Ruling 6: the deck defaults to the first one. `?deck=<id>` (when
        // present and live) overrides this from the page, once loaded — see
        // CardForm's `defaultDeckId` watcher.
        draft.deckId = liveDecks[0]?.id ?? '';
      }

      await refreshExistingHanzi();
    } catch (err) {
      console.error('useCardEditor: failed to load', err);
      error.value = true;
    } finally {
      loading.value = false;
    }
  }

  void load();

  function buildFields(validatedDraft: CardDraft): EditedFields {
    return {
      deckId: draft.deckId,
      hanzi: validatedDraft.hanzi,
      pinyin: parsePinyin(validatedDraft.pinyin),
      translation: validatedDraft.translation,
      pos: draft.pos,
      example: validatedDraft.example ?? '',
      examplePinyin: normalisePinyinText(validatedDraft.examplePinyin ?? ''),
      exampleTranslation: validatedDraft.exampleTranslation ?? '',
      tags: validatedDraft.tags ?? [],
      note: draft.note,
    };
  }

  /**
   * Validates, then either creates a new card or patches the existing one.
   * Returns `false` (without throwing) on a validation error — a real save
   * failure (a rejected Dexie transaction) still throws, for the caller's
   * own try/catch and toast. `fields` never omits an optional key, so
   * clearing example/examplePinyin/exampleTranslation always sends `''`
   * rather than `undefined`, which `cards.update`'s `definedOnly` would
   * otherwise silently drop (see repositories.ts).
   */
  async function save(): Promise<boolean> {
    // Never save over a failed or unfinished load: with an id, only once
    // the card itself has been read.
    if (loading.value || error.value || notFound.value || (id && !existingCard.value)) return false;
    saving.value = true;
    saveAttempted.value = true;
    try {
      await refreshExistingHanzi();
      const validated = validateCard(toCardDraft(draft), existingHanzi.value, bundle.value);
      if (!validated.ok) return false;

      // `null` leaves the items untouched: an edit that did not change a
      // toggle — and any edit of a fully suspended card — must never
      // suspend, un-suspend or create an item as a side effect.
      const dirs = existingCard.value && (suspended.value || !directionsChanged()) ? null : directionList(directions);
      if (dirs !== null && dirs.length === 0) return false;

      const now = Date.now();
      const fields = buildFields(validated.draft);

      if (existingCard.value) {
        await cards.update(existingCard.value.id, fields, dirs, now);
        if (dirs !== null) loadedDirections.value = { recognition: directions.recognition, production: directions.production };
      } else {
        const card: Card = { id: uid(), ...fields, zhuyin: toZhuyin(fields.pinyin), createdAt: now, updatedAt: now, deletedAt: null };
        await cards.create(card, dirs ?? [], now);
        existingCard.value = card;
      }
      await refreshDueCounts();
      baseline.value = formSnapshot();
      return true;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Whether the form holds edits not yet saved, for the page's leave guard.
   * A loaded or saved card compares against that state; a new card counts as
   * changed once anything is typed (the deck alone, which defaults itself,
   * does not count).
   */
  const dirty = computed(() => {
    if (baseline.value !== null) return formSnapshot() !== baseline.value;
    if (id) return false;
    const typed = [draft.hanzi, draft.pinyin, draft.translation, draft.example, draft.examplePinyin, draft.exampleTranslation, draft.note];
    return typed.some((value) => value.trim() !== '') || draft.tags.length > 0;
  });

  return {
    draft,
    directions,
    dirty,
    issues,
    preview,
    save,
    loading,
    saving,
    notFound,
    error,
    retry: load,
    suspended,
    directionsError,
    decks: deckList,
    allTags,
  };
}
