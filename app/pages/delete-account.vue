<script setup lang="ts">
import { DEVELOPER } from '~/utils/legal';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Delete your account · Fanka' });
</script>

<template>
  <kt-page-header
    eyebrow="Legal"
    heading="Delete your Fanka account"
    :description="`Fanka is developed by ${DEVELOPER}. Delete your account from the app, or by email without it.`"
  />

  <LegalSection icon="smartphone" heading="In the app">
    <kt-timeline compact>
      <kt-timeline-item heading="Open Settings" icon="settings" variant="primary">From the sidebar, or the menu on a phone.</kt-timeline-item>
      <kt-timeline-item heading="Choose Account" icon="user" variant="primary">Your profile and sync.</kt-timeline-item>
      <kt-timeline-item heading="Tap Delete account" icon="trash-2" variant="danger">At the bottom of the page.</kt-timeline-item>
      <kt-timeline-item heading="Confirm" icon="check" variant="success" last>The account is deleted at once.</kt-timeline-item>
    </kt-timeline>
  </LegalSection>

  <div class="split">
    <kt-card>
      <div class="outcome deleted">
        <kt-icon name="trash-2" />
        <h2>What is deleted</h2>
        <p>Your account and everything synced to it: decks, cards, review history, writing attempts and settings.</p>
      </div>
    </kt-card>
    <kt-card>
      <div class="outcome kept">
        <kt-icon name="smartphone" />
        <h2>What stays</h2>
        <p>The data on your device. Clear it from Settings › Data › Reset, or uninstall Fanka.</p>
      </div>
    </kt-card>
  </div>

  <ContactCard heading="Without the app" description="Write from the email address of your account and ask for it to be deleted.">
    <kt-alert variant="info" description="Requests are handled within 30 days." />
  </ContactCard>
</template>

<style scoped>
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap-element); }
.outcome { display: flex; flex-direction: column; align-items: flex-start; gap: var(--gap-button); }
.outcome.deleted { color: var(--color-danger-text); }
.outcome.kept { color: var(--color-success-text); }
.outcome h2 { font: var(--font-title-h6); color: var(--text-body); margin: 0; }
.outcome p { font: var(--font-normal-regular); color: var(--text-muted); margin: 0; }
</style>
