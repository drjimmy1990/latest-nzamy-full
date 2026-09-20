/**
 * Supabase-aware service wrapper.
 * ─────────────────────────────────────────────────────────
 * Provides helpers to create dual-mode service functions that:
 *   - In "supabase" mode → call API routes
 *   - In "demo" mode → call localStorage stores
 *
 * Usage:
 *   const getItems = dualMode(
 *     async () => apiGet<Item[]>("/api/v1/items"),
 *     () => getItemsLocal(),
 *   );
 */

// Relative, with the .ts extension, so `node --test` can load this module —
// the `@/` alias is a tsconfig path Node does not resolve, and ~75 service
// modules plus their unit tests import this file. Same spelling as
// src/app/api/v1/tickets/_shared.ts and the other node-testable modules
// (tsconfig sets allowImportingTsExtensions).
import { isSupabaseMode as backendIsSupabase } from "../runtimeMode.ts";

// The mode itself comes from src/lib/runtimeMode.ts — one derivation for the
// whole app, `"supabase"` when the variable is unset, never `"demo"` (see that
// file, and hypothesis H2 of
// docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md). This used to
// re-derive it with its own `?? "demo"`, so an unset variable sent all ~75
// service modules that import `isSupabaseMode` from here down their local
// fixture path instead of the API.
//
// The `typeof window` half is NOT the env default and stays exactly as it was:
// `apiGet` builds its URL from `window.location.origin`, so "server side" must
// keep reporting false here whatever the backend mode is.
export const isSupabaseMode = typeof window !== "undefined" && backendIsSupabase;

// ─── API helpers ──────────────────────────────────────────────────────────────

/** Generic typed fetch to internal API routes */
export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const response = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    // `same-origin` is already the browser default; it is written out because
    // every /api/v1 route authenticates from the `sb-<ref>-auth-token*` cookies
    // and a silent default is the wrong place for that to live. Hypothesis H4
    // of docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md: inside
    // the Capacitor shell the document origin is not the API origin, and an
    // implicit default is exactly what makes such a request arrive with no
    // cookies and come back 401.
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** Generic typed POST/PATCH/PUT/DELETE to internal API routes */
export async function apiMutate<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    // Same reasoning as apiGet above. `cache: "no-store"` joins it here: a
    // mutation must never be served from, or written into, the HTTP cache, and
    // POST /api/v1/service-requests — the call UAT-LIVE-CASE-001 is about —
    // goes through this function.
    credentials: "same-origin",
    cache: "no-store",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error || `API error: ${response.status}`);
  }
  // Some endpoints return 204 No Content
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ─── Dual-mode wrapper ────────────────────────────────────────────────────────

/**
 * Creates a function that runs `supabaseFn` when in supabase mode,
 * and `demoFn` when in demo mode. Falls back to `demoFn` if supabaseFn throws.
 */
export function dualMode<TArgs extends unknown[], TResult>(
  supabaseFn: (...args: TArgs) => Promise<TResult>,
  demoFn: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    if (!isSupabaseMode) {
      return demoFn(...args);
    }
    try {
      return await supabaseFn(...args);
    } catch (error) {
      console.warn("[Nzamy] Supabase call failed, falling back to demo:", error);
      return demoFn(...args);
    }
  };
}

/**
 * Same as dualMode but without fallback — if supabase mode fails, it throws.
 */
export function strictDualMode<TArgs extends unknown[], TResult>(
  supabaseFn: (...args: TArgs) => Promise<TResult>,
  demoFn: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    if (!isSupabaseMode) {
      return demoFn(...args);
    }
    return supabaseFn(...args);
  };
}
