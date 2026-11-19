/**
 * publicGuard.ts — the pure half of the public-library protection (owner
 * message 18 Nov, item 2; batch l8 decisions, «Library»):
 *
 *   1. per-session + per-IP budgets on /api/library/* and search, with a
 *      Turnstile challenge after a threshold (a «pass» cookie then opens a
 *      fresh allowance) and a hard 429 above it;
 *   2. a cap on browsing depth (how far into a collection a non-subscriber may
 *      page) and on consecutive pages (paged requests in a short window);
 *   3. the three admin settings behind them (platform_settings):
 *        library_public_protection            — the numbers of 1 and 2;
 *        public_full_rulings_per_collection   — the items a non-subscriber
 *                                               reads in full per collection
 *                                               (owner register 14 item 13:
 *                                               2, at most 3; the rest are
 *                                               titles and a subscribe card —
 *                                               no excerpt, no «3 أو 5»);
 *        library_feqh_free_pages              — fiqh text is subscribers only
 *                                               (owner: 0 free pages);
 *   4. publicExcerpt(): the excerpt a locked item shows — cut at a word,
 *      never the whole text even when the item is short (audit م-1).
 *
 * The crawler gets nothing more than a visitor: nothing here (or in the
 * routes) reads the User-Agent; Googlebot is a guest like any other.
 *
 * Pure: no I/O, no process.env, relative imports only — `node --test` loads it.
 * The HMAC uses globalThis.crypto.subtle (Node 22 and the proxy runtime).
 */
import { canonicalApiPath } from "../rateLimitRoutes.ts";

// ─── settings ────────────────────────────────────────────────────────────────

export interface LibraryPublicProtection {
  /** Library requests per session in 10 minutes before the Turnstile challenge. */
  sessionChallengeAfter: number;
  /** The same per network address (an office shares it), before the challenge. */
  ipChallengeAfter: number;
  /** Paged requests (offset > 0 / page > 1) per session in 10 minutes before the challenge. */
  pagesChallengeAfter: number;
  /** Hard ceiling per session in 10 minutes (429, no challenge can lift it). */
  sessionHardPer10Min: number;
  /** How deep (items) a non-subscriber may page into one collection. */
  maxPublicOffset: number;
  /** How long a solved challenge lasts (minutes). */
  passMinutes: number;
}

export const LIBRARY_PUBLIC_PROTECTION_KEY = "library_public_protection";
export const PUBLIC_FULL_RULINGS_KEY = "public_full_rulings_per_collection";
export const LIBRARY_FEQH_FREE_PAGES_KEY = "library_feqh_free_pages";

/** The JSON field names in platform_settings (snake_case, as every other setting). */
const PROTECTION_FIELDS: ReadonlyArray<{ key: keyof LibraryPublicProtection; json: string; min: number; max: number; labelAr: string }> = [
  { key: "sessionChallengeAfter", json: "session_challenge_after", min: 10, max: 100000, labelAr: "طلبات الجلسة في ١٠ دقائق قبل التحقق البشري" },
  { key: "ipChallengeAfter", json: "ip_challenge_after", min: 10, max: 1000000, labelAr: "طلبات العنوان الواحد في ١٠ دقائق قبل التحقق البشري" },
  { key: "pagesChallengeAfter", json: "pages_challenge_after", min: 2, max: 100000, labelAr: "الصفحات المتتابعة في ١٠ دقائق قبل التحقق البشري" },
  { key: "sessionHardPer10Min", json: "session_hard_per_10min", min: 20, max: 1000000, labelAr: "الحد الأقصى لطلبات الجلسة في ١٠ دقائق" },
  { key: "maxPublicOffset", json: "max_public_offset", min: 50, max: 1000000, labelAr: "أقصى عمق تصفح لغير المشترك داخل المجموعة (عدد العناصر)" },
  { key: "passMinutes", json: "pass_minutes", min: 5, max: 1440, labelAr: "مدة صلاحية التحقق البشري (دقائق)" },
];

export const LIBRARY_PUBLIC_PROTECTION_FIELDS = PROTECTION_FIELDS;

/**
 * The seeded values (20261128_30). Sized for a person: a researcher opening
 * laws, scrolling a collection and searching stays under 120 requests in ten
 * minutes; a script walking the corpus at one request a second reaches it in
 * two minutes, and then needs a human every 120 requests.
 */
