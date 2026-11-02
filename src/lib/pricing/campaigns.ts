/**
 * Promotional campaigns (owner answer ١٧٩, 2026-10-16).
 *
 * Offers live in a dismissible banner during a real, dated campaign — never as
 * a permanent badge or promise inside a price card. A campaign shows only
 * between its start and end dates.
 *
 * Two sources, in this order:
 *   1. The founder campaign (owner ٢١٨, dates ٢٢٥): its dates are the
 *      platform setting `founder_campaign`, which the admin edits in
 *      /dashboard/admin/settings. GET /api/v1/campaigns/active turns that
 *      setting into a `Campaign` with `founderCampaignFromSetting` — but only
 *      once `FOUNDER_MEMBERSHIP_ON_SALE` is true. The owner decided on 25 Oct
 *      that a free signup never earns the founder badge, seat or library days
 *      (20261026_01 dropped the signup trigger of 20261021_50); only a
 *      verified licence plus a paid founder membership does, and that
 *      membership is built in phase P3. Until then the route answers no
 *      campaign at all. Same date rules as founder_campaign_active(): Riyadh
 *      day, both ends included.
 *   2. `CAMPAIGNS` below — a code-dated list, used only when the route fails
 *      or returns nothing. It stays EMPTY until the owner dates another offer:
 *      a banner must not promise what nobody grants.
 *
 * Pure, relative imports only — campaigns.test.ts runs it under `node --test`.
 */

import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";

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

// ── The founder campaign (owner ٢١٨, dates ٢٢٥; 25-Oct answers, 20261026_01) ──

/**
 * The code-level sale switch of the paid founder membership (phase P3:
 * verified licence + payment + a seat, 20261101_10). P3 Task 11 turned it on,
 * in the same change that ships the membership checkout. It is only the
 * first of two gates: GET /api/v1/campaigns/active and the checkout still
 * answer no campaign / 410 outside the founder_campaign dates, while the
 * admin has paused the sale, or once no seat is left (founder_seat_summary,
 * founder_reserve_seat). Setting it back to false hides the card and refuses
 * every founder checkout without reading the setting; the admin's pause
 * switch («حملة المؤسس») does the same without a deploy.
 */
export const FOUNDER_MEMBERSHIP_ON_SALE: boolean = true;

/**
 * The paid-membership copy. It never promises a gift for registering (owner,
 * 25 Oct: no badge, seat or library days on a free signup). The CTA is the
 * link the owner's campaign uses: /pricing reads `audience` (opens the
 * lawyers tab) and `campaign` (compared with FOUNDER_CAMPAIGN_ID) and scrolls
 * to the #founder-plan card (P3 Task 8).
 */
export const FOUNDER_CAMPAIGN_COPY = {
  badgeAr: "عضوية المحامي المؤسس",
  messageAr: "عضوية المحامي المؤسس السنوية — مقاعد محدودة لمن يوثّق رخصته ويُتم السداد",
  ctaAr: "اعرف التفاصيل",
  ctaHref: "/pricing?audience=lawyers&campaign=founder-2026#founder-plan",
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
 * matter (`library_days` and any other key are ignored), so the banner follows
 * the same dates as the database. Null when either date is null, missing or
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

const FOUNDER_SETTING_KEYS = new Set(["starts_on", "ends_on", "library_days", "capacity", "sale_paused"]);

/** The largest seat count the admin may set (ruling R1). */
export const FOUNDER_CAPACITY_MAX = 100000;

/**
 * The admin write check for `founder_campaign` (api/v1/admin/settings). Strict
 * where the reader is tolerant: the reader treats a malformed date as "off",
 * so a typo saved here would silently stop the campaign. `library_days` is
 * still required in the shape, but since 20261026_01 nothing grants it on
 * signup (P3 decides whether the paid membership uses it). Returns the Arabic
 * reason, or null when the value is acceptable.
 */
export function founderCampaignSettingIssue(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'قيمة founder_campaign يجب أن تكون كائناً بالشكل: {"starts_on":"YYYY-MM-DD"|null,"ends_on":"YYYY-MM-DD"|null,"library_days":90}';
  }
  const unknownKeys = Object.keys(value).filter((k) => !FOUNDER_SETTING_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return `مفاتيح غير معروفة في founder_campaign: ${unknownKeys.join("، ")} — المسموح: starts_on و ends_on و library_days و capacity و sale_paused`;
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
  // Optional: founder_campaign_limits() reads a missing one as 1096 / false,
  // and anything malformed the same way — so a malformed one is refused here
  // rather than silently reverting to the default.
  if ("capacity" in value) {
    const capacity = value.capacity;
    if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > FOUNDER_CAPACITY_MAX) {
      return `عدد المقاعد (capacity) يجب أن يكون عدداً صحيحاً بين 1 و ${FOUNDER_CAPACITY_MAX}`;
    }
  }
  if ("sale_paused" in value && typeof value.sale_paused !== "boolean") {
    return "إيقاف البيع (sale_paused) يجب أن يكون true أو false";
  }
  return null;
}

