"use client";

import { useSyncExternalStore } from "react";
import { isSupabaseMode } from "@/lib/services/api";
import { hasSupabaseSessionCookie } from "./sessionCookie";

const subscribe = () => () => {};

/**
 * True when this browser holds no Supabase session cookie, so the visitor is
 * a guest for certain and a /laws side panel need not wait on
 * useUser().loading (see sessionCookie.ts). false on the server and in demo
 * mode, where the session is not a cookie.
 */
export function useNoSessionCookie(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isSupabaseMode && !hasSupabaseSessionCookie(document.cookie),
    () => false,
  );
}
