<script setup lang="ts">
import { CONTACT_EMAIL, DEVELOPER } from '~/utils/legal';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Delete your account · Fanka' });
</script>

<template>
  <kt-page-header eyebrow="Fanka" heading="Delete your Fanka account" :description="`Fanka is developed by ${DEVELOPER}.`" />

  <section>
    <h2>In the app</h2>
    <p>Open Settings › Account › Delete account, then confirm.</p>
  </section>

  <section>
    <h2>Without the app</h2>
    <p>Write to {{ CONTACT_EMAIL }} from the email address of your account. The account is deleted within 30 days.</p>
  </section>

  <section>
    <h2>What is deleted</h2>
    <p>Your account and everything synced to it: decks, cards, review history, writing attempts and settings.</p>
  </section>

  <section>
    <h2>What stays</h2>
    <p>The data on your device. Clear it from Settings › Data › Reset, or uninstall Fanka.</p>
  </section>
</template>
