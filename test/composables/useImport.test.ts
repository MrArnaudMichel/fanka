import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImport } from '~/composables/useImport';
import { simplifiedCharactersIn } from '~core/chinese/script';
import { db } from '~core/db/db';
import { cards, decks, items } from '~core/db/repositories';
import type { Validated } from '~core/import/validate';

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

    importer.load(CSV);
    expect(importer.mapping.value?.hasHeader).toBe(true);

    importer.setMapping(importer.mapping.value!);
    await importer.verify();

    expect(importer.counts.value).toEqual({ valid: 1, warnings: 0, errors: 2 });

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
    again.load(CSV);
    again.setMapping(again.mapping.value!);
    await again.verify();
    expect(again.counts.value.valid).toBe(0);

    const secondCommit = await again.commit();
    expect(secondCommit.created).toBe(0);
    expect(await cards.forDeck('d1')).toHaveLength(1);
  });

  it('rejects a source with fewer than one data row', () => {
    const importer = useImport();
    expect(() => importer.load('hanzi,pinyin,translation')).toThrow();
    expect(() => importer.load('')).toThrow();
  });

  it('writes an outbox entry for every card it creates', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    importer.load(CSV);
    importer.setMapping(importer.mapping.value!);
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
    importer.load(rows.join('\n'));
    importer.setMapping(importer.mapping.value!);
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
    importer.load(['hanzi,pinyin,translation', '你好,ni3 hao3,hello', '你好,ni3 hao3,hello again'].join('\n'));
    importer.setMapping(importer.mapping.value!);
    await importer.verify();

    expect(importer.counts.value).toEqual({ valid: 1, warnings: 0, errors: 1 });
    const duplicateRow = importer.results.value.find((r: Validated) => !r.ok);
    expect(duplicateRow?.issues).toContainEqual({ field: 'hanzi', severity: 'error', message: 'Already in this deck' });

    const result = await importer.commit();
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('re-checks against the database at commit time, skipping a card created after verify()', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    importer.load(['hanzi,pinyin,translation', '你好,ni3 hao3,hello'].join('\n'));
    importer.setMapping(importer.mapping.value!);
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
    importer.load(['hanzi,pinyin,translation', '你好,ni3 hao3,hello'].join('\n'));
    importer.setMapping(importer.mapping.value!);
    await importer.verify();
    expect(importer.results.value.length).toBeGreaterThan(0);

    importer.targetDeckId.value = 'd2';
    expect(importer.results.value).toEqual([]);
  });

  it('takes the mapped zhuyin column when present, and derives it otherwise', async () => {
    await makeDeck();
    const importer = useImport();
    importer.targetDeckId.value = 'd1';
    importer.load(
      ['hanzi,pinyin,zhuyin,translation', '你好,ni3 hao3,custom-zhuyin,hello', '謝謝,xie4 xie5,,thanks'].join('\n'),
    );
    importer.setMapping(importer.mapping.value!);
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
