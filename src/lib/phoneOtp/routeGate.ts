/**
 * The gate every /api/v1/auth/phone-otp/* route opens with (batch l15).
 * Server-only.
 *
 *   - a signed-in user only (requireApiUser: 401 / 503 on a transport fault,
 *     a frozen or suspended account refused);
 *   - a per-process limit per user AND per address on top of the database
 *     limits (phone_otp_issue: 60 s, 5 an hour and 10 a day per account,
 *     10 a day per number across accounts).
 * These paths are open to a held account in the proxy (phoneOtpRules.ts).
 */

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { clientIpFrom, rateLimit } from "@/lib/rateLimit";
import { PhoneOtpUnavailable } from "./service";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

type Svc = Awaited<ReturnType<typeof createServiceClient>>;
type Gate = { ok: true; user: User; svc: Svc; ip: string } | { ok: false; response: NextResponse };

export async function phoneOtpGate(
  request: Request,
  bucket: string,
  limit: { perUser: number; perIp: number; windowMs: number },
): Promise<Gate> {
  const supabase = await createClient();
  const auth = await requireApiUser(supabase, { error: "سجّل دخولك أولًا." });
  if (auth instanceof NextResponse) return { ok: false, response: auth };
  const ip = clientIpFrom(request);
  const byUser = rateLimit(`phone-otp:${bucket}:u:${auth.user.id}`, { limit: limit.perUser, windowMs: limit.windowMs });
  const byIp = rateLimit(`phone-otp:${bucket}:ip:${ip}`, { limit: limit.perIp, windowMs: limit.windowMs });
  if (!byUser.ok || !byIp.ok) {
    const retry = Math.max(byUser.retryAfterSec, byIp.retryAfterSec);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "محاولات كثيرة — حاول بعد قليل.", retryAfterSec: retry },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(retry) } },
      ),
    };
  }
  return { ok: true, user: auth.user, svc: await createServiceClient(), ip };
}

/** Any failure: an honest «try later», never a stack trace. */
export function phoneOtpFailure(where: string, err: unknown): NextResponse {
  if (!(err instanceof PhoneOtpUnavailable)) {
    console.error(`[auth/phone-otp ${where}]`, err instanceof Error ? err.message : err);
  }
  return NextResponse.json(
    { error: "الخدمة غير متاحة مؤقتًا، حاول بعد قليل.", code: "unavailable" },
    { status: 503, headers: NO_STORE },
  );
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
