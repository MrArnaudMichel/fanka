<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import type { Card } from '~core/db/schema';
import { showsPinyin, showsZhuyin } from '~core/db/settings';
import type { Settings } from '~core/db/settings';

/**
 * Writing shows production items only (see `SessionMode`): the meaning, and
 * the pinyin as a hint unless `hidePinyinUntilRevealed` is on. The default
 * slot holds whatever sits between prompt and answer — the drawing pad, or
 * the verdict once the drawing is checked.
 */
defineProps<{ card: Card; revealed: boolean; settings: DeepReadonly<Settings>; canSpeak: boolean }>();
defineEmits<{ speak: [text: string] }>();
</script>

<template>
  <kt-card>
    <div class="face">
      <div class="prompt fk-selectable">
        <p class="overline">Write the character{{ [...card.hanzi].length > 1 ? 's' : '' }}</p>
        <p class="meaning">{{ card.translation }}</p>
        <PinyinText
          v-if="showsPinyin(settings) && (!settings.hidePinyinUntilRevealed || revealed)"
          :syllables="card.pinyin"
          :colored="settings.toneColors"
          size="22px"
        />
      </div>

      <slot />

      <div v-if="revealed" class="answer fk-selectable" role="status" aria-live="polite" aria-atomic="true">
        <div class="hanzi-row">
          <div class="hanzi">{{ card.hanzi }}</div>
          <kt-button
            variant="secondary-no-bg"
            size="small"
            icon="volume-2"
            :label="canSpeak ? 'Play pronunciation' : 'No Chinese voice on this device'"
            :disabled="!canSpeak"
            @click="$emit('speak', card.hanzi)"
          />
        </div>
        <span v-if="showsZhuyin(settings)" class="zhuyin">{{ card.zhuyin }}</span>
      </div>
      <!--
        `answer-extra` sits under the revealed answer — the stroke-order
        player for a self-graded card. Kept outside the live region above:
        its "n / total" counter changes on every stroke during autoplay, and
        being inside `aria-atomic` would re-announce the whole answer each
        time.
      -->
      <template v-if="revealed">
        <slot name="answer-extra" />
      </template>
    </div>
  </kt-card>
</template>

<style scoped>
.face {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-card);
  text-align: center;
}

.prompt { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); }

.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}

.meaning { margin: 0; font: var(--font-title-h4); color: var(--text-body); max-width: 560px; }

.answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-element);
  width: 100%;
  border-top: var(--border-width) solid var(--border-subtle);
  padding-top: var(--padding-card);
}

.hanzi-row { display: flex; align-items: center; gap: var(--gap-button); }

.hanzi {
  font-family: var(--fk-font-hanzi);
  font-size: clamp(64px, 14vw, 110px);
  line-height: 1.05;
  letter-spacing: 6px;
  color: var(--text-body);
}

.zhuyin { font-family: var(--fk-font-hanzi-sans); font-size: 18px; color: var(--text-muted); letter-spacing: 2px; }
</style>
