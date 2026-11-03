// Provider-neutral result of one outbound background-removal API call.
// Structurally identical to remove-bg-client.server.ts's RemoveBgApiResult,
// so the existing remove.bg client satisfies it unchanged. Types only: no
// runtime code, safe to import anywhere.
export interface BackgroundRemovalApiResult {
  ok: boolean;
  status: number;
  /** PNG bytes of the background-removed image (success only). */
  arrayBuffer?: ArrayBuffer;
  errorText?: string;
  creditsCharged: string | null;
  responseType: string | null;
  responseWidth: string | null;
  responseHeight: string | null;
}

export type BackgroundRemovalProviderId = "api4ai" | "removebg";

/** Where a logo result came from: a paid provider, or the local
 * plain-background path (local-background-removal.server.ts). */
export type ProcessingSourceId = BackgroundRemovalProviderId | "local";
