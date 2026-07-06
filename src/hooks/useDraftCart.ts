"use client";
import { useState, useEffect, useCallback } from "react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { isSupabaseMode } from "@/lib/services/api";

const DRAFT_KEY = "nzamy_legal_draft_v1";

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

/**
 * Draft cart with dual-mode persistence:
 *   - demo mode   → localStorage only (nzamy_legal_draft_v1)
 *   - supabase    → law_draft_carts via /api/v1/drafts/cart (lossless via
 *                   jsonb payload), with localStorage kept as an offline cache.
 * The public shape { cart, setCart } is unchanged, so consumers are unaffected.
 */
export function useDraftCart() {
  const [cart, setCartInternal] = useState<CartEntry[]>([]);

  // Hydrate: prefer the server cart in supabase mode, fall back to localStorage.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isSupabaseMode) {
        try {
          const res = await fetch("/api/v1/drafts/cart");
          if (res.ok) {
            const json = (await res.json()) as { data?: { items?: Record<string, unknown>[] } };
            const items = json.data?.items ?? [];
            if (!cancelled && items.length > 0) {
              setCartInternal(items.map(rowToEntry));
              return;
            }
          }
        } catch {
          /* fall through to localStorage */
        }
      }
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw && !cancelled) setCartInternal(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCart = useCallback(
    (updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])) => {
      setCartInternal((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        if (isSupabaseMode) {
          // Fire-and-forget server persistence.
          fetch("/api/v1/drafts/cart", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: next.map(entryToItem) }),
          }).catch(() => {});
        }
        return next;
      });
    },
    [],
  );

  return { cart, setCart };
}
