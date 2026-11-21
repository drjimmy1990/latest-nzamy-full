/**
 * founderStorage.ts — N21 (batch l12, migration 20261202_80; owner RAW [33],
 * his assistant's default): no gigabyte is promised on any page; internally a
 * founder's stored files have a FAIR-USE line of 25 GB, and he is alerted at
 * 80 % of it. Nothing is ever blocked without an alert — and this module
 * blocks nothing at all: it only decides who is alerted.
 *
 *   platform_settings.founder_storage_fair_use = {"gb": 25, "alert_pct": 80}
 *
 * The daily job POST /api/v1/cron/founder-storage reads
 * public.founder_storage_usage() (bytes per active founder seat, from
 * storage.objects), and alerts each founder at most once a Riyadh month
 * (public.founder_storage_alerts marker).
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const FOUNDER_STORAGE_KEY = "founder_storage_fair_use";

export interface FounderStorageFairUse {
  gb: number;
  alertPct: number;
}

export const DEFAULT_FOUNDER_STORAGE: Readonly<FounderStorageFairUse> = Object.freeze({ gb: 25, alertPct: 80 });

const GB = 1024 ** 3;

/** A stored value → the rule; anything malformed reads as the default. */
export function parseFounderStorage(value: unknown): FounderStorageFairUse {
  const o = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const gb = typeof o.gb === "number" && Number.isInteger(o.gb) && o.gb >= 1 && o.gb <= 10_000 ? o.gb : DEFAULT_FOUNDER_STORAGE.gb;
  const pct = o.alert_pct;
  const alertPct = typeof pct === "number" && Number.isInteger(pct) && pct >= 1 && pct <= 100 ? pct : DEFAULT_FOUNDER_STORAGE.alertPct;
  return { gb, alertPct };
}

/** Admin write check; null when acceptable. */
export function founderStorageIssue(value: unknown): string | null {
  const shape = `قيمة ${FOUNDER_STORAGE_KEY} يجب أن تكون {"gb": عدد صحيح من 1 إلى 10000، "alert_pct": نسبة التنبيه عدد صحيح من 1 إلى 100}`;
  if (!value || typeof value !== "object" || Array.isArray(value)) return shape;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.length !== 2 || keys[0] !== "alert_pct" || keys[1] !== "gb") return shape;
  const ok = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
  return ok(o.gb, 1, 10_000) && ok(o.alert_pct, 1, 100) ? null : shape;
}

export function capBytes(rule: FounderStorageFairUse): number {
  return rule.gb * GB;
}

export interface FounderUsage {
  userId: string;
  usedBytes: number;
}

/** The founders at or over the alert line, with their share of the cap (whole per cent). */
export function foundersToAlert(
  rows: readonly FounderUsage[],
  rule: FounderStorageFairUse,
): Array<FounderUsage & { pct: number }> {
  const cap = capBytes(rule);
  const out: Array<FounderUsage & { pct: number }> = [];
  for (const r of rows) {
    if (!r || typeof r.userId !== "string" || !Number.isFinite(r.usedBytes) || r.usedBytes <= 0) continue;
    const pct = Math.floor((r.usedBytes / cap) * 100);
    if (pct >= rule.alertPct) out.push({ ...r, pct });
  }
  return out;
}

/** «YYYY-MM» of the Riyadh month — one alert per founder per month. */
export function riyadhMonth(now: Date): string {
  const riyadh = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return `${riyadh.getUTCFullYear()}-${String(riyadh.getUTCMonth() + 1).padStart(2, "0")}`;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

function gbText(bytes: number): string {
  const v = Math.round((bytes / GB) * 10) / 10;
  return ar(Number.isInteger(v) ? v : Number(v.toFixed(1))).replace(".", "٫");
}

/** The founder's in-app notice and e-mail text. No number is promised; the line is «الاستعمال العادل». */
export function founderStorageNoticeAr(usedBytes: number, rule: FounderStorageFairUse, pct: number): { title: string; body: string } {
  return {
    title: "اقتربت ملفاتك المحفوظة من حدّ الاستعمال العادل",
    body:
      `تشغل ملفاتك المحفوظة في المنصة نحو ${gbText(usedBytes)} جيجابايت، أي ${ar(pct)}٪ من حدّ الاستعمال العادل لعضوية المؤسس ` +
      `(${ar(rule.gb)} جيجابايت). لم يُوقف شيء، ويمكنك متابعة العمل. ننصحك بحذف ما لا تحتاج إليه من الملفات، ` +
      "وإن احتجت مساحة أكبر فتواصل معنا.",
  };
}
