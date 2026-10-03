import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImport } from '~/composables/useImport';
import { simplifiedCharactersIn } from '~core/chinese/script';
import { db } from '~core/db/db';
import { cards, decks, items } from '~core/db/repositories';
import { REPEATED_MESSAGE } from '~core/import/rows';

const NOW = Date.parse('2026-09-16T08:00:00Z');

async function makeDeck(id = 'd1', name = 'HSK 1'): Promise<void> {
  await decks.put({
    id,
    name,
    description: '',
    colorToken: 'var(--chart-series-1)',
    tag: 'HSK',
    translationLang: 'en',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/**
 * Header, a quoted field with an embedded newline (exercises
 * `parseDelimited`'s multi-line quoting), a simplified row, a duplicate of
 * the valid row, and the one valid row itself — the brief's Step 1 scenario
 * (task-14-brief.md).
 */
const CSV = [
  'hanzi,pinyin,translation',
  '學習,xue2 xi2,"to study,',
  'to learn"',
  '学习,xue2 xi2,to study',
  '學習,xue2 xi2,duplicate',
].join('\n');

describe('useImport', () => {
  it('counts valid/warning/error rows, commits only the valid one, and re-importing creates nothing', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';

    await importer.load(CSV);
    expect(importer.mapping.value?.hasHeader).toBe(true);

    await importer.setMapping(importer.mapping.value!);
    await importer.verify();

    expect(importer.counts.value).toEqual({ valid: 1, warnings: 0, errors: 2, duplicates: 0 });

    const result = await importer.commit();
    expect(result.created).toBe(1);

    const deckCards = await cards.forDeck('d1');
    expect(deckCards).toHaveLength(1);
    expect(deckCards[0]?.hanzi).toBe('學習');
    expect(deckCards[0]?.pinyin).toEqual([
      { text: 'xué', tone: 2 },
      { text: 'xí', tone: 2 },
    ]);

    const madeItems = await items.forCard(deckCards[0]!.id);
    expect(madeItems.map((i) => i.dir).sort()).toEqual(['production', 'recognition']);

    // Re-importing the same file into the same deck: the once-valid row is
    // now a duplicate, so nothing new is created.
    const again = useImport();
    again.targetDeckId.value = 'd1';
    await again.load(CSV);
    await again.setMapping(again.mapping.value!);
    await again.verify();
    expect(again.counts.value.valid).toBe(0);
    expect(again.counts.value.duplicates).toBe(1);

    const secondCommit = await again.commit();
    expect(secondCommit.created).toBe(0);
    expect(await cards.forDeck('d1')).toHaveLength(1);
  });

  it('commits every column of the documented CSV format, tags included', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(
      [
        'hanzi,pinyin,zhuyin,translation,example,example pinyin,example translation,tags',
        '電腦,diàn nǎo,ㄉㄧㄢˋ ㄋㄠˇ,computer,"這台電腦很快,也很便宜。","Zhè tái diànnǎo hěn kuài, yě hěn piányí.","This computer is fast, and cheap too.",tech;hsk1',
      ].join('\n'),
    );
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();

    expect(await importer.commit()).toEqual({ created: 1, updated: 0, skipped: 0 });
    const [card] = await cards.forDeck('d1');
    expect(card).toMatchObject({ hanzi: '電腦', zhuyin: 'ㄉㄧㄢˋ ㄋㄠˇ', tags: ['tech', 'hsk1'] });
  });

  it('rejects a source with fewer than one data row', async () => {
    const importer = useImport();
    await expect(importer.load('hanzi,pinyin,translation')).rejects.toThrow();
    await expect(importer.load('')).rejects.toThrow();
  });

  it('writes an outbox entry for every card it creates', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(CSV);
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();
    await importer.commit();

    const pending = await db.outbox.toArray();
    const deckCards = await cards.forDeck('d1');
    expect(pending.some((e) => e.entity === 'card' && e.entityId === deckCards[0]!.id)).toBe(true);
  });

  it('batches a large import into multiple transactions of at most 200 rows, every card getting an outbox entry', async () => {
    await makeDeck();
    const rows = ['hanzi,pinyin,translation'];
    let codepoint = 0x4e00;
    for (let i = 0; i < 450; i += 1) {
      // Distinct single-character hanzi are not required to be real Chinese
      // words for this test — only distinct and traditional — so this walks
      // the CJK Unified Ideographs block, skipping any codepoint that is a
      // simplified-only character (simplifiedCharactersIn), until it has
      // 450 usable ones.
      let char = String.fromCodePoint(codepoint);
      codepoint += 1;
      while (simplifiedCharactersIn(char).length > 0) {
        char = String.fromCodePoint(codepoint);
        codepoint += 1;
      }
      rows.push(`${char},ma1,word ${i}`);
    }
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(rows.join('\n'));
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();
    expect(importer.counts.value.valid).toBe(450);

    const transactionSpy = vi.spyOn(db, 'transaction');
    const result = await importer.commit();
    expect(result.created).toBe(450);
    expect(transactionSpy).toHaveBeenCalledTimes(3);
    transactionSpy.mockRestore();

    const deckCards = await cards.forDeck('d1');
    expect(deckCards).toHaveLength(450);
    const pending = await db.outbox.toArray();
    const cardEntries = pending.filter((e) => e.entity === 'card');
    expect(cardEntries).toHaveLength(450);
    for (const card of deckCards) {
      const cardItems = await items.forCard(card.id);
      expect(cardItems).toHaveLength(2);
    }
  });

  it('catches a duplicate inside the file itself, not just against the deck', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(['hanzi,pinyin,translation', '你好,ni3 hao3,hello', '你好,ni3 hao3,hello again'].join('\n'));
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();

    expect(importer.counts.value).toEqual({ valid: 1, warnings: 0, errors: 1, duplicates: 0 });
    const repeatedRow = importer.results.value.find((r) => !r.ok);
    expect(repeatedRow?.issues).toContainEqual({ field: 'hanzi', severity: 'error', message: REPEATED_MESSAGE });

    // The repeated row is an error, never counted as skipped.
    expect(await importer.commit()).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('re-checks against the database at commit time, skipping a card created after verify()', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(['hanzi,pinyin,translation', '你好,ni3 hao3,hello'].join('\n'));
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();
    expect(importer.counts.value.valid).toBe(1);

    // A concurrent add lands between verify() and commit() — the scenario
    // ruling 2 (task-14-report.md) exists for.
    await cards.create(
      {
        id: 'concurrent',
        deckId: 'd1',
        hanzi: '你好',
        pinyin: [{ text: 'nǐ', tone: 3 }, { text: 'hǎo', tone: 3 }],
        zhuyin: '',
        translation: 'hi',
        pos: 'noun',
        example: '',
        examplePinyin: '',
        exampleTranslation: '',
        tags: [],
        note: '',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
      ['recognition'],
      NOW,
    );

    const result = await importer.commit();
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await cards.forDeck('d1')).toHaveLength(1);
  });

  it('invalidates results when the target deck changes after verifying', async () => {
    await makeDeck('d1', 'HSK 1');
    await makeDeck('d2', 'HSK 2');
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(['hanzi,pinyin,translation', '你好,ni3 hao3,hello'].join('\n'));
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();
    expect(importer.results.value.length).toBeGreaterThan(0);

    importer.targetDeckId.value = 'd2';
    expect(importer.results.value).toEqual([]);
  });

  it('takes the mapped zhuyin column when present, and derives it otherwise', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    await importer.load(
      ['hanzi,pinyin,zhuyin,translation', '你好,ni3 hao3,custom-zhuyin,hello', '謝謝,xie4 xie5,,thanks'].join('\n'),
    );
    await importer.setMapping(importer.mapping.value!);
    await importer.verify();
    await importer.commit();

    const deckCards = await cards.forDeck('d1');
    const withColumn = deckCards.find((c) => c.hanzi === '你好');
    const withoutColumn = deckCards.find((c) => c.hanzi === '謝謝');
    expect(withColumn?.zhuyin).toBe('custom-zhuyin');
    expect(withoutColumn?.zhuyin.length).toBeGreaterThan(0);
    expect(withoutColumn?.zhuyin).not.toBe('custom-zhuyin');
  });
});

