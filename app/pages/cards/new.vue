<script setup lang="ts">
import CardForm from '~/components/CardForm.vue';

const route = useRoute();
const defaultDeckId = computed(() => (typeof route.query.deck === 'string' ? route.query.deck : undefined));
</script>

<template>
  <CardForm :default-deck-id="defaultDeckId" />
</template>
