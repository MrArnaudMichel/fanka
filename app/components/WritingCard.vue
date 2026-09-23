<script setup lang="ts">
import type { Card } from '~core/db/schema';
import type { Settings } from '~core/db/settings';

/**
 * Deliberately ignores `item.dir`: writing practice always shows the meaning
 * first and the hanzi behind Reveal, regardless of which direction the
 * underlying item happens to be scheduled in. That is the one layout the
 * brief asks for — see the task report for why this reuses the session
 * engine's queue as-is rather than filtering it to `production` items.
 */
defineProps<{ card: Card; revealed: boolean; settings: Settings }>();
</script>

<template>
  <kt-card>
    <div class="face fk-selectable">
      <p class="overline">Write the character</p>
      <p class="meaning">{{ card.translation }}</p>
      <PinyinText v-if="!settings.hidePinyinUntilRevealed || revealed" :syllables="card.pinyin" :colored="settings.toneColors" size="22px" />

      <div v-if="revealed" class="answer" role="status" aria-live="polite" aria-atomic="true">
        <div class="hanzi">{{ card.hanzi }}</div>
        <span v-if="settings.showZhuyin" class="zhuyin">{{ card.zhuyin }}</span>
      </div>
    </div>
  </kt-card>
</template>

<style scoped>
.face {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-card);
  padding: 48px 24px;
  min-height: 320px;
  text-align: center;
}

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
  gap: var(--gap-form);
  width: 100%;
  border-top: var(--border-width) solid var(--border-subtle);
  padding-top: 24px;
  margin-top: 8px;
}

.hanzi {
  font-family: var(--fk-font-hanzi);
  font-size: clamp(88px, 16vw, 168px);
  line-height: 1.05;
  letter-spacing: 6px;
  color: var(--text-body);
}

.zhuyin { font-family: var(--fk-font-hanzi-sans); font-size: 18px; color: var(--text-muted); letter-spacing: 2px; }
</style>