export const LIBRARY_PUBLIC_PROTECTION_DEFAULTS: Readonly<LibraryPublicProtection> = Object.freeze({
  sessionChallengeAfter: 120,
  ipChallengeAfter: 400,
  pagesChallengeAfter: 15,
  sessionHardPer10Min: 600,
  maxPublicOffset: 250,
  passMinutes: 30,
});

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A stored value → the numbers; a missing, odd or out-of-range field keeps its default. */
export function parseLibraryPublicProtection(value: unknown): LibraryPublicProtection {
  const out: LibraryPublicProtection = { ...LIBRARY_PUBLIC_PROTECTION_DEFAULTS };
  const obj = plainObject(value);
  if (!obj) return out;
  for (const f of PROTECTION_FIELDS) {
    const v = obj[f.json];
    if (typeof v === "number" && Number.isInteger(v) && v >= f.min && v <= f.max) out[f.key] = v;
  }
  return out;
}

/** The admin write validator: null when acceptable, else the Arabic reason. */
export function libraryPublicProtectionIssue(value: unknown): string | null {
  const obj = plainObject(value);
  if (!obj) return "قيمة library_public_protection يجب أن تكون كائناً";
  const known = new Set(PROTECTION_FIELDS.map((f) => f.json));
  for (const k of Object.keys(obj)) if (!known.has(k)) return `حقل غير معروف في library_public_protection: ${k}`;
  for (const f of PROTECTION_FIELDS) {
    if (!(f.json in obj)) continue;
    const v = obj[f.json];
    if (typeof v !== "number" || !Number.isInteger(v)) return `«${f.labelAr}» يجب أن يكون عدداً صحيحاً`;
    if (v < f.min || v > f.max) return `«${f.labelAr}» بين ${f.min} و${f.max}`;
  }
  const merged = parseLibraryPublicProtection(obj);
  if (merged.sessionHardPer10Min < merged.sessionChallengeAfter) {
    return "الحد الأقصى لطلبات الجلسة يجب ألا يقل عن عتبة التحقق البشري";
  }
  return null;
}

/**
 * Owner register 14 item 13 / file 16 §9.5 (19 Nov 2026): «يرى الزائر النص
 * الكامل لحكمين لكل مجموعة (إعداد، حد أقصى 3)، والباقي مقفول حتى الاشتراك مع
 * بطاقة اشتراك … (يلغي «مقتطف 180 حرفاً» و«3 أو 5»)».
 */
export interface PublicRulingsSetting {
  /** Items per collection a non-subscriber reads in full (owner: 2, at most PUBLIC_RULINGS_FULL_MAX). */
  full: number;
}

export const PUBLIC_RULINGS_FULL_MAX = 3;
export const PUBLIC_RULINGS_DEFAULTS: Readonly<PublicRulingsSetting> = Object.freeze({ full: 2 });

/** The stored value; an old `excerpt_chars` key (batch l8) is read past — the excerpt is cancelled. */
export function parsePublicRulings(value: unknown): PublicRulingsSetting {
  const out: PublicRulingsSetting = { ...PUBLIC_RULINGS_DEFAULTS };
  const obj = plainObject(value);
  if (!obj) return out;
  if (typeof obj.full === "number" && Number.isInteger(obj.full) && obj.full >= 0 && obj.full <= PUBLIC_RULINGS_FULL_MAX) out.full = obj.full;
  return out;
}

export function publicRulingsIssue(value: unknown): string | null {
  const obj = plainObject(value);
  if (!obj) return 'قيمة public_full_rulings_per_collection يجب أن تكون كائناً بالشكل {"full":2}';
  for (const k of Object.keys(obj)) if (k !== "full") return `حقل غير معروف: ${k} (المقتطف أُلغي بقرار المالك)`;
  if (!("full" in obj) || typeof obj.full !== "number" || !Number.isInteger(obj.full) || obj.full < 0 || obj.full > PUBLIC_RULINGS_FULL_MAX) {
    return `عدد الأحكام الكاملة المجانية لكل مجموعة بين 0 و${PUBLIC_RULINGS_FULL_MAX}`;
  }
  return null;
}

/**
 * How many items of a judicial collection a viewer reads in full, by position
 * (order_index, then id): -1 = all (full library access, or a collection the
 * admin opened); an admin per-collection override wins; otherwise the setting
 * (register 14 item 13), never more than the collection holds. One rule for
 * the API (precedents/[slug]/route.ts) and the server-rendered page
 * (precedents/[slug]/layout.tsx), so the HTML never holds more than a guest's
 * API answer.
 */
