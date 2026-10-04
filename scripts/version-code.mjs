#!/usr/bin/env node
/**
 * Google Play's versionCode, derived from package.json's version so there is
 * one number to bump (`npm version patch|minor`). android/app/build.gradle
 * runs this script and reads `<versionCode> <versionName>` from stdout.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `x.y.z` → `x * 10000 + y * 100 + z`.
 * @param {string} version
 * @returns {number}
 */
export function versionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`version must be x.y.z with no suffix, got "${version}"`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`minor and patch must be 99 or less, got "${version}"`);
  return major * 10000 + minor * 100 + patch;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  process.stdout.write(`${versionCode(version)} ${version}\n`);
}
