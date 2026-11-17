/**
 * The gate every /api/v1/lawyer/signup-verification/* route opens with.
 * Server-only.
 *
 *   - the edge already answers 401 without a session (/api/v1/lawyer/ is a
 *     protected prefix, src/lib/auth/routeAccess.ts);
 *   - assertRole(["lawyer"]) + userType === "lawyer": a platform admin (whom
 *     assertRole always admits) has no signup to verify;
 *   - a per-process limit per user AND per IP on top of the database limits
 *     (lawyer_otp_issue: cooldown, per-user, per-target).
 */

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rateLimit";
import { HOLD_MESSAGE_AR } from "./decision.ts";
import { SignupUnavailable } from "./service.ts";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

type Svc = Awaited<ReturnType<typeof createServiceClient>>;
type Gate = { ok: true; user: User; svc: Svc } | { ok: false; response: NextResponse };

export async function signupGate(
  request: Request,
  bucket: string,
  limit: { perUser: number; perIp: number; windowMs: number },
): Promise<Gate> {
  const auth = await assertRole(["lawyer"]);
  if (!auth.ok) return auth;
  if (auth.userType !== "lawyer") {
    return {
      ok: false,
      response: NextResponse.json({ error: "التحقق من الترخيص لحسابات المحامين فقط." }, { status: 403, headers: NO_STORE }),
    };
  }
  const ip = clientIpFrom(request);
  const byUser = rateLimit(`lawyer-signup:${bucket}:u:${auth.user.id}`, { limit: limit.perUser, windowMs: limit.windowMs });
  const byIp = rateLimit(`lawyer-signup:${bucket}:ip:${ip}`, { limit: limit.perIp, windowMs: limit.windowMs });
  if (!byUser.ok || !byIp.ok) {
    const retry = Math.max(byUser.retryAfterSec, byIp.retryAfterSec);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "محاولات كثيرة — حاول بعد قليل", retryAfterSec: retry },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(retry) } },
      ),
    };
  }
  return { ok: true, user: auth.user, svc: await createServiceClient() };
}

/** Any failure becomes the hold path, never a dead end and never a stack trace. */
export function signupFailure(where: string, err: unknown): NextResponse {
  if (err instanceof SignupUnavailable) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً", holdMessage: HOLD_MESSAGE_AR, code: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
  console.error(`[lawyer/signup-verification ${where}]`, err instanceof Error ? err.message : err);
  return NextResponse.json(
    { error: "خطأ غير متوقع", holdMessage: HOLD_MESSAGE_AR },
    { status: 500, headers: NO_STORE },
  );
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Multipart limits (same allowance as /api/v1/lawyer/licence-image). */
export const MULTIPART_ALLOWANCE = 64 * 1024;