describe('remembered mapping', () => {
  it('reuses the mapping saved for the same headers', async () => {
    const first = useImport();
    await first.load('Front,Back,Sound\n朋友,friend,peng2 you5');
    await first.setMapping({ columns: ['hanzi', 'translation', 'pinyin'], hasHeader: true });

    const second = useImport();
    await second.load('front,back,sound\n老師,teacher,lao3 shi1');
    expect(second.mapping.value).toEqual({ columns: ['hanzi', 'translation', 'pinyin'], hasHeader: true });
    expect(second.mappingRemembered.value).toBe(true);
  });

  it('ignores a saved mapping with a different column count', async () => {
    const first = useImport();
    await first.load('Front,Back\n朋友,friend');
    await first.setMapping({ columns: ['hanzi', 'translation'], hasHeader: true });
    const second = useImport();
    await second.load('Front,Back,Extra\n朋友,friend,x');
    expect(second.mappingRemembered.value).toBe(false);
  });
});

async function makeExistingCard(): Promise<string> {
  await makeDeck();
  await cards.create(
    {
      id: 'existing',
      deckId: 'd1',
      hanzi: '朋友',
      pinyin: [{ text: 'péng', tone: 2 }, { text: 'yǒu', tone: 5 }],
      zhuyin: '',
      translation: 'friend',
      pos: 'noun',
      example: '',
      examplePinyin: '',
      exampleTranslation: '',
      tags: [],
      note: '',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    },
    ['recognition', 'production'],
    NOW,
  );
  return 'existing';
}

