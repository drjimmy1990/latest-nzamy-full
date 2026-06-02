"use client";
import { useState, useEffect, useCallback } from "react";
import type { CartEntry } from "@/components/laws/DraftDrawer";

const DRAFT_KEY = "nzamy_legal_draft_v1";

export function useDraftCart() {
  const [cart, setCartInternal] = useState<CartEntry[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setCartInternal(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const setCart = useCallback(
    (updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])) => {
      setCartInternal(prev => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    []
  );

  return { cart, setCart };
}
