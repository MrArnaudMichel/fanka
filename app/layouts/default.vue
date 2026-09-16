<script setup lang="ts">
import { useDueCounts } from '~/composables/useDueCounts';
import { useNavigation } from '~/composables/useNavigation';

const { total } = useDueCounts();
const { main, library, bar } = useNavigation(total);

// The mockup's breakpoint. Above it the sidebar; below it the bottom bar.
const wide = ref(true);
function measure() {
  wide.value = window.innerWidth >= 900;
}
onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
});
onUnmounted(() => window.removeEventListener('resize', measure));
</script>

<template>
  <div class="shell">
    <AppSidebar v-if="wide" :main="main" :library="library" :due-total="total" />
    <main class="main">
      <div class="page">
        <slot />
      </div>
      <AppBottomNav v-if="!wide" :entries="bar" />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; background: var(--surface-page); color: var(--text-body); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.page { flex: 1; min-width: 0; padding: 24px; padding-bottom: 96px; max-width: 1240px; width: 100%; margin: 0 auto; }
</style>
