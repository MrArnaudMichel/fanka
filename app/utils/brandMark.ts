/**
 * Fanka's mark: a flashcard mid-flip, F on the back, 繁 on the front. One
 * geometry, on a 1024 canvas, for BrandMark.vue (coloured with CSS tokens) and
 * scripts/build-brand.mjs (coloured with the same tokens, resolved). Colours
 * are not here: each side reads them from Kanto its own way.
 */
export const BRAND_MARK = {
  /** Centres the tilted pair, whose own box spans x 140–850 and y 117–803. */
  offset: { x: 17, y: 52 },
  card: { width: 380, height: 520, radius: 44 },
  /** Behind, tilted up to the right, primary colour, carries the F. */
  back: { x: 140, y: 170, skewY: -8 },
  /** In front, tilted down to the right, lifted by a shadow, carries 繁. */
  front: { x: 470, y: 230, skewY: 8 },
  /** Both glyphs sit at the card's centre; `baseline` is the text's y in card space. */
  latin: { text: 'F', size: 320, weight: 800, baseline: 375 },
  hanzi: { text: '繁', size: 280, weight: 700, baseline: 366 },
} as const;
