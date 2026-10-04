<script setup lang="ts">
/** Fanka's mark: 繁 on the accent colour. `large` in the sidebar, `small` in compact bars. */
withDefaults(defineProps<{ size?: 'small' | 'large' }>(), { size: 'small' });
</script>

<template>
  <span class="mark" :class="size" aria-hidden="true">繁</span>
</template>

<style scoped>
.mark {
  flex: none;
  border-radius: var(--border-radius);
  background: var(--color-primary-base);
  display: grid;
  place-items: center;
  font-family: var(--fk-font-hanzi-serif);
  color: var(--color-white);
}
.small { width: 24px; height: 24px; font-size: 14px; }
.large { width: 32px; height: 32px; font-size: 19px; }
</style>
