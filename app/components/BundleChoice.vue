<script setup lang="ts">
import type { Bundle } from '~core/chinese/script';

defineProps<{ modelValue: Bundle | null }>();
defineEmits<{ 'update:modelValue': [value: Bundle] }>();

const BUNDLES: { value: Bundle; title: string; text: string }[] = [
  { value: 'mainland', title: 'Mainland Chinese', text: 'Simplified characters, pinyin, HSK' },
  { value: 'taiwan', title: 'Taiwanese Mandarin', text: 'Traditional characters, zhuyin and pinyin, TBCL' },
];
</script>

<template>
  <div class="choices">
    <kt-card v-for="b in BUNDLES" :key="b.value" clickable :selected="modelValue === b.value" @kt-card-click="$emit('update:modelValue', b.value)">
      <span class="choice-title">{{ b.title }}</span>
      <span class="choice-text">{{ b.text }}</span>
    </kt-card>
  </div>
</template>

<style scoped>
.choices { display: flex; flex-direction: column; gap: var(--gap-element); }
.choice-title { display: block; font: var(--font-title-h6); color: var(--text-body); }
.choice-text { display: block; font: var(--font-normal-small); color: var(--text-muted); }
</style>
