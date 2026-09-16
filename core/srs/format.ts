const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * The string on a grade button. It is deliberately coarse: the learner is
 * choosing between "soon" and "much later", and a precise "11.8 days" would
 * imply a precision the algorithm does not have.
 */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`;
  const days = ms / DAY;
  if (days < 31) return `${Math.round(days)} d`;
  if (days < 365) return `${(days / 30.4).toFixed(1)} mo`;
  return `${(days / 365).toFixed(1)} y`;
}
