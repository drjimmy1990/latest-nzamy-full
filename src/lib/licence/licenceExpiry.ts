/**
 * licenceExpiry.ts — owner ٢٤١ (27 Nov 2026, batch l19): a VERIFIED licensed
 * account whose licence date has passed is no longer refused at checkout
 * (licenceGate.ts); it is told instead, in the app and on its dashboard:
 *
 *   «تنبيه: رخصتك المهنية تنتهي خلال X يومًا / انتهت — يرجى رفع تجديد الرخصة
 *    حتى تستطيع الاستمرار في استخدام المنصة»
 *
 * The owner's sentence is kept; only the counted noun follows Arabic number
 * agreement (يوم واحد / يومين / ٣–١٠ أيام / ١١ يومًا…, arabicCount.ts), and a
 * firm reads «ترخيص مكتبك» instead of «رخصتك المهنية».
 *
 * The licences come from public.licence_expiry_alerts (20261209_10): the
 * verified lawyers and legal consultants (the registry's expiry, else the
 * lawyer's own column), the owners of verified firms, and verified providers.
 *
 * Stages — each sent ONCE per licence date (email_reminder_log, kind
 * licence_expiry_<stage>_app, due_on = the expiry date; a renewed date starts
 * again). Bands, so a missed run still tells, and only the most urgent stage
 * is sent (someone first seen 3 days before the date is not also sent the
 * 30-day notice):
 *   30d   8 – 30 days left
 *   7d    1 – 7 days left
 *   0d    the last day, or already past
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { countPhraseAr } from "../services/arabicCount.ts";

export type LicenceHolder = "lawyer" | "firm" | "provider";
export type LicenceExpiryStage = "30d" | "7d" | "0d";

/** One row of public.licence_expiry_alerts. */
export interface LicenceExpiryRow {
  user_id: string;
  holder: LicenceHolder | string;
  subject_id: string;
  /** YYYY-MM-DD */
  expiry: string;
}

/** The window the alerts look at (and the banner shows). */
export const LICENCE_EXPIRY_HORIZON_DAYS = 30;

/** The notification-settings category (NotificationsTab.tsx): an explicit false mutes the in-app notice. */
export const LICENCE_EXPIRY_CATEGORY = "license_expiry";

/** Where a lawyer uploads his licence image (founderCard FOUNDER_VERIFY_HREF, the profile page's #licence-image). */
export const LICENCE_UPLOAD_HREF = "/dashboard/lawyer/profile/edit#licence-image";
export const LICENCE_CONTACT_HREF = "/contact";

const DAY_MS = 86_400_000;

