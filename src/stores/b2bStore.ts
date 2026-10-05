import { create } from "zustand";
import { resolveB2BSession, type CompanyLocationOption } from "@/lib/b2b.functions";

export type B2BStatus = "idle" | "resolving" | "b2c" | "needs-location" | "b2b";

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
  resolve: (token: string) => Promise<void>;
  /** Only accepts an id already present in `locations` -- i.e. one the server already confirmed this customer is assigned to. Silently ignores any other value. */
  selectLocation: (id: string) => void;
  reset: () => void;
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
        set({ status: "b2c", locations: [], companyLocationId: null, customerId: result.customerId, resolvedForToken: token, resolved: true });
        return;
      }
      const { locations, customerId } = result;
      if (locations.length === 1) {
        set({ status: "b2b", locations, companyLocationId: locations[0]!.id, customerId, resolvedForToken: token, resolved: true });
      } else {
        set({ status: "needs-location", locations, companyLocationId: null, customerId, resolvedForToken: token, resolved: true });
      }
    } catch (err) {
      console.error("[B2B] Failed to resolve B2B session:", err instanceof Error ? err.message : err);
      // Fail safe to B2C rather than leaving status stuck on "resolving".
      set({ status: "b2c", locations: [], companyLocationId: null, customerId: null, resolvedForToken: token, resolved: true });
    }
  },

  selectLocation: (id: string) => {
    const { locations } = get();
    if (!locations.some((l) => l.id === id)) return;
    set({ status: "b2b", companyLocationId: id });
  },

  reset: () => set({ status: "idle", locations: [], companyLocationId: null, customerId: null, resolvedForToken: null, resolved: true }),
}));
