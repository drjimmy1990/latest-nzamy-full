import type { LawStatus } from "./data";

type LawStatusTone = "effective" | "caution" | "repealed" | "unverified";

/**
 * Source-of-truth vocabulary: schema_manifest.json enums.status (eight values).
 * status_undeclared is the internal token for a law whose file records no
 * status (outside the eight-value enum). Owner answer ٢٥٩ (أ): it is never
 * shown — no «لم يُتحقّق …» badge, no invented «ساري»; the status row is
 * simply absent (lawStatusPresentation returns null).
 * Archival file states are deliberately not legal repeal or suspension.
 * issued_publication_unverified reads «صدر» (owner ٢٥٩ (أ): nothing that says
 * our data is unverified; the exact wording is an open owner question).
 */
const STATUS_VIEW: Record<Exclude<LawStatus, "status_undeclared">, { ar: string; en: string; tone: LawStatusTone }> = {
  active: { ar: "ساري", en: "Active", tone: "effective" },
  partially_active: { ar: "ساري جزئياً", en: "Partially active", tone: "caution" },
  deferred_effective: { ar: "مؤجّل النفاذ", en: "Effectiveness deferred", tone: "caution" },
  issued_publication_unverified: { ar: "صدر", en: "Issued", tone: "caution" },
  suspended: { ar: "موقوف السريان", en: "Suspended", tone: "caution" },
  repealed: { ar: "ملغى", en: "Repealed", tone: "repealed" },
  superseded_duplicate: { ar: "نسخة مكررة مهجورة — النص المعتمد في أداة أخرى", en: "Superseded duplicate — see the authoritative document", tone: "unverified" },
  merged_into_parent: { ar: "مدمج في الأداة الأم — ليس ملفاً مستقلاً", en: "Merged into parent — not an independent document", tone: "unverified" },
};

/** Unknown, empty and legacy tokens do not become an assertion of legal effect. */
export function lawStatusForDetail(raw: unknown): LawStatus {
  if (typeof raw !== "string") return "status_undeclared";
  const value = raw.trim();
  return Object.prototype.hasOwnProperty.call(STATUS_VIEW, value)
    ? value as LawStatus
    : "status_undeclared";
}

/**
 * True only for a law whose own status is exactly «ملغى» (T28-23): the red
 * catalogue card and the reader's banner. Same normalisation as the badge, so
 * the three can never disagree about which laws are repealed.
 */
export function isRepealedLawStatus(raw: unknown): boolean {
  return lawStatusForDetail(raw) === "repealed";
}

/** The badge for a recorded status; null when none is recorded (owner ٢٥٩: show nothing). */
export function lawStatusPresentation(raw: unknown): { labelAr: string; labelEn: string; tone: LawStatusTone } | null {
  const status = lawStatusForDetail(raw);
  if (status === "status_undeclared") return null;
  const { ar, en, tone } = STATUS_VIEW[status];
  return { labelAr: ar, labelEn: en, tone };
}
