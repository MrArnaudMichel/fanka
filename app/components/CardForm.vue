<script setup lang="ts">
import type { KtOption } from 'kanto';
import { toaster } from 'kanto';
import PinyinText from '~/components/PinyinText.vue';
import TagInput from '~/components/TagInput.vue';
import { useCardEditor } from '~/composables/useCardEditor';
import type { PartOfSpeech } from '~core/db/schema';
import type { CardField } from '~core/import/validate';

/**
 * One form for both `/cards/new` and `/cards/:id`: `cardId` selects edit vs
 * create, `defaultDeckId` is Task 12's future `?deck=<id>` link (and any
 * other "add to this deck" entry point).
 */
const props = defineProps<{ cardId?: string; defaultDeckId?: string }>();

const editing = computed(() => Boolean(props.cardId));
const router = useRouter();

const { draft, directions, issues, preview, save, loading, saving, notFound, error, retry, suspended, directionsError, decks, allTags } =
  useCardEditor(props.cardId);

/**
 * Ruling 6: the deck defaults to the first one (`useCardEditor`'s own
 * default); `defaultDeckId` only overrides that for a *new* card, once the
 * editor has loaded and the id resolves to a real, currently-live deck. It
 * never touches an edit's own deck.
 */
watch(
  () => loading.value,
  (isLoading) => {
    if (isLoading || editing.value) return;
    if (props.defaultDeckId && decks.value.some((d) => d.id === props.defaultDeckId)) {
      draft.deckId = props.defaultDeckId;
    }
  },
  { immediate: true },
);

const POS_OPTIONS: KtOption[] = [
  { id: 'noun', label: 'Noun' },
  { id: 'verb', label: 'Verb' },
  { id: 'adjective', label: 'Adjective' },
  { id: 'adverb', label: 'Adverb' },
  { id: 'phrase', label: 'Phrase' },
];

const deckOptions = computed<KtOption[]>(() => decks.value.map((d) => ({ id: d.id, label: d.name })));

/** Every `CardField` the form renders its own field for — see `unmappedIssues`. */
const RENDERED_FIELDS: CardField[] = ['hanzi', 'pinyin', 'translation', 'example', 'examplePinyin', 'exampleTranslation', 'tags'];

/**
 * Ruling 4: an issue only shows once its field has been touched (blurred —
 * `kt-input`/`kt-textarea`'s `kt-change` fires on commit) or a save has been
 * attempted — never while the learner is still typing their first
 * character into a field they have not left yet.
 */
const submitted = ref(false);
const touched = reactive<Partial<Record<CardField, boolean>>>({});

function touch(field: CardField): void {
  touched[field] = true;
}

function messageFor(field: CardField): string {
  const matches = issues.value.filter((issue) => issue.field === field);
  return matches.find((issue) => issue.severity === 'error')?.message ?? matches[0]?.message ?? '';
}

function fieldError(field: CardField): string {
  if (!submitted.value && !touched[field]) return '';
  return messageFor(field);
}

/**
 * `zhuyin` is a valid `CardField` (see core/import/validate.ts) but this
 * form has no field for it — it is derived, shown only in the live preview.
 * An issue on it (none today, but the validator owns that list, not this
 * form) would otherwise be invisible; ruling 4 puts it here instead.
 */
const unmappedIssues = computed(() => {
  if (!submitted.value) return [];
  return issues.value.filter((issue) => !RENDERED_FIELDS.includes(issue.field));
});
const alertVariant = computed(() => (unmappedIssues.value.some((issue) => issue.severity === 'error') ? 'danger' : 'warning'));

/** Ruling 5: the sole enabled direction is disabled, not just discouraged — a card needs at least one. */
const recognitionSole = computed(() => directions.recognition && !directions.production);
const productionSole = computed(() => directions.production && !directions.recognition);
/**
 * A fully suspended card's toggles are read-only: suspension belongs to
 * Browse (final review I2), and changing a direction here would otherwise
 * un-suspend the other one as a side effect.
 */
const recognitionDisabled = computed(() => suspended.value || recognitionSole.value);
const productionDisabled = computed(() => suspended.value || productionSole.value);
const recognitionLabel = computed(() =>
  !suspended.value && recognitionSole.value ? 'Recognition — required, keep at least one direction on' : 'Recognition',
);
const productionLabel = computed(() =>
  !suspended.value && productionSole.value ? 'Production — required, keep at least one direction on' : 'Production',
);

