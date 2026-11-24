/**
 * founderInvites.ts — the founder's monthly invites (owner Q144 أ, batch l13;
 * SQL 20261203_20), the pure half.
 *
 * The published promise (founderTerms.ts, /founder): «٣ دعوات تتجدد شهرياً
 * لمحامين مرخصين جدد لم يسبق لهم التسجيل، ولا تتراكم». The owner's answer:
 * «تجربة مكتبة ٣٠ يومًا مع ٥٠ نقطة صالحة مدة التجربة… ولا تعمل الدعوات إلا
 * بعد تفعيل الدفع».
 *
 *   - An ACTIVE founder creates up to `monthly` (3) invite codes a Riyadh
 *     calendar month (an unused one does not carry over).
 *   - A NEW verified advocate (account created after the invite, no founder
 *     invite and no library grant before) redeems a code: a lib-trial library
 *     grant of `trial_days` (30) + `points` (50) gift points expiring with it,
 *     in the library_agent wallet (owner ٢٠١, batch l14: the library
 *     assistant only — no other choice); the trial is outside the 50-point
 *     library gate (src/lib/library/pointsGate.ts).
 *   - Both creating and redeeming work only while the payment gateway is on
 *     for that account (the routes check it; the database cannot see the
 *     server's keys). Otherwise the screen says so (INVITES_GATEWAY_OFF_AR).
 *
 * The setting platform_settings.founder_invites is admin-edited (PATCH
 * /api/v1/admin/settings, validated by founderInvitesIssue); the database
 * reads it with the same defaults (founder_invite_settings()).
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { toArabicDigits } from "../services/arabicCount.ts";

export const FOUNDER_INVITES_KEY = "founder_invites";

/**
 * Owner ٢٠١ (23 Nov 2026, batch l14): the invitee's points are the library
 * assistant's ONLY. The stored field stays (the database reads it) but holds
 * one value: a stored "general" reads as library_agent, and the admin check
 * refuses it. 20261204_20 resets a stored "general" and makes
 * founder_invite_settings() answer library_agent whatever is stored.
 */
export type InvitePointsScope = "library_agent";

export interface FounderInvitesSettings {
  monthly: number;
  trialDays: number;
  points: number;
  pointsScope: InvitePointsScope;
  validDays: number;
}

export const FOUNDER_INVITES_DEFAULTS: Readonly<FounderInvitesSettings> = Object.freeze({
  monthly: 3,
  trialDays: 30,
  points: 50,
  pointsScope: "library_agent",
  validDays: 30,
});

/** The bounds the database applies too (founder_invite_settings()). */
const BOUNDS = {
  monthly: [1, 20],
  trial_days: [1, 365],
  points: [0, 10_000],
  valid_days: [1, 365],
} as const;

const isInt = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/** The stored value → the settings; a missing or malformed field reads as its default (as in SQL). */
export function parseFounderInvites(value: unknown): FounderInvitesSettings {
  const o = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    monthly: isInt(o.monthly, ...BOUNDS.monthly) ? o.monthly : FOUNDER_INVITES_DEFAULTS.monthly,
    trialDays: isInt(o.trial_days, ...BOUNDS.trial_days) ? o.trial_days : FOUNDER_INVITES_DEFAULTS.trialDays,
    points: isInt(o.points, ...BOUNDS.points) ? o.points : FOUNDER_INVITES_DEFAULTS.points,
    pointsScope: "library_agent",
    validDays: isInt(o.valid_days, ...BOUNDS.valid_days) ? o.valid_days : FOUNDER_INVITES_DEFAULTS.validDays,
  };
}

/** The settings → the stored JSON. */
export function founderInvitesValue(s: FounderInvitesSettings): Record<string, unknown> {
  return { monthly: s.monthly, trial_days: s.trialDays, points: s.points, points_scope: s.pointsScope, valid_days: s.validDays };
}

