/**
 * myLibraryView.ts — the decisions behind «مكتبتي» (/laws/my, owner TODO
 * P1-11 / N02-9 / N05-L3), kept out of the components so they can be tested.
 * Every function reads an answer the page already fetched; none invents a
 * value: a read that failed is "unknown", never a zero or an empty list.
 *
 * Pure: relative imports only, so `node --test` loads it directly.
 */

import type { MyLibraryGrantAnswer } from "../../../lib/library/myLibraryGrant.ts";

// ─── النقاط والاشتراك: the library subscription line ─────────────────────────

export type SubscriptionView =
  /** A library grant runs (or is booked): LibraryGrantStatusCard draws it. */
  | { kind: "grant" }
  /** Full library without a library grant — an admin only (no tier opens it since owner ٨٩, l12). */
  | { kind: "plan" }
  /** No full library. `messageAr` set when his account type may not buy it. */
  | { kind: "none"; messageAr: string | null }
  /** The grant read failed or is still running: say nothing about the plan. */
  | { kind: "unknown" };

/**
 * `grant` — the parsed /api/v1/library/my-grant answer (null while loading).
 * `fullAccess` — hasFullLibraryAccess() read by the server page (null when
 * that read failed). A signed-in page never gets `signedIn: false` from the
 * route, so that answer means the read failed (parseMyLibraryGrant's NOTHING).
 */
export function subscriptionView(
  grant: MyLibraryGrantAnswer | null,
  fullAccess: boolean | null,
): SubscriptionView {
  if (!grant || !grant.signedIn) return { kind: "unknown" };
  if (grant.grant) return { kind: "grant" };
  if (fullAccess === true) return { kind: "plan" };
  if (fullAccess === null) return { kind: "unknown" };
  const p = grant.purchase;
  return { kind: "none", messageAr: p && p.eligible === false ? p.messageAr : null };
}

// ─── Founder: نقاط مساعد المكتبة الذكي ───────────────────────────────────────

export type FounderPointsView =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "none" }
  | { kind: "member"; remaining: number; total: number };

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/**
 * The GET /api/v1/membership/founder reply: undefined while it runs, null
 * when it failed (a 503 is "unavailable", never "not a founder"). Only an
 * active member's `libraryPoints` is shown; a member whose seat carries no
 * library row yet (total 0) shows nothing rather than «٠ من ٠».
 */
export function founderPointsView(reply: unknown): FounderPointsView {
  if (reply === undefined) return { kind: "loading" };
  if (reply === null || typeof reply !== "object") return { kind: "unavailable" };
  const r = reply as { member?: unknown; libraryPoints?: unknown };
  if (r.member !== true) return { kind: "none" };
  const lp = r.libraryPoints as { total?: unknown; remaining?: unknown } | null | undefined;
  if (!lp || !isCount(lp.total) || !isCount(lp.remaining)) return { kind: "unavailable" };
  if (lp.total === 0) return { kind: "none" };
  return { kind: "member", remaining: Math.min(lp.remaining, lp.total), total: lp.total };
}

// ─── سجل القراءة ─────────────────────────────────────────────────────────────

export interface ReadingHistoryRow {
  key: string;
  href: string;
  title: string;
  kindAr: string;
  /** ISO time it was opened; null on entries saved before 2026-09-28. */
  openedAt: string | null;
}

/**
 * The reader a stored entry opens — the same rule as RecentSessions.tsx: the
 * slug is stored as useParams() returned it, possibly already percent-encoded
 * (the apiSlug() double-encoding trap), so it is encoded only when it is not.
 */
export function readingHistoryHref(type: unknown, slug: string): string {
  const safe = /%[0-9A-Fa-f]{2}/.test(slug) ? slug : encodeURIComponent(slug);
  if (type === "order") return `/laws/orders/${safe}`;
  if (type === "precedent") return `/precedents/${safe}`;
  return `/laws/${safe}`;
}

const KIND_AR: Record<string, string> = { order: "أمر أو تعميم", precedent: "سوابق قضائية" };

/**
 * preferences.recentSessions (newest first, capped at 10 by the route) as
 * rows. Entries without a slug or a title are dropped, never given one.
 * Returns null when `list` is not a list at all (nothing was read).
 */
export function readingHistoryRows(list: unknown): ReadingHistoryRow[] | null {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return null;
  const rows: ReadingHistoryRow[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as { slug?: unknown; title?: unknown; type?: unknown; openedAt?: unknown };
    if (typeof s.slug !== "string" || !s.slug.trim()) continue;
    if (typeof s.title !== "string" || !s.title.trim()) continue;
    const href = readingHistoryHref(s.type, s.slug);
    if (seen.has(href)) continue;
    seen.add(href);
    const openedAt = typeof s.openedAt === "string" && !Number.isNaN(Date.parse(s.openedAt)) ? s.openedAt : null;
    rows.push({
      key: href,
      href,
      title: s.title.trim(),
      kindAr: (typeof s.type === "string" && KIND_AR[s.type]) || "نظام",
      openedAt,
    });
  }
  return rows;
}

// ─── Arabic wording ──────────────────────────────────────────────────────────

/** ١٢٣ — Arabic-Indic digits. */
export function arDigits(n: number): string {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

/** «منذ ٣ أيام» style relative time; «اليوم» / «أمس» for the last two days. */
export function openedAgoAr(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${arDigits(days)} أيام`;
  if (days < 30) return `منذ ${arDigits(days)} يوماً`;
  const months = Math.floor(days / 30);
  if (months === 1) return "منذ شهر";
  if (months === 2) return "منذ شهرين";
  return months <= 10 ? `منذ ${arDigits(months)} أشهر` : `منذ ${arDigits(months)} شهراً`;
}

/** «جهاز واحد», «جهازين», «٣ أجهزة», «١١ جهازاً». */
export function devicesCountAr(n: number): string {
  if (n === 1) return "جهاز واحد";
  if (n === 2) return "جهازين";
  if (n >= 3 && n <= 10) return `${arDigits(n)} أجهزة`;
  return `${arDigits(n)} جهازاً`;
}