function onHanziInput(event: CustomEvent<{ value: string }>): void {
  draft.hanzi = event.detail.value;
}
function onPinyinInput(event: CustomEvent<{ value: string }>): void {
  draft.pinyin = event.detail.value;
}
function onTranslationInput(event: CustomEvent<{ value: string }>): void {
  draft.translation = event.detail.value;
}
function onExampleInput(event: CustomEvent<{ value: string }>): void {
  draft.example = event.detail.value;
}
function onExamplePinyinInput(event: CustomEvent<{ value: string }>): void {
  draft.examplePinyin = event.detail.value;
}
function onExampleTranslationInput(event: CustomEvent<{ value: string }>): void {
  draft.exampleTranslation = event.detail.value;
}
function onNoteInput(event: CustomEvent<{ value: string }>): void {
  draft.note = event.detail.value;
}

function onDeckChange(event: CustomEvent<{ value: string | number | null }>): void {
  if (typeof event.detail.value === 'string') draft.deckId = event.detail.value;
}
function onPosChange(event: CustomEvent<{ value: string | number | null }>): void {
  if (typeof event.detail.value === 'string') draft.pos = event.detail.value as PartOfSpeech;
}
function onTagsChange(tags: string[]): void {
  draft.tags = tags;
}

function onRecognitionChange(event: CustomEvent<{ checked: boolean }>): void {
  directions.recognition = event.detail.checked;
}
function onProductionChange(event: CustomEvent<{ checked: boolean }>): void {
  directions.production = event.detail.checked;
}

/**
 * Ruling 2: after a successful save, go back to where the learner came
 * from; a direct load (a fresh tab, a reload) has nothing to go back to, so
 * it falls to `/decks` — never `/browse`, which does not exist until Task
 * 12. `router.options.history.state.back` is vue-router's own record of the
 * previous entry in *this* browsing session: null exactly when there isn't
 * one.
 */
function goBackOrDecks(): void {
  if (router.options.history.state.back) {
    router.back();
  } else {
    navigateTo('/decks');
  }
}

async function onSubmit(): Promise<void> {
  // A double Enter, or a fast double-click on Save while the first save is
  // still in flight, must not fire a second `save()` — `saving` is already
  // true for exactly that window.
  if (saving.value) return;
  submitted.value = true;
  try {
    const ok = await save();
    if (ok) {
      toaster.success('Card saved');
      goBackOrDecks();
    }
  } catch (err) {
    console.error('CardForm: failed to save the card', err);
    toaster.error("Couldn't save that card", { description: 'Try again.' });
  }
}
</script>

