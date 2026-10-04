<script setup lang="ts">
/** One titled block of a legal page: an icon, a heading, then the text. */
defineProps<{ icon: string; heading: string }>();
</script>

<template>
  <kt-card>
    <div class="body">
      <div class="head">
        <span class="badge"><kt-icon :name="icon" /></span>
        <h2>{{ heading }}</h2>
      </div>
      <slot />
    </div>
  </kt-card>
</template>

<style scoped>
.body { display: flex; flex-direction: column; gap: var(--gap-element); }
.head { display: flex; align-items: center; gap: var(--gap-element); }
.badge {
  display: grid;
  place-items: center;
  padding: var(--padding-chip);
  border-radius: var(--border-radius);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}
h2 { font: var(--font-title-h6); color: var(--text-body); margin: 0; }
.body :deep(p) { font: var(--font-normal-regular); color: var(--text-muted); margin: 0; }
</style>
