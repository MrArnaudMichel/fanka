<template>
  <!-- The sections live under Settings in the app's own sidebar (and its phone menu); this is only their page frame. -->
  <div class="settings-page">
    <NuxtPage />
  </div>
</template>

<style scoped>
.settings-page { display: flex; flex-direction: column; gap: var(--gap-card); }
</style>
