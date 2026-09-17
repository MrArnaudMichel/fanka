const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * The string on a grade button. It is deliberately coarse: the learner is
 * choosing between "soon" and "much later", and a precise "11.8 days" would
 * imply a precision the algorithm does not have.
 *
 * Each threshold below is checked against the *rounded* value for the unit
 * it guards, not the raw one, so a value that rounds up into the next unit
 * is displayed in that next unit rather than rolling over past its own
 * ceiling: 59.9 min must read "1 h", not "60 min"; a value that rounds to
 * 31 days must read in months, not "31 d"; one that rounds to a full 12
 * months must read in years, not "12.0 mo". Comparing the raw value instead
 * (as an earlier version did) let each of those slip through — the branch
 * decision and the display value disagreed once rounding was involved.
 */
export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} h`;

  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} d`;

  const months = Number((ms / DAY / 30.4).toFixed(1));
  if (months < 12) return `${months.toFixed(1)} mo`;

  return `${(ms / DAY / 365).toFixed(1)} y`;
}
