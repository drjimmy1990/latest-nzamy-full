/**
 * src/lib/rateLimit.ts — a pure, dependency-free fixed-window rate limiter.
 *
 * WHAT THIS IS. A small in-memory counter keyed by (bucket, key) — e.g.
 * bucket `"strict"`, key `"203.0.113.4"` — that answers "has this key used up
 * its allowance for this bucket's window yet?". It performs no I/O, reads no
 * request object, and knows nothing about HTTP or Next.js; a caller (today,
 * src/proxy.ts) reads the request's IP with `resolveClientIp` below, picks a
 * bucket name and a `{max, windowMs}` policy, calls `check()`, and turns a
 * denied decision into whatever response shape it needs (a 429 JSON body with
 * a Retry-After header, in the proxy's case).
 *
 * ALGORITHM: fixed window, not a sliding log or a literal token bucket. Each
 * (bucket, key) tracks one counter plus the timestamp its current window
 * started. A request inside a still-open window increments that counter and
 * is allowed while `count < max`; a request after the window has elapsed
 * starts a fresh window with `count` reset to zero. This can admit a short
 * burst of up to ~2× `max` spanning a window boundary (max requests just
 * before it closes, plus max more just after the next one opens) compared to
 * a sliding-window or leaky-bucket algorithm — an accepted, deliberate trade
 * for a counter this cheap to run and this easy to reason about and test.
 *
 * STORAGE, STATED PLAINLY — do not read this as a claim of more than it is.
 * The Map below lives in ONE process's memory. On this deployment (a single
 * pm2 instance today) that is the whole story. It is NOT shared across
 * instances, is NOT durable across a restart or deploy, and is NOT a security
 * boundary that holds under horizontal scaling: on a multi-instance
 * deployment the real ceiling per key becomes `max` × (number of instances),
 * and every counter resets to zero the moment a new instance starts. This
 * module is abuse friction — enough to blunt a naive script hammering one
 * route from one address — not a guarantee. The upgrade path, when horizontal
 * scaling makes that gap matter, is a shared store (Redis, a Supabase table,
 * an edge KV) behind the same (bucket, key) → decision interface this module
 * exposes today; nothing above this module needs to change to swap the store.
 *
 * BOUNDED MEMORY. Distinct (bucket, key) pairs would otherwise accumulate
 * forever — a flood of requests spoofing random `x-forwarded-for` values
 * against a public route would grow the Map without limit. `evictStale()`
 * drops every entry whose window has already elapsed; that is always safe,
 * because the next `check()` for that same key would treat it as expired and
 * replace it anyway, so evicting it early changes no future decision. `check()`
 * calls `evictStale()` itself, opportunistically, whenever the store's size
 * crosses `maxEntries` — the same sweep-on-threshold shape already used by
 * the leads route's own throttle
 * (src/app/api/v1/leads/business-assessment/route.ts). That sweep alone frees
 * nothing when every tracked key is still inside a live window (a flood of
 * distinct, never-repeated spoofed keys is exactly that case), so `check()`
 * falls back to a hard cap — dropping the oldest surviving entries by
 * insertion order until the store is back at `maxEntries` — so memory is
 * ACTUALLY bounded, not just usually bounded. See `maybeEvict`'s own comment
 * for the one trade that fallback makes.
 *
 * That count bound only caps memory if each entry itself is small and
 * bounded — a Map key of unbounded length would let `maxEntries` distinct,
 * still-live keys still consume unbounded bytes even while the ENTRY COUNT
 * stays capped. The key here is attacker-controlled input (`resolveClientIp`
 * below reads it straight off a request header), so `resolveClientIp` caps
 * the string it returns to a small fixed length — see its own comment — and
 * that cap is what makes "bounded memory" a claim about resident bytes, not
 * only about the number of Map entries.
 */

export type Clock = () => number;

export interface RateLimitPolicy {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max allowed requests per (bucket, key) within one window. */
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window after this one; 0 when denied. */
  remaining: number;
  /** Echoes the policy's `max`, for a caller building response headers. */
  limit: number;
  /** Whole seconds until the window resets. 0 when allowed, always >= 1 when denied. */
  retryAfterSeconds: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

interface WindowEntry {
  windowStart: number;
  windowMs: number;
  count: number;
}

export interface RateLimiterOptions {
  /** Injectable clock so tests can control time. Defaults to `Date.now`. */
  clock?: Clock;
  /**
   * Soft cap on distinct (bucket, key) pairs tracked at once. Crossing it
   * triggers an opportunistic `evictStale()` sweep — it is not a hard limit
   * (a sweep can leave the store above this size if every entry is still
   * live), just the threshold that makes a sweep worth its O(n) cost.
   */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 20_000;

/** The character used to join bucket and key; chosen so it cannot appear in either. */
const KEY_SEPARATOR = "\u0000";

export class RateLimiter {
  private readonly store = new Map<string, WindowEntry>();
  private readonly clock: Clock;
  private readonly maxEntries: number;

