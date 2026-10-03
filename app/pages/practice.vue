<script setup lang="ts">
import { practicePoolSize } from '~/composables/usePracticeSession';

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
    variant: 'primary',
  },
] as const;

/** Cards each mode's endless session would draw from; unknown until read. */
const poolSizes = ref<Partial<Record<'review' | 'writing', number>>>({});

onMounted(async () => {
  try {
    const [review, writing] = await Promise.all([practicePoolSize('review'), practicePoolSize('writing')]);
    poolSizes.value = { review, writing };
  } catch (err) {
    console.error('practice: failed to count the card pool', err);
  }
});

const poolText = (n: number) => `${n} card${n === 1 ? '' : 's'} in your studied decks`;
</script>

<template>
  <div class="practice">
    <kt-page-header
      eyebrow="Learn"
      heading="Practice"
      description="Endless drill on the decks you study. Missed cards come back more often. Nothing here changes your schedule."
    />

    <div class="modes">
      <kt-card v-for="{ mode, heading, description, icon, variant } in MODES" :key="mode">
        <p class="overline" slot="header">{{ heading }}</p>
        <div class="summary">
          <p class="description">{{ description }}</p>
          <p v-if="poolSizes[mode] !== undefined" class="description pool">{{ poolText(poolSizes[mode]!) }}</p>
          <kt-button :variant="variant" size="large" :icon="icon" full-width @click="navigateTo(`/${mode}?endless=1`)">
            Practise {{ heading.toLowerCase() }}
          </kt-button>
        </div>
      </kt-card>
    </div>
  </div>
</template>

<style scoped>
/* Same outer page gap as index.vue's .today, and for the same reason. */
.practice { display: flex; flex-direction: column; gap: 24px; }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
/* Same two-up layout as Today's Review and Writing cards, from the shell's 900px breakpoint. */
.modes { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; }
@media (min-width: 900px) {
  .modes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.summary { display: flex; flex-direction: column; gap: var(--gap-form); }
.description { margin: 0; font: var(--font-normal-regular); color: var(--text-muted); }
</style>
