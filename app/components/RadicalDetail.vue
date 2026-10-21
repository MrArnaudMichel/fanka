<script setup lang="ts">
import type { Radical } from '~core/radicals';
import { radicalForms, variantText } from '~core/radicals';
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';

/** Everything about one radical: its forms, name, meaning, characters built on it and how to write it. */
const props = defineProps<{ radical: Radical; canSpeak: boolean }>();
defineEmits<{ speak: [text: string] }>();

const { load } = useStrokeData();
const strokes = ref<StrokeOrderEntry[]>([]);

watch(
  () => props.radical,
  async (radical) => {
    strokes.value = [];
    const forms = radicalForms(radical);
    const models = await Promise.all(forms.map((form) => load(form)));
    // A newer radical may have been opened while these loaded.
    if (radical !== props.radical) return;
    strokes.value = forms.flatMap((character, i) => (models[i] ? [{ character, model: models[i]!, highlight: null }] : []));
  },
  { immediate: true },
);

const facts = computed(() => [
  { term: 'Meaning', detail: props.radical.meaning },
  { term: 'Pinyin', detail: props.radical.pinyin },
  { term: 'Strokes', detail: String(props.radical.strokes) },
  { term: 'Kangxi number', detail: String(props.radical.number) },
]);
</script>

<template>
  <div class="detail">
    <div class="forms fk-selectable">
      <span class="form">{{ radical.radical }}</span>
      <span v-for="v in radical.variants" :key="v.form" class="form variant">{{ v.form }}</span>
      <kt-button
        variant="secondary-no-bg"
        size="small"
        icon="volume-2"
        :label="canSpeak ? 'Play pronunciation' : 'No Chinese voice on this device'"
        :disabled="!canSpeak"
        @click="$emit('speak', radical.radical)"
      />
    </div>
    <p v-if="radical.variants.length > 0" class="hint">{{ variantText(radical) }}.</p>

    <kt-description-list label="Radical" :items="facts" />

    <section class="examples" aria-label="Characters with this radical">
      <p class="overline">Characters with this radical</p>
      <div v-for="example in radical.examples" :key="example.hanzi" class="example fk-selectable">
        <span class="example-hanzi">{{ example.hanzi }}</span>
        <div class="example-text">
          <span class="example-pinyin">{{ example.pinyin }}</span>
          <span class="example-meaning">{{ example.meaning }}</span>
        </div>
        <kt-button
          variant="secondary-no-bg"
          size="small"
          icon="volume-2"
          :label="canSpeak ? `Play ${example.hanzi}` : 'No Chinese voice on this device'"
          :disabled="!canSpeak"
          @click="$emit('speak', example.hanzi)"
        />
      </div>
    </section>

    <StrokeOrderPanel v-if="strokes.length > 0" :entries="strokes" />
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: var(--gap-card); }
.forms { display: flex; align-items: center; gap: var(--gap-form); }
/* Same size as the review card's revealed hanzi. */
.form { font-family: var(--fk-font-hanzi); font-size: 64px; line-height: 1.1; color: var(--text-body); }
.variant { color: var(--text-muted); }
.hint { margin: 0; font: var(--font-normal-regular); color: var(--text-muted); }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.examples { display: flex; flex-direction: column; gap: var(--gap-button); }
.example { display: flex; align-items: center; gap: var(--gap-form); padding: var(--gap-button) 0; border-bottom: var(--border-width) solid var(--border-subtle); }
.example-hanzi { font-family: var(--fk-font-hanzi); font-size: 32px; line-height: 1.2; color: var(--text-body); }
.example-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.example-pinyin { font-family: var(--font-family-code); font-size: 13px; color: var(--text-muted); }
.example-meaning { font: var(--font-normal-regular); color: var(--text-body); }
</style>
