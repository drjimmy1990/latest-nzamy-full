import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIpFrom } from "@/lib/rateLimit";
import { turnstilePolicy, verifyTurnstileToken } from "@/lib/auth/turnstileServer";
import { startWhatsAppReset } from "@/lib/passwordReset/whatsappReset";
import { serverResetDeps } from "@/lib/passwordReset/whatsappResetServer";
import { WHATSAPP_UNAVAILABLE_AR } from "@/lib/passwordReset/passwordResetRules";

/**
 * POST /api/v1/auth/password-reset/whatsapp/start — «أرسل رمزًا إلى واتساب»
 * on /forgot-password (batch l17). Signed-out: no session is read or made.
 *
 * Body: { email, turnstileToken } — or { phone, turnstileToken } with the
 * confirmed Saudi mobile in place of the e-mail (batch l18, LIVE-06).
 *   200 { ok: true, message }  the SAME answer for every well-formed address
 *       once the security check passed — an account or not, a confirmed
 *       mobile or not, staff, suspended, over a limit. The code (if any) goes
 *       out after the answer (after()), to the account's confirmed mobile.
 *   400 { code: "invalid_email" | "invalid_phone" } · 403 { code: "captcha" } · 503 { code:
 *       "unavailable" } (WhatsApp sending or the switch off, or the security
 *       check not configured in production — the status route then answers
 *       { whatsapp: false } too). None of these depends on the account.
 * The proxy's per-visitor / per-IP bucket (rateLimitRoutes.ts,
 * password-reset-whatsapp) runs first; the core limits each address, and the
 * database caps codes per account and per number.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch {
    body = {};
  }

  let svc: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    svc = await createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, code: "unavailable", error: WHATSAPP_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
  }

  const ip = clientIpFrom(request);
  const captcha = async (): Promise<"ok" | "failed" | "misconfigured"> => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    const policy = turnstilePolicy(secret, process.env.NODE_ENV);
    if (policy === "misconfigured") return "misconfigured";
    if (policy === "skip") return "ok";
    const passed = await verifyTurnstileToken({
      secret: secret as string,
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
      remoteIp: ip,
      fetchImpl: fetch,
    });
    return passed ? "ok" : "failed";
  };

  const answer = await startWhatsAppReset(serverResetDeps(svc, captcha), { email: body.email, phone: body.phone });
  if (answer.background) after(answer.background);
  return NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE });
}