<template>
  <div class="card-editor">
    <kt-page-header eyebrow="Collection" :heading="editing ? 'Edit card' : 'New card'" />

    <kt-skeleton v-if="loading" height="480px" />

    <kt-empty-state
      v-else-if="error"
      icon="triangle-alert"
      :heading="editing ? 'Couldn\'t load this card' : 'Couldn\'t load your decks'"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="retry">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="notFound"
      icon="file-question"
      heading="Card not found"
      description="This card doesn't exist, or it has been deleted."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="layers" @click="goBackOrDecks">Back to decks</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="decks.length === 0"
      icon="layers"
      heading="No decks yet"
      description="Create a deck before adding cards to it."
    >
      <kt-button slot="actions" variant="primary" size="medium" icon="plus" @click="navigateTo('/decks')">Go to decks</kt-button>
    </kt-empty-state>

    <!--
      novalidate: see DeckFormModal.vue's own comment. `kt-button[type=submit]`
      proxies a real native <button> inside this form, which otherwise runs
      the browser's constraint validation first and silently blocks submit
      on a `required` field the learner hasn't filled in yet — `onSubmit`
      below does that validation instead, through `fieldError`/`kt-alert`.
    -->
    <form v-else novalidate @submit.prevent="onSubmit">
      <!--
        The direction toggles, the issues alert and the actions sit outside
        kt-form, inside the same <form>: kt-form's syncDisabled() sets
        `disabled = false` on every control nested in its default slot on
        first render and on every slotchange — and the pinyin preview below is
        a conditional child, so typing pinyin re-enabled toggles that must
        stay locked. `.panel` carries kt-form's card look (the same tokens as
        its fieldset) around all of it, and kt-form's own box is flattened
        through its public `base` part, so the layout reads as one form.
      -->
      <div class="panel">
        <kt-form class="fields">
          <kt-label-input label="Hanzi" required>
            <kt-input
              name="hanzi"
              required
              :value="draft.hanzi"
              :error="fieldError('hanzi')"
              @kt-input="onHanziInput"
              @kt-change="touch('hanzi')"
            />
          </kt-label-input>

          <kt-label-input label="Pinyin" required>
            <kt-input
              name="pinyin"
              required
              placeholder="xué xí"
              :value="draft.pinyin"
              :error="fieldError('pinyin')"
              @kt-input="onPinyinInput"
              @kt-change="touch('pinyin')"
            />
          </kt-label-input>

          <p v-if="preview.pinyin.length > 0" class="preview">
            <PinyinText :syllables="preview.pinyin" />
            <span v-if="preview.zhuyin" class="zhuyin">{{ preview.zhuyin }}</span>
          </p>

          <kt-label-input label="Translation" required>
            <kt-input
              name="translation"
              required
              :value="draft.translation"
              :error="fieldError('translation')"
              @kt-input="onTranslationInput"
              @kt-change="touch('translation')"
            />
          </kt-label-input>

          <div class="row">
            <!-- Direct child of kt-label-input, so its label auto-forwards — no separate `label` needed (see kt-label-input.md). -->
            <kt-label-input label="Part of speech" required class="grow">
              <kt-select :options="POS_OPTIONS" :value="draft.pos" :clearable="false" required @kt-change="onPosChange" />
            </kt-label-input>

            <kt-label-input label="Deck" required class="grow">
              <kt-select :options="deckOptions" :value="draft.deckId" :clearable="false" required @kt-change="onDeckChange" />
            </kt-label-input>
          </div>

          <kt-label-input label="Example">
            <kt-textarea
              name="example"
              rows="2"
              :value="draft.example"
              :error="fieldError('example')"
              @kt-input="onExampleInput"
              @kt-change="touch('example')"
            />
          </kt-label-input>

          <kt-label-input label="Example pinyin">
            <kt-input
              name="examplePinyin"
              :value="draft.examplePinyin"
              :error="fieldError('examplePinyin')"
              @kt-input="onExamplePinyinInput"
              @kt-change="touch('examplePinyin')"
            />
          </kt-label-input>

          <kt-label-input label="Example translation">
            <kt-textarea
              name="exampleTranslation"
              rows="2"
              :value="draft.exampleTranslation"
              :error="fieldError('exampleTranslation')"
              @kt-input="onExampleTranslationInput"
              @kt-change="touch('exampleTranslation')"
            />
          </kt-label-input>

          <!--
            TagInput is not itself a Kanto form control, so kt-label-input's
            label-forwarding (it only targets its first direct slotted
            element) would land on TagInput's own wrapping div, same class of
            limitation as DeckFormModal.vue's colour row. `label` is passed to
            TagInput directly, which forwards it to its inner kt-input-menu.
          -->
          <kt-label-input label="Tags">
            <TagInput label="Tags" :model-value="draft.tags" :options="allTags" :error="fieldError('tags')" @update:model-value="onTagsChange" />
          </kt-label-input>

          <kt-label-input label="Note">
            <kt-textarea name="note" rows="2" :value="draft.note" @kt-input="onNoteInput" />
          </kt-label-input>
        </kt-form>

        <div class="directions">
          <p class="section-label">Study directions</p>
          <kt-alert v-if="suspended" variant="warning" description="This card is suspended and won't be reviewed. Unsuspend it from Cards." />
          <kt-toggle
            :checked="directions.recognition"
            :disabled="recognitionDisabled"
            :label="recognitionLabel"
            @kt-change="onRecognitionChange"
          >
            Recognition
          </kt-toggle>
          <kt-toggle
            :checked="directions.production"
            :disabled="productionDisabled"
            :label="productionLabel"
            @kt-change="onProductionChange"
          >
            Production
          </kt-toggle>
          <kt-alert v-if="directionsError" variant="danger" :description="directionsError" />
        </div>

        <kt-alert v-if="unmappedIssues.length > 0" :variant="alertVariant" heading="Check this card">
          <p v-for="issue in unmappedIssues" :key="issue.message">{{ issue.message }}</p>
        </kt-alert>

        <div class="actions">
          <kt-button variant="dark" type="button" :disabled="saving" @click="goBackOrDecks">Cancel</kt-button>
          <kt-button type="submit" :disabled="saving">Save</kt-button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.card-editor { display: flex; flex-direction: column; gap: 24px; }
.preview { display: flex; align-items: center; gap: var(--gap-button); margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.zhuyin { font-family: var(--fk-font-hanzi-serif); }
.row { display: flex; gap: var(--gap-element); flex-wrap: wrap; }
.row .grow { flex: 1; min-width: 160px; }
.row kt-select { width: 100%; }
/* kt-form's fieldset look (kt-form.ts), moved out to wrap the controls kept outside it. */
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-form);
  padding: var(--padding-card);
  background-color: var(--surface-form);
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--border-radius-card);
}
.fields::part(base) { padding: 0; background: none; border: none; border-radius: 0; }
.actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--gap-button); }
.directions { display: flex; flex-direction: column; gap: var(--gap-button); }
.section-label { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
</style>
