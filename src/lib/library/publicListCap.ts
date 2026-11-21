/**
 * publicListCap.ts — Q100a (batch l12; the owner: «تصفح القوائم … 30 عنصراً
 * يومياً و100 أسبوعياً»), the pure half of the NON-SUBSCRIBER LIST CAP.
 *
 *   A viewer without full library access (a guest, or a signed-in account
 *   without the library) is served at most `daily` DISTINCT list items a
 *   Riyadh day and `weekly` over the last 7 Riyadh days, across the
 *   catalogue lists (/api/library/init) and the search results
 *   (/api/library/search). An item already served to him today is free; an
 *   item served earlier this week counts for the day only. The items of one
 *   answer are allowed in their order until a number is reached; the rest of
 *   that answer is held back and the answer says why (`listLimit`). A
 *   document page, a summary page, the autocomplete box and the cards of the
 *   /laws home are never counted.
 *
 *   SHIPPED OFF (`enabled` false; question ١٥٨): a list cap can hide library
 *   pages from visitors and search engines, so the owner switches it on only
 *   after the evidence (D:\nzwt\reports\l12-rules-evidence.md), and the admin
 *   page refuses to switch it on without the evidence confirmation, as the
 *   l11 view cap does. A crawler of the closed list PROVEN by its address
 *   (crawlerVerify.ts, its switch on) is never counted.
 *
 *   Subjects as the l11 view cap: 'u:<user id>' for an account; for a guest
 *   's:<HMAC(nz_lib_sid)>' and 'a:<HMAC(address)>' — the address has its own,
 *   larger numbers (an office or a mobile network shares one address).
 *
 * Every number is a column of public.library_monitor_settings (20261202_50),
 * edited on the admin page «حماية المكتبة من السحب»; these defaults are what
 * the app uses before that file runs (the cap then stays off).
 *
 * Pure: no imports, so `node --test` loads it.
 */

export interface ListCapSettings {
  enabled: boolean;
  daily: number;
  weekly: number;
  addressDaily: number;
  addressWeekly: number;
}

/** The column defaults of 20261202_50: 30 / 100 are the owner's; the address numbers are chosen here. */
export const LIST_CAP_DEFAULTS: Readonly<ListCapSettings> = Object.freeze({
  enabled: false,
  daily: 30,
  weekly: 100,
  addressDaily: 150,
  addressWeekly: 500,
});

interface IntSpec {
  key: keyof ListCapSettings;
  column: string;
  min: number;
  max: number;
  labelAr: string;
}

/** Bounds = the CHECK constraint of 20261202_50. */
export const LIST_CAP_INTS: readonly IntSpec[] = Object.freeze([
  { key: "daily", column: "non_subscriber_list_daily_limit", min: 1, max: 100_000, labelAr: "عناصر القوائم المختلفة في اليوم لغير المشترك" },
  { key: "weekly", column: "non_subscriber_list_weekly_limit", min: 1, max: 1_000_000, labelAr: "عناصر القوائم المختلفة في سبعة أيام لغير المشترك" },
  { key: "addressDaily", column: "non_subscriber_list_address_daily_limit", min: 1, max: 1_000_000, labelAr: "عناصر القوائم في اليوم من عنوان اتصال واحد (للزوار)" },
  { key: "addressWeekly", column: "non_subscriber_list_address_weekly_limit", min: 1, max: 10_000_000, labelAr: "عناصر القوائم في سبعة أيام من عنوان اتصال واحد (للزوار)" },
]);

export const LIST_CAP_ENABLED_COLUMN = "non_subscriber_list_limit_enabled";
export const LIST_CAP_COLUMNS: readonly string[] = Object.freeze([LIST_CAP_ENABLED_COLUMN, ...LIST_CAP_INTS.map((s) => s.column)]);
export const LIST_CAP_SELECT = LIST_CAP_COLUMNS.join(",");

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/** A database row (or null: the columns not there yet) → the settings; an odd column keeps its default. */
export function listCapSettingsFromRow(row: Record<string, unknown> | null | undefined): ListCapSettings {
  const out: ListCapSettings = { ...LIST_CAP_DEFAULTS };
  if (!row) return out;
  if (typeof row[LIST_CAP_ENABLED_COLUMN] === "boolean") out.enabled = row[LIST_CAP_ENABLED_COLUMN] as boolean;
  for (const s of LIST_CAP_INTS) {
    const v = int(row[s.column], s.min, s.max);
    if (v !== null) out[s.key] = v as never;
  }
  return out;
}

export const LIST_EVIDENCE_REQUIRED_AR =
  "لا يُشغَّل حد تصفح القوائم قبل الاطلاع على أدلة عدم الإضرار بالظهور في محركات البحث وموافقة المالك. أكّد ذلك في خانة التأكيد ثم احفظ.";

export type ListCapPatch =
  | { ok: true; columns: Record<string, unknown>; changed: string[] }
  | { ok: false; error: string; status?: number };

/**
 * The `list` object of the protection PUT → the columns to write. Refuses an
 * unknown field, a wrong type, a number out of bounds, and switching the cap
 * ON without `confirmEvidence: true` (409).
 */
