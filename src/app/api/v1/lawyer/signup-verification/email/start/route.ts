import { NextRequest, NextResponse } from "next/server";
import { startEmailOtp } from "@/lib/lawyerSignup/service";
import { NO_STORE, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";
import { THROWAWAY_EMAIL_AR } from "@/lib/lawyerSignup/throwawayEmail";

/**
 * POST /api/v1/lawyer/signup-verification/email/start — a code to the
 * account's OWN e-mail — the signup's one code (decision ٢٧: it replaced the
 * registry-mobile code). No address in the body. A throwaway domain is refused (400).
 * Needs LAWYER_OTP_EMAIL=on + RESEND_API_KEY + EMAIL_FROM; else 503.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await signupGate(request, "email-start", { perUser: 6, perIp: 20, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  try {
    const out = await startEmailOtp(gate.svc, gate.user);
    if (out.ok) return NextResponse.json(out, { headers: NO_STORE });
    const status =
      out.reason === "throwaway" ? 400
      : out.reason === "cooldown" || out.reason === "user_limit" || out.reason === "target_limit" ? 429
      : out.reason === "already" ? 409
      : 503;
    return NextResponse.json(
      { ...out, error: out.reason === "throwaway" ? THROWAWAY_EMAIL_AR : undefined },
      { status, headers: NO_STORE },
    );
  } catch (err) {
    return signupFailure("email/start", err);
  }
}
