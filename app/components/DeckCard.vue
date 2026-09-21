<script setup lang="ts">
import type { Deck } from '~core/db/schema';

/**
 * One deck, shown compactly: a colour swatch, the name and its tag. Used by
 * the Today deck list; Task 10 extends this same component for the Decks
 * screen, so it stays small and takes the whole deck as a single prop
 * rather than growing a parameter per field.
 */
defineProps<{ deck: Deck }>();
</script>

<template>
  <kt-card>
    <div class="row">
      <span class="swatch" :style="{ background: deck.colorToken }" />
      <span class="name">{{ deck.name }}</span>
      <kt-badge variant="category" tone="neutral" size="small" :label="deck.tag" />
    </div>
  </kt-card>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 10px; }
/* 10px matches no token by value (closest are --gap-button at 8px and
   --gap-drag-drop at 12px, and neither name describes this row), so it
   stays a literal — same precedent as index.vue's .counts gap. */
.swatch { width: 4px; height: 26px; border-radius: var(--radius-full); flex: none; }
.name { flex: 1; min-width: 0; font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
