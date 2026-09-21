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
export const ALLOWLIST: AllowlistEntry[] = [];
