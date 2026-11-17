/**
 * Server-side Cloudflare Turnstile check for Next API routes that guests call
 * without going through GoTrue (first user: POST
 * /api/v1/auth/lawyer-registry-lookup, launch batch R2).
 *
 * The password flows do NOT use this: GoTrue checks their token itself
 * (src/lib/auth/captcha.ts header). A Next route has to ask Cloudflare's
 * siteverify on its own, with the secret in the Next server's env:
 *   TURNSTILE_SECRET_KEY=<the same Secret key GoTrue uses>
 * in /www/wwwroot/nzamy/latest-nzamy-full/.env.local (server-only; never
 * NEXT_PUBLIC_).
 *
 * Pure apart from the injected fetch: no process.env here (the route passes
 * the values in), relative imports only, so `node --test` loads it.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstilePolicy = "verify" | "skip" | "misconfigured";

/**
 * With a secret: verify. Without one: skip outside production (local work),
 * refuse in production — a guest route that reads personal data must not
 * open up because an env line is missing.
 */
export function turnstilePolicy(secret: string | undefined | null, nodeEnv: string | undefined): TurnstilePolicy {
  if ((secret ?? "").trim()) return "verify";
  return nodeEnv === "production" ? "misconfigured" : "skip";
}

type FetchLike = (url: string, init: { method: string; body: URLSearchParams; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

/**
 * true only when Cloudflare says success for this token. A missing token, a
 * network error, a timeout or a malformed answer are all false.
 */
export async function verifyTurnstileToken(input: {
  secret: string;
  token: string | null | undefined;
  remoteIp?: string | null;
  fetchImpl: FetchLike;
  timeoutMs?: number;
}): Promise<boolean> {
  const token = (input.token ?? "").trim();
  if (!token || token.length > 4096) return false;
  const body = new URLSearchParams({ secret: input.secret, response: token });
  if (input.remoteIp && input.remoteIp !== "unknown") body.set("remoteip", input.remoteIp);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  try {
    const res = await input.fetchImpl(SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown } | null;
    return !!data && data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
