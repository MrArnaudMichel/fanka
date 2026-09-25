<script setup lang="ts">
/**
 * Endless practice, outside the schedule: each mode opens its usual screen
 * with `?endless=1`, which swaps in `usePracticeSession`. Cards come from the
 * decks picked on the Decks page, or every deck when none is picked.
 */
const MODES = [
  {
    mode: 'review',
    heading: 'Review',
    description: 'See the hanzi, recall its meaning and reading.',
    icon: 'play',
    variant: 'primary',
  },
  {
    mode: 'writing',
    heading: 'Writing',
    description: 'See the meaning, draw the characters.',
    icon: 'pen-line',
    variant: 'secondary',
  },
] as const;
</script>

<template>
  <div class="practice">
    <kt-page-header
      eyebrow="Learn"
      heading="Practice"
      description="Endless drill on the decks you study. Missed cards come back more often. Nothing here changes your schedule."
    />

    <kt-card v-for="{ mode, heading, description, icon, variant } in MODES" :key="mode">
      <p class="overline" slot="header">{{ heading }}</p>
      <div class="summary">
        <p class="description">{{ description }}</p>
        <kt-button :variant="variant" size="large" :icon="icon" full-width @click="navigateTo(`/${mode}?endless=1`)">
          Practise {{ heading.toLowerCase() }}
        </kt-button>
      </div>
    </kt-card>
  </div>
</template>

<style scoped>
/* Same outer page gap as index.vue's .today, and for the same reason. */
.practice { display: flex; flex-direction: column; gap: 24px; }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.summary { display: flex; flex-direction: column; gap: var(--gap-form); }
.description { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
