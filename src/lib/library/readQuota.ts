/**
 * readQuota.ts — the pure half of owner note ١٣ C07 / C09: which library
 * requests count against a reader's durable daily quota, how the counted
 * document is named, and what a refused reader is told.
 *
 * The counting itself is in Postgres (public.library_read_quota_hit,
 * supabase/migrations/20261030_80_library_read_quota.sql) and is called from
 * src/proxy.ts (and POST /api/library/scoped-search) through
 * readQuotaServer.ts. This file performs no I/O and imports only the pure
 * rateLimitRoutes.ts, so `node --test` loads it directly.
 *
 * WHY DOCUMENTS, NOT REQUESTS. The owner's numbers are «وثيقة فريدة/يوم».
 * One document is fetched in many requests — the precedents reader loads a
 * collection in 5–24 windows, the book reader one section at a time — so the
 * key ignores the query string (offset, page, section) and names only the
 * document: `law:<slug>`, `book:<slug>`, `precedent:<id>`, `decree:<id>`.
 */
import { canonicalApiPath } from "../rateLimitRoutes.ts";

/** The owner's quotas (note ١٣ §٢ المحور ٣), plus the two numbers the note does not give. */
export const LIBRARY_READ_QUOTA = Object.freeze({
  /** Note ١٣: «فرد … 220 وثيقة فريدة/يوم». */
  dailyDocs: 220,
  /** Note ١٣: «عضو مكتب/شركة … 400». A firm / corporate account or an active member. */
  memberDailyDocs: 400,
  /**
   * NOT in the note — chosen here, an owner question: distinct documents per
   * rolling hour. 120 is one new document every 30 seconds for a full hour;
   * a person reading cannot keep that up, a script walking the catalogue does.
   */
  hourlyDocs: 120,
  /**
   * NOT in the note — chosen here, an owner question: after the cap, the
   * Nth DISTINCT document a reader still tries to open the same day opens a
   * library lock (C09). Reaching the cap alone never locks anyone.
   */
  lockAfterRefused: 60,
});

export type LibraryDocKind = "law" | "book" | "precedent" | "decree";

export type QuotaTarget =
  | { kind: "doc"; docKey: string }
  /** The lock is checked, nothing is counted (search, in-document search, library AI). */
  | { kind: "lock-only" };

const DOC_ROUTE_RE = /^\/api\/library\/(laws|books|precedents|decrees)\/([^/]+)$/;
const DOC_KIND: Readonly<Record<string, LibraryDocKind>> = {
  laws: "law",
  books: "book",
  precedents: "precedent",
  decrees: "decree",
};

/**
 * POST routes that return library text but read no single document. Not
 * /api/library/scoped-search: it searches INSIDE one document and returns
 * article text, so the route itself spends that document
 * (scopedSearchDocKey below) — which also checks the lock.
 */
const LOCK_ONLY_POST_PATHS: ReadonlySet<string> = new Set([
  "/api/library/search",
  "/api/ai/explain-article",
  "/api/ai/library-chat",
]);

const MAX_SEGMENT_LENGTH = 200;

/**
 * The document segment as one stable string: percent-decoded until it stops
 * changing (at most three rounds — the apiSlug() double-encoding trap means a
 * slug can arrive encoded once or twice), Unicode NFC, trimmed, capped.
 * null for an empty segment. A malformed escape keeps the last good value.
 */
export function normalizeDocSegment(segment: string): string | null {
  let value = segment;
  for (let i = 0; i < 3 && value.includes("%"); i += 1) {
    let next: string;
    try {
      next = decodeURIComponent(value);
    } catch {
      break;
    }
    if (next === value) break;
    value = next;
  }
  value = value.normalize("NFC").trim().slice(0, MAX_SEGMENT_LENGTH);
  return value === "" ? null : value;
}

/** What, if anything, this request spends from the reader's quota. */
export function libraryQuotaTarget(method: string, rawPathname: string): QuotaTarget | null {
  const m = method.toUpperCase();
  const pathname = canonicalApiPath(rawPathname);
  if (m === "GET") {
    const match = DOC_ROUTE_RE.exec(pathname);
    if (!match) return null;
    const segment = normalizeDocSegment(match[2]);
    if (!segment) return null;
    return { kind: "doc", docKey: `${DOC_KIND[match[1]]}:${segment}` };
  }
  if (m === "POST" && LOCK_ONLY_POST_PATHS.has(pathname)) return { kind: "lock-only" };
  return null;
}

/**
 * The document an in-document search spends: the same key as opening it
 * (scope `law:<slug>` → `law:<slug>`, `collection:<id>` → `precedent:<id>`,
 * `book:<id>` → `book:<id>`), so searching inside a law already opened today
 * costs nothing, and searching inside every law costs one document each.
 */
export function scopedSearchDocKey(kind: "law" | "collection" | "book", id: string): string | null {
  const segment = normalizeDocSegment(id);
  if (!segment) return null;
  const docKind: LibraryDocKind = kind === "collection" ? "precedent" : kind;
  return `${docKind}:${segment}`;
}

/**
 * True when the request carries a Supabase session cookie (`sb-<ref>-auth-token`
 * or one of its `.0`/`.1` chunks). Without one the reader is a guest: there is
 * no user to count, and the proxy skips the auth round trip entirely.
 */
export function hasSupabaseAuthCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}

