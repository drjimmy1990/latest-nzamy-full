/**
 * Promotional campaigns (owner answer ١٧٩, 2026-10-16).
 *
 * Offers live in a dismissible banner during a real, dated campaign — never as
 * a permanent badge or promise inside a price card. A campaign shows only
 * between its start and end dates.
 *
 * Two sources, in this order:
 *   1. The founder-lawyer campaign (owner ٢١٨, dates ٢٢٥): its dates are the
 *      platform setting `founder_campaign`, which the admin edits in
 *      /dashboard/admin/settings. GET /api/v1/campaigns/active turns that
 *      setting into a `Campaign` with `founderCampaignFromSetting`. The banner
 *      shows exactly when the signup trigger grants (founder_campaign_active()
 *      in 20261021_50): same date rules, Riyadh day, both ends included.
 *   2. `CAMPAIGNS` below — a code-dated list, used only when the route fails
 *      or returns nothing. It stays EMPTY until the owner dates another offer:
 *      a banner must not promise what nobody grants.
 *
 * Pure, relative imports only — campaigns.test.ts runs it under `node --test`.
 */

export interface Campaign {
  /** Stable id; also the key the dismissal is remembered under. */
  id: string;
  /** First day shown, `YYYY-MM-DD`, Riyadh time. */
  startsOn: string;
  /** Last day shown, `YYYY-MM-DD`, Riyadh time (inclusive). */
  endsOn: string;
  badgeAr: string;
  messageAr: string;
  ctaAr: string;
  ctaHref: string;
}

export const CAMPAIGNS: readonly Campaign[] = [];

/** Riyadh calendar day (`YYYY-MM-DD`) of an instant. */
export function riyadhDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** The campaign live on `now`'s Riyadh day, or null. The earliest-ending wins. */
export function activeCampaign(now: Date, campaigns: readonly Campaign[] = CAMPAIGNS): Campaign | null {
  const day = riyadhDay(now);
  const live = campaigns
    .filter((c) => c.startsOn <= c.endsOn && c.startsOn <= day && day <= c.endsOn)
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
  return live[0] ?? null;
}

// ── The founder-lawyer campaign (owner ٢١٨, dates ٢٢٥; 20261021_50) ──────────

/** The owner's copy, verbatim. */
export const FOUNDER_CAMPAIGN_COPY = {
  badgeAr: "فترة المحامي المؤسس",
  messageAr: "سجّل الآن واحصل على ٣ أشهر من المكتبة القانونية مجاناً وشارة المؤسس",
  ctaAr: "سجّل محامياً",
  ctaHref: "/register/provider?type=lawyer",
} as const;

const DAY_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** A real calendar day in `YYYY-MM-DD` — `2027-02-30` is not one. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCFullYear(y); // Date.UTC maps years 0–99 to 1900–1999
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The founder campaign live on `today` (a Riyadh `YYYY-MM-DD`), or null.
 *
 * As tolerant as founder_campaign_active(): only `starts_on` / `ends_on`
 * matter (`library_days` and any other key are ignored), so the banner shows
 * exactly when the trigger grants. Null when either date is null, missing or
 * not a real day, when `ends_on` is before `starts_on`, when `today` is
 * outside them, or when the value is not an object.
 */
export function founderCampaignFromSetting(value: unknown, today: string): Campaign | null {
  if (!isPlainObject(value) || !isCalendarDay(today)) return null;
  const { starts_on: startsOn, ends_on: endsOn } = value;
  if (!isCalendarDay(startsOn) || !isCalendarDay(endsOn)) return null;
  if (startsOn > endsOn || today < startsOn || today > endsOn) return null;
  return { id: `founder-${startsOn}`, startsOn, endsOn, ...FOUNDER_CAMPAIGN_COPY };
}

const FOUNDER_SETTING_KEYS = new Set(["starts_on", "ends_on", "library_days"]);

/**
 * The admin write check for `founder_campaign` (api/v1/admin/settings). Strict
 * where the reader is tolerant: the reader treats a malformed date as "off",
 * so a typo saved here would silently stop the campaign. Returns the Arabic
 * reason, or null when the value is acceptable.
 */
export function founderCampaignSettingIssue(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'قيمة founder_campaign يجب أن تكون كائناً بالشكل: {"starts_on":"YYYY-MM-DD"|null,"ends_on":"YYYY-MM-DD"|null,"library_days":90}';
  }
  const unknownKeys = Object.keys(value).filter((k) => !FOUNDER_SETTING_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return `مفاتيح غير معروفة في founder_campaign: ${unknownKeys.join("، ")} — المسموح: starts_on و ends_on و library_days`;
  }
  for (const [key, label] of [["starts_on", "تاريخ البداية"], ["ends_on", "تاريخ النهاية"]] as const) {
    if (!(key in value)) return `${label} (${key}) مطلوب — تاريخ بالشكل YYYY-MM-DD أو null لإيقاف الحملة`;
    const day = value[key];
    if (day !== null && !isCalendarDay(day)) {
      return `${label} (${key}) غير صالح — يجب أن يكون تاريخاً حقيقياً بالشكل YYYY-MM-DD أو null`;
    }
  }
  const { starts_on: startsOn, ends_on: endsOn, library_days: libraryDays } = value;
  if (typeof startsOn === "string" && typeof endsOn === "string" && startsOn > endsOn) {
    return "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية";
  }
  if (typeof libraryDays !== "number" || !Number.isInteger(libraryDays) || libraryDays < 1 || libraryDays > 3650) {
    return "عدد أيام المكتبة (library_days) يجب أن يكون عدداً صحيحاً بين 1 و 3650";
  }
  return null;
}

/**
 * The `campaign` of a GET /api/v1/campaigns/active body, when it is usable:
 * every field a string, real dates in order, and a CTA that stays on this site.
 * Anything else is null, and the banner falls back to `CAMPAIGNS`.
 */
export function campaignFromApi(body: unknown): Campaign | null {
  if (!isPlainObject(body) || !isPlainObject(body.campaign)) return null;
  const c = body.campaign;
  const fields = ["id", "startsOn", "endsOn", "badgeAr", "messageAr", "ctaAr", "ctaHref"] as const;
  if (!fields.every((f) => typeof c[f] === "string" && (c[f] as string).length > 0)) return null;
  const campaign = Object.fromEntries(fields.map((f) => [f, c[f]])) as unknown as Campaign;
  if (!isCalendarDay(campaign.startsOn) || !isCalendarDay(campaign.endsOn)) return null;
  if (campaign.startsOn > campaign.endsOn) return null;
  // Same-site only: "//host" and "/\host" are both read as another host.
  if (!/^\/(?![/\\])/.test(campaign.ctaHref)) return null;
  return campaign;
}
