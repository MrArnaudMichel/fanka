<script setup lang="ts">
import type { RunKind } from '~/composables/useStudyRun';

/**
 * The strip above a session's card: how far along it is, and the way out.
 * Undo and Leave sit here rather than in the page header's actions: at phone
 * width kt-page-header wraps its actions onto a row of their own, which cost
 * a card's worth of height for two icons.
 */
const props = defineProps<{
  kind: RunKind;
  position: number;
  total: number;
  seen: number;
  right: number;
  canUndo: boolean;
  leaveHref: string;
}>();
defineEmits<{ undo: [] }>();

const percent = computed(() => (props.total === 0 ? 0 : (props.position / props.total) * 100));
const leaveLabel = computed(() => (props.kind === 'scheduled' ? 'Leave session' : props.kind === 'lesson' ? 'Leave lesson' : 'Leave practice'));
</script>

<template>
  <div class="progress">
    <div class="row">
      <span v-if="kind === 'endless'" class="mono">{{ seen }} seen · {{ right }} right</span>
      <span v-else-if="kind === 'lesson'" class="mono">{{ position }} / {{ total }} learned · {{ seen }} answered</span>
      <span v-else class="mono">{{ position }} / {{ total }}</span>
      <span class="actions">
        <kt-button v-if="kind === 'scheduled'" variant="secondary-no-bg" size="small" icon="undo-2" label="Undo" :disabled="!canUndo" @click="$emit('undo')" />
        <kt-button variant="secondary-no-bg" size="small" icon="x" :label="leaveLabel" @click="navigateTo(leaveHref)" />
      </span>
    </div>
    <kt-progress-bar v-if="kind !== 'endless'" :value="percent" :label="kind === 'lesson' ? 'Lesson progress' : 'Session progress'" />
  </div>
</template>

<style scoped>
.progress { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; justify-content: space-between; }
.actions { display: flex; gap: var(--gap-button); }
.mono { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
</style>
