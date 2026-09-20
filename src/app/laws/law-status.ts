import type { LawStatus } from "./data";

type LawStatusTone = "effective" | "caution" | "repealed" | "unverified";

/**
 * Source-of-truth vocabulary: schema_manifest.json enums.status (eight values).
 * status_undeclared is outside the eight-value document enum, but is present
 * explicitly in six live frontmatters (five laws, one decree, 2026-09-18).
 * Display it honestly; source cleanup requires a separate evidence-backed pass.
 * Archival file states are deliberately not legal repeal or suspension.
 */
const STATUS_VIEW: Record<LawStatus, { ar: string; en: string; tone: LawStatusTone }> = {
  active: { ar: "ساري", en: "Active", tone: "effective" },
  partially_active: { ar: "ساري جزئياً", en: "Partially active", tone: "caution" },
  deferred_effective: { ar: "مؤجّل النفاذ", en: "Effectiveness deferred", tone: "caution" },
  issued_publication_unverified: { ar: "صدر — لم يُتحقّق من النشر", en: "Issued — publication not verified", tone: "caution" },
  suspended: { ar: "موقوف السريان", en: "Suspended", tone: "caution" },
  repealed: { ar: "ملغى", en: "Repealed", tone: "repealed" },
  superseded_duplicate: { ar: "نسخة مكررة مهجورة — النص المعتمد في أداة أخرى", en: "Superseded duplicate — see the authoritative document", tone: "unverified" },
  merged_into_parent: { ar: "مدمج في الأداة الأم — ليس ملفاً مستقلاً", en: "Merged into parent — not an independent document", tone: "unverified" },
  status_undeclared: { ar: "لم يُتحقّق من الحالة", en: "Status not verified", tone: "unverified" },
};

/** Unknown, empty and legacy tokens do not become an assertion of legal effect. */
export function lawStatusForDetail(raw: unknown): LawStatus {
  if (typeof raw !== "string") return "status_undeclared";
  const value = raw.trim();
  return Object.prototype.hasOwnProperty.call(STATUS_VIEW, value)
    ? value as LawStatus
    : "status_undeclared";
}

export function lawStatusPresentation(raw: unknown): { labelAr: string; labelEn: string; tone: LawStatusTone } {
  const { ar, en, tone } = STATUS_VIEW[lawStatusForDetail(raw)];
  return { labelAr: ar, labelEn: en, tone };
}
