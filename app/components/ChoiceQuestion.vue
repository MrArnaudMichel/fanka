<script setup lang="ts">
/**
 * One multiple-choice question in a round: where the round is, the prompt,
 * the choices, and — once one is picked — what the default slot holds (the
 * verdict and the way on). Picking colours the right choice green and a wrong
 * pick red. Keys 1 to 4 pick a choice, then Enter asks for the next question.
 */
const props = defineProps<{
  index: number;
  count: number;
  score: number;
  ask: string;
  prompt: string;
  promptHanzi: boolean;
  /** Shown under the prompt; `detailAfter` holds it back until a choice is made. */
  detail?: string;
  detailAfter?: boolean;
  /** What the speaker reads; no speaker when absent. */
  spoken?: string | null;
  canSpeak: boolean;
  choices: string[];
  answer: number;
  chosen: number | null;
  hanziChoices: boolean;
}>();
const emit = defineEmits<{ choose: [index: number]; speak: [text: string]; next: [] }>();

function variant(i: number): string {
  if (props.chosen === null) return 'secondary';
  if (i === props.answer) return 'success';
  return i === props.chosen ? 'danger' : 'secondary';
}

function onKey(event: KeyboardEvent): void {
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Enter' && props.chosen !== null) {
    // A focused button handles its own Enter; acting here too would skip a question.
    if ((event.target as Element | null)?.closest?.('kt-button')) return;
    event.preventDefault();
    emit('next');
    return;
  }
  const n = Number(event.key);
  if (props.chosen === null && Number.isInteger(n) && n >= 1 && n <= props.choices.length) {
    event.preventDefault();
    emit('choose', n - 1);
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <kt-card>
    <div slot="header" class="progress">
      <span class="overline">Question {{ index + 1 }} of {{ count }}</span>
      <span class="overline">Score {{ score }}</span>
    </div>
    <kt-progress-bar size="small" label="Progress" :value="index + (chosen === null ? 0 : 1)" :max="count" />

    <div class="question">
      <p class="ask">{{ ask }}</p>
      <div class="prompt-row">
        <p :class="promptHanzi ? 'prompt-hanzi fk-selectable' : 'prompt-text'">{{ prompt }}</p>
        <kt-button
          v-if="spoken"
          variant="secondary-no-bg"
          size="small"
          icon="volume-2"
          :label="canSpeak ? 'Play pronunciation' : 'No Chinese voice on this device'"
          :disabled="!canSpeak"
          @click="emit('speak', spoken)"
        />
      </div>
      <p v-if="detail && (!detailAfter || chosen !== null)" class="detail">{{ detail }}</p>
    </div>

    <div class="choices" :class="{ hanzi: hanziChoices }">
      <kt-button v-for="(choice, i) in choices" :key="`${index}-${i}`" :variant="variant(i)" size="large" full-width @click="chosen === null && emit('choose', i)">
        {{ choice }}
      </kt-button>
    </div>

    <slot v-if="chosen !== null" />
  </kt-card>
</template>

<style scoped>
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.progress { display: flex; justify-content: space-between; gap: var(--gap-button); }
.question { display: flex; flex-direction: column; align-items: center; gap: var(--gap-button); text-align: center; padding-top: var(--gap-button); }
.ask { margin: 0; font: var(--font-normal-regular); color: var(--text-muted); }
.prompt-row { display: flex; align-items: center; gap: var(--gap-button); }
/* Same size as the review card's revealed hanzi. */
.prompt-hanzi { margin: 0; font-family: var(--fk-font-hanzi); font-size: clamp(64px, 14vw, 96px); line-height: 1.1; color: var(--text-body); }
.prompt-text { margin: 0; font: var(--font-title-h4); color: var(--text-body); }
.detail { margin: 0; font: var(--font-normal-regular); color: var(--text-muted); }
.choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-button); }
/* The hanzi choices read in the hanzi face, a step up from button text. */
.choices.hanzi kt-button::part(button) { font-family: var(--fk-font-hanzi); font-size: 22px; }
</style>
