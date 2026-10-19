import { create } from "zustand";
import { resolveB2BSession, type CompanyLocationOption } from "@/lib/b2b.functions";
import { readPersistedShoppingMode, writePersistedShoppingMode, type ShoppingMode } from "@/lib/shopping-mode";

export type { ShoppingMode };
export type B2BStatus = "idle" | "resolving" | "b2c" | "pending" | "needs-location" | "b2b";

interface B2BStore {
  status: B2BStatus;
  locations: CompanyLocationOption[];
  companyLocationId: string | null;
  /** Resolved Shopify customer GID (opaque, non-secret) -- the stable,
   * non-token identity used to scope buyer-aware React Query cache keys
   * (see src/lib/shopify-overlay.ts). Never the bearer token itself. */
  customerId: string | null;
  /** The token this result was resolved for, so a stale in-flight resolve() from a just-replaced token can't clobber the current state. */
  resolvedForToken: string | null;
  /** True once a real determination has been made for the CURRENT page
   * load -- either resolve() finished (success or its fail-safe-to-b2c
   * catch branch) or reset() ran (no token / signed out). `status` alone
   * can't signal this: "idle" is both "never checked yet" (initial state,
   * SSR, pre-hydration) and "checked, confirmed anonymous" (reset()'s own
   * target state), and price-bearing UI needs to tell those apart --
   * see src/lib/shopify-overlay.ts's usePriceOverlay / useB2BPriceOverlayMap. */
  resolved: boolean;
  /** Which experience the shopper is ACTIVELY using right now -- distinct
   * from `status` (eligibility, server-resolved) and never sufficient on
   * its own to grant B2B pricing; see getEffectiveCompanyLocationId below,
   * the one place both are combined. Defaults to "b2b" for an
   * already-eligible customer who's never chosen otherwise (no regression
   * for existing B2B customers), or whatever that customer previously
   * persisted via setShoppingMode (see src/lib/shopping-mode.ts). */
  shoppingMode: ShoppingMode;
  resolve: (token: string) => Promise<void>;
  /** Only accepts an id already present in `locations` -- i.e. one the server already confirmed this customer is assigned to. Silently ignores any other value. */
  selectLocation: (id: string) => void;
  /** "b2c" is always accepted (retreating to personal shopping never needs
   * eligibility). "b2b" is only applied if `status` is actually "b2b" or
   * "needs-location" (server-confirmed eligibility) -- mirrors
   * selectLocation's "only accept a server-confirmed value" pattern.
   * Returns whether it was applied, so callers can tell a no-op apart
   * from a real change. Persists the choice (customer-scoped) on success. */
  setShoppingMode: (mode: ShoppingMode) => boolean;
  reset: () => void;
}

/** The ONE place deciding whether this buyer's company location should
 * actually be applied right now: requires BOTH genuine eligibility
 * (status === "b2b") AND the shopper currently being in Business shopping
 * mode. "needs-location" deliberately never qualifies even with
 * shoppingMode === "b2b" -- there's no companyLocationId to apply until
 * selectLocation() runs. Every B2B-pricing/quantity-rule/buyer-identity
 * call site reads through this single function instead of raw
 * status/companyLocationId, so there is exactly one place this logic can
 * drift. */
export function getEffectiveCompanyLocationId(
  state: Pick<B2BStore, "status" | "shoppingMode" | "companyLocationId">,
): string | null {
  if (state.status !== "b2b" || state.shoppingMode !== "b2b") return null;
  return state.companyLocationId;
}

// Deliberately NOT wrapped in zustand's `persist` middleware -- this store
// never touches localStorage/sessionStorage. Persisting companyLocationId
// keyed only by a fixed storage key name (not by which customer it belongs
// to) would itself become exactly the kind of cross-identity leak this
// feature has to avoid: a shared/public device signing out of a B2B
// account and into a different B2C account before the persisted value was
// ever cleared. Re-resolving via the Admin API lookup on every sign-in is
// cheap enough not to need session-crossing storage at all.
export const useB2BStore = create<B2BStore>()((set, get) => ({
  status: "idle",
  locations: [],
  companyLocationId: null,
  customerId: null,
  resolvedForToken: null,
  resolved: false,
  shoppingMode: "b2c",

  resolve: async (token: string) => {
    if (get().resolvedForToken === token && get().status !== "idle") return;
    // `resolved` must drop back to false here, not just at the initial
    // "never checked" default -- this same path runs again on switching
    // identity (sign out of one account, into another, same tab). Without
    // this, `resolved` would stay stale-true from the PREVIOUS customer's
    // determination for the whole in-flight window below, and price UI
    // gated on it would paint that previous buyer's cached price/overlay
    // for the new one until this resolution finishes.
    set({ status: "resolving", resolved: false });
    try {
      const result = await resolveB2BSession({ data: { customerAccessToken: token } });
      // A newer resolve() may have started (and possibly already finished)
      // for a different token while this request was in flight -- never
      // let a stale response overwrite a newer one.
      if (get().resolvedForToken !== null && get().resolvedForToken !== token && get().status !== "resolving") return;

      if (result.status === "b2c") {
        set({ status: "b2c", locations: [], companyLocationId: null, customerId: result.customerId, resolvedForToken: token, resolved: true, shoppingMode: "b2c" });
        return;
      }
      if (result.status === "pending") {
        set({ status: "pending", locations: [], companyLocationId: null, customerId: result.customerId, resolvedForToken: token, resolved: true, shoppingMode: "b2c" });
        return;
      }
      const { locations, customerId } = result;
      // Defaults to "b2b" unless this customer has explicitly persisted
      // "b2c" before -- an already-eligible B2B customer who's never
      // chosen otherwise sees zero regression from today's always-B2B
      // behaviour. Never trusts a persisted value on its own: this is
      // only a DEFAULT, re-gated by getEffectiveCompanyLocationId against
      // the live `status` on every read.
      const persisted = readPersistedShoppingMode(customerId);
      const shoppingMode: ShoppingMode = persisted === "b2c" ? "b2c" : "b2b";
      if (locations.length === 1) {
        set({ status: "b2b", locations, companyLocationId: locations[0]!.id, customerId, resolvedForToken: token, resolved: true, shoppingMode });
      } else {
        set({ status: "needs-location", locations, companyLocationId: null, customerId, resolvedForToken: token, resolved: true, shoppingMode });
      }
    } catch (err) {
      console.error("[B2B] Failed to resolve B2B session:", err instanceof Error ? err.message : err);
      // Fail safe to B2C rather than leaving status stuck on "resolving".
      set({ status: "b2c", locations: [], companyLocationId: null, customerId: null, resolvedForToken: token, resolved: true, shoppingMode: "b2c" });
    }
  },

  selectLocation: (id: string) => {
    const { locations } = get();
    if (!locations.some((l) => l.id === id)) return;
    set({ status: "b2b", companyLocationId: id });
  },

  setShoppingMode: (mode: ShoppingMode) => {
    const { status, customerId } = get();
    if (mode === "b2b" && status !== "b2b" && status !== "needs-location") return false;
    set({ shoppingMode: mode });
    writePersistedShoppingMode(customerId, mode);
    return true;
  },

  reset: () => set({ status: "idle", locations: [], companyLocationId: null, customerId: null, resolvedForToken: null, resolved: true, shoppingMode: "b2c" }),
}));
