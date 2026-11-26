"use client";

import { useEffect, useState } from "react";

/**
 * useVatRegistered — whether the platform adds VAT today, as the SERVER says
 * (GET /api/v1/pricing/vat; batch l16 A-01). null until the answer arrives:
 * a server render (which nginx may cache) never carries a VAT line, and a
 * failed or malformed answer stays null — no VAT line, never a guess. One
 * request per page load, shared by every caller.
 */
let shared: Promise<boolean | null> | null = null;

function fetchVatRegistered(): Promise<boolean | null> {
  if (!shared) {
    shared = fetch("/api/v1/pricing/vat", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const v = (body as { vatRegistered?: unknown } | null)?.vatRegistered;
        return typeof v === "boolean" ? v : null;
      })
      .catch(() => null);
  }
  return shared;
}

export function useVatRegistered(): boolean | null {
  const [registered, setRegistered] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchVatRegistered().then((v) => {
      if (!cancelled) setRegistered(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return registered;
}
