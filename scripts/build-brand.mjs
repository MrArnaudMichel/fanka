#!/usr/bin/env node
/**
 * Every image of Fanka's mark, from app/utils/brandMark.ts and Kanto's
 * tokens. Run from the repo root after changing either, then
 * `npx capacitor-assets generate --android` (see docs/android.md):
 *
 *   node scripts/build-brand.mjs
 *
 * Needs Manrope and Noto Serif CJK TC installed: the text is rasterised here,
 * and the PNGs are committed, so CI never runs this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { BRAND_MARK as M } from '../app/utils/brandMark.ts';
import { icoFromPngs } from './brand/ico.mjs';
import { kantoColour } from './brand/kanto-colour.mjs';

const C = {
  page: kantoColour('dark', '--color-dark-12'),
  shadow: kantoColour('dark', '--color-dark-8'),
  back: kantoColour('dark', '--color-primary-base'),
  latin: kantoColour('dark', '--color-white'),
  front: kantoColour('light', '--color-dark-8'),
  hanzi: kantoColour('dark', '--color-dark-12'),
  title: kantoColour('dark', '--color-text-100'),
  tagline: kantoColour('dark', '--color-text-400'),
};
const LATIN_FONT = 'Manrope'; // Kanto's --font-family-display
const HANZI_FONT = 'Noto Serif CJK TC';

/** The mark's two cards on a 1024 canvas, optionally scaled about its centre. */
function cards(scale = 1) {
  const { card, back, front, latin, hanzi, offset } = M;
  const cx = card.width / 2;
  const rect = (fill) => `<rect width="${card.width}" height="${card.height}" rx="${card.radius}" fill="${fill}"/>`;
  return (
    `<g transform="translate(512 512) scale(${scale}) translate(-512 -512) translate(${offset.x} ${offset.y})">` +
    `<g transform="translate(${back.x} ${back.y}) skewY(${back.skewY})">${rect(C.back)}` +
    `<text x="${cx}" y="${latin.baseline}" font-family="${LATIN_FONT}" font-weight="${latin.weight}" font-size="${latin.size}" fill="${C.latin}" text-anchor="middle">${latin.text}</text></g>` +
    `<g filter="url(#lift)" transform="translate(${front.x} ${front.y}) skewY(${front.skewY})">${rect(C.front)}` +
    `<text x="${cx}" y="${hanzi.baseline}" font-family="${HANZI_FONT}" font-weight="${hanzi.weight}" font-size="${hanzi.size}" fill="${C.hanzi}" text-anchor="middle">${hanzi.text}</text></g>` +
    `</g>`
  );
}

const LIFT = `<filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="22"/><feOffset dy="22" result="b"/><feFlood flood-color="${C.shadow}" flood-opacity="0.6"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

const markSvg = ({ background = true, scale = 1 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>${LIFT}</defs>` +
  (background ? `<rect width="1024" height="1024" fill="${C.page}"/>` : '') +
  cards(scale) +
  `</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png();
const solid = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: C.page } });

// Play: the full-bleed icon (Play rounds it) and the feature graphic.
await png(markSvg(), 512).toFile('store/icon-512.png');

const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <text x="470" y="230" font-family="${LATIN_FONT}" font-weight="800" font-size="120" fill="${C.title}">Fanka</text>
  <text x="474" y="300" font-family="${LATIN_FONT}" font-weight="500" font-size="38" fill="${C.tagline}">Learn Mandarin Chinese</text>
  <text x="474" y="350" font-family="${LATIN_FONT}" font-weight="500" font-size="38" fill="${C.tagline}">Mainland or Taiwan</text>
</svg>`;
await solid(1024, 500)
  .composite([
    { input: await png(markSvg({ background: false }), 440).toBuffer(), left: 30, top: 30 },
    { input: Buffer.from(feature), left: 0, top: 0 },
  ])
  .flatten({ background: C.page })
  .removeAlpha()
  .png()
  .toFile('store/feature-graphic.png');

// Capacitor sources (assets/), turned into every Android density by
// capacitor-assets. The adaptive foreground is drawn inside a 16.7% inset by
// mipmap-anydpi-v26, which already keeps it within the launcher's safe zone.
mkdirSync('assets', { recursive: true });
await png(markSvg(), 1024).toFile('assets/icon-only.png');
await png(markSvg({ background: false }), 1024).toFile('assets/icon-foreground.png');
await solid(1024, 1024).png().toFile('assets/icon-background.png');
const splash = await solid(2732, 2732)
  .composite([{ input: await png(markSvg({ background: false }), 900).toBuffer(), gravity: 'center' }])
  .png()
  .toBuffer();
writeFileSync('assets/splash.png', splash);
writeFileSync('assets/splash-dark.png', splash);

// Android: the colour behind the adaptive icon and the Android 12+ splash
// screen (styles.xml), which cannot read a CSS token.
writeFileSync(
  'android/app/src/main/res/values/ic_launcher_background.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by scripts/build-brand.mjs: Kanto's color-dark-12 token, dark theme. -->
<resources>
    <color name="ic_launcher_background">${C.page}</color>
</resources>
`,
);

// Web: favicon.ico with 16, 32 and 48 px PNGs.
const sizes = [16, 32, 48];
const icons = await Promise.all(sizes.map(async (size) => ({ size, data: await png(markSvg(), size).toBuffer() })));
writeFileSync('public/favicon.ico', icoFromPngs(icons));

console.log('Wrote store/icon-512.png, store/feature-graphic.png, assets/icon-*.png, assets/splash*.png, public/favicon.ico');
