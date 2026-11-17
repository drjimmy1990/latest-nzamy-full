import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/lawyerSignup/service";
import { NO_STORE, readJson, signupFailure, signupGate } from "@/lib/lawyerSignup/routeGate";
import { cleanOtpInput } from "@/lib/lawyerSignup/otpCode";

/** POST /api/v1/lawyer/signup-verification/email/verify — Body: { code }. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await signupGate(request, "email-verify", { perUser: 15, perIp: 40, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  const code = cleanOtpInput((await readJson(request))?.code);
  if (!code) return NextResponse.json({ ok: false, reason: "format", error: "الرمز ستة أرقام" }, { status: 400, headers: NO_STORE });
  try {
    const out = await verifyOtp(gate.svc, gate.user, "email", code);
    return NextResponse.json(out, { status: out.ok ? 200 : out.reason === "unavailable" ? 503 : 400, headers: NO_STORE });
  } catch (err) {
    return signupFailure("email/verify", err);
  }
}
