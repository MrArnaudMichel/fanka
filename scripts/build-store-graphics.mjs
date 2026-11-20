// Play Console listing graphics, from the same 繁 mark and brand primary as
// the launcher icon (docs/android.md). Run: node scripts/build-store-graphics.mjs
// Output: store/icon-512.png (512×512, 32-bit) and store/feature-graphic.png
// (1024×500, no alpha), as Play requires.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const BRAND = '#6562F8'; // Kanto brand primary, as in the launcher icon
const LOGO = 'assets/logo.png';
const OUT = 'store';

mkdirSync(OUT, { recursive: true });

async function icon() {
  const mark = await sharp(LOGO).resize(360, 360).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BRAND } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/icon-512.png`);
}

async function featureGraphic() {
  const mark = await sharp(LOGO).resize(300, 300).toBuffer();
  const text = Buffer.from(`
    <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
      <text x="440" y="235" font-family="sans-serif" font-weight="700"
            font-size="104" fill="#FFFFFF">Fanka</text>
      <text x="444" y="300" font-family="sans-serif" font-size="34"
            fill="#FFFFFF" fill-opacity="0.85">Learn Traditional Chinese</text>
      <text x="444" y="345" font-family="sans-serif" font-size="34"
            fill="#FFFFFF" fill-opacity="0.85">with spaced repetition</text>
    </svg>`);
  await sharp({ create: { width: 1024, height: 500, channels: 3, background: BRAND } })
    .composite([
      { input: mark, left: 100, top: 100 },
      { input: text, left: 0, top: 0 },
    ])
    .flatten({ background: BRAND })
    .removeAlpha()
    .png()
    .toFile(`${OUT}/feature-graphic.png`);
}

await icon();
await featureGraphic();
console.log(`Wrote ${OUT}/icon-512.png and ${OUT}/feature-graphic.png`);