export function collectionFreeCount(
  access: { freeLimit: number; freeLimitSource?: "override" | "default" },
  total: number,
  rulings: PublicRulingsSetting,
): number {
  if (access.freeLimit === -1) return -1;
  const n = access.freeLimitSource === "override" ? access.freeLimit : rulings.full;
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return Number.isFinite(total) && total >= 0 ? Math.min(safe, total) : safe;
}

/** Owner decision: fiqh text is for subscribers only — 0 free pages by default. */
export const FEQH_FREE_PAGES_DEFAULT = 0;
const FEQH_FREE_PAGES_MAX = 20;

export function parseFeqhFreePages(value: unknown): number {
  const obj = plainObject(value);
  const v = obj?.pages;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= FEQH_FREE_PAGES_MAX ? v : FEQH_FREE_PAGES_DEFAULT;
}

export function feqhFreePagesIssue(value: unknown): string | null {
  const obj = plainObject(value);
  if (!obj) return 'قيمة library_feqh_free_pages يجب أن تكون كائناً بالشكل {"pages":0}';
  for (const k of Object.keys(obj)) if (k !== "pages") return `حقل غير معروف: ${k}`;
  const v = obj.pages;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > FEQH_FREE_PAGES_MAX) return `عدد صفحات الفقه المجانية بين 0 و${FEQH_FREE_PAGES_MAX}`;
  return null;
}

export interface LibraryGuardSettings {
  protection: LibraryPublicProtection;
  rulings: PublicRulingsSetting;
  feqhFreePages: number;
}

/** platform_settings rows ({key, value}) → the three settings, defaults for anything missing. */
export function guardSettingsFromRows(rows: unknown): LibraryGuardSettings {
  const map = new Map<string, unknown>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const o = plainObject(r);
      if (o && typeof o.key === "string") map.set(o.key, o.value);
    }
  }
  return {
    protection: parseLibraryPublicProtection(map.get(LIBRARY_PUBLIC_PROTECTION_KEY)),
    rulings: parsePublicRulings(map.get(PUBLIC_FULL_RULINGS_KEY)),
    feqhFreePages: parseFeqhFreePages(map.get(LIBRARY_FEQH_FREE_PAGES_KEY)),
  };
}

export const LIBRARY_GUARD_DEFAULTS: Readonly<LibraryGuardSettings> = Object.freeze({
  protection: LIBRARY_PUBLIC_PROTECTION_DEFAULTS,
  rulings: PUBLIC_RULINGS_DEFAULTS,
  feqhFreePages: FEQH_FREE_PAGES_DEFAULT,
});

// ─── which requests the guard counts ─────────────────────────────────────────

export const LIBRARY_CHALLENGE_PATH = "/api/library/challenge";

const GUARDED_RE = /^\/api\/(?:v1\/)?library(?:\/|$)/;

/**
 * Paths under the library prefixes the guard does NOT count: the challenge
 * itself (it is how a visitor gets past the guard), the reader's own state
 * and devices (polled by the app, no library text), and private folders.
 */
const NOT_COUNTED: readonly RegExp[] = [
  /^\/api\/library\/challenge$/,
  /^\/api\/v1\/library\/status$/,
  /^\/api\/v1\/library\/devices(?:\/|$)/,
  /^\/api\/v1\/library\/my-grant$/,
  /^\/api\/library\/folders(?:\/|$)/,
];

/** True when this library request is counted by the public guard. */
export function isLibraryGuardedRequest(method: string, rawPathname: string): boolean {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && m !== "POST") return false;
  const pathname = canonicalApiPath(rawPathname);
  if (!GUARDED_RE.test(pathname)) return false;
  return !NOT_COUNTED.some((re) => re.test(pathname));
}

/**
 * A «next page» request: offset > 0 or page > 1 in the query string. (Search
 * pages travel in a POST body the proxy never reads; their depth is capped in
 * the routes — SEARCH_MAX_DEPTH / SCOPED_MAX_DEPTH.)
 */
export function isPagedLibraryRequest(searchParams: URLSearchParams): boolean {
  const offset = Number(searchParams.get("offset"));
  if (Number.isFinite(offset) && offset > 0) return true;
  const page = Number(searchParams.get("page"));
  if (Number.isFinite(page) && page > 1) return true;
  const cursor = searchParams.get("cursor") ?? searchParams.get("after");
  return typeof cursor === "string" && cursor.trim() !== "";
}

// ─── session cookie ──────────────────────────────────────────────────────────