/** Riyadh's calendar day (UTC+3, no daylight saving), YYYY-MM-DD. */
export function riyadhToday(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** Days from today (Riyadh) to the expiry date: 0 = the last day, negative = past. Null for anything but a YYYY-MM-DD. */
export function licenceDaysLeft(expiry: unknown, now: Date): number | null {
  if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry.slice(0, 10))) return null;
  const end = Date.parse(`${expiry.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${riyadhToday(now)}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(today)) return null;
  return Math.round((end - today) / DAY_MS);
}

/** The band a number of days left falls in; null = more than 30 days away. */
export function licenceExpiryStage(daysLeft: number | null): LicenceExpiryStage | null {
  if (daysLeft === null || !Number.isFinite(daysLeft)) return null;
  if (daysLeft <= 0) return "0d";
  if (daysLeft <= 7) return "7d";
  if (daysLeft <= LICENCE_EXPIRY_HORIZON_DAYS) return "30d";
  return null;
}

/** The once-only marker kind (20261209_10). */
export function licenceExpiryKind(stage: LicenceExpiryStage): "licence_expiry_30d_app" | "licence_expiry_7d_app" | "licence_expiry_0d_app" {
  return `licence_expiry_${stage}_app`;
}

const DAYS_FORMS = { zero: null, one: "يوم واحد", two: "يومين", few: "أيام", many: "يومًا", hundreds: "يوم" };

export interface LicenceExpiryNotice {
  title: string;
  body: string;
  href: string;
  hrefLabel: string;
}

/** The notice and banner text for one licence `daysLeft` days from its date (≤ 0: the last day or past). */
export function licenceExpiryNotice(holder: string, daysLeft: number): LicenceExpiryNotice {
  const firm = holder === "firm";
  const subject = firm ? "ترخيص مكتبك" : "رخصتك المهنية";
  const when =
    daysLeft < 0 ? "انتهى" : daysLeft === 0 ? "ينتهي اليوم" : `ينتهي خلال ${countPhraseAr(daysLeft, DAYS_FORMS)}`;
  // «رخصة» is feminine, «ترخيص» masculine: تنتهي / انتهت vs ينتهي / انتهى
  const verb = firm ? when : when.replace(/^انتهى/, "انتهت").replace(/^ينتهي/, "تنتهي");
  const renew = firm ? "يرجى رفع تجديد الترخيص حتى تستطيع الاستمرار في استخدام المنصة." : "يرجى رفع تجديد الرخصة حتى تستطيع الاستمرار في استخدام المنصة.";
  const how =
    holder === "lawyer"
      ? " ارفع صورة الرخصة المجدّدة من ملفك المهني ليراجعها فريق المنصة."
      : firm
        ? " أرسل الترخيص المجدّد إلى فريق المنصة من صفحة «تواصل معنا» ليراجعه."
        : " أرسل الرخصة المجدّدة إلى فريق المنصة من صفحة «تواصل معنا» ليراجعها.";
  return {
    title: `تنبيه: ${subject} ${verb}`,
    body: `${renew}${how}`,
    href: holder === "lawyer" ? LICENCE_UPLOAD_HREF : LICENCE_CONTACT_HREF,
    hrefLabel: holder === "lawyer" ? "رفع الرخصة المجدّدة" : "تواصل معنا",
  };
}

export interface PlannedLicenceNotice {
  row: LicenceExpiryRow;
  stage: LicenceExpiryStage;
  daysLeft: number;
}

/** The rows the cron tells today (one stage per row; rows more than 30 days away or unreadable are left out). */
export function planLicenceExpiryNotices(rows: readonly LicenceExpiryRow[], now: Date): PlannedLicenceNotice[] {
  const out: PlannedLicenceNotice[] = [];
  for (const row of rows) {
    if (!row || typeof row.user_id !== "string" || typeof row.subject_id !== "string") continue;
    const daysLeft = licenceDaysLeft(row.expiry, now);
    const stage = licenceExpiryStage(daysLeft);
    if (stage && daysLeft !== null) out.push({ row, stage, daysLeft });
  }
  return out;
}

/** The banner's licence: the one with the nearest (or longest past) date within the window. Null when none. */
export function bannerLicence(rows: readonly LicenceExpiryRow[], now: Date): PlannedLicenceNotice | null {
  const planned = planLicenceExpiryNotices(rows, now);
  if (planned.length === 0) return null;
  return planned.reduce((a, b) => (b.daysLeft < a.daysLeft ? b : a));
}

/** user_settings in the fields that mute an in-app licence notice. */
export interface LicenceNoticeSettings {
  notifications_enabled?: boolean | null;
  preferences?: unknown;
}

/** True when the account turned notifications off, or the «تجديدات الترخيص» category off. */
export function licenceNoticeMuted(row: LicenceNoticeSettings | null | undefined): boolean {
  if (!row) return false;
  if (row.notifications_enabled === false) return true;
  const prefs = row.preferences;
  if (!prefs || typeof prefs !== "object") return false;
  const block = (prefs as Record<string, unknown>).notifications;
  if (!block || typeof block !== "object") return false;
  const cats = (block as Record<string, unknown>).categories;
  return !!cats && typeof cats === "object" && (cats as Record<string, unknown>)[LICENCE_EXPIRY_CATEGORY] === false;
}

/** GET /api/v1/me/licence-expiry → the banner's content, or null (nothing to show, or an unexpected body). */
export interface LicenceExpiryBannerReply {
  alert: (LicenceExpiryNotice & { daysLeft: number; stage: LicenceExpiryStage }) | null;
}

export function licenceBannerFromReply(reply: unknown): LicenceExpiryBannerReply["alert"] {
  if (!reply || typeof reply !== "object") return null;
  const a = (reply as { alert?: unknown }).alert;
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.body !== "string" || typeof o.href !== "string" || typeof o.hrefLabel !== "string") return null;
  if (typeof o.daysLeft !== "number" || (o.stage !== "30d" && o.stage !== "7d" && o.stage !== "0d")) return null;
  // only an in-site path is ever linked
  if (!o.href.startsWith("/") || o.href.startsWith("//")) return null;
  return { title: o.title, body: o.body, href: o.href, hrefLabel: o.hrefLabel, daysLeft: o.daysLeft, stage: o.stage };
}