/**
 * R1: the posted body's `capacity` must be a plain integer literal. The SQL
 * (founder_campaign_limits) accepts only digits, so a stored 50.0 would read
 * as 1096 — and `JSON.parse` turns 50.0 into 50, which the shape validator
 * cannot tell apart. So the raw request text is checked: every `"capacity":`
 * followed by a number must be digits only (no sign, point or exponent). A
 * non-number (a string, true…) is left to founderCampaignSettingIssue.
 * Returns the Arabic reason, or null.
 */
export function founderCapacityLiteralIssue(raw: string): string | null {
  const key = /"capacity"\s*:\s*/g;
  let m: RegExpExecArray | null;
  while ((m = key.exec(raw)) !== null) {
    const rest = raw.slice(m.index + m[0].length);
    if (!/^[-0-9.]/.test(rest)) continue;
    if (!/^[0-9]+(?=\s*[,}\]])/.test(rest)) {
      return `عدد المقاعد (capacity) يجب أن يُكتب عدداً صحيحاً بلا كسور ولا أُس (مثل 1096 لا 1096.0) — بين 1 و ${FOUNDER_CAPACITY_MAX}`;
    }
  }
  return null;
}

/**
 * The value an admin PATCH of `founder_campaign` stores: the posted keys over
 * the stored ones (R1). The settings page posts only the dates and
 * library_days, so capacity and sale_paused must survive it. A non-object
 * post is returned untouched (the validator refuses it); a non-object stored
 * value contributes nothing.
 */
export function mergeFounderCampaignSetting(stored: unknown, posted: unknown): unknown {
  if (!isPlainObject(posted)) return posted;
  return isPlainObject(stored) ? { ...stored, ...posted } : posted;
}

// ── the seat count (founder_seat_summary(), 20261101_10) ────────────────────

export interface FounderSeatSummary {
  capacity: number;
  seatsLeft: number;
  /** The SQL's on_sale: window open, not paused, a seat left. */
  onSale: boolean;
  /** The SQL's sale_paused: the admin's «إيقاف البيع مؤقتًا» (founder_campaign.sale_paused). */
  salePaused: boolean;
}

const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * founder_seat_summary()'s one row (PostgREST answers a `returns table`
 * function with an array) as the card needs it, or null when the reply is
 * not that row.
 */
export function founderSummaryFromRpc(data: unknown): FounderSeatSummary | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isPlainObject(row)) return null;
  const { capacity, seats_left: seatsLeft, on_sale: onSale, sale_paused: salePaused } = row;
  if (!isWhole(capacity) || capacity < 1 || !isWhole(seatsLeft) || typeof onSale !== "boolean") return null;
  if (typeof salePaused !== "boolean") return null;
  return { capacity, seatsLeft, onSale, salePaused };
}

/** The route's campaign: the banner's fields plus what the /pricing card reads. */
export type FounderOfferCampaign = Campaign & {
  planId: string;
  onSale: boolean;
  /** The admin paused the sale (R31): the card's campaign-link visitor reads «البيع متوقف مؤقتًا…». */
  salePaused: boolean;
  seatsLeft: number;
  capacity: number;
};

/**
 * The founder campaign with the seat count. `onSale` is the code switch
 * (FOUNDER_MEMBERSHIP_ON_SALE) AND the SQL's on_sale, so neither alone can
 * put the card up.
 */
export function founderOfferCampaign(
  campaign: Campaign,
  summary: FounderSeatSummary,
  flag: boolean,
): FounderOfferCampaign {
  return {
    ...campaign,
    planId: FOUNDER_PLAN_ID,
    onSale: flag && summary.onSale,
    salePaused: summary.salePaused,
    seatsLeft: summary.seatsLeft,
    capacity: summary.capacity,
  };
}

/**
 * The `campaign` of a GET /api/v1/campaigns/active body, when it is usable:
 * every field a string, real dates in order, and a CTA that stays on this site.
 * A founder campaign the route marks `onSale: false` (seats full, sale paused)
 * is null too: the banner must not advertise what cannot be bought.
 * Anything else is null, and the banner falls back to `CAMPAIGNS`.
 */
export function campaignFromApi(body: unknown): Campaign | null {
  if (!isPlainObject(body) || !isPlainObject(body.campaign)) return null;
  const c = body.campaign;
  if (c.onSale === false) return null;
  const fields = ["id", "startsOn", "endsOn", "badgeAr", "messageAr", "ctaAr", "ctaHref"] as const;
  if (!fields.every((f) => typeof c[f] === "string" && (c[f] as string).length > 0)) return null;
  const campaign = Object.fromEntries(fields.map((f) => [f, c[f]])) as unknown as Campaign;
  if (!isCalendarDay(campaign.startsOn) || !isCalendarDay(campaign.endsOn)) return null;
  if (campaign.startsOn > campaign.endsOn) return null;
  // Same-site only: "//host" and "/\host" are both read as another host.
  if (!/^\/(?![/\\])/.test(campaign.ctaHref)) return null;
  return campaign;
}
