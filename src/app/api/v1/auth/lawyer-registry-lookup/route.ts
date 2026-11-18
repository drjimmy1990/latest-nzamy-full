import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rateLimit";
import { libraryReadClientKey } from "@/lib/rateLimitRoutes";
import { turnstilePolicy, verifyTurnstileToken } from "@/lib/auth/turnstileServer";
import { parseLookupBody, shapeLookupResult } from "@/lib/registry/lawyerRegistryLookup";

/**
 * POST /api/v1/auth/lawyer-registry-lookup — guest, used on the lawyer signup
 * page (launch batch R2/R3/R5; migration 20261122_40).
 *
 * Body: { licenseNumber?: string, fullName?: string, turnstileToken?: string }
 * 200 { status: "valid", name } | { status: "ambiguous" } | { status: "unverified" }
 * 400 bad input · 403 { code: "captcha" } · 429 too many · 503 { status: "unavailable" }
 *
 * Order: per-visitor limit (10 / 10 min) → body → Turnstile (siteverify,
 * TURNSTILE_SECRET_KEY; refused in production without it) → the service-role
 * RPC → the registry name only (owner 18 Nov, item 3.1): no licence number,
 * no expiry, no mobile digits; expired / unverifiable / not found are one
 * "unverified" — the registrant is never told about validity.
 *
 * Nothing is verified here: the answer only fills the form. The account stays
 * pending until an admin approves it (no OTP yet — R4); the admin queue shows
 * the registry match computed from the database, never from this answer.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const LIMIT = { limit: 10, windowMs: 10 * 60_000 };

export async function POST(request: NextRequest) {
  const peer = clientIpFrom(request);
  const visitor = libraryReadClientKey((name) => request.headers.get(name), peer);
  const rl = rateLimit(`lawyer-registry-lookup:${visitor}`, LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "محاولات كثيرة — حاول بعد قليل" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400, headers: NO_STORE });
  }
  const parsed = parseLookupBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  const policy = turnstilePolicy(secret, process.env.NODE_ENV);
  if (policy === "misconfigured") {
    console.error("[lawyer-registry-lookup] TURNSTILE_SECRET_KEY is not set — lookups refused");
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  if (policy === "verify") {
    const passed = await verifyTurnstileToken({
      secret: secret as string,
      token: parsed.input.turnstileToken,
      remoteIp: visitor,
      fetchImpl: fetch,
    });
    if (!passed) {
      return NextResponse.json(
        { error: "تعذّر اجتياز التحقق الأمني — أكمله مرة أخرى", code: "captcha" },
        { status: 403, headers: NO_STORE },
      );
    }
  }

  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("lawyer_registry_lookup", {
      p_licence: parsed.input.licenseNumber,
      p_full_name: parsed.input.fullName,
    });
    if (error) {
      // 42883/PGRST202 before 20261122_40 runs; anything else is logged by code only.
      console.error("[lawyer-registry-lookup] rpc failed:", error.code);
      return NextResponse.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json(shapeLookupResult(data), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