/** Admin write check for founder_invites; null when acceptable. */
export function founderInvitesIssue(value: unknown): string | null {
  const shape =
    `قيمة ${FOUNDER_INVITES_KEY} يجب أن تكون {"monthly": ١–٢٠، "trial_days": ١–٣٦٥، "points": ٠–١٠٠٠٠، ` +
    `"points_scope": "library_agent"، "valid_days": ١–٣٦٥} بأعداد صحيحة (نقاط التجربة لمساعد المكتبة وحده)`;
  if (!value || typeof value !== "object" || Array.isArray(value)) return shape;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  if (keys !== "monthly,points,points_scope,trial_days,valid_days") return shape;
  if (!isInt(o.monthly, ...BOUNDS.monthly) || !isInt(o.trial_days, ...BOUNDS.trial_days)
      || !isInt(o.points, ...BOUNDS.points) || !isInt(o.valid_days, ...BOUNDS.valid_days)) return shape;
  if (o.points_scope !== "library_agent") return shape;
  return null;
}

// ── codes and links ─────────────────────────────────────────────────────────

/** A typed or pasted code → its stored form (16 upper-case hex), or null. Spaces / dashes / case are forgiven. */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const code = input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return /^[0-9A-F]{16}$/.test(code) ? code : null;
}

/** «ABCD-1234-…» for reading aloud or typing. */
export function formatInviteCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** The invite page's path (the founder shares the full URL). */
export function inviteLinkPath(code: string): string {
  return `/founder/invite/${encodeURIComponent(code)}`;
}

