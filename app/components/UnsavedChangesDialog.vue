<script setup lang="ts">
defineProps<{ open: boolean }>();
const emit = defineEmits<{ stay: []; leave: [] }>();
</script>

<template>
  <kt-confirm-dialog
    :open="open"
    heading="Leave without saving?"
    message="Your changes on this page haven't been saved."
    confirm-label="Leave"
    cancel-label="Stay"
    variant="danger"
    @kt-confirm="emit('leave')"
    @kt-cancel="emit('stay')"
  />
</template>
