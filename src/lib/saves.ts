/**
 * Client-side store for the signed-in shopper's saved products.
 * Backed by secure server functions that verify the Shopify customer session.
 */
import { useEffect, useState } from "react";
import { getCustomerToken } from "@/lib/customer";
import { listSavedHandles, toggleSavedProduct } from "@/lib/saves.functions";

let handles: string[] = [];
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export async function refreshSaves(force = false): Promise<void> {
  const token = getCustomerToken();
  if (!token) {
    handles = [];
    loaded = true;
    emit();
    return;
  }
  if (inflight) return inflight;
  if (loaded && !force) return;
  inflight = (async () => {
    try {
      handles = await listSavedHandles({ data: { token } });
    } catch {
      handles = [];
    } finally {
      loaded = true;
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

export function clearSaves() {
  handles = [];
  loaded = false;
  emit();
}

export async function toggleSave(handle: string): Promise<{ saved: boolean }> {
  const token = getCustomerToken();
  if (!token) throw new Error("Sign in to save products.");
  const result = await toggleSavedProduct({ data: { token, handle } });
  handles = result.saved ? [handle, ...handles.filter((h) => h !== handle)] : handles.filter((h) => h !== handle);
  emit();
  return result;
}

export function useSaves() {
  const [state, setState] = useState<{ handles: string[]; loaded: boolean }>({ handles, loaded });

  useEffect(() => {
    const listener = () => setState({ handles, loaded });
    listeners.add(listener);
    void refreshSaves();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { savedHandles: state.handles, loaded: state.loaded, toggleSave, refresh: () => refreshSaves(true) };
}
