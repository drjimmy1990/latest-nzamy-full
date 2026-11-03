/**
 * monitorSettings.ts — the one row of public.library_monitor_settings
 * (20261031_10) as the admin page edits it: every field, its column, its
 * bounds (the SAME as the table's CHECK constraints — the database refuses
 * anything else anyway), its Arabic label and its group on the form.
 *
 * Pure (no I/O); used by /api/v1/admin/library-monitor/settings and by the
 * «نشاط المكتبة» panel. `node --test` loads it directly.
 */

export type FlagAction = "notify" | "slow" | "lock";
export const FLAG_ACTIONS: readonly FlagAction[] = ["notify", "slow", "lock"];

export const FLAG_ACTION_AR: Readonly<Record<FlagAction, string>> = {
  notify: "تنبيه الإدارة فقط — القراءة مستمرة",
  slow: "إبطاء القارئ تلقائياً (حدود أقل لمدة محددة)",
  lock: "إيقاف قراءة المكتبة تلقائياً حتى تراجعه",
};

export type SettingsGroup = "caps" | "rules" | "action" | "alerts";

export interface IntField {
  key: string;
  column: string;
  type: "int";
  min: number;
  max: number;
  labelAr: string;
  group: SettingsGroup;
  /** The on/off switch this number belongs to, if any. */
  toggle?: string;
}
export interface BoolField {
  key: string;
  column: string;
  type: "bool";
  labelAr: string;
  group: SettingsGroup;
}
export interface EnumField {
  key: string;
  column: string;
  type: "enum";
  values: readonly string[];
  labelAr: string;
  group: SettingsGroup;
}
export type SettingsField = IntField | BoolField | EnumField;

const int = (key: string, column: string, min: number, max: number, labelAr: string, group: SettingsGroup, toggle?: string): IntField =>
  ({ key, column, type: "int", min, max, labelAr, group, ...(toggle ? { toggle } : {}) });
const bool = (key: string, column: string, labelAr: string, group: SettingsGroup): BoolField =>
  ({ key, column, type: "bool", labelAr, group });

export const MONITOR_SETTINGS_FIELDS: readonly SettingsField[] = [
  int("dailyDocs", "daily_docs", 1, 100000, "حد الوثائق المختلفة في اليوم — الفرد", "caps"),
  int("memberDailyDocs", "member_daily_docs", 1, 100000, "حد الوثائق المختلفة في اليوم — عضو المكتب أو الشركة", "caps"),
  int("hourlyDocs", "hourly_docs", 1, 100000, "حد الوثائق المختلفة في الساعة", "caps"),
  int("lockAfterRefused", "lock_after_refused", 0, 100000, "إيقاف تلقائي بعد محاولة فتح هذا العدد من الوثائق بعد بلوغ الحد اليومي (٠ = لا إيقاف تلقائي)", "caps"),

  bool("ruleHourRequestsOn", "rule_hour_requests_on", "طلبات كثيرة في ساعة واحدة (فتح الوثائق والبحث ومساعد المكتبة)", "rules"),
  int("ruleHourRequests", "rule_hour_requests", 10, 1000000, "عدد الطلبات في الساعة", "rules", "ruleHourRequestsOn"),
  bool("ruleHourSearchesOn", "rule_hour_searches_on", "عمليات بحث كثيرة في ساعة واحدة", "rules"),
  int("ruleHourSearches", "rule_hour_searches", 5, 1000000, "عدد عمليات البحث في الساعة", "rules", "ruleHourSearchesOn"),
  bool("ruleWeekDocsOn", "rule_week_docs_on", "وثائق كثيرة خلال ٧ أيام", "rules"),
  int("ruleWeekDocs", "rule_week_docs", 10, 1000000, "عدد الوثائق المختلفة خلال ٧ أيام", "rules", "ruleWeekDocsOn"),
  bool("ruleSustainedOn", "rule_sustained_on", "وتيرة آلية متواصلة لساعات", "rules"),
  int("ruleSustainedHours", "rule_sustained_hours", 2, 24, "عدد الساعات النشطة خلال ٢٤ ساعة", "rules", "ruleSustainedOn"),
  int("ruleSustainedMinDocs", "rule_sustained_min_docs", 1, 100000, "تُعدّ الساعة نشطة إذا فُتح فيها هذا العدد من الوثائق أو أكثر", "rules", "ruleSustainedOn"),
  bool("ruleNightOn", "rule_night_on", "قراءة كثيفة ليلاً (من منتصف الليل إلى الخامسة فجراً بتوقيت الرياض)", "rules"),
  int("ruleNightDocs", "rule_night_docs", 1, 100000, "عدد الوثائق ليلاً خلال آخر ٢٤ ساعة", "rules", "ruleNightOn"),
  bool("ruleNearCapOn", "rule_near_cap_on", "الاقتراب من الحد اليومي", "rules"),
  int("ruleNearCapPct", "rule_near_cap_pct", 10, 100, "النسبة المئوية من الحد اليومي", "rules", "ruleNearCapOn"),
  int("reflagQuietHours", "reflag_quiet_hours", 0, 720, "بعد إغلاق المراجعة: لا يُعاد وضع الحساب قيد المراجعة قبل (ساعات)", "rules"),

  { key: "flagAction", column: "flag_action", type: "enum", values: FLAG_ACTIONS, labelAr: "ماذا يحدث عند وضع الحساب قيد المراجعة", group: "action" },
  int("slowDailyDocs", "slow_daily_docs", 1, 100000, "الإبطاء: حد الوثائق في اليوم", "action"),
  int("slowHourlyDocs", "slow_hourly_docs", 1, 100000, "الإبطاء: حد الوثائق في الساعة", "action"),
  int("slowHours", "slow_hours", 1, 720, "الإبطاء: المدة (ساعات)", "action"),

  bool("notifyAdmins", "notify_admins", "تنبيه المسؤولين في المنصة عند وضع حساب قيد المراجعة", "alerts"),
  bool("notifyOnAutoLock", "notify_on_auto_lock", "تنبيه المسؤولين عند الإيقاف التلقائي لتجاوز الحد", "alerts"),
  int("retentionDays", "retention_days", 7, 365, "مدة حفظ سجل النشاط (أيام)", "alerts"),
];