describe('duplicates', () => {
  it('skips cards already in the deck by default', async () => {
    await makeExistingCard();
    const imp = useImport();
    imp.targetDeckId.value = 'd1';
    await imp.load('hanzi,pinyin,translation\n朋友,peng2 you5,pal\n老師,lao3 shi1,teacher');
    await imp.verify();
    expect(imp.counts.value).toEqual({ valid: 1, warnings: 0, errors: 0, duplicates: 1 });
    expect(imp.results.value[0]).toMatchObject({ ok: true, duplicate: true });
    expect(await imp.commit()).toEqual({ created: 1, updated: 0, skipped: 1 });
  });

  it('updates their content and keeps their items with Update', async () => {
    const existingCardId = await makeExistingCard();
    const imp = useImport();
    imp.targetDeckId.value = 'd1';
    await imp.load('hanzi,pinyin,translation\n朋友,peng2 you5,pal');
    await imp.verify();
    imp.duplicatePolicy.value = 'update';
    const itemsBefore = await db.items.where('cardId').equals(existingCardId).toArray();
    expect(await imp.commit()).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect((await db.cards.get(existingCardId))?.translation).toBe('pal');
    expect(await db.items.where('cardId').equals(existingCardId).toArray()).toEqual(itemsBefore);
    expect((await db.outbox.toArray()).some((o) => o.entity === 'card' && o.entityId === existingCardId)).toBe(true);
  });
});

describe('re-importing the same file with Update', () => {
  it('leaves cards it would not change alone, with no sync write', async () => {
    const existingCardId = await makeExistingCard();
    const csv = 'hanzi,pinyin,translation\n朋友,peng2 you5,pal';
    const first = useImport();
    first.targetDeckId.value = 'd1';
    await first.load(csv);
    await first.verify();
    first.duplicatePolicy.value = 'update';
    expect(await first.commit()).toEqual({ created: 0, updated: 1, skipped: 0 });
    const stamped = (await db.cards.get(existingCardId))!.updatedAt;
    await db.outbox.clear();

    const again = useImport();
    again.targetDeckId.value = 'd1';
    await again.load(csv);
    await again.verify();
    again.duplicatePolicy.value = 'update';
    expect(await again.commit()).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect((await db.cards.get(existingCardId))!.updatedAt).toBe(stamped);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('fixRow', () => {
  it('re-validates the edited row in place', async () => {
    await makeDeck();
    const imp = useImport();
    imp.targetDeckId.value = 'd1';
    await imp.load('hanzi,pinyin,translation\n老師,lao3 shi1,\n學生,xue2 sheng1,student');
    await imp.verify();
    expect(imp.results.value[0]!.ok).toBe(false);
    imp.fixRow(0, { hanzi: '老師', pinyin: 'lao3 shi1', translation: 'teacher' });
    expect(imp.results.value[0]!.ok).toBe(true);
    expect(imp.results.value[1]!.draft.hanzi).toBe('學生');
    expect(imp.counts.value.valid).toBe(2);
  });
});
describe('fixRow after the results were invalidated', () => {
  it('does nothing once the destination deck changes, rather than rebuilding results for the old deck', async () => {
    await makeDeck();
    const imp = useImport();
    imp.targetDeckId.value = 'd1';
    await imp.load('hanzi,pinyin,translation\n老師,lao3 shi1,');
    await imp.verify();
    imp.targetDeckId.value = 'other';
    imp.fixRow(0, { hanzi: '老師', pinyin: 'lao3 shi1', translation: 'teacher' });
    expect(imp.results.value).toEqual([]);
  });

  it('ignores an index outside the rows', async () => {
    await makeDeck();
    const imp = useImport();
    imp.targetDeckId.value = 'd1';
    await imp.load('hanzi,pinyin,translation\n學生,xue2 sheng1,student');
    await imp.verify();
    imp.fixRow(5, { hanzi: '老師', pinyin: 'lao3 shi1', translation: 'teacher' });
    expect(imp.results.value.map((r) => r.draft.hanzi)).toEqual(['學生']);
  });
});

