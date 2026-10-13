<script setup lang="ts">
/** Above a focused practice session: how many words it holds, and the way back to every studied deck. */
const props = defineProps<{ count: number }>();

function practiseEverything(): void {
  const route = useRoute();
  void navigateTo({ path: route.path, query: { endless: '1' } });
}
</script>

<template>
  <kt-alert variant="info" :description="`Practising ${props.count} weak word${props.count === 1 ? '' : 's'} from Statistics.`">
    <kt-button slot="actions" variant="secondary-no-bg" size="small" @click="practiseEverything">Practise everything</kt-button>
  </kt-alert>
</template>
