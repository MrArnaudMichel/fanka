<script setup lang="ts">
import { CONTACT_EMAIL, DEVELOPER, LEGAL_PAGES } from '~/utils/legal';

/**
 * Public pages Google Play links to (privacy policy, account deletion,
 * licences): the brand bar instead of the sidebar, a switcher between the
 * three, a readable column whose text can be selected.
 */
const route = useRoute();
const router = useRouter();

function onSwitch(event: CustomEvent<{ value: string | number }>): void {
  void navigateTo(String(event.detail.value));
}

/** Back where the learner came from (Settings › About), or into the app from a link. */
function openApp(): void {
  if (window.history.state?.back) router.back();
  else void navigateTo('/');
}
</script>

<template>
  <div class="shell">
    <!--
      Not kt-header: it always draws its mobile menu button, and these pages
      have no menu to open — only the brand and the way into the app.
    -->
    <header class="bar">
      <span class="brand">
        <BrandMark />
        <span>Fanka</span>
      </span>
      <kt-button variant="secondary" size="small" icon="arrow-left" @click="openApp">Open Fanka</kt-button>
    </header>

    <div class="legal fk-selectable">
      <kt-segmented-control label="Legal pages" size="small" :options="LEGAL_PAGES" :value="route.path" @kt-change="onSwitch" />
      <main class="legal-main">
        <slot />
      </main>
      <p class="footer">Fanka is made by {{ DEVELOPER }} · {{ CONTACT_EMAIL }}</p>
    </div>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; background: var(--surface-page); color: var(--text-body); }
.brand { display: flex; align-items: center; gap: var(--gap-element); font: var(--font-title-h6); color: var(--text-body); }
.bar {
  position: sticky;
  top: 0;
  z-index: var(--z-dropdown);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-element);
  padding: var(--padding-card);
  padding-top: calc(var(--padding-card) + env(safe-area-inset-top));
  background: var(--surface-page);
  border-bottom: var(--border-width) solid var(--border-subtle);
}

/*
  Kanto has no content-width token. 72ch is a reading measure that follows
  the font size (and Kanto's text-size setting), not a layout size.
*/
.legal {
  max-width: 72ch;
  margin: 0 auto;
  padding: var(--padding-card);
  padding-bottom: calc(var(--padding-card) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--gap-card);
}
.legal-main { display: flex; flex-direction: column; gap: var(--gap-card); }
.footer {
  margin: 0;
  padding-top: var(--gap-card);
  border-top: var(--border-width) solid var(--border-subtle);
  font: var(--font-normal-small);
  color: var(--text-muted);
}
</style>
