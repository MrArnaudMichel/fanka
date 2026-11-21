<script setup lang="ts">
import type { PinyinSyllable } from '~core/chinese/pinyin';
import { toneColorToken } from '~core/chinese/tones';

const props = defineProps<{ syllables: PinyinSyllable[]; colored?: boolean; size?: string }>();

// `--text-body` rather than `--color-white`: the two are identical in the
// dark theme, but `--color-white` stays pure white in light theme, where it
// is invisible against the page. `--text-body` is the token that tracks the
// theme.
const color = (syllable: PinyinSyllable) =>
  props.colored === false ? 'var(--text-body)' : toneColorToken(syllable.tone);
</script>

<template>
  <span class="pinyin" :style="{ fontSize: size }">
    <span v-for="(syllable, i) in syllables" :key="i" :style="{ color: color(syllable) }">{{ syllable.text }}</span>
  </span>
</template>

<style scoped>
/* Wraps, so a long example sentence stays inside its card on a phone. */
.pinyin { display: inline-flex; flex-wrap: wrap; gap: 8px; font-family: var(--font-family-code); }
</style>
