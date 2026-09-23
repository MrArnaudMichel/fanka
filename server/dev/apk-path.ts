import { fileURLToPath } from 'node:url';

/** Where `npm run android` leaves the debug build. */
export const APK_PATH = fileURLToPath(new URL('../../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url));
