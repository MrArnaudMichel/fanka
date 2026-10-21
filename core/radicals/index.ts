import { RADICALS, type Radical, type RadicalPosition } from './data';

export * from './data';

/** Stable id for a radical, from its Kangxi number. */
export function radicalId(radical: Pick<Radical, 'number'>): string {
  return `kangxi-${radical.number}`;
}

export function findRadical(id: string): Radical | undefined {
  return RADICALS.find((r) => radicalId(r) === id);
}

/** Every form of a radical: the full one first, then the forms it takes inside characters. */
export function radicalForms(radical: Pick<Radical, 'radical' | 'variants'>): string[] {
  return [radical.radical, ...radical.variants.map((v) => v.form)];
}

const POSITION_WORDS: Record<RadicalPosition, string> = {
  left: 'on the left',
  right: 'on the right',
  top: 'on top',
  bottom: 'at the bottom',
  wrap: 'wrapped round the bottom left',
};

/** "Written 亻 on the left", one clause per variant; empty when it has none. */
export function variantText(radical: Pick<Radical, 'variants'>): string {
  return radical.variants.map((v) => `Written ${v.form} ${POSITION_WORDS[v.position]}`).join('. ');
}

/** Matches on the radical, its forms, pinyin with or without tones, meaning or an example. */
export function matchesQuery(radical: Radical, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const haystack = [...radicalForms(radical), radical.pinyin, radical.meaning, ...radical.examples.flatMap((e) => [e.hanzi, e.meaning])];
  return haystack.some((text) => fold(text).includes(q));
}

/** Lower case without tone marks, so "shui" finds shuǐ. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}/gu, '').replace(/ü/g, 'u').toLowerCase();
}
