/**
 * A guest tapped the wishlist heart on a product -- remembers which one
 * so CustomerAuthModal can complete that save exactly once after a
 * successful sign-in/registration, without a second save store or any
 * navigation (the auth modal is always an overlay on the page the guest
 * was already on -- see CustomerAuthModal.tsx's own notes on this).
 *
 * Plain module state (same lightweight pattern as saves.ts), not
 * persisted: a full page reload already means there's no pending modal
 * left to resume anyway, so there's nothing worth surviving a reload for.
 */
let pendingHandle: string | null = null;

export function setPendingSave(handle: string) {
  pendingHandle = handle;
}

/** Reads and clears in one step -- a pending save is only ever consumed once. */
export function takePendingSave(): string | null {
  const handle = pendingHandle;
  pendingHandle = null;
  return handle;
}

/** Clears without consuming -- for a cancelled/dismissed auth attempt, so
 * a LATER, unrelated sign-in never silently saves a stale product. */
export function clearPendingSave() {
  pendingHandle = null;
}
