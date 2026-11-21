<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { type Settings, showsPinyin, showsZhuyin } from '~core/db/settings';

/**
 * A reading from the lesson content (numbered pinyin, "ba4 ba5"), shown the
 * way the active bundle reads: pinyin, zhuyin or both. Zhuyin comes from the
 * content when it carries one, otherwise from the pinyin.
 */
const props = defineProps<{
  pinyin: string;
  zhuyin?: string;
  settings: DeepReadonly<Settings>;
  small?: boolean;
}>();

const syllables = computed(() => parsePinyin(props.pinyin));
const zhuyinText = computed(() => props.zhuyin ?? toZhuyin(syllables.value));
</script>

<template>
  <span class="reading" :class="{ small }">
    <PinyinText
      v-if="showsPinyin(settings)"
      :syllables="syllables"
      :colored="settings.toneColors"
      :size="small ? 'var(--fk-reading-size-small)' : 'var(--fk-reading-size)'"
    />
    <span v-if="showsZhuyin(settings)" class="zhuyin">{{ zhuyinText }}</span>
  </span>
</template>

<style scoped>
.reading { display: inline-flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: var(--gap-button); }
.zhuyin { font-family: var(--fk-font-hanzi-sans); font-size: var(--fk-reading-size); color: var(--text-muted); }
.small .zhuyin { font-size: var(--fk-reading-size-small); }
</style>
