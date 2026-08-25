/**
 * rateLimit.ts — in-memory sliding-window rate limiter.
 * ─────────────────────────────────────────────────────
 * Per-process (pm2 single instance today). Not distributed — if the app is
 * ever scaled to multiple nodes, swap the Map for Redis/Upstash keeping the
 * same call shape. Keys are caller-chosen (e.g. `ai-chat:{ip}` or user id).
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
// Crude memory guard: a scripted scan across many IPs cannot grow the map
// unbounded. Clearing resets counters, which momentarily relaxes limits —
// acceptable for an abuse cap, not billing-grade accounting.
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying (0 when ok). */
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= opts.limit) {
    const retryAfterSec = Math.ceil((bucket.hits[0] + opts.windowMs - now) / 1000);
    return { ok: false, retryAfterSec: Math.max(retryAfterSec, 1) };
  }

  bucket.hits.push(now);
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP for rate-limit keys (nginx sets x-forwarded-for). */
export function clientIpFrom(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
