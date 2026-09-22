<script setup lang="ts">
import type { KtOption } from 'kanto';

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

/**
 * Remounting the menu (via `:key`) after every pick, rather than resetting
 * its `value` property, is what actually clears the field: `kt-input-menu`
 * keeps the chosen option's id as its own internal state once `kt-change`
 * fires, and re-passing the same `value` prop (unchanged, still `''`) is a
 * no-op patch that Vue skips — verified against kt-input-menu.ts's `choose()`.
 * A fresh instance starts with no selection and no query, which is exactly
 * the empty field the next tag needs.
 */
const menuKey = ref(0);

function addTag(tag: string): void {
  const trimmed = tag.trim();
  if (trimmed.length === 0 || props.modelValue.includes(trimmed)) return;
  emit('update:modelValue', [...props.modelValue, trimmed]);
}

function onChange(event: CustomEvent<{ value: string | number | null }>): void {
  if (typeof event.detail.value === 'string') addTag(event.detail.value);
  query.value = '';
  menuKey.value += 1;
}

function removeTag(tag: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t !== tag),
  );
}
</script>

<template>
  <div class="tag-input">
    <kt-input-menu
      :key="menuKey"
      :label="label ?? 'Tags'"
      placeholder="Add a tag"
      :options="filteredOptions"
      :error="error ?? ''"
      empty-text="No matching tags"
      @kt-filter="onFilter"
      @kt-change="onChange"
    />
    <div v-if="modelValue.length > 0" class="tags">
      <span v-for="tag in modelValue" :key="tag" class="tag">
        <kt-badge size="small">{{ tag }}</kt-badge>
        <kt-button icon="x" :label="`Remove tag ${tag}`" variant="secondary-no-bg" size="small" @click="removeTag(tag)" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.tag-input { display: flex; flex-direction: column; gap: var(--gap-element); }
.tags { display: flex; flex-wrap: wrap; gap: var(--gap-element); }
.tag { display: inline-flex; align-items: center; gap: var(--gap-element); }
</style>