export function parseListCapPatch(value: unknown, current: ListCapSettings, confirmEvidence: boolean): ListCapPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "إعدادات حد القوائم غير صالحة" };
  const columns: Record<string, unknown> = {};
  const changed: string[] = [];
  const ints = new Map(LIST_CAP_INTS.map((s) => [s.key as string, s]));
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "enabled") {
      if (typeof raw !== "boolean") return { ok: false, error: "«تشغيل حد تصفح القوائم»: قيمة غير صالحة" };
      if (raw && !current.enabled && !confirmEvidence) return { ok: false, error: LIST_EVIDENCE_REQUIRED_AR, status: 409 };
      columns[LIST_CAP_ENABLED_COLUMN] = raw;
    } else {
      const s = ints.get(key);
      if (!s) return { ok: false, error: `حقل غير معروف: ${key.slice(0, 40)}` };
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `«${s.labelAr}» يجب أن يكون عدداً صحيحاً` };
      if (n < s.min || n > s.max) return { ok: false, error: `«${s.labelAr}» بين ${s.min} و${s.max}` };
      columns[s.column] = n;
    }
    changed.push(`list.${key}`);
  }
  if (changed.length === 0) return { ok: false, error: "لا يوجد ما يُحفظ" };
  return { ok: true, columns, changed };
}

/** One list item's key: `<kind>:<id>`, at most 300 characters (the table's check); null for no id. */
export function listItemKey(kind: string, id: unknown): string | null {
  const v = typeof id === "string" ? id : typeof id === "number" && Number.isFinite(id) ? String(id) : "";
  if (!v) return null;
  return `${kind}:${v}`.slice(0, 300);
}

/** At most this many keys go to the database in one call (the function refuses more). */
export const LIST_CAP_MAX_ITEMS = 1000;

export interface ListHitRow {
  status: string;
  allowed: string[] | null;
  usedDay: number;
  usedWeek: number;
  dayLimit: number;
  weekLimit: number;
  subject: string | null;
  window: "day" | "week" | null;
  resetsAt: string | null;
}

/** public.library_public_list_hit's one row (PostgREST answers an array) → typed, or null. */
export function parseListHitRow(body: unknown): ListHitRow | null {
  const r = Array.isArray(body) ? body[0] : body;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.status !== "string") return null;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    status: o.status,
    allowed: Array.isArray(o.allowed) ? o.allowed.filter((x): x is string => typeof x === "string") : null,
    usedDay: n(o.used_day),
    usedWeek: n(o.used_week),
    dayLimit: n(o.day_limit),
    weekLimit: n(o.week_limit),
    subject: typeof o.subject === "string" ? o.subject : null,
    window: o.cap_window === "day" || o.cap_window === "week" ? o.cap_window : null,
    resetsAt: typeof o.resets_at === "string" ? o.resets_at : null,
  };
}

export const PUBLIC_LIST_LIMIT_CODE = "library_public_list_limit";

export interface ListLimitNotice {
  code: typeof PUBLIC_LIST_LIMIT_CODE;
  message: string;
  window: "day" | "week";
  limit: number;
  resetsAt: string | null;
  subscribeHref: string;
}

/**
 * The reader's message. It names the visitor's own number (the account /
 * session number), never the address number, so nobody is told a number
 * that is not his.
 */
export function listLimitMessageAr(window: "day" | "week", limit: number): string {
  return window === "week"
    ? `بلغت حد تصفح قوائم المكتبة دون اشتراك هذا الأسبوع (${limit} عنصراً مختلفاً في سبعة أيام). اشترك في المكتبة لتتصفح دون هذا الحد.`
    : `بلغت حد تصفح قوائم المكتبة دون اشتراك اليوم (${limit} عنصراً مختلفاً). يتجدد الحد عند منتصف الليل بتوقيت الرياض، ويمكنك الاشتراك في المكتبة لتتصفح دون هذا الحد.`;
}

/** The notice an answer carries when some of its items were held back; null when none were. */
export function listLimitNotice(row: ListHitRow | null, settings: ListCapSettings): ListLimitNotice | null {
  if (!row || (row.status !== "partial" && row.status !== "over")) return null;
  const window = row.window ?? "day";
  const own = row.subject?.startsWith("u:") || row.subject?.startsWith("s:");
  const limit = window === "week" ? (own && row.weekLimit) || settings.weekly : (own && row.dayLimit) || settings.daily;
  return {
    code: PUBLIC_LIST_LIMIT_CODE,
    message: listLimitMessageAr(window, limit),
    window,
    limit,
    resetsAt: window === "day" ? row.resetsAt : null,
    subscribeHref: "/laws/subscribe",
  };
}

/** The allowed keys of a row: null = every item (off, ok, or no row — fail open). */
export function allowedListKeys(row: ListHitRow | null): Set<string> | null {
  if (!row || (row.status !== "partial" && row.status !== "over")) return null;
  return new Set(row.allowed ?? []);
}

/** Keep the items whose key is allowed (an item with no key is kept). */
export function keepAllowed<T>(items: readonly T[], keyOf: (item: T) => string | null, allowed: Set<string> | null): T[] {
  if (!allowed) return [...items];
  return items.filter((item) => {
    const k = keyOf(item);
    return k === null || allowed.has(k);
  });
}
