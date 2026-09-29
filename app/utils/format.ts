/** "8 s", "12 min", "3 h 5 min" — study time, never a countdown. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "87%", or "—" when there is nothing to measure. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** "1 answer", "3 answers" — a count with its noun, pluralised. */
export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** `9/23` from `2026-09-23` — short enough for 30 tick labels at phone width. */
export function shortDate(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}
