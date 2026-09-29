import type { StrokeCheck } from '~core/chinese/strokes';

/** The copy and colour of one of the two verdicts shown after Check. */
export interface Verdict {
  heading: string;
  variant: 'success' | 'danger' | 'warning' | 'info';
}

type Checked = { character: string; check: StrokeCheck };

function sentence(prefix: string, text: string): string {
  return prefix ? `${prefix}${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

function prefixFor(attempts: readonly Checked[], a: Checked): string {
  return attempts.length > 1 ? `${a.character}: ` : '';
}

/**
 * The character itself: every stroke there and in place, whatever the order.
 *
 * `kt-alert` has no `eyebrow` prop (checked in `kt-alert.d.ts`), so the label
 * that would otherwise have gone there is baked into the heading.
 */
export function characterVerdict(attempts: readonly Checked[]): Verdict {
  const wrong = attempts.find((a) => !a.check.shapeCorrect);
  if (!wrong) return { heading: 'Character: Right', variant: 'success' };
  const prefix = prefixFor(attempts, wrong);
  const { error, drawn, expected, strokeIndex } = wrong.check;
  if (error === 'stroke-count') return { heading: `Character: ${sentence(prefix, `wrong stroke count, ${drawn} of ${expected}`)}`, variant: 'danger' };
  return { heading: `Character: ${sentence(prefix, `stroke ${(strokeIndex ?? 0) + 1} doesn't match`)}`, variant: 'danger' };
}

/**
 * The stroke order. Judged only on characters whose shape is right; when no
 * such character has an order fault but some shape was wrong, the order
 * could not be judged.
 */
export function orderVerdict(attempts: readonly Checked[]): Verdict {
  const fault = attempts.find((a) => a.check.shapeCorrect && !a.check.orderCorrect);
  if (fault) {
    const n = (fault.check.strokeIndex ?? 0) + 1;
    const what = fault.check.error === 'stroke-direction' ? `stroke ${n} drawn backwards` : `stroke ${n} drawn out of order`;
    return { heading: `Stroke order: ${sentence(prefixFor(attempts, fault), what)}`, variant: 'warning' };
  }
  if (attempts.every((a) => a.check.orderCorrect)) return { heading: 'Stroke order: Right', variant: 'success' };
  return { heading: 'Stroke order: Not checked', variant: 'info' };
}

/** Which model stroke the overlay and the player mark, and in which colour. */
export function highlightFor(check: StrokeCheck): { index: number; tone: 'danger' | 'warning' } | null {
  if (check.strokeIndex === null || check.strokeIndex >= check.expected) return null;
  if (!check.shapeCorrect) return { index: check.strokeIndex, tone: 'danger' };
  if (!check.orderCorrect) return { index: check.strokeIndex, tone: 'warning' };
  return null;
}
