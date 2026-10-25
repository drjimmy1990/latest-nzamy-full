"use client";
import { useCallback, useSyncExternalStore } from "react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { isSupabaseMode } from "@/lib/services/api";
import { createDraftCartStore, entryToItem, type DraftCartStore } from "@/hooks/draftCartStore";

export { DRAFT_CART_SAVE_ERROR } from "@/hooks/draftCartStore";

const DRAFT_KEY = "nzamy_legal_draft_v1";

function readLocalDraft(): CartEntry[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CartEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * The tab's one draft cart (src/hooks/draftCartStore.ts), created on first
 * use in the browser. Every useDraftCart() caller — the reader page and the
 * global FloatingButtons FAB alike — reads and writes this same store, so an
 * item added on the page is in the FAB's drawer at once, and a removal there
 * never saves a stale copy over it.
 */
let store: DraftCartStore | null = null;
function draftCartStore(): DraftCartStore {
  if (!store) {
    store = createDraftCartStore({
      supabaseMode: isSupabaseMode,
      fetchCart: async () => {
        const res = await fetch("/api/v1/drafts/cart");
        const json = res.ok ? ((await res.json()) as unknown) : null;
        return { ok: res.ok, json };
      },
      putCart: async (items) => {
        try {
          const res = await fetch("/api/v1/drafts/cart", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: items.map(entryToItem) }),
          });
          return res.ok;
        } catch {
          return false;
        }
      },
      readLocal: readLocalDraft,
      writeLocal: (items) => {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(items));
        } catch {
          /* ignore */
        }
      },
      removeLocal: () => {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      },
    });
  }
  return store;
}

const subscribe = (listener: () => void) => draftCartStore().subscribe(listener);
const getSnapshot = () => draftCartStore().getSnapshot();
const getServerSnapshot = () => draftCartStore().getServerSnapshot();

/**
 * Draft cart with dual-mode persistence (draftCartStore.ts has the rules):
 *   - demo mode                       → localStorage only (nzamy_legal_draft_v1);
 *   - supabase mode, signed in        → the server (law_draft_carts) is the
 *                                        store; a failed save is `saveError`;
 *   - supabase mode, not signed in    → localStorage only, as demo mode.
 * The public shape { cart, setCart, saveError, clearSaveError } is unchanged;
 * the state is now shared by every caller in the tab.
 */
export function useDraftCart() {
  const { cart, saveError } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setCart = useCallback(
    (updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])) => draftCartStore().setCart(updater),
    [],
  );
  const clearSaveError = useCallback(() => draftCartStore().clearSaveError(), []);
  return { cart, setCart, saveError, clearSaveError };
}
