import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCardEditor } from '~/composables/useCardEditor';
import { db } from '~core/db/db';
import { cards, decks, items } from '~core/db/repositories';
import type { Card } from '~core/db/schema';
import { itemId } from '~core/db/schema';

const NOW = Date.parse('2026-09-16T08:00:00Z');

async function makeDeck(id = 'd1', name = 'HSK 1'): Promise<void> {
  await decks.put({
    id,
    name,
    description: '',
    colorToken: 'var(--chart-series-1)',
    tag: 'HSK',
    bundle: 'taiwan' as const, translationLang: 'en',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });
}

async function makeCard(over: Partial<Card> = {}): Promise<Card> {
  const card: Card = {
    id: 'c1',
    deckId: 'd1',
    hanzi: '學習',
    pinyin: [{ text: 'xué', tone: 2 }],
    zhuyin: 'ㄒㄩㄝˊ',
    translation: 'to study',
    pos: 'verb',
    example: '',
    examplePinyin: '',
    exampleTranslation: '',
    tags: [],
    note: '',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
  await cards.create(card, ['recognition', 'production'], NOW);
  return card;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** `useCardEditor` fires its own load immediately, outside any Vue lifecycle — this waits for it to settle. */
async function ready(editor: ReturnType<typeof useCardEditor>): Promise<void> {
  await vi.waitFor(() => expect(editor.loading.value).toBe(false));
}

describe('useCardEditor', () => {
  it('loads an existing card and fills the draft', async () => {
    await makeDeck();
    await makeCard();
    const editor = useCardEditor('c1');
    await ready(editor);

    expect(editor.notFound.value).toBe(false);
    expect(editor.draft.deckId).toBe('d1');
    expect(editor.draft.hanzi).toBe('學習');
    expect(editor.draft.pinyin).toBe('xué');
    expect(editor.draft.translation).toBe('to study');
    expect(editor.draft.pos).toBe('verb');
    expect(editor.directions.recognition).toBe(true);
    expect(editor.directions.production).toBe(true);
    expect(editor.preview.value.pinyin).toEqual([{ text: 'xué', tone: 2 }]);
  });

  it('saves a new card with the chosen directions', async () => {
    await makeDeck();
    const editor = useCardEditor();
    await ready(editor);

    editor.draft.hanzi = '你好';
    editor.draft.pinyin = 'ni3 hao3';
    editor.draft.translation = 'hello';
    editor.directions.production = false;

    const ok = await editor.save();
    expect(ok).toBe(true);

    const saved = (await cards.forDeck('d1')).find((c) => c.hanzi === '你好');
    expect(saved).toBeTruthy();
    const madeItems = await items.forCard(saved!.id);
    expect(madeItems.map((i) => i.dir)).toEqual(['recognition']);
  });

  it('saves an edit and applies the Task 9 direction rules', async () => {
    await makeDeck();
    await makeCard();
    const editor = useCardEditor('c1');
    await ready(editor);

    editor.draft.translation = 'to study, to learn';
    editor.directions.production = false;

    const ok = await editor.save();
    expect(ok).toBe(true);

    const updated = await cards.get('c1');
    expect(updated?.translation).toBe('to study, to learn');

    const productionItem = await items.get(itemId('c1', 'production'));
    expect(productionItem?.suspended).toBe(true);
    const recognitionItem = await items.get(itemId('c1', 'recognition'));
    expect(recognitionItem?.suspended).toBe(false);
  });

  it('blocks save on a duplicate hanzi in the same deck, with the validator issue', async () => {
    await makeDeck();
    await makeCard({ id: 'c1', hanzi: '學習' });
    await makeCard({ id: 'c2', hanzi: '你好' });
    const editor = useCardEditor('c2');
    await ready(editor);

    editor.draft.hanzi = '學習';
    const ok = await editor.save();

    expect(ok).toBe(false);
    expect(editor.issues.value).toContainEqual({ field: 'hanzi', severity: 'error', message: 'Already in this deck' });
  });

  it('does not flag an unchanged edit as a duplicate of itself (ruling 1)', async () => {
    await makeDeck();
    await makeCard();
    const editor = useCardEditor('c1');
    await ready(editor);

    expect(editor.issues.value.some((issue) => issue.message === 'Already in this deck')).toBe(false);
    const ok = await editor.save();
    expect(ok).toBe(true);
  });

  it('checks duplicates against the target deck when a card is moved (ruling 1)', async () => {
    await makeDeck('d1', 'HSK 1');
    await makeDeck('d2', 'HSK 2');
    await makeCard({ id: 'c1', deckId: 'd1', hanzi: '學習' });
    await makeCard({ id: 'c2', deckId: 'd2', hanzi: '學習' });

    const editor = useCardEditor('c1');
    await ready(editor);

    editor.draft.deckId = 'd2';
    await vi.waitFor(() => expect(editor.issues.value.some((issue) => issue.message === 'Already in this deck')).toBe(true));

    const ok = await editor.save();
    expect(ok).toBe(false);
  });

  it('sets notFound for an unknown id', async () => {
    const editor = useCardEditor('does-not-exist');
    await ready(editor);
    expect(editor.notFound.value).toBe(true);
  });

  it('sets notFound for a soft-deleted card', async () => {
    await makeDeck();
    await makeCard({ deletedAt: NOW });
    const editor = useCardEditor('c1');
    await ready(editor);
    expect(editor.notFound.value).toBe(true);
  });

  it('clearing example sends an empty string, not undefined', async () => {
    await makeDeck();
    await makeCard({ example: '我每天學習。', examplePinyin: 'wo3 mei3 tian1 xue2 xi2', exampleTranslation: 'I study every day.' });
    const editor = useCardEditor('c1');
    await ready(editor);

    editor.draft.example = '';
    editor.draft.examplePinyin = '';
    editor.draft.exampleTranslation = '';
    const ok = await editor.save();
    expect(ok).toBe(true);

    const updated = await cards.get('c1');
    expect(updated?.example).toBe('');
    expect(updated?.examplePinyin).toBe('');
    expect(updated?.exampleTranslation).toBe('');
  });

  it('recomputes zhuyin only when the pinyin actually changes', async () => {
    await makeDeck();
    await makeCard({ zhuyin: 'custom-should-be-kept' });
    const editor = useCardEditor('c1');
    await ready(editor);

    editor.draft.translation = 'changed, but not the pinyin';
    let ok = await editor.save();
    expect(ok).toBe(true);
    expect((await cards.get('c1'))?.zhuyin).toBe('custom-should-be-kept');

    editor.draft.pinyin = 'hao3';
    ok = await editor.save();
    expect(ok).toBe(true);
    expect((await cards.get('c1'))?.zhuyin).not.toBe('custom-should-be-kept');
    expect((await cards.get('c1'))?.zhuyin.length).toBeGreaterThan(0);
  });

  describe('a suspended card (final review I2)', () => {
    async function suspendAll(): Promise<void> {
      await items.setSuspended([itemId('c1', 'recognition'), itemId('c1', 'production')], true, NOW);
    }

    it('flags a fully suspended card, and its toggles show the directions it has', async () => {
      await makeDeck();
      await makeCard();
      await suspendAll();
      const editor = useCardEditor('c1');
      await ready(editor);

      expect(editor.suspended.value).toBe(true);
      expect(editor.directions.recognition).toBe(true);
      expect(editor.directions.production).toBe(true);
    });

    it('saves a fully suspended card unchanged: other fields update, it stays suspended', async () => {
      await makeDeck();
      await makeCard();
      await suspendAll();
      const editor = useCardEditor('c1');
      await ready(editor);

      editor.draft.translation = 'to learn';
      expect(await editor.save()).toBe(true);

      expect((await cards.get('c1'))?.translation).toBe('to learn');
      expect((await items.get(itemId('c1', 'recognition')))?.suspended).toBe(true);
      expect((await items.get(itemId('c1', 'production')))?.suspended).toBe(true);
    });

    it('does not flag a partly suspended card, and saving it unchanged keeps its items as they are', async () => {
      await makeDeck();
      await makeCard();
      await items.setSuspended([itemId('c1', 'production')], true, NOW);
      const editor = useCardEditor('c1');
      await ready(editor);

      expect(editor.suspended.value).toBe(false);
      expect(editor.directions.recognition).toBe(true);
      expect(editor.directions.production).toBe(false);

      expect(await editor.save()).toBe(true);
      expect((await items.get(itemId('c1', 'recognition')))?.suspended).toBe(false);
      expect((await items.get(itemId('c1', 'production')))?.suspended).toBe(true);
    });

    it('refuses a save with every direction off, with a reason', async () => {
      await makeDeck();
      await makeCard();
      const editor = useCardEditor('c1');
      await ready(editor);

      editor.directions.recognition = false;
      editor.directions.production = false;
      expect(await editor.save()).toBe(false);
      expect(editor.directionsError.value).toBe('Turn on at least one direction.');

      editor.directions.recognition = true;
      expect(editor.directionsError.value).toBe('');
    });
  });
});

describe('useCardEditor dirty state', () => {
  it('is clean when an existing card loads, dirty after an edit, clean once saved', async () => {
    await makeDeck();
    await makeCard({ pinyin: [{ text: 'xué', tone: 2 }, { text: 'xí', tone: 2 }] });
    const editor = useCardEditor('c1');
    await ready(editor);
    expect(editor.dirty.value).toBe(false);
    editor.draft.translation = 'to learn';
    expect(editor.dirty.value).toBe(true);
    expect(await editor.save()).toBe(true);
    expect(editor.dirty.value).toBe(false);
  });

  it('counts a toggled direction as a change', async () => {
    await makeDeck();
    await makeCard();
    const editor = useCardEditor('c1');
    await ready(editor);
    editor.directions.production = false;
    expect(editor.dirty.value).toBe(true);
  });

  it('is clean for a new card until something is typed, and clean again once created', async () => {
    await makeDeck();
    const editor = useCardEditor();
    await ready(editor);
    expect(editor.dirty.value).toBe(false);
    editor.draft.deckId = 'd1';
    expect(editor.dirty.value).toBe(false);
    editor.draft.hanzi = '朋友';
    editor.draft.pinyin = 'peng2 you5';
    editor.draft.translation = 'friend';
    expect(editor.dirty.value).toBe(true);
    expect(await editor.save()).toBe(true);
    expect(editor.dirty.value).toBe(false);
  });
});