export type QuotaStatus = "exempt" | "ok" | "over_daily" | "over_hourly" | "locked";

/** One row of public.library_read_quota_hit, as the app uses it. */
export interface QuotaRow {
  status: QuotaStatus;
  usedToday: number;
  dayLimit: number;
  usedHour: number;
  hourLimit: number;
  refusedToday: number;
  lockReference: string | null;
  lockedUntil: string | null;
  resetsAt: string | null;
}

const STATUSES: ReadonlySet<string> = new Set(["exempt", "ok", "over_daily", "over_hourly", "locked"]);

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * PostgREST's answer (an array of one row, or the row itself) → QuotaRow, or
 * null when it is not a row this code understands. null means "no decision":
 * the caller lets the request through (fail open).
 */
export function parseQuotaRow(json: unknown): QuotaRow | null {
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUSES.has(r.status)) return null;
  return {
    status: r.status as QuotaStatus,
    usedToday: int(r.used_today),
    dayLimit: int(r.day_limit),
    usedHour: int(r.used_hour),
    hourLimit: int(r.hour_limit),
    refusedToday: int(r.refused_today),
    lockReference: str(r.lock_reference),
    lockedUntil: str(r.locked_until),
    resetsAt: str(r.resets_at),
  };
}

/** Where a locked reader is sent: the public contact page. */
export const LIBRARY_LOCK_SUPPORT_PATH = "/contact";

export function libraryLockMessageAr(reference: string | null): string {
  const ref = reference ? ` (رقم المرجع: ${reference})` : "";
  return (
    `أُوقفت القراءة في المكتبة القانونية لحسابك مؤقتاً لحماية محتواها${ref}. ` +
    "حسابك وبقية خدمات المنصة تعمل كالمعتاد. " +
    "لاستعادة القراءة تواصل مع الدعم من صفحة «تواصل معنا» واذكر رقم المرجع."
  );
}

export function libraryDailyLimitMessageAr(limit: number): string {
  return (
    `بلغت الحد اليومي لفتح الوثائق في المكتبة (${limit} وثيقة مختلفة في اليوم). ` +
    "الوثائق التي فتحتها اليوم تبقى متاحة لك، ويتجدد الحد عند منتصف الليل بتوقيت الرياض. " +
    "إن كان عملك يحتاج أكثر من ذلك فتواصل مع الدعم."
  );
}

export function libraryHourlyLimitMessageAr(limit: number): string {
  return (
    `فتحت ${limit} وثيقة مختلفة خلال ساعة، وهو أعلى من وتيرة القراءة المعتادة. ` +
    "انتظر قليلاً ثم أكمل؛ الوثائق التي فتحتها تبقى متاحة لك."
  );
}

export interface QuotaRefusal {
  status: 423 | 429;
  body: {
    error: string;
    code: "library_security_lock" | "library_daily_limit" | "library_hourly_limit";
    reference?: string;
    support?: string;
    limit?: number;
    resetsAt?: string;
  };
  /** Seconds for Retry-After (429 only). */
  retryAfterSeconds: number | null;
}

/** Whole seconds from `now` to an ISO time, at least 1; 3600 when unknown. */
export function secondsUntil(iso: string | null, now: number): number {
  if (!iso) return 3600;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 3600;
  return Math.max(1, Math.ceil((at - now) / 1000));
}

/**
 * The refusal for a quota answer, or null when the request may go on
 * ('ok', 'exempt'). 423 for a lock (it does not pass by waiting), 429 with
 * Retry-After for a cap.
 */
export function quotaRefusal(row: QuotaRow | null, now: number): QuotaRefusal | null {
  if (!row) return null;
  if (row.status === "locked") {
    return {
      status: 423,
      body: {
        error: libraryLockMessageAr(row.lockReference),
        code: "library_security_lock",
        ...(row.lockReference ? { reference: row.lockReference } : {}),
        support: LIBRARY_LOCK_SUPPORT_PATH,
      },
      retryAfterSeconds: null,
    };
  }
  if (row.status === "over_daily") {
    return {
      status: 429,
      body: {
        error: libraryDailyLimitMessageAr(row.dayLimit),
        code: "library_daily_limit",
        limit: row.dayLimit,
        ...(row.resetsAt ? { resetsAt: row.resetsAt } : {}),
      },
      retryAfterSeconds: secondsUntil(row.resetsAt, now),
    };
  }
  if (row.status === "over_hourly") {
    return {
      status: 429,
      body: {
        error: libraryHourlyLimitMessageAr(row.hourLimit),
        code: "library_hourly_limit",
        limit: row.hourLimit,
        ...(row.resetsAt ? { resetsAt: row.resetsAt } : {}),
      },
      retryAfterSeconds: secondsUntil(row.resetsAt, now),
    };
  }
  return null;
}

/**
 * A small in-process memo with a time-to-live and a hard size cap — the
 * note's "L1" in front of Postgres. The proxy remembers, for 60 seconds, that
 * (user, document) was already allowed, so the 24 windows of one collection
 * cost one database call, not 24. A lock an admin sets reaches an
 * already-open document within that TTL. Oldest-first eviction at the cap.
 */
export class TtlMemo<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly clock: () => number;

  constructor(ttlMs: number, maxEntries = 10_000, clock: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.clock = clock;
  }

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.clock()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number = this.ttlMs): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.clock() + ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  get size(): number {
    return this.store.size;
  }
}
