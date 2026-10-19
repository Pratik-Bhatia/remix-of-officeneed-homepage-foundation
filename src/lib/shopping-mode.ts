/**
 * Persists a signed-in customer's chosen shopping mode (Personal vs
 * Business) across page refreshes and navigation -- a bare UI-preference
 * enum, never itself sufficient to grant B2B pricing (see
 * src/stores/b2bStore.ts's getEffectiveCompanyLocationId, which always
 * re-ANDs this against the live, server-resolved eligibility status).
 *
 * The storage key is itself scoped per customer
 * (`officeneed_shopping_mode:<customerId>`), not a single fixed key with
 * an embedded identity check -- mirrors the same cross-identity-leak
 * concern b2bStore.ts's own header comment raises about companyLocationId.
 * A different customer's device slot simply doesn't exist until THEY
 * explicitly choose a mode, so there is no fixed key for one identity's
 * preference to leak through into another's.
 *
 * `customerId` is always the opaque, non-secret Shopify customer GID
 * resolveB2BSession() returns -- never a client-asserted identity.
 */

export type ShoppingMode = "b2c" | "b2b";

function storageKey(customerId: string): string {
  return `officeneed_shopping_mode:${customerId}`;
}

export function readPersistedShoppingMode(customerId: string | null): ShoppingMode | null {
  if (typeof window === "undefined" || !customerId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(customerId));
    return raw === "b2c" || raw === "b2b" ? raw : null;
  } catch {
    return null;
  }
}

export function writePersistedShoppingMode(customerId: string | null, mode: ShoppingMode): void {
  if (typeof window === "undefined" || !customerId) return;
  try {
    window.localStorage.setItem(storageKey(customerId), mode);
  } catch {
    // Best-effort -- a failed write just means the default re-applies next resolve().
  }
}
