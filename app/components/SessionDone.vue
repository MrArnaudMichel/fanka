<script setup lang="ts">
import type { RunKind } from '~/composables/useStudyRun';

/** The card a finished session ends on. Endless practice never ends, so it has none. */
defineProps<{ kind: RunKind; graded: number; total: number; firstTry: number; lesson: string | null }>();
defineEmits<{ again: [] }>();
</script>

<template>
  <kt-card class="done">
    <div class="body">
      <span class="seal">完</span>
      <template v-if="kind === 'lesson'">
        <h2>{{ lesson }} learned</h2>
        <p>{{ total }} card{{ total === 1 ? '' : 's' }}, {{ firstTry }} right on the first try.</p>
        <div class="actions">
          <kt-button variant="secondary" size="medium" icon="rotate-ccw" @click="$emit('again')">Learn again</kt-button>
          <kt-button variant="primary" size="medium" icon="book-open" @click="navigateTo('/lessons')">Back to lessons</kt-button>
        </div>
      </template>
      <template v-else>
        <h2>Session complete</h2>
        <p>{{ graded }} card{{ graded === 1 ? '' : 's' }} graded.</p>
        <kt-button variant="primary" size="medium" icon="house" @click="navigateTo('/')">Back to today</kt-button>
      </template>
    </div>
  </kt-card>
</template>

<style scoped>
.body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
p { margin: 0; color: var(--text-muted); }
.actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gap-button); }
</style>
