import { stat } from 'node:fs/promises';
import { defineEventHandler } from 'h3';
import { APK_PATH } from './apk-path';
import { apkUrls } from './lan';

export interface ApkInfo {
  readonly exists: boolean;
  readonly size: number;
  readonly mtime: string | null;
  /** Every LAN address the APK can be downloaded from, most likely first. */
  readonly urls: string[];
}

/** JSON for the install page: whether the APK exists, its size/build time, and where to get it. */
export default defineEventHandler(async (event): Promise<ApkInfo> => {
  const urls = apkUrls(event);
  try {
    const info = await stat(APK_PATH);
    return { exists: true, size: info.size, mtime: info.mtime.toISOString(), urls };
  } catch {
    return { exists: false, size: 0, mtime: null, urls };
  }
});
