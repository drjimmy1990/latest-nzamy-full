/**
 * publicViewCapServer.ts — the I/O half of publicViewCap.ts (batch l11, O18 /
 * A16): the settings (60-second memo), the subjects of one document open, the
 * call to public.library_public_view_hit (20261201_30), and the 429.
 *
 * Called by the four document routes right after spendLibraryDocument
 * (libraryDocQuota.ts), with the route's own answer to "does this viewer have
 * the full library?" — the proxy cannot know it without the tier, grant and
 * points reads, and counting before the route would spend a view on a 404.
 *
 * WHILE THE CAP IS OFF (the shipped state) this does one memoised settings
 * read per minute per process and nothing else: no database call per request,
 * no DNS lookup.
 *
 * FAILS OPEN, ALWAYS: no key, a missing column or function (the SQL not run
 * yet), a timeout or any error → null, and the read goes on as before.
 */
import { NextResponse } from "next/server";
import { isSupabaseMode } from "@/lib/runtimeMode";
import { resolveClientIp } from "@/lib/rateLimit";
import { libraryReadClientKey } from "@/lib/rateLimitRoutes";
import { libraryQuotaTarget } from "./readQuota";
import { LIBRARY_SESSION_COOKIE, librarySessionId, libraryPassSecret } from "./publicGuard";
import { claimFromHeaders } from "./crawlerVerify";
import { isVerifiedCrawler } from "./crawlerVerifyServer";
import {
  PUBLIC_VIEW_SELECT,
  parsePublicViewRow,
  publicViewRefusal,
  publicViewSettingsFromRow,
  subjectHash,
  viewerSubjects,
  type PublicViewSettings,
} from "./publicViewCap";

const TTL_MS = 60 * 1000;
const FAIL_TTL_MS = 15 * 1000;
const TIMEOUT_MS = 1_500;
const MISSING_RETRY_MS = 10 * 60 * 1000;

let cached: { value: PublicViewSettings; expiresAt: number } | null = null;
let inflight: Promise<PublicViewSettings> | null = null;
let functionMissingUntil = 0;

function defaults(): PublicViewSettings {
  return publicViewSettingsFromRow(null);
}

async function fetchSettings(): Promise<{ value: PublicViewSettings; ok: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { value: defaults(), ok: false };
  try {
    const select = encodeURIComponent(PUBLIC_VIEW_SELECT.replace(/\s+/g, ""));
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/library_monitor_settings?select=${select}&id=eq.true`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // 400 = a column is missing (20261201_30 not run yet): the cap stays off.
    if (!res.ok) return { value: defaults(), ok: res.status === 400 };
    const rows: unknown = await res.json();
    const row = Array.isArray(rows) && rows[0] && typeof rows[0] === "object" ? (rows[0] as Record<string, unknown>) : null;
    return { value: publicViewSettingsFromRow(row), ok: true };
  } catch {
    return { value: defaults(), ok: false };
  }
}

/** The protection settings now (memoised 60 s; 15 s after a failed read). Never throws. */
export async function loadPublicViewSettings(): Promise<PublicViewSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (inflight) return inflight;
  inflight = fetchSettings()
    .then(({ value, ok }) => {
      cached = { value, expiresAt: Date.now() + (ok ? TTL_MS : FAIL_TTL_MS) };
      return value;
    })
    .catch(() => defaults())
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The key the subjects are hashed with: the library pass secret, else the service key. */
export function viewHashSecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return libraryPassSecret(env) ?? (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
}

/** The nz_lib_sid cookie of a plain Request (the routes get a Request, not a NextRequest). */
export function sessionIdFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === LIBRARY_SESSION_COOKIE) return librarySessionId(part.slice(eq + 1).trim());
  }
  return null;
}

/** The visitor's address as every library bucket reads it (X-Real-IP first, the Cloudflare chain). */
export function visitorAddress(getHeader: (name: string) => string | null): string | null {
  const ip = libraryReadClientKey(getHeader, resolveClientIp(getHeader));
  return ip && ip !== "unknown" ? ip : null;
}

/**
 * Q100a (batch l12, publicListCapServer.ts): is this request a crawler of the
 * closed list, its switch on, PROVEN by its address? The list cap never
 * counts one. The same proof as the view cap below — the User-Agent only
 * names which provider to check.
 */
export async function provenCrawlerRequest(request: Request, settings: PublicViewSettings): Promise<boolean> {
  const getHeader = (name: string) => request.headers.get(name);
  const address = visitorAddress(getHeader);
  const claim = claimFromHeaders(getHeader);
  if (!claim.crawler || !address || !settings.crawlers[claim.crawler.id]?.on) return false;
  return isVerifiedCrawler(claim.crawler, address);
}

async function callHit(body: Record<string, unknown>): Promise<unknown> {
  if (Date.now() < functionMissingUntil) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/library_public_view_hit`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = json && typeof json === "object" ? (json as { code?: unknown }).code : undefined;
    if (code === "PGRST202" || code === "42883" || res.status === 404) functionMissingUntil = Date.now() + MISSING_RETRY_MS;
    else console.error("[library-view-cap] call failed:", res.status);
    return null;
  }
  return json;
}

/**
 * Counts one document open of a viewer WITHOUT full library access. null = go
 * on; a NextResponse = the 429 to return as it is. `hasFullLibrary` is the
 * route's own subscriber answer (a subscriber is never counted here: his own
 * caps are library_read_quota_hit's).
 */
export async function spendPublicView(
  request: Request,
  viewer: { userId: string | null; hasFullLibrary: boolean },
): Promise<NextResponse | null> {
  if (viewer.hasFullLibrary || !isSupabaseMode) return null;
  try {
    const target = libraryQuotaTarget(request.method, new URL(request.url).pathname);
    if (!target || target.kind !== "doc") return null;
    const settings = await loadPublicViewSettings();
    if (!settings.enabled) return null;

    const getHeader = (name: string) => request.headers.get(name);
    const address = visitorAddress(getHeader);
    const claim = claimFromHeaders(getHeader);
    let verifiedCrawlerId: string | null = null;
    let verified: boolean | null = null;
    if (claim.crawler && address && settings.crawlers[claim.crawler.id]?.on) {
      verified = await isVerifiedCrawler(claim.crawler, address);
      if (verified) verifiedCrawlerId = claim.crawler.id;
    }
    const secret = viewHashSecret();
    const sid = viewer.userId ? null : sessionIdFromCookieHeader(getHeader("cookie"));
    const subjects = viewerSubjects({
      userId: viewer.userId,
      sessionHash: sid ? await subjectHash(secret, "sid", sid) : null,
      addressHash: !viewer.userId && address ? await subjectHash(secret, "addr", address) : null,
      verifiedCrawlerId,
      agentId: claim.agent?.id ?? null,
    });
    if (subjects.length === 0) return null;

    const row = parsePublicViewRow(
      await callHit({
        p_doc_key: target.docKey,
        p_subjects: subjects,
        p_crawler: claim.crawler?.id ?? null,
        p_crawler_verified: verified,
      }),
    );
    const refusal = publicViewRefusal(row, settings, Date.now());
    if (!refusal) return null;
    const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
    if (refusal.retryAfterSeconds !== null) headers["Retry-After"] = String(refusal.retryAfterSeconds);
    return NextResponse.json(refusal.body, { status: refusal.status, headers });
  } catch {
    return null;
  }
}
