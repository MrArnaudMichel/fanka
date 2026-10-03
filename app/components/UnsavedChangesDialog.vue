<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; message?: string }>(), { message: "Your changes on this page haven't been saved." });
const emit = defineEmits<{ stay: []; leave: [] }>();
</script>

<template>
  <kt-confirm-dialog
    :open="open"
    heading="Leave without saving?"
    :message="message"
    confirm-label="Leave"
    cancel-label="Stay"
    variant="danger"
    @kt-confirm="emit('leave')"
    @kt-cancel="emit('stay')"
  />
</template>
