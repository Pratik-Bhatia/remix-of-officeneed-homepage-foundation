export type PrintingMethodName = "Laser Engraving" | "UV Printing";

/** UV Printing is only offered from this order quantity up (existing rule). */
export const UV_MIN_QUANTITY = 25;

export function isUvAvailableForQuantity(quantity: number): boolean {
  return quantity >= UV_MIN_QUANTITY;
}

/** The method actually used for a requested one at this quantity: a UV
 * request below the minimum quantity is Laser Engraving, never UV. */
export function resolvePrintingMethod(requested: PrintingMethodName | undefined, quantity: number): PrintingMethodName {
  return requested === "UV Printing" && isUvAvailableForQuantity(quantity) ? "UV Printing" : "Laser Engraving";
}

/**
 * One customer-visible string for a gift set's per-component methods: the
 * method itself when every component uses the same one, otherwise
 * "Diary: UV Printing; Pen: Laser Engraving" -- never one component's
 * method standing in for the others.
 */
export function summarizeComponentMethods(entries: ReadonlyArray<{ name: string; method: string }>): string {
  if (entries.length === 0) return "";
  const first = entries[0]!.method;
  if (entries.every((e) => e.method === first)) return first;
  return entries.map((e) => `${e.name}: ${e.method}`).join("; ");
}
