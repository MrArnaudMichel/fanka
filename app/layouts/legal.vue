<script setup lang="ts">
/**
 * Public pages Google Play links to (privacy policy, account deletion,
 * licences): no sidebar, a readable column, text that can be selected.
 */
</script>

<template>
  <div class="legal fk-selectable">
    <kt-button variant="secondary-no-bg" size="small" icon="arrow-left" @click="navigateTo('/')">Back to Fanka</kt-button>
    <main class="legal-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/*
  Kanto has no content-width token. 72ch is a reading measure that follows
  the font size (and Kanto's text-size setting), not a layout size.
*/
.legal {
  max-width: 72ch;
  margin: 0 auto;
  padding: var(--padding-card);
  padding-top: calc(var(--padding-card) + env(safe-area-inset-top));
  padding-bottom: calc(var(--padding-card) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--gap-card);
  background: var(--surface-page);
  color: var(--text-body);
}
.legal-main { display: flex; flex-direction: column; gap: var(--gap-card); width: 100%; }
.legal-main :deep(h2) { font: var(--font-title-h6); margin: 0; }
.legal-main :deep(p) { font: var(--font-normal-regular); margin: 0; }
.legal-main :deep(section) { display: flex; flex-direction: column; gap: var(--gap-element); }
</style>
