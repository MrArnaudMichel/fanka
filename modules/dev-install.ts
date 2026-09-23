import { fileURLToPath } from 'node:url';
import { addDevServerHandler, defineNuxtModule, extendPages } from 'nuxt/kit';

/**
 * Wires up "install the debug APK on a phone" for `npm run dev` only: the
 * `/install` page and its three supporting routes (the APK download, its
 * info as JSON, and its QR code as SVG).
 *
 * Both `extendPages` and `addDevServerHandler` are skipped outright when
 * `nuxt.options.dev` is false, so `npm run build` / `npm run build:app`
 * never see the page or the routes at all — not "hidden", genuinely absent:
 * Nitro never registers the handlers, and the page is never added to the
 * route table, so nothing under `app/dev/` or `server/dev/` is ever reached
 * by the production build graph, let alone bundled into it.
 */
export default defineNuxtModule({
  meta: { name: 'dev-install' },
  async setup(_options, nuxt) {
    if (!nuxt.options.dev) return;

    extendPages((pages) => {
      pages.push({
        name: 'install',
        path: '/install',
        file: fileURLToPath(new URL('../app/dev/install.vue', import.meta.url)),
      });
    });

    const [apk, apkInfo, qr] = await Promise.all([
      import('../server/dev/apk'),
      import('../server/dev/apk-info'),
      import('../server/dev/qr'),
    ]);

    // Nitro's dev handlers are registered as h3 middleware — `app.use(route,
    // handler)` matches by raw string prefix, not by path segment, and the
    // first matching layer wins. `/dev/apk` is a string-prefix of
    // `/dev/apk-info` (and of `/dev/apk/info`), so it would swallow either —
    // these three routes are picked to share no prefix with one another.
    addDevServerHandler({ route: '/dev/apk', handler: apk.default });
    addDevServerHandler({ route: '/dev/install-info', handler: apkInfo.default });
    addDevServerHandler({ route: '/dev/qr', handler: qr.default });
  },
});
