/**
 * Moves focus onto `target()` the moment it actually becomes focusable — at
 * mount, if it is already enabled, or on the transition from disabled to
 * enabled otherwise — and never if the learner has already put focus
 * somewhere else in the meantime.
 *
 * Exists because every grade and undo in this app runs through one
 * serialising queue (`useReviewSession`'s `enqueue`), and `undoCore` sets
 * the reactive flag that mounts the next focus target (`revealed`) well
 * before the operation it belongs to actually finishes — `busy` stays
 * `true` until `persist()` and `syncTimer()` have also run. The same is
 * true of a grade: `gradeCore` sets `revealed` false, mounting the
 * Show-answer button, before its own `persist()`/`syncTimer()` settle. A
 * control that mounts already `disabled` cannot receive focus — disabled
 * form controls are unfocusable by spec, so `.focus()` on one silently
 * no-ops — and `onMounted` only ever fires once per instance, so without
 * watching for the moment it becomes enabled, focus is stranded until the
 * learner tabs there themselves. `<body>` (or nothing) is treated as
 * "unclaimed"; anything else is left alone, so this never yanks focus away
 * from somewhere the learner deliberately put it.
 *
 * The watcher below is deliberately `flush: 'post'`. `watch()`'s default,
 * `'pre'`, runs *before* this component's own render effect — so with the
 * default, the callback could see `disabled()` already `false` while the
 * real DOM `disabled` attribute (and, for a Lit element, its shadow-DOM
 * native `<button>`) had not actually been patched yet, and `.focus()`
 * would silently no-op against a control still genuinely disabled a tick
 * earlier. `'post'` guarantees the DOM patch has already landed first.
 */
export function useFocusWhenEnabled(
  target: () => (HTMLElement & { updateComplete?: Promise<boolean> }) | undefined,
  disabled: () => boolean,
): void {
  function unclaimed(): boolean {
    const active = document.activeElement;
    return !active || active === document.body;
  }

  async function attempt(): Promise<void> {
    if (!target() || disabled()) return;
    // Lit elements (`kt-button`) paint their shadow DOM — and so the native
    // `<button>` `.focus()` actually delegates to — on their own microtask
    // after `connectedCallback`, not synchronously within it.
    // `updateComplete` is `undefined` (so an instant no-op `await`) for a
    // plain native element, which has no such delay.
    await target()?.updateComplete;
    if (disabled() || !unclaimed()) return;
    target()?.focus();
  }

  onMounted(attempt);
  watch(
    disabled,
    (nowDisabled) => {
      if (!nowDisabled) void attempt();
    },
    { flush: 'post' },
  );
}
