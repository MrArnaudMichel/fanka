import { describe, expect, it } from 'vitest';
import { kantoColour } from '../../scripts/brand/kanto-colour.mjs';
import { icoFromPngs } from '../../scripts/brand/ico.mjs';
import { BRAND_MARK } from '../../app/utils/brandMark';

describe('kantoColour', () => {
  it('resolves the accent through its default', () => {
    expect(kantoColour('dark', '--color-primary-base')).toBe('#5f5dea');
    expect(kantoColour('light', '--color-primary-base')).toBe('#5f5dea');
  });

  it('converts the oklch neutrals with the default tint', () => {
    expect(kantoColour('dark', '--color-text-100')).toBe('#f4f4f5');
    expect(kantoColour('dark', '--color-dark-12')).toBe('#1d1c22');
  });

  it('reads the light theme over the dark one', () => {
    expect(kantoColour('light', '--color-dark-8')).toBe('#ffffff');
    expect(kantoColour('dark', '--color-dark-8')).toBe('#131216');
  });

  it('refuses a name Kanto does not define', () => {
    expect(() => kantoColour('dark', '--color-not-a-token')).toThrow(/no --color-not-a-token/);
  });
});

describe('icoFromPngs', () => {
  const png = (size: number, bytes: number) => ({ size, data: Buffer.alloc(bytes, size) });

  it('writes an icon directory followed by each PNG in order', () => {
    const ico = icoFromPngs([png(16, 10), png(32, 20)]);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // count
    // First entry: 16 px, 10 bytes, right after the 6 + 2 × 16 byte header.
    expect(ico[6]).toBe(16);
    expect(ico.readUInt32LE(6 + 8)).toBe(10);
    expect(ico.readUInt32LE(6 + 12)).toBe(38);
    // Second entry starts where the first ends.
    expect(ico[22]).toBe(32);
    expect(ico.readUInt32LE(22 + 12)).toBe(48);
    expect(ico.length).toBe(38 + 10 + 20);
    expect(ico[38]).toBe(16);
    expect(ico[48]).toBe(32);
  });

  it('stores 256 px as 0, as the format requires', () => {
    expect(icoFromPngs([png(256, 4)])[6]).toBe(0);
  });
});

describe('BRAND_MARK', () => {
  it('keeps both cards inside the 1024 canvas', () => {
    const { offset, card, back, front } = BRAND_MARK;
    for (const c of [back, front]) {
      const slope = Math.tan((Math.abs(c.skewY) * Math.PI) / 180) * card.width;
      expect(offset.x + c.x).toBeGreaterThanOrEqual(0);
      expect(offset.x + c.x + card.width).toBeLessThanOrEqual(1024);
      expect(offset.y + c.y - slope).toBeGreaterThanOrEqual(0);
      expect(offset.y + c.y + card.height + slope).toBeLessThanOrEqual(1024);
    }
  });
});
