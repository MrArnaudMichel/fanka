<script setup lang="ts">
/**
 * A lesson is the decks that share a tag (see `~core/lessons`). Here each one
 * is studied as a whole: learned in one sitting, written, drilled on meanings,
 * or spoken.
 */
const { lessons, untagged, loading, failed, load } = useLessons();
onMounted(() => load());
</script>

<template>
  <div class="lessons">
    <kt-page-header
      eyebrow="Learn"
      heading="Lessons"
      description="Study a whole lesson at once. Learn lesson shows every card until you get each one right; answers count as practice, and new cards start their schedule."
    />

    <kt-skeleton v-if="loading" height="200px" />

    <kt-empty-state v-else-if="failed" icon="triangle-alert" heading="Couldn't load the lessons" description="Something went wrong reading the database. Try again.">
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load()">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="lessons.length === 0"
      icon="book-open"
      heading="No lessons yet"
      description="Give decks the same tag, such as Lesson 5, and they are studied here as one lesson."
    >
      <kt-button slot="actions" variant="primary" size="medium" icon="layers" @click="navigateTo('/decks')">Go to decks</kt-button>
    </kt-empty-state>

    <template v-else>
      <div class="grid">
        <LessonCard v-for="l in lessons" :key="l.lesson" :lesson="l" />
      </div>
      <kt-alert
        v-if="untagged > 0"
        variant="info"
        :description="`${untagged} deck${untagged === 1 ? ' has' : 's have'} no lesson. Give a deck a tag on the Decks page to group it here.`"
      />
    </template>
  </div>
</template>

<style scoped>
.lessons { display: flex; flex-direction: column; gap: 24px; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); }
@media (min-width: 900px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
