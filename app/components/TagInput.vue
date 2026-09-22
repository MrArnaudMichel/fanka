<script setup lang="ts">
import type { KtInputMenu, KtOption } from 'kanto';
import type { ComponentPublicInstance } from 'vue';

/**
 * Kanto has no multi-value tag input, so this composes one from
 * `kt-input-menu` (choose or type) plus a `kt-badge` per chosen tag, each
 * paired with its own icon-only remove button — see task-11-report.md for
 * why a badge cannot host that button in its own slot and still read as a
 * label rather than a second control.
 */
const props = defineProps<{ modelValue: string[]; options: string[]; label?: string; error?: string }>();
const emit = defineEmits<{ 'update:modelValue': [string[]] }>();

const query = ref('');
const menuEl = ref<KtInputMenu | null>(null);

/**
 * Already-chosen tags drop out of the list — picking one again would be a
 * no-op that only clutters the popup. When the typed query does not match
 * an existing tag (case-insensitively), an "Add …" option is offered first,
 * so typing a brand new tag and pressing Enter adds it — `kt-input-menu`
 * only ever commits a listed option, so a free-typed tag needs one synthesised
 * for it.
 */
const filteredOptions = computed<KtOption[]>(() => {
  const trimmedQuery = query.value.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const available = props.options.filter((tag) => !props.modelValue.includes(tag));
  const matches = lowerQuery.length > 0 ? available.filter((tag) => tag.toLowerCase().includes(lowerQuery)) : available;
  const opts: KtOption[] = matches.map((tag) => ({ id: tag, label: tag }));
  const exactMatch = available.some((tag) => tag.toLowerCase() === lowerQuery);
  if (trimmedQuery.length > 0 && !exactMatch) {
    opts.unshift({ id: trimmedQuery, label: `Add "${trimmedQuery}"` });
  }
  return opts;
});

function onFilter(event: CustomEvent<{ query: string }>): void {
  query.value = event.detail.query;
}

function addTag(tag: string): boolean {
  const trimmed = tag.trim();
  if (trimmed.length === 0 || props.modelValue.includes(trimmed)) return false;
  emit('update:modelValue', [...props.modelValue, trimmed]);
  return true;
}

/** `part="input"` is the documented, stable part every `kt-input-menu.md` example styles through — not an internal implementation detail. */
function menuInput(): HTMLInputElement | null {
  return menuEl.value?.shadowRoot?.querySelector<HTMLInputElement>('[part="input"]') ?? null;
}

/**
 * Clears the field for the next tag without remounting the element (a
 * remount destroys and recreates the native `<input>`, which is what was
 * stealing focus back to `<body>` — see task-11-report.md's Fix round 1).
 *
 * `value` is cleared through its own public `@property` — direct and
 * documented. `query`/`open`/`activeIndex` have no such public setter, so
 * they are cleared by simulating the exact keystroke a learner would use to
 * get the same result — Escape, which `kt-input-menu`'s own `onKeyDown`
 * already closes and clears the query for (see `close()` in its source) —
 * rather than reaching into its private state.
 */
function resetMenuField(): void {
  const el = menuEl.value;
  if (!el) return;
  el.value = null;
  const input = menuInput();
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
  query.value = '';
  input?.focus();
}

function onChange(event: CustomEvent<{ value: string | number | null }>): void {
  if (typeof event.detail.value === 'string') addTag(event.detail.value);
  resetMenuField();
}

/**
 * `kt-input-menu` computes the Enter key's `activeIndex` synchronously in
 * its own `onKeyDown`, against whatever `options` it was last given — but
 * the "Add …" option for a brand-new tag only lands a tick later, once this
 * component's own `kt-filter` handler above has re-derived `filteredOptions`
 * and Vue has pushed it back down as a prop. So typing a new tag and
 * pressing Enter *immediately* finds no active option internally and
 * commits nothing — this listens on the host (the keydown event is composed
 * and bubbles out through the shadow boundary) and adds the trimmed last
 * `kt-filter` query itself as a fallback.
 *
 * This never double-adds: when `kt-input-menu`'s own Enter handling *did*
 * commit a real option, it already fired `kt-change` synchronously, earlier
 * in this same event's bubble phase (the shadow-internal listener runs
 * before this host-level one) — `onChange` above has therefore already
 * cleared `query` by the time this runs, so `pending` here is empty and this
 * is a no-op. `addTag`'s own dedupe is a second, independent backstop.
 */
function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;
  const pending = query.value.trim();
  if (pending.length === 0) return;
  addTag(pending);
  resetMenuField();
}

const removeButtons = new Map<string, HTMLElement>();
/** A bound ref callback per tag, so the template needn't type an inline arrow (Vue's template-ref element type is broader than plain `Element`). */
function removeRef(tag: string): (el: Element | ComponentPublicInstance | null) => void {
  return (el) => {
    if (el) removeButtons.set(tag, el as HTMLElement);
    else removeButtons.delete(tag);
  };
}

/**
 * Moves focus to where the removed button used to be: the tag that slides
 * into its position, or — for the last tag — the one now left last, or —
 * once none are left — back to the tag field, so it never falls through to
 * `<body>`.
 */
async function removeTag(tag: string): Promise<void> {
  const index = props.modelValue.indexOf(tag);
  const next = props.modelValue.filter((t) => t !== tag);
  emit('update:modelValue', next);
  await nextTick();
  if (next.length === 0) {
    menuInput()?.focus();
    return;
  }
  const targetTag = next[Math.min(index, next.length - 1)]!;
  removeButtons.get(targetTag)?.focus();
}
</script>

<template>
  <div class="tag-input">
    <kt-input-menu
      ref="menuEl"
      :label="label ?? 'Tags'"
      placeholder="Add a tag"
      :options="filteredOptions"
      :error="error ?? ''"
      empty-text="No matching tags"
      @kt-filter="onFilter"
      @kt-change="onChange"
      @keydown="onMenuKeydown"
    />
    <div v-if="modelValue.length > 0" class="tags">
      <span v-for="tag in modelValue" :key="tag" class="tag">
        <kt-badge size="small">{{ tag }}</kt-badge>
        <kt-button
          :ref="removeRef(tag)"
          icon="x"
          :label="`Remove tag ${tag}`"
          variant="secondary-no-bg"
          size="small"
          @click="removeTag(tag)"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.tag-input { display: flex; flex-direction: column; gap: var(--gap-element); }
.tags { display: flex; flex-wrap: wrap; gap: var(--gap-element); }
.tag { display: inline-flex; align-items: center; gap: var(--gap-element); }
</style>