  constructor(options: RateLimiterOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Records one request against (bucket, key) under `policy` and returns
   * whether it is allowed. Each call both reads and mutates state — this is
   * "may I make this request", not a read-only check.
   */
  check(bucket: string, key: string, policy: RateLimitPolicy): RateLimitDecision {
    const now = this.clock();
    const compositeKey = `${bucket}${KEY_SEPARATOR}${key}`;
    let entry = this.store.get(compositeKey);

    if (!entry || now - entry.windowStart >= entry.windowMs) {
      entry = { windowStart: now, windowMs: policy.windowMs, count: 0 };
    }

    const resetAt = entry.windowStart + entry.windowMs;

    if (entry.count >= policy.max) {
      this.store.set(compositeKey, entry);
      this.maybeEvict(now);
      return {
        allowed: false,
        remaining: 0,
        limit: policy.max,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        resetAt,
      };
    }

    entry.count += 1;
    this.store.set(compositeKey, entry);
    this.maybeEvict(now);

    return {
      allowed: true,
      remaining: Math.max(0, policy.max - entry.count),
      limit: policy.max,
      retryAfterSeconds: 0,
      resetAt,
    };
  }

  /**
   * Removes every entry whose window has already elapsed as of `now`
   * (defaults to the injected clock). Returns the number of entries removed.
   * Safe to call at any time — see the module header for why.
   */
  evictStale(now: number = this.clock()): number {
    let removed = 0;
    for (const [storedKey, entry] of this.store) {
      if (now - entry.windowStart >= entry.windowMs) {
        this.store.delete(storedKey);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Clears state — one (bucket, key) counter, every key in one bucket, or (with
   * no arguments) everything. Test and ops use; production request handling
   * never needs to call this.
   */
  reset(bucket?: string, key?: string): void {
    if (bucket === undefined) {
      this.store.clear();
      return;
    }
    if (key === undefined) {
      const prefix = `${bucket}${KEY_SEPARATOR}`;
      for (const storedKey of this.store.keys()) {
        if (storedKey.startsWith(prefix)) this.store.delete(storedKey);
      }
      return;
    }
    this.store.delete(`${bucket}${KEY_SEPARATOR}${key}`);
  }

  /** Distinct (bucket, key) pairs currently tracked. Test/diagnostic use only. */
  get size(): number {
    return this.store.size;
  }

  /**
   * Keeps the store at or under `maxEntries`. First tries the cheap, always-
   * correct path — dropping entries whose window has already elapsed, which
   * changes no future decision (see the module header). That alone is not a
   * hard bound: a flood of requests presenting a fresh, distinct key on every
   * request (e.g. a spoofed `x-forwarded-for` value) is never stale within its
   * own window, so `evictStale` would free nothing while the store keeps
   * growing. If the store is still over the cap after that sweep, this falls
   * back to dropping the oldest surviving entries by insertion order — a real
   * memory bound, at the cost of a real trade-off worth stating plainly: `Map`
   * does not reorder a key on `.set()` to an existing key, so "oldest" means
   * oldest FIRST SEEN, not least-recently-used. An address that has been
   * making frequent, still-live requests since before the cap was hit can be
   * evicted here — its next request is then treated as a fresh key with a
   * fresh count, i.e. this can only ever make the limiter more permissive for
   * that key, never less. Memory staying bounded takes priority over that
   * cosmetic loosening.
   */
  private maybeEvict(now: number): void {
    if (this.store.size <= this.maxEntries) return;
    this.evictStale(now);
    if (this.store.size <= this.maxEntries) return;
    for (const storedKey of this.store.keys()) {
      if (this.store.size <= this.maxEntries) break;
      this.store.delete(storedKey);
    }
  }
}

/**
 * The caller's address for rate-limiting purposes: `x-real-ip` (set by nginx
 * to the TCP peer), else the LAST entry of `x-forwarded-for` (the one nginx
 * appended), else the literal string `"unknown"`.
 *
 * Note the difference from the leads route's own throttle
 * (src/app/api/v1/leads/business-assessment/route.ts), which maps an
 * unidentifiable caller to `null` and skips limiting entirely — deliberately,
 * because its single shared bucket is small (5 per 10 minutes) and a
 * placeholder key would start rejecting genuine callers on the page whose
 * defect was losing leads. This limiter's buckets are meant to hold under a
 * flood from callers presenting no proxy headers at all, so every
 * unidentifiable caller is folded into one shared `"unknown"` key on purpose
 * — the trade is the opposite one, and is made deliberately here too.
 *
 * OPS PRECONDITION THIS FUNCTION DEPENDS ON AND CANNOT VERIFY ITSELF. Reading
 * `x-forwarded-for` first is only meaningful if the reverse proxy in front of
 * this app SETS that header from the real connecting address rather than
 * passing through whatever the client sent. `deployment_guide.md` (line
 * ~284) shows nginx configured with
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, which
 * APPENDS to any value the client already supplied rather than replacing it —
 * so a caller can prepend an arbitrary first entry
 * (`X-Forwarded-For: 1.2.3.4`) and this function returns that fabricated
 * value, not their real address, bypassing the bucket keyed on it entirely.
 * `x-real-ip` is NOT spoofable the same way under that same config
 * (`proxy_set_header X-Real-IP $remote_addr;` — nginx sets it from its own
 * connection, discarding anything the client sent), but this function only
 * reaches it when `x-forwarded-for` is absent, which an attacker controls by
 * simply sending one. Fixing this is an nginx change (stop appending — set
 * `X-Forwarded-For` to `$remote_addr` outright, the way `X-Real-IP` already
 * is), not something this module can enforce from inside the request it is
 * given; see the owner report for this as an open precondition.
 *
 * Takes a header getter rather than a request object so this module stays
 * framework-agnostic; a caller passes e.g. `(name) => req.headers.get(name)`.
 *
 * LENGTH-CAPPED, ON PURPOSE. Both headers are attacker-controlled strings of
 * whatever length the caller cares to send, and the value returned here
 * becomes a `RateLimiter` Map key verbatim (see `check()` above) — so with no
 * cap, a flood presenting a fresh multi-KB `x-forwarded-for` value on every
 * request would make each of the store's up-to-`maxEntries` resident keys
 * several KB, not the few bytes a real IPv4/IPv6(+zone) address takes. That
 * defeats the module header's "bounded memory" claim on resident BYTES even
 * while the entry COUNT stays capped. `MAX_IP_LENGTH` (64 — comfortably over
 * any real address, including an IPv6 address with a zone ID) is applied to
 * whatever this function is about to return, on both branches, so the store
 * never holds a key that trades a few bytes of real information for
 * kilobytes of adversary-chosen padding.
 *
 * Truncation, not hashing, so two distinct inputs that agree on their first
 * `MAX_IP_LENGTH` characters collapse to the same key and share one bucket
 * allowance. No two REAL addresses collide this way (none reach 64 characters
 * to begin with), and an attacker who wants two spoofed values to collide
 * could already choose two identical short ones — truncation gives them no
 * capability they lacked before, it only removes the ability to blow up
 * resident memory with a long one. This cap is enforced here, in the one
 * function every caller uses to produce a key, not inside `RateLimiter`
 * itself — `check()` still accepts whatever `key` string it is given, so the
 * module-header "bounded memory" claim holds because of this caller
 * convention, not because `RateLimiter` refuses an oversized key on its own.
 */
const MAX_IP_LENGTH = 64;

export function resolveClientIp(
  getHeader: (name: string) => string | null | undefined,
): string {
  // Order matters. The production nginx (deployment_guide.md:283-284) sets
  //   X-Real-IP        $remote_addr                — the TCP peer, not spoofable
  //   X-Forwarded-For  $proxy_add_x_forwarded_for  — APPENDS the peer to whatever
  //                                                  the client already sent
  // so the FIRST entry of x-forwarded-for is attacker-controlled and the LAST
  // entry is the one nginx appended. Prefer x-real-ip; fall back to the last
  // forwarded entry; never the first.
  const real = getHeader("x-real-ip");
  if (real && real.trim() !== "") return real.trim().slice(0, MAX_IP_LENGTH);
  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((x) => x.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, MAX_IP_LENGTH);
  }
  return "unknown";
}

/* ─────────────────────────────────────────────────────────────────────────
 * Compatibility surface — the call shape used by the route-level callers on
 * the owner's branch (`rateLimit(key, {limit, windowMs})` + `clientIpFrom`).
 * Same process-local limiter underneath (one shared instance, bucket
 * "compat"), so a route that limits by user id and the proxy that limits by
 * IP never collide on keys.
 * ───────────────────────────────────────────────────────────────────────── */

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying (0 when ok). */
  retryAfterSec: number;
}

const compatLimiter = new RateLimiter();

/** Route-level helper: `rateLimit("ai-review:" + ip, { limit: 5, windowMs: 60_000 })`. */
export function rateLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const decision = compatLimiter.check("compat", key, { max: opts.limit, windowMs: opts.windowMs });
  return { ok: decision.allowed, retryAfterSec: decision.allowed ? 0 : decision.retryAfterSeconds };
}

/** Best-effort client IP for a Request (same header order as `resolveClientIp`). */
export function clientIpFrom(request: Request): string {
  return resolveClientIp((name) => request.headers.get(name));
}
