import { NextRequest, NextResponse } from "next/server";
import { startIdentityOtp } from "@/lib/lawyerSignup/service";
import { NO_STORE, readJson, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";
import { HOLD_MESSAGE_AR } from "@/lib/lawyerSignup/decision";

/**
 * POST /api/v1/lawyer/signup-verification/identity/start — send the identity
 * code (decision ٢١). Body: { channel: "whatsapp" | "sms" }. NO number in the
 * body: the server sends ONLY to the mobile the lawyers' registry holds for
 * the licence on his file. WhatsApp first; SMS after 60 s or by the button.
 *
 * 200 { ok: true, channel, hint (last two digits), resendAfterSec, expiresInSec }
 * 409 not at this step · 429 cooldown / limits · 503 channel unavailable
 * (then the page shows «سجّلنا بياناتك وسنتواصل معك»).
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await signupGate(request, "identity-start", { perUser: 6, perIp: 20, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  const body = await readJson(request);
  const channel = body?.channel === "sms" ? "sms" : body?.channel === "whatsapp" ? "whatsapp" : null;
  if (!channel) return NextResponse.json({ error: "قناة غير صالحة" }, { status: 400, headers: NO_STORE });
  try {
    const out = await startIdentityOtp(gate.svc, gate.user, channel);
    if (out.ok) return NextResponse.json(out, { headers: NO_STORE });
    const status =
      out.reason === "cooldown" || out.reason === "user_limit" || out.reason === "target_limit" ? 429
      : out.reason === "not_now" || out.reason === "already" ? 409
      : 503;
    return NextResponse.json(
      { ...out, holdMessage: status === 503 ? HOLD_MESSAGE_AR : null },
      { status, headers: { ...NO_STORE, ...(out.retryAfterSec ? { "Retry-After": String(out.retryAfterSec) } : {}) } },
    );
  } catch (err) {
    return signupFailure("identity/start", err);
  }
}
