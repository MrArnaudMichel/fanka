<script setup lang="ts">
import { CONTACT_EMAIL, DATA_REGION, DEVELOPER, LAST_UPDATED } from '~/utils/legal';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Privacy policy · Fanka' });
</script>

<template>
  <kt-page-header eyebrow="Fanka" heading="Privacy policy" :description="`Last updated ${LAST_UPDATED}.`" />

  <section>
    <h2>Without an account</h2>
    <p>Everything you create and every answer you give stays on your device.</p>
  </section>

  <section>
    <h2>Fonts and hosting</h2>
    <p>
      Fanka loads its Chinese fonts from Google Fonts, which receives your IP address and browser details when the fonts
      are fetched. The web version is served by Vercel, which keeps standard access logs.
    </p>
  </section>

  <section>
    <h2>With an account</h2>
    <p>
      An account syncs your study across devices. Fanka then stores your email address, used to send the sign-in link,
      and your decks, cards, review history, writing attempts and settings with Supabase, a hosted database provider,
      in {{ DATA_REGION }}. Only your account can read them. Supabase also logs sign-ins, with their IP address.
    </p>
  </section>

  <section>
    <h2>On your device</h2>
    <p>Pronunciation uses your device's own speech engine. Reminders are notifications scheduled on your device.</p>
  </section>

  <section>
    <h2>What Fanka never does</h2>
    <p>No ads, no analytics, no tracking. Your data is never sold, and shared only with the providers named above.</p>
  </section>

  <section>
    <h2>How long data is kept</h2>
    <p>Synced data is kept until you delete your account. Data on your device is kept until you reset it or uninstall Fanka.</p>
  </section>

  <section>
    <h2>Your rights</h2>
    <p>
      Export everything from Settings › Data › Export backup. Delete your account from Settings › Account, or see
      fanka.arnaudmichel.fr/delete-account. For anything else, write to {{ CONTACT_EMAIL }}.
    </p>
  </section>

  <section>
    <h2>Who is responsible</h2>
    <p>{{ DEVELOPER }}, {{ CONTACT_EMAIL }}.</p>
  </section>
</template>
