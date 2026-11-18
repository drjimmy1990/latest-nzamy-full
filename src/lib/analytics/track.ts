/**
 * track.ts — the one client call the pages use: trackEvent(name, params).
 *
 * A no-op unless the analytics scripts were loaded on this page — which
 * AnalyticsConsent.tsx does only after consent, only with an env id, only on
 * a public route (analytics.ts) — AND the current page is still one of those
 * routes. Safe to call from any component, on the server too (it returns).
 * Never pass personal data in params: no e-mail, name, licence or user id.
 */
import { isAnalyticsRoute, type ClientAnalyticsEvent } from "./analytics.ts";

type Params = Record<string, string | number | boolean>;

interface AnalyticsWindow {
  gtag?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
  __nzAnalyticsLoaded?: { ga4Id: string | null; clarity: boolean };
}

export function trackEvent(name: ClientAnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as AnalyticsWindow;
  const loaded = w.__nzAnalyticsLoaded;
  if (!loaded || !isAnalyticsRoute(window.location.pathname)) return;
  try {
    if (loaded.ga4Id && typeof w.gtag === "function") w.gtag("event", name, params);
    if (loaded.clarity && typeof w.clarity === "function") w.clarity("event", name);
  } catch {
    // analytics never breaks a page
  }
}

const sentOnce = new Set<string>();

/** trackEvent, at most once per page load per event name (e.g. the first «التالي» of a signup form). */
export function trackEventOnce(name: ClientAnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined" || sentOnce.has(name)) return;
  const w = window as unknown as AnalyticsWindow;
  if (!w.__nzAnalyticsLoaded || !isAnalyticsRoute(window.location.pathname)) return;
  sentOnce.add(name);
  trackEvent(name, params);
}
