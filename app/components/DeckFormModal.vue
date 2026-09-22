<script setup lang="ts">
import type { KtOption } from 'kanto';
import { toaster } from 'kanto';
import { computed, ref, watch } from 'vue';
import { type DeckInput, useDecks } from '~/composables/useDecks';
import { DECK_COLORS, type DeckColor } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

/**
 * Create and edit share one modal: `deck` is the row being edited, or
 * `null`/absent for a new one. Every field is seeded from it and reset back
 * to blank/defaults for create — see `resetForm`, run whenever the modal is
 * about to open rather than on every prop change, so an edit in progress
 * does not get clobbered by an unrelated re-render.
 */
const props = defineProps<{ open: boolean; deck?: Deck | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const { create, update } = useDecks();

/**
 * The palette's real names, in `DECK_COLORS` order — see the task report for
 * how each was read off `--chart-series-1..8`'s hue rather than guessed.
 * Colour choice is always this fixed list; nothing here accepts free text.
 */
const COLOR_NAMES = ['Blue', 'Orange', 'Teal', 'Amber', 'Pink', 'Green', 'Purple', 'Red'] as const;
const colorOptions: KtOption[] = DECK_COLORS.map((token, i) => ({ id: token, label: COLOR_NAMES[i] }));

const name = ref('');
const description = ref('');
const colorToken = ref<DeckColor>(DECK_COLORS[0]);
const tag = ref('');
const nameError = ref('');
const saving = ref(false);

const heading = computed(() => (props.deck ? 'Edit deck' : 'New deck'));

function resetForm(): void {
  name.value = props.deck?.name ?? '';
  description.value = props.deck?.description ?? '';
  colorToken.value = (props.deck?.colorToken as DeckColor | undefined) ?? DECK_COLORS[0];
  tag.value = props.deck?.tag ?? '';
  nameError.value = '';
  saving.value = false;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetForm();
  },
);

function onNameInput(event: CustomEvent<{ value: string }>): void {
  name.value = event.detail.value;
  if (nameError.value && name.value.trim().length > 0) nameError.value = '';
}

function onDescriptionInput(event: CustomEvent<{ value: string }>): void {
  description.value = event.detail.value;
}

function onTagInput(event: CustomEvent<{ value: string }>): void {
  tag.value = event.detail.value;
}

function onColorChange(event: CustomEvent<{ value: string | number | null }>): void {
  if (typeof event.detail.value === 'string') colorToken.value = event.detail.value as DeckColor;
}

async function onSubmit(): Promise<void> {
  const trimmedName = name.value.trim();
  if (!trimmedName) {
    nameError.value = 'Name is required';
    return;
  }

  const input: DeckInput = { name: trimmedName, description: description.value, colorToken: colorToken.value, tag: tag.value.trim() };
  saving.value = true;
  try {
    if (props.deck) {
      await update(props.deck.id, input);
      toaster.success('Deck updated', { description: trimmedName });
    } else {
      await create(input);
      toaster.success('Deck created', { description: trimmedName });
    }
    emit('saved');
  } catch (err) {
    console.error('DeckFormModal: failed to save the deck', err);
    toaster.error("Couldn't save that deck", { description: 'Try again.' });
  } finally {
    saving.value = false;
  }
}

function onModalClose(event: CustomEvent): void {
  // No unsaved-work guard: nothing here is destructive, and cancelling
  // Escape/backdrop on a form this short would be more friction than it
  // saves — see kt-modal.md's own guidance on when to bother.
  void event;
  emit('close');
}
</script>

<template>
  <!--
    novalidate: `kt-button[type=submit]` submits through a real, temporary
    native <button> inside this form (see kt-button.ts's submitEnclosingForm),
    which otherwise runs the browser's own constraint validation first. With
    `required` on `kt-input`, that silently blocks the submit event entirely
    on an empty Name — verified in a real browser: no `submit` event fires,
    and nothing is shown (Chromium logs "An invalid form control ... is not
    focusable" and stops there). `required` stays on the field for its
    accessible "required" announcement; `novalidate` hands the actual
    validation and its visible feedback to `onSubmit` below, which is the
    inline `kt-input`/`kt-select` `error` prop the brief asks for.
  -->
  <form novalidate @submit.prevent="onSubmit">
    <kt-modal :open="open" :heading="heading" @kt-close="onModalClose">
      <kt-form>
        <kt-label-input label="Name" required>
          <kt-input name="name" required :value="name" :error="nameError" @kt-input="onNameInput" />
        </kt-label-input>

        <kt-label-input label="Description">
          <kt-textarea name="description" :value="description" rows="3" @kt-input="onDescriptionInput" />
        </kt-label-input>

        <!--
          `kt-label-input` only labels its first *direct* slotted child (see
          `kt-label-input.ts`'s `control` getter) — wrapping `kt-select` in
          this row's `div` for the swatch means that passthrough would land
          on the div instead. `label` is set on `kt-select` directly so its
          accessible name is correct regardless; the one thing lost is
          `kt-label-input`'s click-to-focus (a plain div has nothing to focus
          into) — the same class of limitation `index.vue` already documents
          for `kt-page-header`, and listed as a deferred minor rather than
          restructured around, same reasoning.
        -->
        <!--
          `clearable="false"`: `kt-select`'s clear button fires `kt-change`
          with `{ value: null, option: null }` (kt-select.ts's `clear()`),
          which left `colorToken` holding the last real colour while the
          field displayed empty — a stale colour was then what Save actually
          wrote. A colour is always required (never optional, never free
          text — see the task report), so there is no valid "cleared" state
          for this field to begin with; not offering the clear control at
          all removes the bad state rather than reacting to it after the
          fact. `clear()` is `kt-select`'s only source of a null `kt-change`
          (checked in kt-select.ts), so this closes the whole bug class.
        -->
        <kt-label-input label="Colour" required>
          <div class="color-row">
            <span class="swatch" :style="{ background: colorToken }" />
            <kt-select label="Colour" required :clearable="false" :options="colorOptions" :value="colorToken" @kt-change="onColorChange" />
          </div>
        </kt-label-input>

        <kt-label-input label="Tag">
          <kt-input name="tag" :value="tag" @kt-input="onTagInput" />
        </kt-label-input>
      </kt-form>

      <kt-button slot="footer" variant="dark" type="button" :disabled="saving" @click="emit('close')">Cancel</kt-button>
      <kt-button slot="footer" type="submit" :disabled="saving">{{ deck ? 'Save' : 'Create deck' }}</kt-button>
    </kt-modal>
  </form>
</template>

<style scoped>
.color-row { display: flex; align-items: center; gap: var(--gap-element); }
/* kt-select is `display: block` but has no intrinsic width of its own, so as
   a flex item it shrinks to its content (the trigger's text) rather than
   filling the row — flex: 1 is what makes it behave like the other fields. */
.color-row kt-select { flex: 1; min-width: 0; }
.swatch { width: 20px; height: 20px; border-radius: var(--radius-full); flex: none; }
</style>
