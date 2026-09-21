export interface AllowlistEntry {
  /** Path relative to the repo root. */
  file: string;
  /** The native tag, without angle brackets. */
  tag: string;
  /** Why a Kanto element cannot do this job. */
  reason: string;
  /** The task that removes it, if it is only temporary. */
  removeIn?: string;
}

/**
 * Every native interactive or structural element in app/ that is not a Kanto
 * element must be listed here with a reason. The integrity test fails on any
 * element not listed, and on any entry that no longer matches, so the list
 * cannot rot.
 */
export const ALLOWLIST: AllowlistEntry[] = [
  { file: 'app/components/AppSidebar.vue', tag: 'nav', reason: 'Hand-built sidebar from phase 1.', removeIn: 'Task 2' },
  { file: 'app/components/AppBottomNav.vue', tag: 'nav', reason: 'Hand-built bottom bar from phase 1.', removeIn: 'Task 2' },
  { file: 'app/components/GradeButtons.vue', tag: 'button', reason: 'Hand-built grade buttons from phase 1.', removeIn: 'Task 3' },
  { file: 'app/pages/index.vue', tag: 'ul', reason: 'Hand-built deck list from phase 1.', removeIn: 'Task 3' },
];
