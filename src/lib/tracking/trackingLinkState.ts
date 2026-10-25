/**
 * trackingLinkState.ts — the client tracking link's lifetime and state words
 * (D2, owner decision ٢٧٦; migration 20261026_62_tracking_links_v2.sql).
 *
 *   lifetime  chosen at creation (and again at re-activation): 7, 30 or 90
 *             days, or «حتى انتهاء المرحلة» — until the case's current stage
 *             ends (its closing date passes, it is deleted, or a newer stage
 *             written by a case worker becomes current).
 *   state     revoked > paused > expired > active. A link is never deleted:
 *             on expiry (or by the lawyer's hand) it is paused, and one click
 *             re-activates the SAME URL; revoking stays one-way.
 *
 * The database is the authority — public.tracking_link_effective_state is
 * this same function in SQL, and the lawyer list shows the state SQL computed
 * (a 'stage' expiry needs the case's stages). This mirror serves the labels,
 * the routes' fallback before the migration, and the tests that pin the two
 * together (supabase/tests/rls/tracking_links_v2.test.sql T9 uses the same
 * vectors as trackingLinkState.test.ts).
 *
 * Pure (no imports), so `node --test` loads it directly.
 */

export const TRACKING_LIFETIMES = ["7d", "30d", "90d", "stage"] as const;
export type TrackingLifetime = (typeof TRACKING_LIFETIMES)[number];

export const LIFETIME_LABEL_AR: Record<TrackingLifetime, string> = {
  "7d": "٧ أيام",
  "30d": "٣٠ يوماً",
  "90d": "٩٠ يوماً",
  stage: "حتى انتهاء المرحلة الحالية",
};

export const DEFAULT_TRACKING_LIFETIME: TrackingLifetime = "30d";

export function isTrackingLifetime(v: unknown): v is TrackingLifetime {
  return typeof v === "string" && (TRACKING_LIFETIMES as readonly string[]).includes(v);
}

export type TrackingLinkState = "active" | "paused" | "expired" | "revoked";

export const STATE_LABEL_AR: Record<TrackingLinkState, string> = {
  active: "نشط",
  paused: "موقوف مؤقتاً",
  expired: "منتهي — موقوف",
  revoked: "ملغى",
};

export function isTrackingLinkState(v: unknown): v is TrackingLinkState {
  return v === "active" || v === "paused" || v === "expired" || v === "revoked";
}

export interface TrackingStateInput {
  revokedAt: string | null;
  pausedAt: string | null;
  pausedReason: string | null;
  expiresAt: string | null;
  /** A 'stage' link whose pinned stage has ended — only SQL can know it. */
  stageEnded: boolean;
}

/** revoked > paused (by hand) > expired (paused on expiry, or past its end) > active. */
export function effectiveTrackingState(s: TrackingStateInput, nowMs: number): TrackingLinkState {
  if (s.revokedAt) return "revoked";
  if (s.pausedAt) return s.pausedReason === "expired" ? "expired" : "paused";
  if (s.stageEnded) return "expired";
  if (s.expiresAt) {
    const end = Date.parse(s.expiresAt);
    if (!Number.isNaN(end) && end <= nowMs) return "expired";
  }
  return "active";
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/**
 * What the client typed → exactly four ASCII digits, or null. Arabic-Indic
 * (٠–٩) and Persian (۰–۹) digits count; spaces and dashes are dropped;
 * anything else refuses. The database normalises the same way
 * (public.tracking_phone_digits) and compares there — the phone itself never
 * leaves it.
 */
export function normalizeUnlockDigits(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 20) return null;
  let out = "";
  for (const ch of input) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ARABIC_INDIC.includes(ch)) out += String(ARABIC_INDIC.indexOf(ch));
    else if (PERSIAN.includes(ch)) out += String(PERSIAN.indexOf(ch));
    else if (ch === " " || ch === "-" || ch === " ") continue;
    else return null;
  }
  return /^[0-9]{4}$/.test(out) ? out : null;
}

/**
 * Deploy order (D2): the code may reach production before 20261026_62.
 * PostgREST answers a function it does not know with PGRST202 ("Could not
 * find the function public.<name>(…) in the schema cache"); Postgres itself
 * with 42883. Either, naming `fn`, means "v1 database": the routes and the
 * page then behave as v1 (no lifetime, no pause, no digits). Any other
 * error stays an error.
 */
export function isMissingRpcError(error: { code?: string; message?: string } | null | undefined, fn: string): boolean {
  if (!error || !fn) return false;
  if (error.code !== "PGRST202" && error.code !== "42883") return false;
  return String(error.message ?? "").includes(fn);
}
