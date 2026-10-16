/**
 * businessDelegations.ts — the rules of «سجل التفويضات» (owner decision ٣٦,
 * owner decision ٥ «التفويض»), kept pure so they run under `node --test`.
 *
 * The table is `public.business_delegations`
 * (supabase/migrations/20261017_30_business_delegations.sql). The database is
 * the authority — its triggers refuse an outsider, the owner, a past expiry and
 * any edit other than revoking — and these functions exist so the API can say
 * WHY in Arabic before the request reaches it, and so the screen and the API
 * describe a row's state with the same words.
 */
import { isIsoDate } from "../riyadhToday.ts";

/** The powers a delegation can carry. One today: editing the company data. */
export const DELEGATION_SCOPES = ["company_profile"] as const;
export type DelegationScope = (typeof DELEGATION_SCOPES)[number];

export const DELEGATION_SCOPE_LABEL: Record<DelegationScope, string> = {
  company_profile: "تعديل بيانات المنشأة",
};

export const DELEGATION_NOTE_MAX = 500;

/**
 * Where a delegation stands today.
 *   active   — in force: not revoked, not past its last day, member still active
 *   expired  — its last day (Riyadh) has passed
 *   revoked  — the owner revoked it (final)
 *   lapsed   — not revoked and not expired, but the delegate is no longer an
 *              active member, so it grants nothing (the SQL helper requires an
 *              active membership too)
 */
export type DelegationStatus = "active" | "expired" | "revoked" | "lapsed";

export const DELEGATION_STATUS_LABEL: Record<DelegationStatus, string> = {
  active: "سارٍ",
  expired: "منتهٍ",
  revoked: "ملغى",
  lapsed: "موقوف — العضو غير نشط",
};

export interface DelegationStatusInput {
  revokedAt: string | null;
  expiresOn: string | null;
  /** The delegate's membership in this company is `active`. */
  memberActive: boolean;
}

export function delegationStatus(row: DelegationStatusInput, todayRiyadh: string): DelegationStatus {
  if (row.revokedAt) return "revoked";
  if (row.expiresOn && row.expiresOn < todayRiyadh) return "expired";
  if (!row.memberActive) return "lapsed";
  return "active";
}

export interface NewDelegationInput {
  delegateUserId: string;
  scope: DelegationScope;
  expiresOn: string | null;
  note: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELEGATION_AR = {
  badBody: "بيانات التفويض غير صالحة.",
  delegateRequired: "اختر العضو الذي تريد تفويضه.",
  badScope: "نوع الصلاحية غير معروف.",
  badExpiry: "تاريخ انتهاء التفويض غير صالح.",
  pastExpiry: "تاريخ انتهاء التفويض يجب ألا يسبق اليوم.",
  noteTooLong: `الملاحظة طويلة جداً (الحد ${DELEGATION_NOTE_MAX} حرف).`,
} as const;

/**
 * Validate a POST body. `todayRiyadh` is YYYY-MM-DD (riyadhToday()), passed in
 * so this stays deterministic.
 */
export function validateNewDelegation(
  body: unknown,
  todayRiyadh: string,
): { ok: true; value: NewDelegationInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: DELEGATION_AR.badBody };
  }
  const raw = body as Record<string, unknown>;

  const delegateUserId = typeof raw.delegateUserId === "string" ? raw.delegateUserId.trim() : "";
  if (!UUID_RE.test(delegateUserId)) return { ok: false, error: DELEGATION_AR.delegateRequired };

  const scopeRaw = raw.scope === undefined || raw.scope === null ? "company_profile" : raw.scope;
  if (typeof scopeRaw !== "string" || !(DELEGATION_SCOPES as readonly string[]).includes(scopeRaw)) {
    return { ok: false, error: DELEGATION_AR.badScope };
  }

  let expiresOn: string | null = null;
  if (raw.expiresOn !== undefined && raw.expiresOn !== null && raw.expiresOn !== "") {
    if (!isIsoDate(raw.expiresOn)) return { ok: false, error: DELEGATION_AR.badExpiry };
    if (raw.expiresOn < todayRiyadh) return { ok: false, error: DELEGATION_AR.pastExpiry };
    expiresOn = raw.expiresOn;
  }

  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== "string") return { ok: false, error: DELEGATION_AR.badBody };
    const trimmed = raw.note.trim();
    if (trimmed.length > DELEGATION_NOTE_MAX) return { ok: false, error: DELEGATION_AR.noteTooLong };
    note = trimmed === "" ? null : trimmed;
  }

  return { ok: true, value: { delegateUserId, scope: scopeRaw as DelegationScope, expiresOn, note } };
}
