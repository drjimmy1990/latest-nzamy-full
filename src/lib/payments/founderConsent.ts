/**
 * founderConsent.ts — the founder terms consent a founder membership checkout
 * needs (owner decision ١٦, 17 Nov 2026): «a MANDATORY consent checkbox
 * before payment that records the time and the text version».
 *
 * The contract of POST /api/v1/payments/checkout for the founder membership
 * (kind "membership", lawyer-founder-2026) — every other item ignores it:
 *   body  { itemId, billing, acceptFounderTerms: true, founderTermsVersion: FOUNDER_TERMS_VERSION }
 *   - acceptFounderTerms missing / not exactly `true`     → 400 FOUNDER_TERMS_REQUIRED_AR
 *   - founderTermsVersion not the current version         → 400 FOUNDER_TERMS_STALE_AR
 *   - the terms not published (FOUNDER_TERMS_PUBLISHED off) → 410 «باب الاشتراك مغلق حاليًا»
 *   - accepted → the order's metadata gets
 *       founder_terms_version    (the version accepted)
 *       founder_terms_accepted_at (the SERVER clock, ISO 8601) — never the browser's.
 *
 * Pure: relative imports only, so `node --test` loads it; the checkout screen
 * (a client component) imports the label and the body builder from here too.
 */

import { FOUNDER_TERMS_PUBLISHED, FOUNDER_TERMS_VERSION } from "../founder/founderTerms.ts";

/** The checkbox's label (owner ١٦). */
export const FOUNDER_CONSENT_LABEL_AR = "قرأتُ شروط باقة المحامي المؤسس وأوافق عليها";
export const FOUNDER_TERMS_HREF = "/founder-terms";

export const FOUNDER_TERMS_REQUIRED_AR = "يلزم الإقرار بقراءة شروط باقة المحامي المؤسس والموافقة عليها قبل الدفع";
export const FOUNDER_TERMS_STALE_AR = "تحدّثت شروط باقة المحامي المؤسس. حدّث الصفحة واقرأ الشروط ثم وافق عليها قبل الدفع";
/** = checkoutCore's FOUNDER_CLOSED_AR (kept here so this module has no import cycle). */
const FOUNDER_CLOSED_AR = "باب الاشتراك مغلق حاليًا";

export interface FounderConsent {
  accepted: boolean;
  version: string | null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The two consent fields of a checkout body, read leniently: anything but a
 * literal `true` is not a consent, and anything but a short string is no
 * version. Never refuses the body itself — only a founder order needs them,
 * and checkFounderConsent answers for it.
 */
export function parseFounderConsent(body: unknown): FounderConsent {
  if (!isPlainObject(body)) return { accepted: false, version: null };
  const version = body.founderTermsVersion;
  return {
    accepted: body.acceptFounderTerms === true,
    version: typeof version === "string" && version.length > 0 && version.length <= 32 ? version : null,
  };
}

export type FounderConsentCheck =
  | { ok: true; metadata: { founder_terms_version: string; founder_terms_accepted_at: string } }
  | { ok: false; status: 400 | 410; error: string };

export interface FounderTermsState {
  published: boolean;
  version: string;
}

export const CURRENT_FOUNDER_TERMS: FounderTermsState = Object.freeze({
  published: FOUNDER_TERMS_PUBLISHED,
  version: FOUNDER_TERMS_VERSION,
});

/** The founder order's consent rule; `now` is the server's clock. */
export function checkFounderConsent(
  consent: FounderConsent | null | undefined,
  now: Date,
  terms: FounderTermsState = CURRENT_FOUNDER_TERMS,
): FounderConsentCheck {
  if (!terms.published) return { ok: false, status: 410, error: FOUNDER_CLOSED_AR };
  if (!consent || consent.accepted !== true) return { ok: false, status: 400, error: FOUNDER_TERMS_REQUIRED_AR };
  if (consent.version !== terms.version) return { ok: false, status: 400, error: FOUNDER_TERMS_STALE_AR };
  return {
    ok: true,
    metadata: { founder_terms_version: terms.version, founder_terms_accepted_at: now.toISOString() },
  };
}
