/**
 * publicViewCap.ts — the pure half of two library protections (batch l11):
 *
 *   O18 / A16 — the NON-SUBSCRIBER DAILY VIEW CAP (owner register 14 items
 *   48(4), 52, 53, 56, 60, 64; spec 16.13). A viewer without full library
 *   access (a guest, or a signed-in account without a library subscription)
 *   may open at most `dailyViews` DISTINCT documents a Riyadh day through the
 *   document routes (/api/library/laws|books|precedents|decrees/<id>).
 *   Owner question ١٠٠, default kept while he has not answered: only these
 *   opens count — never the public summary page (/laws/<slug>, rendered on the
 *   server), a list, the catalogue or search. Re-opening a document already
 *   opened today is free. SHIPPED OFF (`enabled` false): the owner switches it
 *   on only after the evidence that it does not hurt search visibility
 *   (register 53), and the admin page refuses to switch it on without the
 *   evidence confirmation (G45).
 *
 *   Who is counted ("subjects", each with its own number):
 *     u:<user id>        a signed-in non-subscriber            → dailyViews
 *     s:<session hash>   a guest's library session (nz_lib_sid) → dailyViews
 *     a:<address hash>   a guest's address (X-Real-IP first, the
 *                        Cloudflare chain as every library bucket) → addressDailyViews
 *                        (larger: an office or a mobile network shares one address)
 *     c:<crawler>        a crawler of the closed list PROVEN by its address
 *                        (crawlerVerify.ts) → that provider's own number,
 *                        instead of all the above
 *     p:<agent>          ChatGPT-User / Claude-User / Perplexity-User: on top
 *                        of the visitor's own subjects, one shared number per
 *                        provider (register 60: they are visitors)
 *   A document is refused when ANY subject is at its number. Addresses and
 *   sessions are stored only as keyed hashes (HMAC), never in clear.
 *
 *   O19 — the review rules for SEQUENTIAL and PARALLEL reading (owner
 *   register 14 item 67 / file 19, R67): their switches and thresholds and the
 *   staff e-mail addresses live in the same settings row; the rules run in
 *   Postgres (library_monitor_evaluate, 20261201_30), for every account,
 *   admins and test accounts included.
 *
 * Every number is a column of public.library_monitor_settings (20261201_30),
 * edited on the admin page «حماية المكتبة من السحب»; these defaults are what
 * the app uses before that file runs (the cap then stays off).
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { isPlainEmail } from "../email/sendEmail.ts";
import { VERIFIED_CRAWLERS, VISITOR_AGENTS } from "./crawlerList.ts";

export interface CrawlerLimit {
  on: boolean;
  daily: number;
}

export interface PublicViewSettings {
  enabled: boolean;
  dailyViews: number;
  addressDailyViews: number;
  crawlers: Record<string, CrawlerLimit>;
  agents: Record<string, number>;
  sequenceOn: boolean;
  sequenceDocs: number;
  sequenceGapSeconds: number;
  parallelOn: boolean;
  parallelSessions: number;
  parallelMinutes: number;
  alertEmails: string[];
}

/**
 * The defaults (the same as the column defaults of 20261201_30). dailyViews 5
 * is the owner's number (register 52); every other number is chosen here and
 * says so on the admin page.
 */
export const PUBLIC_VIEW_DEFAULTS: Readonly<PublicViewSettings> = Object.freeze({
  enabled: false,
  dailyViews: 5,
  addressDailyViews: 20,
  crawlers: Object.freeze({
    googlebot: { on: true, daily: 5000 },
    bingbot: { on: true, daily: 5000 },
    applebot: { on: true, daily: 2000 },
    "oai-searchbot": { on: true, daily: 2000 },
    "claude-searchbot": { on: true, daily: 2000 },
    perplexitybot: { on: true, daily: 2000 },
    amazonbot: { on: false, daily: 200 },
  }) as Record<string, CrawlerLimit>,
  agents: Object.freeze({ "chatgpt-user": 100, "claude-user": 100, "perplexity-user": 100 }) as Record<string, number>,
  sequenceOn: true,
  sequenceDocs: 20,
  sequenceGapSeconds: 20,
  parallelOn: true,
  parallelSessions: 3,
  parallelMinutes: 10,
  alertEmails: [],
}) as Readonly<PublicViewSettings>;

