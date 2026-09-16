// tsconfig.check.json deliberately excludes app/** (see its own comment), so
// its program never picks up the Nuxt-generated ambient globals (`ref`,
// `readonly`, `import.meta.client`, ...) that make a composable like
// app/composables/useSettings.ts compile inside Nuxt or under Vitest (see
// vitest.config.ts's AutoImport plugin). A test that imports a composable
// still pulls its source into this profile's program — TypeScript
// type-checks every file reachable from an included file, not only the
// included files themselves — so this hand-declares the small subset those
// composables actually use. Keep this in sync by hand as that set grows.
export {};

declare global {
  const ref: typeof import('vue').ref;
  const readonly: typeof import('vue').readonly;

  interface ImportMeta {
    readonly client?: boolean;
  }
}
