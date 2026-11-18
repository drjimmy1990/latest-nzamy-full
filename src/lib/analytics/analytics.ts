/**
 * analytics.ts — visitor analytics (owner package 17/18 Nov, decision 18 of
 * batch l7): GA4 + Microsoft Clarity, built and OFF.
 *
 * The rules, all enforced here or by the two files that use this one
 * (src/components/analytics/AnalyticsConsent.tsx in the browser,
 * src/lib/payments/fulfillOrder.ts on the server):
 *
 *   1. Nothing runs without the env ids. NEXT_PUBLIC_GA4_ID («G-…») and
 *      NEXT_PUBLIC_CLARITY_ID are read at BUILD time (Next inlines them);
 *      with neither set there is no banner, no script, no cookie. The
 *      server purchase event also needs GA4_API_SECRET.
 *   2. Consent first. Neither script is fetched before the visitor presses
 *      «أوافق» on the banner; «لا أوافق» is the same size and one click. The
 *      choice is remembered in the first-party cookie CONSENT_COOKIE.
 *   3. Public routes only: ANALYTICS_ROUTES (home, /founder, /pricing,
 *      /register/*, /checkout, /payments/result). Never a dashboard, /ai/*
 *      (the drafter), /dashboard/admin or any other page.
 *   4. Clarity sees no typed value: every input is masked, and on the
 *      payment and verification pages the whole page is (FULL_MASK_ROUTES).
 *   5. The purchase is sent by the server (GA4 Measurement Protocol) only
 *      for a LIVE order whose buyer had consented at checkout — the GA client
 *      id is copied from the `_ga` cookie then and only then. No client id →
 *      no event; one is never invented.
 *
 * Nothing here holds personal data: no e-mail, name, licence, user id or
 * card detail is ever put in an event.
 */

// ── env ─────────────────────────────────────────────────────────────────────

const GA4_ID_RE = /^G-[A-Z0-9]{4,16}$/;
const CLARITY_ID_RE = /^[a-z0-9]{6,16}$/;

/** A GA4 measurement id («G-XXXXXXX»), or null — never put in a URL unchecked. */
export function validGa4Id(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return GA4_ID_RE.test(v) ? v : null;
}

/** A Clarity project id (lower-case letters and digits), or null. */
export function validClarityId(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return CLARITY_ID_RE.test(v) ? v : null;
}

export interface AnalyticsIds {
  ga4Id: string | null;
  clarityId: string | null;
  /** At least one id is set: only then is there anything to consent to. */
  enabled: boolean;
}

export function analyticsIds(ga4: string | undefined | null, clarity: string | undefined | null): AnalyticsIds {
  const ga4Id = validGa4Id(ga4);
  const clarityId = validClarityId(clarity);
  return { ga4Id, clarityId, enabled: Boolean(ga4Id || clarityId) };
}

// ── routes ──────────────────────────────────────────────────────────────────

/**
 * The only pages analytics may run on: a prefix matches itself and its
 * sub-paths (/register/provider/verify), never a longer name (/founder-terms,
 * /registerx). "/" matches the home page only.
 */
export const ANALYTICS_ROUTES = ["/", "/founder", "/pricing", "/register", "/checkout", "/payments/result"] as const;

/** Pages whose whole content Clarity masks (amounts, masked e-mail, licence). */
export const FULL_MASK_ROUTES = ["/checkout", "/payments/result", "/register/provider/verify"] as const;

function normalisePath(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) return null;
  const path = pathname.split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

function underAny(pathname: string | null | undefined, routes: readonly string[]): boolean {
  const path = normalisePath(pathname);
  if (!path) return false;
  return routes.some((r) => (r === "/" ? path === "/" : path === r || path.startsWith(`${r}/`)));
}

export function isAnalyticsRoute(pathname: string | null | undefined): boolean {
  return underAny(pathname, ANALYTICS_ROUTES);
}

export function isFullMaskRoute(pathname: string | null | undefined): boolean {
  return underAny(pathname, FULL_MASK_ROUTES);
}

// ── consent cookie ──────────────────────────────────────────────────────────

export const CONSENT_COOKIE = "nz_consent";
/** 180 days, for either answer; the banner asks again after that. */
export const CONSENT_MAX_AGE_S = 180 * 24 * 60 * 60;

export type ConsentChoice = "granted" | "denied";

export function parseConsent(raw: string | undefined | null): ConsentChoice | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/** The value read from a `document.cookie` string. */
export function consentFromCookieHeader(cookieHeader: string | undefined | null): ConsentChoice | null {
  return parseConsent(cookieValue(cookieHeader, CONSENT_COOKIE));
}

