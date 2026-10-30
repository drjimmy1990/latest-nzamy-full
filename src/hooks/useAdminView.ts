"use client";

/**
 * useAdminView — the admin's view context ("admin" | "lawyer") for THIS tab.
 *
 * UI state only (see src/lib/nav/shellContext.ts): it picks which menu an
 * admin is drawn and nothing else. Guards, src/proxy.ts and every API route
 * keep reading the real role. A non-admin session never writes it, and every
 * reader ignores it unless the real role is "admin".
 *
 * sessionStorage, per tab — the owner's own proposal (REF0021 §1-ج). Reads
 * and writes are wrapped: blocked storage simply means "nothing stored".
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  ADMIN_VIEW_EVENT,
  adminViewFromPath,
  readStoredAdminView,
  writeStoredAdminView,
  type AdminView,
} from "@/lib/nav/shellContext";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ADMIN_VIEW_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ADMIN_VIEW_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const getSnapshot = (): AdminView | null => readStoredAdminView(storage());
const getServerSnapshot = (): AdminView | null => null;

export function setAdminView(view: AdminView): void {
  if (writeStoredAdminView(storage(), view)) {
    try { window.dispatchEvent(new Event(ADMIN_VIEW_EVENT)); } catch {}
  }
}

/**
 * @param pathname the current path — entering /dashboard/admin or
 *   /dashboard/lawyer records that view (the old «وضع المحامي» link keeps
 *   working, now with a memory).
 * @param isAdmin the REAL role is admin and the session has resolved. Only
 *   then is anything written.
 */
export function useAdminView(pathname: string, isAdmin: boolean): {
  storedView: AdminView | null;
  setView: (view: AdminView) => void;
} {
  const storedView = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!isAdmin) return;
    const fromPath = adminViewFromPath(pathname);
    if (fromPath) setAdminView(fromPath);
  }, [pathname, isAdmin]);

  const setView = useCallback((view: AdminView) => {
    if (isAdmin) setAdminView(view);
  }, [isAdmin]);

  return { storedView: isAdmin ? storedView : null, setView };
}
