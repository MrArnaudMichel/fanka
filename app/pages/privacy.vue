<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import { DATA_RECIPIENTS, DATA_REGION, LAST_UPDATED_LABEL } from '~/utils/legal';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Privacy policy · Fanka' });

const GLANCE = [
  { icon: 'smartphone', title: 'Stays on your device', text: 'Without an account, your study never leaves it.' },
  { icon: 'cloud', title: 'Synced only if you sign in', text: 'An account is optional and only used for sync.' },
  { icon: 'eye-off', title: 'No ads, no tracking', text: 'No analytics, and your data is never sold.' },
];

const columns: KtTableColumn[] = [
  { key: 'provider', label: 'Provider', width: '30%' },
  { key: 'what', label: 'What and why' },
];

/** Two columns fit a phone: the reason goes under what is sent. */
function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  if (column.key !== 'what') return undefined;
  return html`${row.what}<br /><span style="color: var(--text-muted)">${row.why}</span>`;
}
</script>

<template>
  <kt-page-header eyebrow="Legal" heading="Privacy policy" description="What Fanka keeps, where it keeps it, and who else sees it.">
    <kt-badge variant="tag" size="small">Updated {{ LAST_UPDATED_LABEL }}</kt-badge>
  </kt-page-header>

  <section class="glance">
    <h2>At a glance</h2>
    <div class="glance-grid">
      <kt-card v-for="g in GLANCE" :key="g.title">
        <div class="glance-item">
          <kt-icon :name="g.icon" />
          <span class="glance-title">{{ g.title }}</span>
          <span class="glance-text">{{ g.text }}</span>
        </div>
      </kt-card>
    </div>
  </section>

  <LegalSection icon="smartphone" heading="Without an account">
    <p>Everything you create and every answer you give stays on your device.</p>
  </LegalSection>

  <LegalSection icon="cloud" heading="With an account">
    <p>
      An account syncs your study across devices. Fanka then stores your email address, used to send the sign-in link,
      and your decks, cards, review history, writing attempts and settings with Supabase, a hosted database provider,
      in {{ DATA_REGION }}. Only your account can read them. Supabase also logs sign-ins, with their IP address.
    </p>
  </LegalSection>

  <LegalSection icon="server" heading="Who receives what">
    <p>
      Fanka loads its Chinese fonts from Google Fonts, which receives your IP address and browser details when the fonts
      are fetched. The web version is served by Vercel, which keeps standard access logs.
    </p>
    <kt-table label="Who receives what" :columns="columns" :data="DATA_RECIPIENTS" :renderCell="renderCell" compact />
  </LegalSection>

  <LegalSection icon="volume-2" heading="On your device">
    <p>Pronunciation uses your device's own speech engine. Reminders are notifications scheduled on your device.</p>
  </LegalSection>

  <LegalSection icon="eye-off" heading="What Fanka never does">
    <p>No ads, no analytics, no tracking. Your data is never sold, and shared only with the providers above.</p>
  </LegalSection>

  <LegalSection icon="clock" heading="How long data is kept">
    <p>Synced data is kept until you delete your account. Data on your device is kept until you reset it or uninstall Fanka.</p>
  </LegalSection>

  <LegalSection icon="shield-check" heading="Your rights">
    <p>
      Export everything from Settings › Data › Export backup. Delete your account from Settings › Account, or follow the
      steps on the Delete account page.
    </p>
  </LegalSection>

  <ContactCard description="Questions about your data, or a request about your rights." />
</template>

<style scoped>
.glance { display: flex; flex-direction: column; gap: var(--gap-element); }
.glance h2 { font: var(--font-title-h6); color: var(--text-body); margin: 0; }
.glance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--gap-element); }
.glance-item {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--gap-element);
  align-items: start;
  color: var(--color-primary-text);
}
.glance-item kt-icon { grid-row: span 2; }
.glance-title { font: var(--font-normal-medium); color: var(--text-body); }
.glance-text { font: var(--font-normal-small); color: var(--text-muted); }
</style>
