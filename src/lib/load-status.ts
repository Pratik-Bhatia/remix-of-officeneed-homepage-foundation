/**
 * One explicit state for any asynchronous section, so a component never has
 * to guess from an empty array whether data is still loading, genuinely
 * empty, or failed:
 *
 *   loading -> show a skeleton shaped like the content
 *   success -> show the data (or the real empty state if it's empty)
 *   error   -> show an error with a retry -- never the empty state
 *   idle    -> the request is deliberately not running (e.g. a disabled
 *              query); render nothing data-dependent
 */
export type LoadStatus = "idle" | "loading" | "success" | "error";

/**
 * Derives a LoadStatus from React Query fields. Data already in hand
 * (cache, or a previous success during a background refresh) always wins,
 * so content is never swapped back to a skeleton; a retry after an error
 * reads as loading, not as a lingering error.
 */
export function queryLoadStatus(q: { data: unknown; isError: boolean; fetchStatus: "fetching" | "paused" | "idle" }, enabled = true): LoadStatus {
  if (q.data !== undefined) return "success";
  if (!enabled) return "idle";
  if (q.fetchStatus === "fetching") return "loading";
  if (q.isError) return "error";
  // Enabled but not started yet (e.g. server render, first client frame).
  return "loading";
}
