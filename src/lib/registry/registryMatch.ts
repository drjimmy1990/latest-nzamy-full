/**
 * The admin verification queue's registry line (launch batch R2/R3/R5,
 * migration 20261122_40 → public.lawyer_registry_admin_matches).
 *
 * Computed by the database from the licence on the lawyer's file when the
 * admin reads the queue — never stored from anything the browser sent at
 * signup. It is a hint to approve faster, not a proof: without an OTP (R4)
 * anyone can type someone else's licence, which is exactly what name_match,
 * mobile_match and other_claims help the admin spot.
 *
 * Pure: relative imports only, `node --test` loads it as it is.
 */

export type RegistryMatchStatus = "valid" | "expired" | "unknown_expiry" | "not_found" | "no_licence";
export type NameMatch = "exact" | "partial" | "different" | "none";

export interface RegistryMatch {
  status: RegistryMatchStatus;
  licence: string | null;
  registryName: string | null;
  expiry: string | null;
  archived: boolean;
  nameMatch: NameMatch | null;
  /** true / false when both mobiles are known, else null. */
  mobileMatch: boolean | null;
  /** Other accounts whose licence number is the same (normalised). */
  otherClaims: number;
  checkedAt: string | null;
}

const STATUSES = new Set<RegistryMatchStatus>(["valid", "expired", "unknown_expiry", "not_found", "no_licence"]);
const NAME_MATCHES = new Set<NameMatch>(["exact", "partial", "different", "none"]);

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** One row's jsonb → RegistryMatch, or null when it is not one. */
export function shapeRegistryMatch(raw: unknown): RegistryMatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUSES.has(r.status as RegistryMatchStatus)) return null;
  const nm = typeof r.name_match === "string" && NAME_MATCHES.has(r.name_match as NameMatch) ? (r.name_match as NameMatch) : null;
  const claims = typeof r.other_claims === "number" && Number.isFinite(r.other_claims) && r.other_claims > 0 ? Math.floor(r.other_claims) : 0;
  return {
    status: r.status as RegistryMatchStatus,
    licence: str(r.licence),
    registryName: str(r.registry_name),
    expiry: typeof r.expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.expiry) ? r.expiry : null,
    archived: r.archived === true,
    nameMatch: nm,
    mobileMatch: typeof r.mobile_match === "boolean" ? r.mobile_match : null,
    otherClaims: claims,
    checkedAt: str(r.checked_at),
  };
}

/** The RPC's rows → Map(user_id → RegistryMatch). Malformed rows are skipped. */
export function registryMatchesByUser(rows: unknown): Map<string, RegistryMatch> {
  const out = new Map<string, RegistryMatch>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { user_id, registry_match } = row as { user_id?: unknown; registry_match?: unknown };
    const m = shapeRegistryMatch(registry_match);
    if (typeof user_id === "string" && m) out.set(user_id, m);
  }
  return out;
}

export type Tone = "good" | "warn" | "bad" | "neutral";

/** The admin's one-line Arabic reading of a match, plus notes, with a tone. */
export function describeRegistryMatch(m: RegistryMatch): { line: string; notes: string[]; tone: Tone } {
  const notes: string[] = [];
  if (m.otherClaims > 0) notes.push(`حسابات أخرى تحمل رقم الترخيص نفسه: ${m.otherClaims}`);
  if (m.status === "no_licence") return { line: "السجل: لم يُدخل رقم ترخيص", notes, tone: "neutral" };
  if (m.status === "not_found") return { line: `السجل: الترخيص ${m.licence ?? ""} غير موجود`.trim(), notes, tone: "bad" };

  const expiry = m.expiry ? m.expiry.split("-").reverse().join("/") : null;
  let line: string;
  let tone: Tone;
  if (m.status === "valid") {
    line = `السجل: ${m.registryName ?? ""} — ترخيص ${m.licence ?? ""} سارٍ حتى ${expiry ?? ""}`;
    tone = "good";
  } else if (m.status === "expired") {
    line = `السجل: ${m.registryName ?? ""} — ترخيص ${m.licence ?? ""} منتهٍ في ${expiry ?? ""}`;
    tone = "bad";
  } else {
    line = `السجل: ${m.registryName ?? ""} — ترخيص ${m.licence ?? ""} بلا تاريخ انتهاء`;
    tone = "warn";
  }
  if (m.archived) notes.push("السجل يصفه بأنه غير ظاهر في القائمة النشطة اليوم");
  if (m.nameMatch === "different") notes.push("اسم الحساب يختلف عن الاسم في السجل");
  else if (m.nameMatch === "partial") notes.push("اسم الحساب جزء من الاسم في السجل");
  if (m.mobileMatch === false) notes.push("جوال الحساب يختلف عن الجوال في السجل");
  else if (m.mobileMatch === true) notes.push("جوال الحساب يطابق الجوال في السجل");
  if (tone === "good" && (m.archived || m.nameMatch === "different" || m.mobileMatch === false || m.otherClaims > 0)) tone = "warn";
  return { line: line.replace(/\s+/g, " ").trim(), notes, tone };
}
