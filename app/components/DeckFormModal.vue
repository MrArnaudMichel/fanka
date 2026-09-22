<script setup lang="ts">
import { toaster } from 'kanto';
import { computed, ref, watch } from 'vue';
import DeckFields from '~/components/DeckFields.vue';
import { type DeckInput, useDecks } from '~/composables/useDecks';
import { DECK_COLORS, type DeckColor } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

/**
 * Create and edit share one modal: `deck` is the row being edited, or
 * `null`/absent for a new one. Every field is seeded from it and reset back
 * to blank/defaults for create — see `resetForm`, run whenever the modal is
 * about to open rather than on every prop change, so an edit in progress
 * does not get clobbered by an unrelated re-render. The fields themselves,
 * their validation and the colour swatch live in `DeckFields` (ruling 3,
 * task-13-report.md), shared with the deck detail page's Settings tab.
 */
const props = defineProps<{ open: boolean; deck?: Deck | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const { create, update } = useDecks();

const name = ref('');
const description = ref('');
const colorToken = ref<DeckColor>(DECK_COLORS[0]);
const tag = ref('');
const saving = ref(false);
const fieldsRef = ref<InstanceType<typeof DeckFields> | null>(null);

const heading = computed(() => (props.deck ? 'Edit deck' : 'New deck'));

function resetForm(): void {
  name.value = props.deck?.name ?? '';
  description.value = props.deck?.description ?? '';
  colorToken.value = (props.deck?.colorToken as DeckColor | undefined) ?? DECK_COLORS[0];
  tag.value = props.deck?.tag ?? '';
  saving.value = false;
  fieldsRef.value?.resetValidation();
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetForm();
  },
);

async function onSubmit(): Promise<void> {
  if (!fieldsRef.value?.validate()) return;

  const input: DeckInput = { name: name.value, description: description.value, colorToken: colorToken.value, tag: tag.value };
  saving.value = true;
  try {
    if (props.deck) {
      await update(props.deck.id, input);
      toaster.success('Deck updated', { description: name.value });
    } else {
      await create(input);
      toaster.success('Deck created', { description: name.value });
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
    validation and its visible feedback to `DeckFields.validate()`, which is
    the inline `kt-input` `error` prop the brief asks for.
  -->
  <form novalidate @submit.prevent="onSubmit">
    <kt-modal :open="open" :heading="heading" @kt-close="onModalClose">
      <DeckFields ref="fieldsRef" v-model:name="name" v-model:description="description" v-model:color-token="colorToken" v-model:tag="tag" />

      <kt-button slot="footer" variant="dark" type="button" :disabled="saving" @click="emit('close')">Cancel</kt-button>
      <kt-button slot="footer" type="submit" :disabled="saving">{{ deck ? 'Save' : 'Create deck' }}</kt-button>
    </kt-modal>
  </form>
</template>
