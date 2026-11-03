"use client";

/**
 * useAdminSimulation — the admin's «عرض كـ» sub-role and «محاكاة القيود»
 * mode for THIS tab (S6 Part D; preflight ruling R27).
 *
 * UI state only (see src/lib/nav/adminSimulation.ts). It chooses which menu
 * an admin is drawn and whether the dashboards' own UI gates apply to the
 * admin. It is never read by a guard, routeAccess, src/proxy.ts, an API or a
 * request; adminSimulation.test.ts pins that with a source scan.
 *
 * It does not read the session itself: the caller passes `isAdmin` from the
 * REAL role, and the hook returns null otherwise — so a value someone typed
 * into a non-admin tab's sessionStorage is ignored. Mirrors useAdminView.ts:
 * sessionStorage per tab, every read and write wrapped.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  ADMIN_SIM_EVENT,
  parseStoredAdminSimulation,
  readStoredAdminSimulationText,
  writeStoredAdminSimulation,
  type AdminSimulation,
} from "@/lib/nav/adminSimulation";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ADMIN_SIM_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ADMIN_SIM_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// The raw string is the snapshot (a parsed object would be a new value on
// every call and loop useSyncExternalStore); it is parsed in a memo below.
const getSnapshot = (): string | null => readStoredAdminSimulationText(storage());
const getServerSnapshot = (): string | null => null;

/** Writes this tab's simulation. Callers gate it on the real admin role. */
export function setAdminSimulation(sim: AdminSimulation): void {
  if (writeStoredAdminSimulation(storage(), sim)) {
    try { window.dispatchEvent(new Event(ADMIN_SIM_EVENT)); } catch {}
  }
}

/**
 * @param isAdmin the REAL role is admin and the session has resolved. When
 *   false the hook answers null whatever is stored.
 */
export function useAdminSimulation(isAdmin: boolean): AdminSimulation | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => (isAdmin ? parseStoredAdminSimulation(raw) : null), [isAdmin, raw]);
}
