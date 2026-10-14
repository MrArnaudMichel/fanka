<script setup lang="ts">
import type { KtOption } from 'kanto-ds';
import { DECK_COLORS, type DeckColor } from '~core/db/repositories';

/**
 * The deck fields — name, description, colour and tag — shared by
 * `DeckFormModal` (the create/edit modal) and the deck detail page's
 * Settings tab (ruling 3, task-13-report.md). One place for the fields,
 * their validation and the colour swatch, so the two screens cannot quietly
 * drift apart the way two copies would let them.
 */
const name = defineModel<string>('name', { required: true });
const description = defineModel<string>('description', { required: true });
const colorToken = defineModel<DeckColor>('colorToken', { required: true });
const tag = defineModel<string>('tag', { required: true });

/**
 * The palette's real names, in `DECK_COLORS` order — see task-10-report.md
 * for how each was read off `--chart-series-1..8`'s hue rather than guessed.
 * Colour choice is always this fixed list; nothing here accepts free text.
 */
const COLOR_NAMES = ['Blue', 'Orange', 'Teal', 'Amber', 'Pink', 'Green', 'Purple', 'Red'] as const;
const colorOptions: KtOption[] = DECK_COLORS.map((token, i) => ({ id: token, label: COLOR_NAMES[i] }));

const nameError = ref('');

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

/**
 * Trims name and tag in place and checks the one required field, the same
 * check `DeckFormModal`'s `onSubmit` always ran inline. Returns false (and
 * sets `nameError`, the visible `kt-input` `error`) without touching
 * anything else when the name is blank, so a caller's submit handler can
 * bail out exactly the way the modal always has.
 */
function validate(): boolean {
  const trimmedName = name.value.trim();
  if (!trimmedName) {
    nameError.value = 'Name is required';
    return false;
  }
  name.value = trimmedName;
  tag.value = tag.value.trim();
  nameError.value = '';
  return true;
}

/** Clears a stale error left over from a previous, unrelated submit attempt — run whenever a caller reseeds the fields from a fresh row. */
function resetValidation(): void {
  nameError.value = '';
}

defineExpose({ validate, resetValidation });
</script>

<template>
  <kt-form>
    <kt-label-input label="Name" required>
      <kt-input name="name" required :value="name" :error="nameError" @kt-input="onNameInput" />
    </kt-label-input>

    <kt-label-input label="Description">
      <kt-textarea name="description" :value="description" rows="3" @kt-input="onDescriptionInput" />
    </kt-label-input>

    <!--
      `kt-label-input` only labels its first *direct* slotted child (see
      `kt-label-input.ts`'s `control` getter) — wrapping `kt-select` in this
      row's `div` for the swatch means that passthrough would land on the div
      instead. `label` is set on `kt-select` directly so its accessible name
      is correct regardless; the one thing lost is `kt-label-input`'s
      click-to-focus (a plain div has nothing to focus into) — the same class
      of limitation `decks/index.vue` already documents for `kt-page-header`,
      and listed as a deferred minor rather than restructured around, same
      reasoning.
    -->
    <!--
      `clearable="false"`: `kt-select`'s clear button fires `kt-change` with
      `{ value: null, option: null }` (kt-select.ts's `clear()`), which left
      `colorToken` holding the last real colour while the field displayed
      empty — a stale colour was then what Save actually wrote. A colour is
      always required (never optional, never free text — see
      task-10-report.md), so there is no valid "cleared" state for this field
      to begin with; not offering the clear control at all removes the bad
      state rather than reacting to it after the fact. `clear()` is
      `kt-select`'s only source of a null `kt-change` (checked in
      kt-select.ts), so this closes the whole bug class.
    -->
    <kt-label-input label="Colour" required>
      <div class="color-row">
        <span class="swatch" :style="{ background: colorToken }" />
        <kt-select label="Colour" required :clearable="false" :options="colorOptions" :value="colorToken" @kt-change="onColorChange" />
      </div>
    </kt-label-input>

    <!-- The tag is the deck's lesson: decks that share one are listed and studied together. -->
    <kt-label-input label="Lesson">
      <kt-input name="tag" placeholder="Lesson 3" :value="tag" @kt-input="onTagInput" />
    </kt-label-input>
  </kt-form>
</template>

<style scoped>
.color-row { display: flex; align-items: center; gap: var(--gap-element); }
/* kt-select is `display: block` but has no intrinsic width of its own, so as
   a flex item it shrinks to its content (the trigger's text) rather than
   filling the row — flex: 1 is what makes it behave like the other fields. */
.color-row kt-select { flex: 1; min-width: 0; }
.swatch { width: 20px; height: 20px; border-radius: var(--radius-full); flex: none; }
</style>
