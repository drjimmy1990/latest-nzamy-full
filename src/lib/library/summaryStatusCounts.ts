/**
 * The readiness count beside «إخفاء كل موجز غير مراجَع» (batch l16, B-50; the
 * library team's track 5): how many law and decree summaries are reviewed,
 * draft, or carry no status — so nobody switches Q96 on while it would hide
 * every summary of a kind (summaryReview.ts).
 *
 * GET /api/v1/admin/library-summary-status reads the counts; this file only
 * shapes them and words the warning. Pure, no imports: `node --test` loads it.
 */

export interface SummaryStatusCount {
  reviewed: number;
  draft: number;
  /** No status (NULL): hidden too once the switch is on. */
  none: number;
}

export interface SummaryStatusCounts {
  /** null when the table or its summary_status column could not be read. */
  laws: SummaryStatusCount | null;
  decrees: SummaryStatusCount | null;
}

const LABELS: Record<keyof SummaryStatusCounts, string> = { laws: "الأنظمة واللوائح", decrees: "القرارات والتعاميم" };

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** A {reviewed, draft, none} object from the route's JSON, else null. */
export function parseSummaryStatusCount(v: unknown): SummaryStatusCount | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return { reviewed: count(o.reviewed), draft: count(o.draft), none: count(o.none) };
}

/** One line per kind: «الأنظمة واللوائح: مراجَع ١٢ · مسودة ٣ · بلا حالة ٤٠٠». */
export function summaryStatusLines(c: SummaryStatusCounts): string[] {
  const ar = (n: number) => n.toLocaleString("ar-SA");
  return (Object.keys(LABELS) as Array<keyof SummaryStatusCounts>).map((k) => {
    const x = c[k];
    return x
      ? `${LABELS[k]}: مراجَع ${ar(x.reviewed)} · مسودة ${ar(x.draft)} · بلا حالة ${ar(x.none)}`
      : `${LABELS[k]}: تعذّرت قراءة الحالات`;
  });
}

/** The warning to show before switching on: a kind with summaries but none reviewed would lose them all. */
export function summaryStatusWarning(c: SummaryStatusCounts): string | null {
  const empty = (Object.keys(LABELS) as Array<keyof SummaryStatusCounts>).filter((k) => {
    const x = c[k];
    return !x || (x.reviewed === 0 && x.draft + x.none > 0);
  });
  if (empty.length === 0) return null;
  return `لا يوجد موجز مراجَع بعد في: ${empty.map((k) => LABELS[k]).join("، ")}. تشغيل الخيار الآن يخفي موجزاتها كلها.`;
}
