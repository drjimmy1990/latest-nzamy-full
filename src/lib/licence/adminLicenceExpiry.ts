/**
 * adminLicenceExpiry.ts — l19 review (pay S1 + the corr gap): an admin sets or
 * corrects the licence expiry date of a lawyer (lawyer_profiles.license_expiry)
 * or of a firm (firm_profiles.license_expiry, keyed on its owner) on the
 * existing verification screen («تحقق المزودين»), saved through
 * PATCH /api/v1/admin/verifications/[id] with
 *   { action: "set_licence_expiry", holder: "lawyer" | "firm", licenseExpiry: "YYYY-MM-DD" | null }
 * and audited (admin_audit_events, action licence_expiry_set).
 *
 * The licence expiry alerts (licence_expiry_alerts, 20261209_10) take the
 * LATER of the registry's date and the lawyer's own date, so a corrected date
 * here ends a stale «انتهت» from an old registry row.
 *
 * Pure: `node --test` loads it.
 */

export const LICENCE_EXPIRY_ACTION = "set_licence_expiry";
export const LICENCE_EXPIRY_AUDIT_ACTION = "licence_expiry_set";

export type LicenceExpiryHolder = "lawyer" | "firm";

/** The table and the key column of each holder. */
export const LICENCE_EXPIRY_TABLE: Readonly<Record<LicenceExpiryHolder, { table: "lawyer_profiles" | "firm_profiles"; key: "user_id" | "owner_user_id" }>> =
  Object.freeze({
    lawyer: Object.freeze({ table: "lawyer_profiles", key: "user_id" }),
    firm: Object.freeze({ table: "firm_profiles", key: "owner_user_id" }),
  });

export const LICENCE_EXPIRY_INVALID_AR = "أدخل تاريخًا صحيحًا لانتهاء الرخصة، أو اتركه فارغًا لحذفه.";
export const LICENCE_EXPIRY_SAVED_AR = "حُفظ تاريخ انتهاء الرخصة.";
export const LICENCE_EXPIRY_CLEARED_AR = "حُذف تاريخ انتهاء الرخصة من الملف.";

/** A real calendar date YYYY-MM-DD between 1900 and 2200, or null. */
export function realIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? value : null;
}

export type LicenceExpiryPatch =
  | { ok: true; holder: LicenceExpiryHolder; date: string | null }
  | { ok: false; error: string };

/** The body of the admin's «حفظ التاريخ»: holder + a real date, or null / "" to clear it. */
export function parseLicenceExpiryPatch(body: unknown): LicenceExpiryPatch {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.action !== LICENCE_EXPIRY_ACTION) return { ok: false, error: LICENCE_EXPIRY_INVALID_AR };
  if (b.holder !== "lawyer" && b.holder !== "firm") return { ok: false, error: LICENCE_EXPIRY_INVALID_AR };
  const raw = b.licenseExpiry;
  if (raw === null || raw === "") return { ok: true, holder: b.holder, date: null };
  const date = realIsoDate(raw);
  if (!date) return { ok: false, error: LICENCE_EXPIRY_INVALID_AR };
  return { ok: true, holder: b.holder, date };
}
