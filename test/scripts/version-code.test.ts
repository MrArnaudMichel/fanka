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

describe('version-code.mjs on the command line', () => {
  it('prints only the reason and exits non-zero for a bad version, so Gradle can show it', async () => {
    const { spawnSync } = await import('node:child_process');
    const { join } = await import('node:path');
    const script = join(__dirname, '..', '..', 'scripts', 'version-code.mjs');

    const result = spawnSync(process.execPath, [script, '1.2.3-beta'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('version must be x.y.z with no suffix, got "1.2.3-beta"');
    expect(result.stdout).toBe('');
  });
});
