/**
 * grantPointsTopup.ts — LIVE-10 (owner package 27 Nov 2026, batch l19), the
 * pure half: an admin library grant (the direct grant and an approved library
 * request) tops the grantee's balance up to the library's minimum (50 points,
 * library_min_points_to_browse) when it is below — otherwise every library
 * grant being gated by that minimum (owner ٩٣, ./pointsGate.ts), the grantee
 * stayed locked out of the full text with 0 points.
 *
 * The work is one SQL call, public.library_grant_points_topup(grant)
 * (20261209_50): it locks the grant, reads the gate's own balance, credits ONE
 * library-assistant lot through credit_wallet_points (the paid pass's call)
 * expiring with the grant, and keeps one row per grant so a retry adds
 * nothing. This module reads its answer and words the grantee's notice.
 *
 * Pure: relative imports only, so `node --test` loads it. The call is in
 * ./grantPointsTopupServer.ts.
 */
import { libraryPointsWordAr } from "./pointsGate.ts";

export type GrantPointsTopupStatus =
  | "credited"
  | "not_needed"
  | "already"
  | "gate_off"
  | "not_gated"
  | "ended"
  | "not_admin_grant"
  /** 20261209_50 has not run yet: the grant stands, with no points. */
  | "not_installed"
  /** The call failed: the grant stands, with no points; logged. */
  | "failed"
  /** No grant id to key it on (the non-atomic fallback path): nothing asked. */
  | "skipped";

export interface GrantPointsTopup {
  status: GrantPointsTopupStatus;
  /** Points credited by THIS grant (0 unless credited / already). */
  points: number;
  minPoints: number | null;
}

const KNOWN: ReadonlySet<string> = new Set([
  "credited", "not_needed", "already", "gate_off", "not_gated", "ended", "not_admin_grant",
]);

const int = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** The function's jsonb answer → a GrantPointsTopup; anything unexpected is "failed". */
export function parseGrantPointsTopup(data: unknown): GrantPointsTopup {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { status: "failed", points: 0, minPoints: null };
  const row = data as Record<string, unknown>;
  const status = typeof row.status === "string" && KNOWN.has(row.status) ? (row.status as GrantPointsTopupStatus) : null;
  if (!status) return { status: "failed", points: 0, minPoints: null };
  const points = int(row.points) ?? 0;
  if (status === "credited" && !(points > 0)) return { status: "failed", points: 0, minPoints: null };
  return { status, points: status === "credited" || status === "already" ? points : 0, minPoints: int(row.min_points) };
}

/** PGRST202 / 42883: the function is not there yet. */
export function grantTopupFunctionMissing(code: string | null | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}

/**
 * The sentence added to the grantee's «تم تفعيل اشتراك المكتبة» notice, only
 * when THIS grant credited points; null otherwise (nothing is claimed that
 * did not happen).
 */
export function grantPointsTopupNoticeAr(topup: GrantPointsTopup): string | null {
  if (topup.status !== "credited" || !(topup.points > 0)) return null;
  const min = topup.minPoints && topup.minPoints > 0 ? topup.minPoints : null;
  const credited = `وأُضيفت إلى رصيدك ${libraryPointsWordAr(topup.points)} لمساعد المكتبة`;
  return min
    ? `${credited} ليبلغ رصيدك ${libraryPointsWordAr(min)}، وهو الحد الأدنى لفتح نصوص المكتبة الكاملة.`
    : `${credited}.`;
}

/** What the audit row and the admin's answer carry. */
export function grantPointsTopupAudit(topup: GrantPointsTopup): { status: GrantPointsTopupStatus; points: number } {
  return { status: topup.status, points: topup.points };
}

/**
 * The admin's toast line after a library grant (the entitlements console), or
 * null when there is nothing to say. Plain words; the SQL file name only when
 * the operator must run it.
 */
export function grantPointsTopupAdminAr(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const status = (raw as { status?: unknown }).status;
  const points = int((raw as { points?: unknown }).points) ?? 0;
  switch (status) {
    case "credited":
      return points > 0 ? `وأُضيفت إلى رصيده ${libraryPointsWordAr(points)} ليبلغ الحد الأدنى لفتح المكتبة` : null;
    case "not_needed":
      return "ورصيده بلغ الحد الأدنى لفتح المكتبة، فلم تُضف نقاط";
    case "not_installed":
      return "ولم تُضف نقاط: ملف قاعدة البيانات 20261209_50 لم يُشغَّل بعد";
    case "failed":
      return "وتعذّرت إضافة النقاط إلى رصيده، فبقي رصيده كما كان";
    default:
      return null;
  }
}
