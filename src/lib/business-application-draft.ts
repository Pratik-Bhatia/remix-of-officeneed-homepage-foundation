/**
 * Recovery state for a business application that failed to submit AFTER
 * the Shopify customer account was already created.
 *
 * The draft only holds what the shopper typed into the form (never the
 * session token or password). It is keyed by the server-resolved Shopify
 * customer id, so another customer signing in on the same device never
 * sees it. It is purely a UX hint: it grants nothing. Pricing and access
 * still come only from the live Shopify relationship (b2b.functions.ts).
 */
export type BusinessApplicationDraft = {
  companyName: string;
  gstNumber: string;
  contactName?: string;
  phone?: string;
  address?: { addressLine1: string; addressLine2?: string; city: string; state: string; pin: string; country: string };
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "officeneed:b2b-application-draft:";

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function saveApplicationDraft(customerId: string, draft: BusinessApplicationDraft, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || !customerId) return;
  try {
    storage.setItem(PREFIX + customerId, JSON.stringify(draft));
  } catch {
    /* storage full / disabled -- recovery banner simply won't show */
  }
}

export function getApplicationDraft(customerId: string | null | undefined, storage: StorageLike | null = defaultStorage()): BusinessApplicationDraft | null {
  if (!storage || !customerId) return null;
  try {
    const raw = storage.getItem(PREFIX + customerId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.companyName === "string" && typeof parsed.gstNumber === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearApplicationDraft(customerId: string | null | undefined, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || !customerId) return;
  try {
    storage.removeItem(PREFIX + customerId);
  } catch {
    /* ignore */
  }
}

/**
 * Submits (or re-submits) a business application for an EXISTING, signed-in
 * customer. Never creates a Shopify customer -- callers only pass a save
 * function that writes the application row. Returns an outcome instead of
 * throwing so the UI can always show a friendly message.
 */
export async function submitBusinessApplication(
  save: (draft: BusinessApplicationDraft) => Promise<unknown>,
  draft: BusinessApplicationDraft,
): Promise<"submitted" | "failed"> {
  try {
    await save(draft);
    return "submitted";
  } catch {
    return "failed";
  }
}