/** "YYYY-MM" of the Riyadh calendar month (UTC+3, no daylight saving) — as the database's month_key. */
export function riyadhMonthKey(now: Date): string {
  const t = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── words ───────────────────────────────────────────────────────────────────

export const INVITES_GATEWAY_OFF_AR =
  "دعوات العضو المؤسس قيد التفعيل: تعمل بعد تفعيل الدفع الإلكتروني في المنصة، وتظهر هنا عندئذٍ.";

export const INVITES_NOT_READY_AR = "دعوات العضو المؤسس قيد التفعيل.";

export const INVITES_UNAVAILABLE_AR = "تعذّر تحميل الدعوات الآن — حاول بعد قليل.";

/** «تجربة المكتبة القانونية ٣٠ يوماً مع ٥٠ نقطة …» — what the invitee gets, from the live setting. */
export function inviteGiftAr(s: FounderInvitesSettings): string {
  const days = `${toArabicDigits(s.trialDays)} ${s.trialDays >= 3 && s.trialDays <= 10 ? "أيام" : "يوماً"}`;
  const trial = `تجربة المكتبة القانونية ${days}`;
  // Owner ٢٠١ (أ), batch l14: the trial is outside the 50-point library gate.
  const open = "، والمكتبة مفتوحة لك طوال التجربة مهما كان رصيدك";
  if (s.points <= 0) return `${trial}${open}`;
  const noun = s.points >= 3 && s.points <= 10 ? "نقاط" : "نقطة";
  return `${trial} مع ${toArabicDigits(s.points)} ${noun} لمساعد المكتبة وحده صالحة مدة التجربة${open}`;
}

export type CreateResult = "ok" | "not_founder" | "limit";

export const CREATE_REFUSAL_AR: Record<Exclude<CreateResult, "ok">, string> = {
  not_founder: "الدعوات للأعضاء المؤسسين ذوي العضوية السارية.",
  limit: "استخدمت دعوات هذا الشهر كلها، وتتجدد أول الشهر القادم (لا تتراكم).",
};

export type RedeemResult =
  | "ok"
  | "invalid"
  | "expired"
  | "used"
  | "already_redeemed"
  | "self"
  | "founder_inactive"
  | "pending_verification"
  | "not_lawyer"
  | "not_new";

export const REDEEM_RESULTS: readonly RedeemResult[] = Object.freeze([
  "ok", "invalid", "expired", "used", "already_redeemed", "self", "founder_inactive",
  "pending_verification", "not_lawyer", "not_new",
]);

export const REDEEM_REFUSAL_AR: Record<Exclude<RedeemResult, "ok">, string> = {
  invalid: "رمز الدعوة غير صحيح. تأكد منه كما وصلك.",
  expired: "انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة من العضو المؤسس.",
  used: "استُخدمت هذه الدعوة من حساب آخر.",
  already_redeemed: "فعّلت هذه الدعوة من قبل، وتجربتك سارية في «مكتبتي».",
  self: "لا يمكنك استخدام دعوتك أنت؛ أرسلها لزميل جديد.",
  founder_inactive: "لم تعد هذه الدعوة صالحة لأن عضوية صاحبها لم تعد سارية.",
  pending_verification: "حسابك قيد التوثيق. بعد توثيق ترخيصك عد إلى هذا الرابط لتفعيل الدعوة؛ الرمز محفوظ لك حتى انتهاء صلاحيته.",
  not_lawyer: "الدعوة لمحامٍ مرخّص موثّق الحساب في المنصة.",
  not_new: "الدعوة للمحامين الجدد فقط: حسابك أُنشئ قبل الدعوة، أو سبق أن فعّلت دعوة أو اشتراكاً في المكتبة.",
};

/** The HTTP status of a redeem answer: 200 ok, 409 a state the user cannot change now, 403 not eligible, 400 a bad code. */
export function redeemStatus(result: RedeemResult): number {
  switch (result) {
    case "ok":
      return 200;
    case "invalid":
      return 400;
    case "not_lawyer":
    case "not_new":
    case "self":
      return 403;
    default:
      return 409;
  }
}

/** The RPC's jsonb → a known result, or null for anything unexpected. */
export function redeemResultOf(data: unknown): RedeemResult | null {
  const r = data && typeof data === "object" ? (data as { result?: unknown }).result : null;
  return typeof r === "string" && (REDEEM_RESULTS as readonly string[]).includes(r) ? (r as RedeemResult) : null;
}

/** The success line after a redeem. */
export function redeemSuccessAr(trialEndsAt: string | null, s: FounderInvitesSettings): string {
  const until = trialEndsAt ? ` حتى ${toArabicDigits(trialEndsAt.slice(0, 10))}` : "";
  return `فُعّلت دعوتك: ${inviteGiftAr(s)}${until}. افتح المكتبة من «مكتبتي».`;
}

// ── the founder's card ──────────────────────────────────────────────────────

export interface InviteRow {
  code: string;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  month_key: string;
}

export type InviteStatus = "open" | "redeemed" | "expired";

export interface InviteItem {
  code: string;
  display: string;
  linkPath: string;
  status: InviteStatus;
  statusAr: string;
  expiresOn: string;
}

const STATUS_AR: Record<InviteStatus, string> = {
  open: "لم تُستخدم بعد",
  redeemed: "فعّلها زميل",
  expired: "انتهت صلاحيتها",
};

export function inviteStatus(row: InviteRow, now: Date): InviteStatus {
  if (row.redeemed_at) return "redeemed";
  const t = Date.parse(row.expires_at);
  return Number.isFinite(t) && t > now.getTime() ? "open" : "expired";
}

export interface FounderInvitesView {
  monthly: number;
  used: number;
  remaining: number;
  remainingAr: string;
  gift: string;
  items: InviteItem[];
}

/** The founder's invites card: this month's allowance and the invites (newest first). */
export function founderInvitesView(rows: readonly InviteRow[], s: FounderInvitesSettings, now: Date): FounderInvitesView {
  const month = riyadhMonthKey(now);
  const used = rows.filter((r) => r.month_key === month).length;
  const remaining = Math.max(s.monthly - used, 0);
  const items = [...rows]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((r) => {
      const status = inviteStatus(r, now);
      return {
        code: r.code,
        display: formatInviteCode(r.code),
        linkPath: inviteLinkPath(r.code),
        status,
        statusAr: STATUS_AR[status],
        expiresOn: toArabicDigits(String(r.expires_at).slice(0, 10)),
      };
    });
  return {
    monthly: s.monthly,
    used,
    remaining,
    remainingAr:
      remaining === 0
        ? "استخدمت دعوات هذا الشهر كلها؛ تتجدد أول الشهر القادم."
        : `دعوات هذا الشهر: بقي ${toArabicDigits(remaining)} من ${toArabicDigits(s.monthly)}، ولا تتراكم.`,
    gift: inviteGiftAr(s),
    items,
  };
}
