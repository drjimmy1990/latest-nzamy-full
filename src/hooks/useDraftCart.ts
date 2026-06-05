"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { isSupabaseMode, apiGet, apiMutate } from "@/lib/services/api";

const DRAFT_KEY = "nzamy_legal_draft_v1";

export function useDraftCart() {
  const [cart, setCartInternal] = useState<CartEntry[]>([]);
  const initializedRef = useRef(false);

  // Hydrate on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (isSupabaseMode) {
      apiGet<{ items: CartEntry[] }>("/api/v1/drafts/cart")
        .then(data => setCartInternal(data.items ?? []))
        .catch(() => {
          // Fallback to localStorage
          try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) setCartInternal(JSON.parse(raw));
          } catch { /* ignore */ }
        });
    } else {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) setCartInternal(JSON.parse(raw));
      } catch { /* ignore */ }
    }
  }, []);

  const setCart = useCallback(
    (updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])) => {
      setCartInternal(prev => {
        const next = typeof updater === "function" ? updater(prev) : updater;

        // Persist
        if (isSupabaseMode) {
          apiMutate("/api/v1/drafts/cart", "PUT", { items: next }).catch(() => {
            // Fallback: also save to localStorage
            try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
          });
        } else {
          try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        }

        return next;
      });
    },
    []
  );

  return { cart, setCart };
}
