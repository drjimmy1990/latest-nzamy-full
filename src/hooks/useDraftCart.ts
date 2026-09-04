"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { isSupabaseMode } from "@/lib/services/api";
import { isCurrentSequence, shouldMigrateLocalDraft, extractCartUserId } from "@/hooks/draftCartSync";

const DRAFT_KEY = "nzamy_legal_draft_v1";

/** Shown by consumers when a signed-in user's cart change failed to reach
 *  the server — item 94: the server is the store in supabase mode, so a
 *  failed sync is real data loss, not a silent fallback. */
export const DRAFT_CART_SAVE_ERROR = "تعذّر حفظ السلة على الخادم";

/** Reconstruct a CartEntry from a law_draft_carts row (prefer the jsonb payload). */
function rowToEntry(row: Record<string, unknown>): CartEntry {
  if (row.payload && typeof row.payload === "object") {
    return row.payload as CartEntry;
  }
  // Legacy row (no payload) — minimal reconstruction.
  return {
    articleId: String(row.article_number ?? ""),
    articleNum: String(row.article_number ?? ""),
    articleTitle: String(row.article_title ?? ""),
    articleText: "",
    lawName: "",
    lawSlug: String(row.law_slug ?? ""),
    isArticleAdded: true,
    isExecRegAdded: false,
    principles: [],
    precedents: [],
  };
}

/** Map a CartEntry to a PUT item (queryable columns + full payload). */
function entryToItem(e: CartEntry) {
  return {
    law_slug: e.lawSlug,
    article_number: e.articleNum,
    article_title: e.articleTitle,
    payload: e,
  };
}

function readLocalDraft(): CartEntry[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CartEntry[]) : [];
  } catch {
    return [];
  }
}

async function putCart(items: CartEntry[]): Promise<boolean> {
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
}

/**
 * Draft cart with dual-mode persistence:
 *   - demo mode                       → localStorage only (nzamy_legal_draft_v1).
 *   - supabase mode, signed in        → the server (law_draft_carts) is the
 *                                        store: no localStorage write, the PUT
 *                                        is awaited, and a failure is exposed
 *                                        via `saveError` for the caller to show.
 *   - supabase mode, not signed in    → same as demo (localStorage only); the
 *                                        API 401s for anonymous visitors, so
 *                                        there is nothing to sync yet.
 * On first hydrate as a signed-in user with an empty server cart but a
 * non-empty local draft, that draft is pushed to the server once and then
 * cleared locally — the actual "migrate to the cloud" step.
 * The public shape { cart, setCart } is unchanged; `saveError` and
 * `clearSaveError` are additive so existing consumers are unaffected.
 */
export function useDraftCart() {
  const [cart, setCartInternal] = useState<CartEntry[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mirrors `cart` synchronously so setCart can compute `next` without a
  // functional state updater (that form can't safely await/setSaveError).
  const cartRef = useRef<CartEntry[]>([]);
  // Whether this session is an authenticated supabase user — only that case
  // makes the server the store. Anonymous supabase-mode visitors behave like
  // demo mode until they sign in.
  const signedInRef = useRef(false);
  // Monotonic guard: only the most recently issued save/migration may write
  // `saveError` or clear localStorage, so a slow response can't land after a
  // newer one and report a stale result.
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isSupabaseMode) {
        try {
          const res = await fetch("/api/v1/drafts/cart");
          if (res.ok) {
            const json = (await res.json()) as unknown;
            const userId = extractCartUserId(json);
            if (userId) {
              signedInRef.current = true;
              const items =
                ((json as { data?: { items?: Record<string, unknown>[] } }).data?.items) ?? [];
              if (cancelled) return;
              if (items.length > 0) {
                const entries = items.map(rowToEntry);
                cartRef.current = entries;
                setCartInternal(entries);
                // Deliberately NOT clearing localStorage here: a second
                // useDraftCart instance (e.g. FloatingButtons' global FAB
                // alongside a page's own instance) hydrates concurrently, and
                // whichever resolves first would otherwise wipe the key out
                // from under the other. Stale local data is harmless — it is
                // never read while signedInRef is true.
                return;
              }
              const local = readLocalDraft();
              if (shouldMigrateLocalDraft(items.length, local.length)) {
                cartRef.current = local;
                setCartInternal(local);
                seqRef.current += 1;
                const seq = seqRef.current;
                const ok = await putCart(local);
                if (cancelled || !isCurrentSequence(seq, seqRef.current)) return;
                if (ok) {
                  try {
                    localStorage.removeItem(DRAFT_KEY);
                  } catch {
                    /* ignore */
                  }
                } else {
                  // Leave localStorage in place as a safety net; report it so
                  // the caller can tell the user their draft isn't synced yet.
                  setSaveError(DRAFT_CART_SAVE_ERROR);
                }
              }
              return;
            }
          }
        } catch {
          /* offline / network failure — fall through to localStorage below */
        }
      }
      // demo mode, or supabase mode with no signed-in user (anonymous/offline).
      if (!cancelled) {
        const local = readLocalDraft();
        cartRef.current = local;
        if (local.length > 0) setCartInternal(local);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCart = useCallback(
    (updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])) => {
      const next = typeof updater === "function" ? updater(cartRef.current) : updater;
      cartRef.current = next;
      setCartInternal(next);

      if (isSupabaseMode && signedInRef.current) {
        seqRef.current += 1;
        const seq = seqRef.current;
        void putCart(next).then((ok) => {
          if (!isCurrentSequence(seq, seqRef.current)) return; // superseded by a newer save
          setSaveError(ok ? null : DRAFT_CART_SAVE_ERROR);
        });
        return;
      }

      // demo mode, or supabase mode without a signed-in user: localStorage is the store.
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const clearSaveError = useCallback(() => setSaveError(null), []);

  return { cart, setCart, saveError, clearSaveError };
}