/** The columns 20261201_30 adds to library_monitor_settings (and only those). */
export const PUBLIC_VIEW_COLUMNS: readonly string[] = Object.freeze([
  "non_subscriber_view_limit_enabled",
  "non_subscriber_daily_view_limit",
  "non_subscriber_address_daily_limit",
  "crawler_view_limits",
  "agent_view_limits",
  "rule_sequence_on",
  "rule_sequence_docs",
  "rule_sequence_gap_seconds",
  "rule_parallel_on",
  "rule_parallel_sessions",
  "rule_parallel_minutes",
  "alert_emails",
]);

export const PUBLIC_VIEW_SELECT = ["updated_at", "updated_by", ...PUBLIC_VIEW_COLUMNS].join(", ");

interface IntSpec {
  key: keyof PublicViewSettings;
  column: string;
  min: number;
  max: number;
  labelAr: string;
}
interface BoolSpec {
  key: keyof PublicViewSettings;
  column: string;
  labelAr: string;
}

/** Bounds = the table's CHECK constraints. */
export const PUBLIC_VIEW_INTS: readonly IntSpec[] = Object.freeze([
  { key: "dailyViews", column: "non_subscriber_daily_view_limit", min: 1, max: 1000, labelAr: "عدد المستندات المختلفة في اليوم لغير المشترك" },
  { key: "addressDailyViews", column: "non_subscriber_address_daily_limit", min: 1, max: 100000, labelAr: "عدد المستندات المختلفة في اليوم من عنوان اتصال واحد (للزوار)" },
  { key: "sequenceDocs", column: "rule_sequence_docs", min: 3, max: 100000, labelAr: "عدد الوثائق المفتوحة تباعاً" },
  { key: "sequenceGapSeconds", column: "rule_sequence_gap_seconds", min: 1, max: 3600, labelAr: "أقصى مدة بين وثيقة والتي تليها (ثوانٍ)" },
  { key: "parallelSessions", column: "rule_parallel_sessions", min: 2, max: 1000, labelAr: "عدد جلسات القراءة في وقت واحد" },
  { key: "parallelMinutes", column: "rule_parallel_minutes", min: 1, max: 1440, labelAr: "خلال (دقائق)" },
]);

export const PUBLIC_VIEW_BOOLS: readonly BoolSpec[] = Object.freeze([
  { key: "enabled", column: "non_subscriber_view_limit_enabled", labelAr: "تشغيل حد الاطلاع اليومي لغير المشترك" },
  { key: "sequenceOn", column: "rule_sequence_on", labelAr: "تنبيه عند فتح وثائق كثيرة تباعاً بسرعة" },
  { key: "parallelOn", column: "rule_parallel_on", labelAr: "تنبيه عند القراءة من جلسات كثيرة في وقت واحد" },
]);

export const CRAWLER_DAILY_MAX = 1_000_000;
export const AGENT_DAILY_MAX = 1_000_000;
export const ALERT_EMAILS_MAX = 10;

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/** crawler_view_limits as stored → every closed-list crawler with a valid entry (else its default). */
export function crawlerLimitsFrom(value: unknown): Record<string, CrawlerLimit> {
  const src = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out: Record<string, CrawlerLimit> = {};
  for (const c of VERIFIED_CRAWLERS) {
    const d = PUBLIC_VIEW_DEFAULTS.crawlers[c.id] ?? { on: false, daily: 100 };
    const e = src[c.id] && typeof src[c.id] === "object" ? (src[c.id] as Record<string, unknown>) : {};
    out[c.id] = {
      on: typeof e.on === "boolean" ? e.on : d.on,
      daily: int(e.daily, 1, CRAWLER_DAILY_MAX) ?? d.daily,
    };
  }
  return out;
}

/** agent_view_limits as stored → every visitor agent with a valid number (else its default). */
export function agentLimitsFrom(value: unknown): Record<string, number> {
  const src = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const a of VISITOR_AGENTS) out[a.id] = int(src[a.id], 1, AGENT_DAILY_MAX) ?? PUBLIC_VIEW_DEFAULTS.agents[a.id] ?? 100;
  return out;
}

