/**
 * utmAttribution.ts — F13 (owner package 17 Nov): where a buyer came from.
 *
 * FIRST TOUCH. The proxy (src/proxy.ts) sets one first-party cookie,
 * ATTRIBUTION_COOKIE, the first time a browser opens a page whose URL carries
 * at least one utm_* parameter, and never overwrites it while it lives (30
 * days). It holds the five utm values, the landing PATH (never the query:
 * a query string can carry a reset token or an e-mail) and the first-seen
 * time — no user id, no IP, no e-mail. POST /api/v1/payments/checkout copies
 * it into payment_orders.metadata.attribution, and the founder admin page
 * (F14) counts conversion by utm_source / utm_campaign from there.
 *
 * Why only a URL WITH utm parameters sets it (not every first visit): the
 * site sits behind an nginx proxy cache. A cached page never reaches the
 * proxy, so a "first visit" cookie could be missed or land on a later,
 * uncached page with the wrong landing path. A utm URL is its own cache key
 * and a response that sets a cookie is not cached by default, so tagged
 * campaign links are captured reliably. A visitor who never arrived through a
 * tagged link has no cookie, and the order is counted as «غير متتبَّع».
 *
 * The cookie is httpOnly (only the server reads it), SameSite=Lax, Secure in
 * production. Every value is re-validated when it is read: a hand-edited
 * cookie can only produce bounded, printable strings.
 *
 * Pure: no imports, no process.env, so `node --test` loads it and the proxy
 * stays cheap (no DB, no network).
 */

export const ATTRIBUTION_COOKIE = "nz_attr";
export const ATTRIBUTION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

export type Attribution = Partial<Record<UtmKey, string>> & {
  /** The landing page's pathname (no query, no fragment). */
  landing_path: string;
  /** ISO time the cookie was set. */
  first_seen_at: string;
};

const MAX_UTM_LENGTH = 64;
const MAX_PATH_LENGTH = 160;
const MAX_COOKIE_LENGTH = 3000;

/**
 * A utm value as stored: trimmed, control and bidi-override characters and
 * the JSON / cookie-hostile ones removed, at most MAX_UTM_LENGTH characters.
 * Empty → null.
 */
export function cleanUtmValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = Array.from(
    raw
      .normalize("NFC")
      // C0/C1 controls, bidi overrides and isolates, zero-width marks
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "")
      .replace(/[<>"'`\\;]/g, "")
      .trim(),
  )
    .slice(0, MAX_UTM_LENGTH)
    .join("")
    .trim();
  return cleaned ? cleaned : null;
}

/** A pathname as stored: starts with "/", printable ASCII only (Next keeps it percent-encoded), bounded. */
export function cleanLandingPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/, 1)[0];
  if (!/^\/[\x21-\x7e]*$/.test(path)) return null;
  if (/[<>"'`\\;]/.test(path)) return null;
  return path.slice(0, MAX_PATH_LENGTH);
}

/**
 * The attribution of a landing URL, or null when it carries no usable utm
 * parameter (then nothing is stored).
 */
export function attributionFromUrl(
  searchParams: { get(name: string): string | null },
  pathname: string,
  now: Date,
): Attribution | null {
  const utm: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const v = cleanUtmValue(searchParams.get(key));
    if (v) utm[key] = v;
  }
  if (Object.keys(utm).length === 0) return null;
  return { ...utm, landing_path: cleanLandingPath(pathname) ?? "/", first_seen_at: now.toISOString() };
}

export function serializeAttribution(a: Attribution): string {
  return JSON.stringify(a);
}

/** The cookie's value read back, re-validated field by field; null when absent or unusable. */
export function parseAttributionCookie(value: string | null | undefined): Attribution | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_COOKIE_LENGTH) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const landing = cleanLandingPath(obj.landing_path);
  const seen = typeof obj.first_seen_at === "string" ? Date.parse(obj.first_seen_at) : Number.NaN;
  if (!landing || !Number.isFinite(seen)) return null;
  const out: Attribution = { landing_path: landing, first_seen_at: new Date(seen).toISOString() };
  let any = false;
  for (const key of UTM_KEYS) {
    const v = cleanUtmValue(obj[key]);
    if (v) {
      out[key] = v;
      any = true;
    }
  }
  return any ? out : null;
}

type HeaderGet = (name: string) => string | null;

/**
 * Should the proxy try to set the cookie on this request? Only a top-level
 * page load (GET, a document navigation), never an API call, a Next asset,
 * a router prefetch or an RSC fetch, and only while the browser has none.
 */
export function shouldCaptureAttribution(req: {
  method: string;
  pathname: string;
  hasCookie: boolean;
  header: HeaderGet;
}): boolean {
  if (req.hasCookie) return false;
  if (req.method.toUpperCase() !== "GET") return false;
  if (req.pathname.startsWith("/api/") || req.pathname.startsWith("/_next/")) return false;
  if (req.header("next-router-prefetch") !== null || req.header("rsc") !== null) return false;
  const purpose = `${req.header("purpose") ?? ""} ${req.header("sec-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch")) return false;
  const mode = req.header("sec-fetch-mode");
  if (mode !== null) return mode === "navigate";
  return (req.header("accept") ?? "").includes("text/html");
}

export function attributionCookieOptions(production: boolean): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  path: "/";
} {
  return { httpOnly: true, sameSite: "lax", secure: production, maxAge: ATTRIBUTION_MAX_AGE_S, path: "/" };
}
