<script setup lang="ts">
import CardForm from '~/components/CardForm.vue';

const route = useRoute();
const cardId = computed(() => route.params.id as string);
</script>

<template>
  <!-- Keyed on the id: useCardEditor reads its `id` argument once, at setup,
       so navigating between two edit URLs (e.g. Browse's Edit action on two
       different rows) must remount CardForm rather than reuse the instance
       with a stale draft. -->
  <CardForm :key="cardId" :card-id="cardId" />
</template>