export const LIBRARY_SESSION_COOKIE = "nz_lib_sid";
export const LIBRARY_PASS_COOKIE = "nz_lib_pass";
const SID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** A well-formed session id from the cookie, or null (missing / odd → keyed by address). */
export function librarySessionId(raw: string | null | undefined): string | null {
  return typeof raw === "string" && SID_RE.test(raw) ? raw : null;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh random session id (or pass nonce). */
export function newLibraryId(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return base64url(buf);
}

// ─── the pass (a solved challenge), HMAC-signed ──────────────────────────────

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(`nzamy-library-pass-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(sig)).slice(0, 32);
}

/** The visitor the pass is bound to, hashed (the address never sits in the cookie). */
export async function passBinding(visitorKey: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(`lib-pass-bind:${visitorKey}`));
  return base64url(new Uint8Array(digest)).slice(0, 16);
}

/** `v1.<expires ms>.<nonce>.<sig>` — bound to `binding` (not stored, recomputed on verify). */
export async function signLibraryPass(secret: string, input: { expiresAt: number; nonce: string; binding: string }): Promise<string> {
  const body = `v1.${Math.trunc(input.expiresAt)}.${input.nonce}`;
  return `${body}.${await hmac(secret, `${body}.${input.binding}`)}`;
}

/** The pass's nonce when it is genuine, unexpired and bound to this visitor; else null. */
export async function verifyLibraryPass(
  secret: string,
  token: string | null | undefined,
  binding: string,
  now: number,
): Promise<string | null> {
  if (!secret || typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  if (!SID_RE.test(parts[2])) return null;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}.${parts[2]}.${binding}`);
  if (expected.length !== parts[3].length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0 ? parts[2] : null;
}

/**
 * The HMAC secret for passes: LIBRARY_CHALLENGE_SECRET, else the Turnstile
 * secret the server already holds (mixed with a label inside hmac(), so the
 * pass key is never the Turnstile key itself). null = no pass can be made.
 */
export function libraryPassSecret(env: Readonly<Record<string, string | undefined>>): string | null {
  const own = (env.LIBRARY_CHALLENGE_SECRET ?? "").trim();
  if (own.length >= 16) return own;
  const turnstile = (env.TURNSTILE_SECRET_KEY ?? "").trim();
  return turnstile ? turnstile : null;
}

// ─── decisions and answers ───────────────────────────────────────────────────

export const LIBRARY_CHALLENGE_HEADER = "x-library-challenge";

export const LIBRARY_CHALLENGE_MESSAGE_AR =
  "تصفّحت عدداً كبيراً من صفحات المكتبة خلال وقت قصير. أكّد أنك لست برنامجاً آلياً لتكمل القراءة.";

export const LIBRARY_BUSY_MESSAGE_AR =
  "طلبات كثيرة على المكتبة خلال وقت قصير. انتظر قليلاً ثم أكمل القراءة.";

export function libraryDepthMessageAr(maxOffset: number): string {
  return (
    `يعرض التصفح المجاني أول ${maxOffset} عنصراً من هذه المجموعة. ` +
    "للمتابعة بعد ذلك والاطلاع على النصوص كاملة اشترك في المكتبة القانونية."
  );
}

/** A non-subscriber asking for a window past the public depth. */
export function isBeyondPublicDepth(offset: number, hasFullAccess: boolean, maxPublicOffset: number): boolean {
  return !hasFullAccess && Number.isFinite(offset) && offset >= maxPublicOffset;
}

// ─── the public excerpt (audit م-1) ──────────────────────────────────────────

/**
 * The excerpt of a locked item: at most `maxChars`, and never the whole text —
 * a text shorter than the cap is cut to about 60 % of itself, so a one-line
 * principle no longer shows in full. Cut at the last space when one is near,
 * always ending with «…». Non-strings pass through.
 */
export function publicExcerpt<T>(text: T, maxChars: number): T | string {
  if (typeof text !== "string") return text;
  const clean = text.trim();
  if (clean === "") return clean;
  const cap = clean.length <= maxChars ? Math.max(1, Math.floor(clean.length * 0.6)) : maxChars;
  let cut = clean.slice(0, cap);
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(cap * 0.6)) cut = cut.slice(0, space);
  return `${cut.replace(/[\s،,.؛:]+$/u, "")}…`;
}

/** True when a principle row carries a judgment (facts / reasons / operative part): a «ruling». */
export function isRulingRow(row: { facts?: unknown; reasons?: unknown; ruling?: unknown }): boolean {
  const filled = (v: unknown) => typeof v === "string" && v.trim() !== "";
  return filled(row.facts) || filled(row.reasons) || filled(row.ruling);
}