export type MonitorSettings = Record<string, number | boolean | string>;

/** The seeded values (20261031_10) — what the page shows before the migration runs. */
export const MONITOR_SETTINGS_DEFAULTS: Readonly<MonitorSettings> = Object.freeze({
  dailyDocs: 220, memberDailyDocs: 400, hourlyDocs: 120, lockAfterRefused: 60,
  ruleHourRequestsOn: true, ruleHourRequests: 600,
  ruleHourSearchesOn: true, ruleHourSearches: 200,
  ruleWeekDocsOn: true, ruleWeekDocs: 600,
  ruleSustainedOn: true, ruleSustainedHours: 6, ruleSustainedMinDocs: 30,
  ruleNightOn: false, ruleNightDocs: 60,
  ruleNearCapOn: true, ruleNearCapPct: 80,
  reflagQuietHours: 24,
  flagAction: "notify", slowDailyDocs: 60, slowHourlyDocs: 20, slowHours: 24,
  notifyAdmins: true, notifyOnAutoLock: true, retentionDays: 30,
});

export const MONITOR_SETTINGS_SELECT = ["updated_at", "updated_by", ...MONITOR_SETTINGS_FIELDS.map((f) => f.column)].join(", ");

/** A database row → the page's settings (a missing or odd column keeps its default). */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): MonitorSettings {
  const out: MonitorSettings = { ...MONITOR_SETTINGS_DEFAULTS };
  if (!row) return out;
  for (const f of MONITOR_SETTINGS_FIELDS) {
    const v = row[f.column];
    if (f.type === "int" && typeof v === "number" && Number.isInteger(v)) out[f.key] = v;
    else if (f.type === "bool" && typeof v === "boolean") out[f.key] = v;
    else if (f.type === "enum" && typeof v === "string" && f.values.includes(v)) out[f.key] = v;
  }
  return out;
}

export type SettingsPatch =
  | { ok: true; columns: Record<string, number | boolean | string>; changed: string[] }
  | { ok: false; error: string };

/**
 * A PUT body (any subset of the fields) → the columns to update. Refuses an
 * unknown field, a wrong type, or a number outside its bounds, naming the
 * field in Arabic. An empty patch is refused too.
 */
export function parseSettingsPatch(body: unknown): SettingsPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "بيانات غير صالحة" };
  const input = body as Record<string, unknown>;
  const byKey = new Map(MONITOR_SETTINGS_FIELDS.map((f) => [f.key, f]));
  const columns: Record<string, number | boolean | string> = {};
  const changed: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const f = byKey.get(key);
    if (!f) return { ok: false, error: `حقل غير معروف: ${key}` };
    if (f.type === "int") {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `«${f.labelAr}» يجب أن يكون عدداً صحيحاً` };
      if (n < f.min || n > f.max) return { ok: false, error: `«${f.labelAr}» بين ${f.min} و${f.max}` };
      columns[f.column] = n;
    } else if (f.type === "bool") {
      if (typeof value !== "boolean") return { ok: false, error: `«${f.labelAr}»: قيمة غير صالحة` };
      columns[f.column] = value;
    } else {
      if (typeof value !== "string" || !f.values.includes(value)) return { ok: false, error: `«${f.labelAr}»: قيمة غير صالحة` };
      columns[f.column] = value;
    }
    changed.push(key);
  }
  if (changed.length === 0) return { ok: false, error: "لا يوجد ما يُحفظ" };
  return { ok: true, columns, changed };
}

/** Arabic names of the review rules (library_review_flags.rule). */
export const REVIEW_RULE_AR: Readonly<Record<string, string>> = {
  hour_requests: "طلبات كثيرة في ساعة",
  hour_searches: "بحث كثير في ساعة",
  week_docs: "وثائق كثيرة خلال أسبوع",
  sustained: "وتيرة آلية متواصلة",
  night: "قراءة كثيفة ليلاً",
  near_cap: "اقتراب من الحد اليومي",
};
