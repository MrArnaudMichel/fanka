<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import { parsePinyin } from '~core/chinese/pinyin';
import type { Card, Item } from '~core/db/schema';
import { showsPinyin, showsZhuyin } from '~core/db/settings';
import type { Settings } from '~core/db/settings';

/**
 * Review shows recognition items only (see `SessionMode`): the hanzi alone,
 * and the learner recalls its pinyin and meaning before revealing them.
 */
defineProps<{ card: Card; item: Item; revealed: boolean; settings: DeepReadonly<Settings>; canSpeak: boolean }>();
defineEmits<{ speak: [text: string] }>();
</script>

<template>
  <kt-card>
    <div slot="header" class="meta">
      <span class="state">{{ item.state }}</span>
    </div>

    <div class="face fk-selectable" :class="{ revealed }">
      <div class="hanzi">{{ card.hanzi }}</div>

      <div v-if="revealed" class="answer" role="status" aria-live="polite" aria-atomic="true">
        <div class="pinyin-row">
          <PinyinText v-if="showsPinyin(settings)" :syllables="card.pinyin" :colored="settings.toneColors" size="28px" />
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
        <p class="meaning">{{ card.translation }}</p>
        <div class="tags">
          <kt-badge v-for="tag in card.tags" :key="tag" variant="tag" tone="neutral" size="small" :label="tag" />
        </div>
        <div v-if="card.example" class="example">
          <div class="example-head">
            <p class="overline">Example</p>
            <kt-button
              variant="secondary-no-bg"
              size="small"
              icon="volume-2"
              :label="canSpeak ? 'Play pronunciation' : 'No Chinese voice on this device'"
              :disabled="!canSpeak"
              @click="$emit('speak', card.example)"
            />
          </div>
          <p class="example-hanzi">{{ card.example }}</p>
          <!-- Stored numbered ("wo3 men5") by lessons and the seed, or with marks by imports: parsed either way. -->
          <p v-if="card.examplePinyin" class="example-pinyin">
            <PinyinText :syllables="parsePinyin(card.examplePinyin)" :colored="settings.toneColors" size="13px" />
          </p>
          <p class="example-translation">{{ card.exampleTranslation }}</p>
        </div>
        <p v-if="card.note" class="note">Mnemonic · {{ card.note }}</p>
      </div>
    </div>
  </kt-card>
</template>

<style scoped>
.meta { display: flex; align-items: center; gap: var(--gap-button); }
.state { margin-left: auto; font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }

.face {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-card);
  padding: var(--padding-card);
  /* The card sizes to its content (the hanzi, then the answer). The floor
     only keeps a one-character word from collapsing to a sliver; the same
     documented clamp exception as the hanzi sizes below. */
  min-height: min(200px, 26dvh);
  text-align: center;
}

.hanzi {
  font-family: var(--fk-font-hanzi);
  font-size: clamp(88px, 16vw, 168px);
  line-height: 1.05;
  letter-spacing: 6px;
  color: var(--text-body);
}

/* Once revealed, the hanzi steps down so the answer fits under it. */
.revealed .hanzi { font-size: clamp(64px, 14vw, 110px); }

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
  gap: var(--gap-form);
  align-items: center;
  width: 100%;
  border-top: var(--border-width) solid var(--border-subtle);
  padding-top: 24px;
}

.zhuyin { font-family: var(--fk-font-hanzi-sans); font-size: 18px; color: var(--text-muted); letter-spacing: 2px; }
.pinyin-row, .example-head { display: flex; align-items: center; gap: var(--gap-button); }
.pinyin-row { justify-content: center; }
.example-head { justify-content: space-between; }
.example-head .overline { margin: 0; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }

.example {
  width: 100%;
  max-width: 620px;
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--border-radius);
  padding: 16px;
  text-align: left;
  background: var(--surface-field);
}

.example p { margin: 0 0 8px; }
.example-hanzi { font-family: var(--fk-font-hanzi); font-size: 26px; line-height: 1.5; color: var(--text-body); }
.example-pinyin { font-family: var(--font-family-code); font-size: 13px; color: var(--text-muted); }
.example-translation { font: var(--font-normal-regular); color: var(--text-body); }
.note { margin: 0; width: 100%; max-width: 620px; text-align: left; font: var(--font-normal-small); color: var(--text-muted); }
</style>
