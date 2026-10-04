import { describe, expect, it } from 'vitest';
import { versionCode } from '../../scripts/version-code.mjs';

describe('versionCode', () => {
  it('packs x.y.z into one growing integer', () => {
    expect(versionCode('1.0.0')).toBe(10000);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'));
  });

  it('rejects what would collide or not be a release', () => {
    expect(() => versionCode('1.2.3-beta')).toThrow(/x\.y\.z/);
    expect(() => versionCode('1.2')).toThrow(/x\.y\.z/);
    expect(() => versionCode('1.100.0')).toThrow(/99/);
    expect(() => versionCode('1.0.100')).toThrow(/99/);
  });
});
