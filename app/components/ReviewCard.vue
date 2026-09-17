<script setup lang="ts">
import type { Card, Item } from '~core/db/schema';
import type { Settings } from '~core/db/settings';

defineProps<{ card: Card; item: Item; revealed: boolean; settings: Settings }>();
</script>

<template>
  <kt-card>
    <div slot="header" class="meta">
      <kt-badge variant="tag" :tone="item.dir === 'recognition' ? 'primary' : 'info'" size="small"
        :label="item.dir === 'recognition' ? 'Recognition · 字 → meaning' : 'Production · meaning → 字'" />
      <span class="state">{{ item.state }}</span>
    </div>

    <div class="face">
      <div v-if="item.dir === 'recognition'" class="hanzi">{{ card.hanzi }}</div>
      <div v-else class="prompt">
        <p class="overline">Write the character</p>
        <p class="meaning">{{ card.translation }}</p>
        <PinyinText v-if="!settings.hidePinyinUntilRevealed" :syllables="card.pinyin" :colored="settings.toneColors" size="22px" />
      </div>

      <div v-if="revealed" class="answer" role="status" aria-live="polite" aria-atomic="true">
        <div v-if="item.dir === 'production'" class="hanzi answer-hanzi">{{ card.hanzi }}</div>
        <PinyinText :syllables="card.pinyin" :colored="settings.toneColors" size="28px" />
        <span v-if="settings.showZhuyin" class="zhuyin">{{ card.zhuyin }}</span>
        <p class="meaning">{{ card.translation }}</p>
        <div class="tags">
          <kt-badge v-for="tag in card.tags" :key="tag" variant="tag" tone="neutral" size="small" :label="tag" />
        </div>
        <div v-if="card.example" class="example">
          <p class="overline">Example</p>
          <p class="example-hanzi">{{ card.example }}</p>
          <p class="example-pinyin">{{ card.examplePinyin }}</p>
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
  padding: 48px 24px;
  min-height: 320px;
  text-align: center;
}

.hanzi {
  font-family: var(--fk-font-hanzi);
  font-size: clamp(88px, 16vw, 168px);
  line-height: 1.05;
  letter-spacing: 6px;
  color: var(--text-body);
}

.answer-hanzi { font-size: clamp(64px, 11vw, 110px); }
.prompt { display: flex; flex-direction: column; gap: 14px; align-items: center; }

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
  gap: 16px;
  align-items: center;
  width: 100%;
  border-top: var(--border-width) solid var(--border-subtle);
  padding-top: 24px;
}

.zhuyin { font-family: var(--fk-font-hanzi-sans); font-size: 18px; color: var(--text-muted); letter-spacing: 2px; }
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
