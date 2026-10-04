<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { CONTACT_EMAIL } from '~/utils/legal';

/** The legal pages' contact block: the address, plus email and copy actions. */
withDefaults(defineProps<{ heading?: string; description?: string }>(), {
  heading: 'Contact',
  description: 'Questions about your data, or anything else.',
});

function email(): void {
  window.location.href = `mailto:${CONTACT_EMAIL}`;
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    toaster.success('Address copied');
  } catch {
    toaster.error("Couldn't copy the address", { description: CONTACT_EMAIL });
  }
}
</script>

<template>
  <LegalSection icon="mail" :heading="heading">
    <p>{{ description }}</p>
    <span class="address">{{ CONTACT_EMAIL }}</span>
    <slot />
    <div class="actions">
      <kt-button variant="primary" size="small" icon="mail" @click="email">Email us</kt-button>
      <kt-button variant="secondary" size="small" icon="copy" @click="copy">Copy address</kt-button>
    </div>
  </LegalSection>
</template>

<style scoped>
.address { font: var(--font-normal-medium); color: var(--text-body); }
.actions { display: flex; flex-wrap: wrap; gap: var(--gap-button); }
</style>
