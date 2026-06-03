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

const BACKEND_MODE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo")
    : "demo";

export const isSupabaseMode = BACKEND_MODE === "supabase";

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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
