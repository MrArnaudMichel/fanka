import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { parsePinyin } from '../../core/chinese/pinyin';
import { toZhuyin } from '../../core/chinese/zhuyin';

interface Entry {
  id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  pos: string;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
}

const source = JSON.parse(readFileSync(fileURLToPath(new URL('../../core/seed/data/hsk1.json', import.meta.url)), 'utf-8')) as {
  id: string;
  name: string;
  description: string;
  colorToken: string;
  tag: string;
  cards: Entry[];
};

/**
 * The app no longer seeds a deck, so specs that need cards to study start by
 * writing the old 20-word "HSK 1 — traditional" deck (ids `hsk1-traditional:hsk1-01`...)
 * straight into IndexedDB, then reload so the app reads it. Call it on a page
 * the onboarding fixture has already brought to the app.
 */
export async function seedStarterDeck(page: Page): Promise<void> {
  const rows = source.cards.map((entry) => {
    const pinyin = parsePinyin(entry.pinyin);
    return {
      id: `${source.id}:${entry.id}`,
      hanzi: entry.hanzi,
      pinyin,
      zhuyin: toZhuyin(pinyin),
      translation: entry.translation,
      pos: entry.pos,
      example: entry.example,
      examplePinyin: parsePinyin(entry.examplePinyin).map((s) => s.text).join(' '),
      exampleTranslation: entry.exampleTranslation,
      tags: entry.tags,
    };
  });
  const deck = { id: source.id, name: source.name, description: source.description, colorToken: source.colorToken, tag: source.tag };

  await page.evaluate(
    ({ deck: d, rows: cardRows }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('fanka');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['decks', 'cards', 'items'], 'readwrite');
          tx.onerror = () => reject(tx.error);
          const now = Date.now();
          tx.objectStore('decks').put({ ...d, bundle: 'taiwan', translationLang: 'en', createdAt: now, updatedAt: now, deletedAt: null });
          for (const row of cardRows) {
            tx.objectStore('cards').put({ ...row, deckId: d.id, note: '', createdAt: now, updatedAt: now, deletedAt: null });
            for (const dir of ['recognition', 'production']) {
              tx.objectStore('items').put({
                id: `${row.id}:${dir}`,
                cardId: row.id,
                dir,
                suspended: false,
                updatedAt: now,
                state: 'new',
                due: now,
                stability: 0,
                difficulty: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                reps: 0,
                lapses: 0,
                learningSteps: 0,
                lastReview: null,
              });
            }
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    { deck, rows },
  );
  await page.reload();
}
