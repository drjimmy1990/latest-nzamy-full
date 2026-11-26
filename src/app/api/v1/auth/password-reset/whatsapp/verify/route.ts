import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyWhatsAppReset } from "@/lib/passwordReset/whatsappReset";
import { serverResetDeps } from "@/lib/passwordReset/whatsappResetServer";
import { WHATSAPP_UNAVAILABLE_AR } from "@/lib/passwordReset/passwordResetRules";

/**
 * POST /api/v1/auth/password-reset/whatsapp/verify — the code from WhatsApp
 * and the new password (batch l17). Signed-out.
 *
 * Body: { email, code, password, confirm }
 *   200 { ok: true }  the password is set (auth admin API) and the account's
 *       sessions are ended (their refresh tokens are gone; an access token
 *       already issued lapses at its expiry). After the answer, the account's
 *       e-mail is told (after()). No session is created here: the page sends
 *       the person to /login, so the lockout, suspension, security check and
 *       the staff two-step all still apply to the next sign-in.
 *   400 { code: "invalid_code", error: «الرمز غير صحيح أو انتهت صلاحيته» } —
 *       a wrong, expired, used or locked code, or an address with no
 *       account: one answer, held to one minimum time.
 *   400 { code: "weak_password" | "invalid_email" } · 429 { code:
 *       "rate_limited" } · 503 { code: "unavailable" | "password_not_set" }.
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

  // verify takes no security check of its own: the code is the secret, five
  // tries kill it, the proxy bucket limits each visitor and IP, and the core
  // limits each address.
  const answer = await verifyWhatsAppReset(serverResetDeps(svc, async () => "ok"), {
    email: body.email,
    code: body.code,
    password: body.password,
    confirm: body.confirm,
  });
  if (answer.background) after(answer.background);
  return NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE });
}
