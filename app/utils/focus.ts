import type { LocationQueryValue } from 'vue-router';

/** `?cards=a,b,c` (focused practice from Statistics) as card ids; undefined when absent or malformed. */
export function focusCardIds(value: LocationQueryValue | LocationQueryValue[] | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const ids = value.split(',').filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}
