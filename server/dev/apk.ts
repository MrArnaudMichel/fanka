import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createError, defineEventHandler, sendStream, setResponseHeaders } from 'h3';
import { APK_PATH } from './apk-path';

/**
 * Streams the debug APK, dev only (wired up by `modules/dev-install.ts`,
 * only when `nuxt.options.dev` — never registered, so never reachable, in
 * `npm run build` / `npm run build:app` or inside the Android app itself).
 */
export default defineEventHandler(async (event) => {
  let info;
  try {
    info = await stat(APK_PATH);
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not found',
      message: 'No debug APK yet — run `npm run android` to build android/app/build/outputs/apk/debug/app-debug.apk, then reload the install page.',
    });
  }

  setResponseHeaders(event, {
    'content-type': 'application/vnd.android.package-archive',
    'content-disposition': 'attachment; filename="fanka-debug.apk"',
    'content-length': info.size,
  });
  return sendStream(event, createReadStream(APK_PATH));
});
