import { NextRequest, NextResponse } from "next/server";
import { evaluate, verifyOtp } from "@/lib/lawyerSignup/service";
import { NO_STORE, readJson, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";
import { cleanOtpInput } from "@/lib/lawyerSignup/otpCode";

/**
 * POST /api/v1/lawyer/signup-verification/email/verify — Body: { code }.
 * The e-mail code is the signup's one code (decision ٢٧). Five wrong tries
 * kill a code (lawyer_otp_verify, atomic). On success the state is
 * re-evaluated: with LAWYER_INSTANT_APPROVAL=on and every condition met, the
 * account is approved here.
 * 200 { ok: true, state } · 400 { ok: false, reason, attemptsLeft? }
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await signupGate(request, "email-verify", { perUser: 15, perIp: 40, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  const code = cleanOtpInput((await readJson(request))?.code);
  if (!code) return NextResponse.json({ ok: false, reason: "format", error: "الرمز ستة أرقام" }, { status: 400, headers: NO_STORE });
  try {
    const out = await verifyOtp(gate.svc, gate.user, "email", code);
    if (!out.ok) return NextResponse.json(out, { status: out.reason === "unavailable" ? 503 : 400, headers: NO_STORE });
    return NextResponse.json({ ok: true, state: await evaluate(gate.svc, gate.user) }, { headers: NO_STORE });
  } catch (err) {
    return signupFailure("email/verify", err);
  }
}