/** A database row (or null) → the settings; an odd column keeps its default. */
export function publicViewSettingsFromRow(row: Record<string, unknown> | null | undefined): PublicViewSettings {
  const out: PublicViewSettings = {
    ...PUBLIC_VIEW_DEFAULTS,
    crawlers: crawlerLimitsFrom(null),
    agents: agentLimitsFrom(null),
    alertEmails: [],
  };
  if (!row) return out;
  for (const b of PUBLIC_VIEW_BOOLS) if (typeof row[b.column] === "boolean") (out as unknown as Record<string, unknown>)[b.key] = row[b.column];
  for (const i of PUBLIC_VIEW_INTS) {
    const v = int(row[i.column], i.min, i.max);
    if (v !== null) (out as unknown as Record<string, unknown>)[i.key] = v;
  }
  out.crawlers = crawlerLimitsFrom(row.crawler_view_limits);
  out.agents = agentLimitsFrom(row.agent_view_limits);
  out.alertEmails = Array.isArray(row.alert_emails) ? row.alert_emails.filter(isPlainEmail).slice(0, ALERT_EMAILS_MAX) : [];
  return out;
}

export type ProtectionPatch =
  | { ok: true; columns: Record<string, unknown>; changed: string[] }
  | { ok: false; error: string; status?: number };

export const EVIDENCE_REQUIRED_AR =
  "لا يُشغَّل حد الاطلاع قبل الاطلاع على أدلة عدم الإضرار بالظهور في محركات البحث وموافقة المالك. أكّد ذلك في خانة التأكيد ثم احفظ.";

/**
 * A PUT body → the columns to write. Refuses an unknown field, a wrong type,
 * a number out of bounds, an unknown crawler / agent, a bad e-mail; and
 * (G45) switching the cap ON without `confirmEvidence: true`.
 */
export function parseProtectionPatch(body: unknown, current: PublicViewSettings): ProtectionPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "بيانات غير صالحة" };
  const input = { ...(body as Record<string, unknown>) };
  const confirm = input.confirmEvidence === true;
  delete input.confirmEvidence;
  const columns: Record<string, unknown> = {};
  const changed: string[] = [];
  const ints = new Map(PUBLIC_VIEW_INTS.map((s) => [s.key as string, s]));
  const bools = new Map(PUBLIC_VIEW_BOOLS.map((s) => [s.key as string, s]));
  for (const [key, value] of Object.entries(input)) {
    const i = ints.get(key);
    const b = bools.get(key);
    if (i) {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `«${i.labelAr}» يجب أن يكون عدداً صحيحاً` };
      if (n < i.min || n > i.max) return { ok: false, error: `«${i.labelAr}» بين ${i.min} و${i.max}` };
      columns[i.column] = n;
    } else if (b) {
      if (typeof value !== "boolean") return { ok: false, error: `«${b.labelAr}»: قيمة غير صالحة` };
      if (b.key === "enabled" && value === true && !current.enabled && !confirm) {
        return { ok: false, error: EVIDENCE_REQUIRED_AR, status: 409 };
      }
      columns[b.column] = value;
    } else if (key === "crawlers") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "إعدادات الزواحف غير صالحة" };
      const next: Record<string, CrawlerLimit> = { ...current.crawlers };
      for (const [id, e] of Object.entries(value as Record<string, unknown>)) {
        const def = VERIFIED_CRAWLERS.find((c) => c.id === id);
        if (!def) return { ok: false, error: `زاحف غير معروف: ${id}` };
        const entry = e && typeof e === "object" ? (e as Record<string, unknown>) : null;
        if (!entry || typeof entry.on !== "boolean" || int(entry.daily, 1, CRAWLER_DAILY_MAX) === null) {
          return { ok: false, error: `«${def.label}»: الحد اليومي بين 1 و${CRAWLER_DAILY_MAX}` };
        }
        next[id] = { on: entry.on, daily: entry.daily as number };
      }
      columns.crawler_view_limits = next;
    } else if (key === "agents") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "إعدادات الوكلاء غير صالحة" };
      const next: Record<string, number> = { ...current.agents };
      for (const [id, n] of Object.entries(value as Record<string, unknown>)) {
        const def = VISITOR_AGENTS.find((a) => a.id === id);
        if (!def) return { ok: false, error: `وكيل غير معروف: ${id}` };
        if (int(n, 1, AGENT_DAILY_MAX) === null) return { ok: false, error: `«${def.label}»: الحد اليومي بين 1 و${AGENT_DAILY_MAX}` };
        next[id] = n as number;
      }
      columns.agent_view_limits = next;
    } else if (key === "alertEmails") {
      const list = typeof value === "string" ? value.split(/[\s,;،]+/) : value;
      if (!Array.isArray(list)) return { ok: false, error: "عناوين البريد غير صالحة" };
      const clean = [...new Set(list.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : x)).filter((x) => x !== ""))];
      if (clean.length > ALERT_EMAILS_MAX) return { ok: false, error: `عشرة عناوين بريد على الأكثر` };
      const bad = clean.find((x) => !isPlainEmail(x));
      if (bad !== undefined) return { ok: false, error: `عنوان بريد غير صالح: ${String(bad).slice(0, 80)}` };
      columns.alert_emails = clean;
    } else {
      return { ok: false, error: `حقل غير معروف: ${key}` };
    }
    changed.push(key);
  }
  if (changed.length === 0) return { ok: false, error: "لا يوجد ما يُحفظ" };
  return { ok: true, columns, changed };
}