/** The `document.cookie` assignment that stores a choice (first-party, Lax, whole site). */
export function consentCookieString(choice: ConsentChoice, secure: boolean): string {
  return `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function cookieValue(cookieHeader: string | undefined | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** The analytics cookies GA4 and Clarity set on our own domain — cleared when consent is withdrawn. */
export function isAnalyticsCookieName(name: string): boolean {
  return name === "_ga" || name.startsWith("_ga_") || name === "_gid" || name === "_clck" || name === "_clsk";
}

// ── GA client id (server, at checkout) ──────────────────────────────────────

/** `_ga` = «GA1.1.<random>.<first-seen seconds>» → «<random>.<seconds>», or null. */
export function parseGaClientId(raw: string | undefined | null): string | null {
  const m = /^GA\d\.\d+\.(\d{1,20}\.\d{1,20})$/.exec((raw ?? "").trim());
  return m ? m[1] : null;
}

/** `_ga_<id>` = «GS1.1.<session>.…» or «GS2.1.s<session>$o…» → the session id, or null. */
export function parseGaSessionId(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  const gs1 = /^GS1\.\d+\.(\d{6,20})\./.exec(v);
  if (gs1) return gs1[1];
  const gs2 = /^GS2\.\d+\.s(\d{6,20})(?:\$|$)/.exec(v);
  return gs2 ? gs2[1] : null;
}

/** The session cookie GA4 sets for one measurement id: «_ga_» + the id without «G-». */
export function gaSessionCookieName(ga4Id: string): string {
  return `_ga_${ga4Id.replace(/^G-/, "")}`;
}

export interface OrderAnalytics {
  ga_client_id: string;
  ga_session_id?: string;
}

/**
 * What the checkout stores as metadata.analytics: the GA ids, ONLY when the
 * buyer's consent cookie says granted and GA4 is configured. Anything else
 * (declined, no choice, no `_ga`, no GA4 id) → null, and no purchase event
 * will ever be sent for that order.
 */
export function orderAnalyticsFromCookies(
  get: (name: string) => string | undefined | null,
  ga4IdRaw: string | undefined | null,
): OrderAnalytics | null {
  const ga4Id = validGa4Id(ga4IdRaw);
  if (!ga4Id) return null;
  if (parseConsent(get(CONSENT_COOKIE)) !== "granted") return null;
  const clientId = parseGaClientId(get("_ga"));
  if (!clientId) return null;
  const sessionId = parseGaSessionId(get(gaSessionCookieName(ga4Id)));
  return { ga_client_id: clientId, ...(sessionId ? { ga_session_id: sessionId } : {}) };
}

/** metadata.analytics read back from an order (re-validated: the column is jsonb). */
export function orderAnalyticsFromMetadata(metadata: Record<string, unknown> | null | undefined): OrderAnalytics | null {
  const a = metadata?.analytics;
  if (!a || typeof a !== "object") return null;
  const rec = a as Record<string, unknown>;
  const clientId = typeof rec.ga_client_id === "string" ? parseGaClientId(`GA1.1.${rec.ga_client_id}`) : null;
  if (!clientId) return null;
  const sessionId = typeof rec.ga_session_id === "string" && /^\d{6,20}$/.test(rec.ga_session_id) ? rec.ga_session_id : null;
  return { ga_client_id: clientId, ...(sessionId ? { ga_session_id: sessionId } : {}) };
}

// ── events ──────────────────────────────────────────────────────────────────

/** The owner's list (package 17 Nov). Purchase is server-side only. */
export const ANALYTICS_EVENTS = {
  pageView: "page_view",
  reserveClick: "reserve_seat_click",
  signUpStart: "sign_up_start",
  licenceVerified: "licence_verified",
  consentTicked: "founder_consent_ticked",
  beginCheckout: "begin_checkout",
  purchase: "purchase",
} as const;

export type ClientAnalyticsEvent = Exclude<(typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS], "purchase">;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/**
 * The page_location sent to GA: origin + path + the utm values only. Any
 * other query value is dropped — /payments/result carries payment ids and a
 * query string can carry a reset token or an e-mail.
 */
export function cleanPageLocation(origin: string, pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v && v.trim()) kept.set(key, v.trim().slice(0, 64));
  }
  const path = normalisePath(pathname) ?? "/";
  const q = kept.toString();
  return `${origin}${path}${q ? `?${q}` : ""}`;
}

// ── server purchase event (GA4 Measurement Protocol) ────────────────────────

export const GA4_MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export interface PurchaseInput {
  orderId: string;
  itemId: string;
  itemName: string;
  kind: string;
  /** The order's total, VAT included, in halalas. */
  totalHalalas: number;
  currency: string;
  metadata: Record<string, unknown> | null;
}

/** The Measurement Protocol body, or null when the order carries no consented client id. */
export function buildPurchasePayload(input: PurchaseInput): Record<string, unknown> | null {
  const ids = orderAnalyticsFromMetadata(input.metadata);
  if (!ids) return null;
  if (!Number.isFinite(input.totalHalalas) || input.totalHalalas < 0) return null;
  const value = Math.round(input.totalHalalas) / 100;
  return {
    client_id: ids.ga_client_id,
    non_personalized_ads: true,
    events: [
      {
        name: ANALYTICS_EVENTS.purchase,
        params: {
          transaction_id: input.orderId,
          // value is the order total INCLUDING VAT (payment_orders.total_halalas)
          value,
          currency: input.currency || "SAR",
          ...(ids.ga_session_id ? { session_id: ids.ga_session_id } : {}),
          engagement_time_msec: 1,
          items: [{ item_id: input.itemId, item_name: input.itemName, item_category: input.kind, price: value, quantity: 1 }],
        },
      },
    ],
  };
}

export interface PurchaseSenderConfig {
  ga4Id: string | undefined | null;
  apiSecret: string | undefined | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends the purchase event. Never throws; "off" when GA4 or the secret is
 * missing, "skipped" when the order has no consented client id.
 */
export async function sendPurchaseEvent(
  cfg: PurchaseSenderConfig,
  input: PurchaseInput,
): Promise<"sent" | "off" | "skipped" | "failed"> {
  const ga4Id = validGa4Id(cfg.ga4Id);
  const secret = (cfg.apiSecret ?? "").trim();
  if (!ga4Id || !secret) return "off";
  const payload = buildPurchasePayload(input);
  if (!payload) return "skipped";
  try {
    const url = `${GA4_MP_ENDPOINT}?measurement_id=${encodeURIComponent(ga4Id)}&api_secret=${encodeURIComponent(secret)}`;
    const res = await (cfg.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 3000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
