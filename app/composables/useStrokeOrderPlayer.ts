import type { DeepReadonly } from 'vue';
import type { CharacterStrokes } from '~core/chinese/strokes';

/** One character for `StrokeOrderPanel`, with the stroke to mark, if any. */
export interface StrokeOrderEntry {
  character: string;
  model: DeepReadonly<CharacterStrokes>;
  highlight: { index: number; tone: 'danger' | 'warning' } | null;
}

/**
 * The stroke-order player's state. `shown` strokes are drawn whole;
 * `drawing` is the one being animated, or `null`. The component calls
 * `strokeEnded` when that stroke's animation ends — under reduced motion
 * Kanto's duration tokens are 0s, so it ends at once and a replay shows the
 * whole character.
 *
 * `run` changes on every replay; the component keys the animated stroke on
 * it, so replaying the same stroke restarts its animation.
 */
export function useStrokeOrderPlayer(total: () => number) {
  const shown = ref(0);
  const drawing = ref<number | null>(null);
  const playing = ref(false);
  const run = ref(0);

  const current = computed(() => (drawing.value !== null ? drawing.value + 1 : shown.value));

  function replay(): void {
    run.value += 1;
    shown.value = 0;
    playing.value = total() > 0;
    drawing.value = total() > 0 ? 0 : null;
  }

  function strokeEnded(): void {
    if (drawing.value === null) return;
    shown.value = drawing.value + 1;
    drawing.value = playing.value && shown.value < total() ? shown.value : null;
    if (drawing.value === null) playing.value = false;
  }

  function next(): void {
    playing.value = false;
    if (drawing.value !== null) {
      shown.value = drawing.value + 1;
      drawing.value = null;
    }
    if (shown.value < total()) {
      run.value += 1;
      drawing.value = shown.value;
    }
  }

  function prev(): void {
    playing.value = false;
    drawing.value = null;
    shown.value = Math.max(0, shown.value - 1);
  }

  watch(total, () => {
    playing.value = false;
    drawing.value = null;
    shown.value = 0;
  });

  return { shown: readonly(shown), drawing: readonly(drawing), run: readonly(run), current, replay, next, prev, strokeEnded };
}