// ─── subjects ────────────────────────────────────────────────────────────────

export interface SubjectInput {
  userId: string | null;
  /** HMAC of the nz_lib_sid cookie, or null. */
  sessionHash: string | null;
  /** HMAC of the visitor's address, or null. */
  addressHash: string | null;
  /** A crawler of the closed list, PROVEN by its address, whose switch is on. */
  verifiedCrawlerId: string | null;
  /** A visitor agent named by the User-Agent (only ever adds a subject). */
  agentId: string | null;
}

/** The subjects one document open is counted against (see the header). */
export function viewerSubjects(input: SubjectInput): string[] {
  if (input.verifiedCrawlerId) return [`c:${input.verifiedCrawlerId}`];
  const out: string[] = [];
  if (input.userId) out.push(`u:${input.userId}`);
  else {
    if (input.sessionHash) out.push(`s:${input.sessionHash}`);
    if (input.addressHash) out.push(`a:${input.addressHash}`);
  }
  if (input.agentId) out.push(`p:${input.agentId}`);
  return out;
}

const encoder = new TextEncoder();

/** A keyed hash (HMAC-SHA-256, base64url, 22 chars) of `value` under `label`. */
export async function subjectHash(secret: string, label: string, value: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(`nzamy-library-view-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(`${label}:${value}`)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22);
}

// ─── the refusal ─────────────────────────────────────────────────────────────

export const PUBLIC_VIEW_LIMIT_CODE = "library_public_view_limit";

export function publicViewMessageAr(limit: number): string {
  return `بلغت الحد اليومي لتصفح نصوص المكتبة دون اشتراك (${limit} مستندات مختلفة في اليوم). يتجدد الحد عند منتصف الليل بتوقيت الرياض، ويمكنك الاشتراك في المكتبة لتقرأ دون هذا الحد.`;
}

export interface PublicViewRow {
  status: string;
  used: number;
  dayLimit: number;
  subject: string | null;
  resetsAt: string | null;
}

/** The function's one row (PostgREST answers an array) → a typed row, or null. */
export function parsePublicViewRow(body: unknown): PublicViewRow | null {
  const r = Array.isArray(body) ? body[0] : body;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.status !== "string") return null;
  return {
    status: o.status,
    used: typeof o.used === "number" ? o.used : 0,
    dayLimit: typeof o.day_limit === "number" ? o.day_limit : 0,
    subject: typeof o.subject === "string" ? o.subject : null,
    resetsAt: typeof o.resets_at === "string" ? o.resets_at : null,
  };
}

export interface PublicViewRefusal {
  status: 429;
  body: { error: string; code: string; limit: number; resetsAt: string | null; subscribeHref: string };
  retryAfterSeconds: number | null;
}

/**
 * The 429 for a refused open, or null. No challenge header: solving a
 * Turnstile box does not lift a daily cap. The message names the visitor's
 * number (dailyViews), not the address number, so a reader is never told a
 * number that is not his.
 */
export function publicViewRefusal(row: PublicViewRow | null, settings: PublicViewSettings, now: number): PublicViewRefusal | null {
  if (!row || row.status !== "over") return null;
  const kind = row.subject ? row.subject.split(":")[0] : "";
  const limit = kind === "u" || kind === "s" ? row.dayLimit || settings.dailyViews : settings.dailyViews;
  const at = row.resetsAt ? Date.parse(row.resetsAt) : NaN;
  return {
    status: 429,
    body: {
      error: publicViewMessageAr(limit),
      code: PUBLIC_VIEW_LIMIT_CODE,
      limit,
      resetsAt: row.resetsAt,
      subscribeHref: "/laws/subscribe",
    },
    retryAfterSeconds: Number.isFinite(at) ? Math.max(1, Math.ceil((at - now) / 1000)) : null,
  };
}
