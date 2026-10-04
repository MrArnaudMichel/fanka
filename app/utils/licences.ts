/**
 * What /licences credits. The integrity test (test/integrity/licences.test.ts)
 * fails when a production dependency is added or removed without updating
 * LIBRARIES, so the page cannot fall behind package.json.
 */
export interface LicenceEntry {
  /** The npm package name, as in package.json. */
  package: string;
  name: string;
  licence: string;
  url: string;
}

/** Data Fanka ships, derived at build time from these devDependencies. */
export const DATA_SOURCES: readonly LicenceEntry[] = [
  { package: 'hanzi-writer-data', name: 'Make Me a Hanzi stroke data', licence: 'Arphic Public License', url: 'https://github.com/skishore/makemeahanzi' },
  { package: 'opencc-data', name: 'OpenCC conversion tables', licence: 'Apache-2.0', url: 'https://github.com/BYVoid/OpenCC' },
];

export const LIBRARIES: readonly LicenceEntry[] = [
  { package: '@capacitor-community/text-to-speech', name: 'Capacitor Text to Speech', licence: 'MIT', url: 'https://github.com/capacitor-community/text-to-speech' },
  { package: '@capacitor/android', name: 'Capacitor Android', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/app', name: 'Capacitor App', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/core', name: 'Capacitor', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/filesystem', name: 'Capacitor Filesystem', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/local-notifications', name: 'Capacitor Local Notifications', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/share', name: 'Capacitor Share', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/status-bar', name: 'Capacitor Status Bar', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@supabase/supabase-js', name: 'Supabase JS', licence: 'MIT', url: 'https://github.com/supabase/supabase-js' },
  { package: 'dexie', name: 'Dexie', licence: 'Apache-2.0', url: 'https://dexie.org' },
  { package: 'kanto-ds', name: 'Kanto', licence: 'MIT', url: 'https://kanto.arnaudmichel.fr' },
  { package: 'lit', name: 'Lit', licence: 'BSD-3-Clause', url: 'https://lit.dev' },
  { package: 'lucide', name: 'Lucide', licence: 'ISC', url: 'https://lucide.dev' },
  { package: 'nuxt', name: 'Nuxt', licence: 'MIT', url: 'https://nuxt.com' },
  { package: 'ts-fsrs', name: 'ts-fsrs', licence: 'MIT', url: 'https://github.com/open-spaced-repetition/ts-fsrs' },
  { package: 'vue', name: 'Vue', licence: 'MIT', url: 'https://vuejs.org' },
  { package: 'vue-router', name: 'Vue Router', licence: 'MIT', url: 'https://router.vuejs.org' },
];
