/**
 * Pure client-side pagination helpers (no data fetching) -- used by the
 * PDP reviews list (src/components/officeneed/ProductReviews.tsx).
 */

/** Clamps `page` into 1..totalPages for `count` items (always >= 1 page). */
export function clampPage(page: number, count: number, perPage: number): { page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(count / perPage));
  return { page: Math.min(Math.max(1, Math.floor(page) || 1), totalPages), totalPages };
}

/** The items on `page` (1-based), in their original order. */
export function pageSlice<T>(items: readonly T[], page: number, perPage: number): T[] {
  const { page: current } = clampPage(page, items.length, perPage);
  return items.slice((current - 1) * perPage, current * perPage);
}

/**
 * Page-number buttons to render: every page when there are 7 or fewer,
 * otherwise first, last, the current page and its neighbours, with an
 * "ellipsis" marking each gap -- never more than 7 entries.
 */
export function pageItems(current: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(current - 1, totalPages - 4));
  const end = Math.min(totalPages - 1, Math.max(current + 1, 5));
  const items: Array<number | "ellipsis"> = [1];
  if (start > 2) items.push("ellipsis");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}
