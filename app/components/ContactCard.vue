<script setup lang="ts">
import { CONTACT_EMAIL } from '~/utils/legal';

/** The legal pages' contact block: the address, plus email and copy actions. */
withDefaults(defineProps<{ heading?: string; description?: string }>(), {
  heading: 'Contact',
  description: 'Questions about your data, or anything else.',
});

function email(): void {
  window.location.href = `mailto:${CONTACT_EMAIL}`;
}
</script>

<template>
  <LegalSection icon="mail" :heading="heading">
    <p>{{ description }}</p>
    <span class="address">{{ CONTACT_EMAIL }}</span>
    <slot />
    <div class="actions">
      <kt-button variant="primary" size="small" icon="mail" @click="email">Email us</kt-button>
      <!-- Says "Address copied" on the button itself; a refused clipboard shakes it, and the address stays readable above. -->
      <kt-copy-button :value="CONTACT_EMAIL" variant="secondary" size="small" label="Copy address" copied-label="Address copied" />
    </div>
  </LegalSection>
</template>

<style scoped>
.address { font: var(--font-normal-medium); color: var(--text-body); }
.actions { display: flex; flex-wrap: wrap; gap: var(--gap-button); }
</style>
