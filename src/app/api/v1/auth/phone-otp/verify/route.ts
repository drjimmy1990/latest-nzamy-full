import { NextRequest, NextResponse } from "next/server";
import { phoneOtpGated, verifyPhoneOtp } from "@/lib/phoneOtp/service";
import { NO_STORE, phoneOtpFailure, phoneOtpGate, readJsonBody } from "@/lib/phoneOtp/routeGate";
import { cleanOtpInput } from "@/lib/lawyerSignup/otpCode";

/**
 * POST /api/v1/auth/phone-otp/verify — confirm the WhatsApp code (batch l15).
 * Body: { code } — six digits, Arabic-Indic digits accepted.
 * 200 { ok: true, home } · 409 { code: "phone_otp_not_required" } (switch
 * off, an older / staff / test / already-confirmed account) · 400 { reason: "wrong" | "expired" | "locked" |
 * "phone_changed" | "no_phone", error, attemptsLeft? } · 503 unavailable.
 * A hit stamps profiles.phone_verified_at in the database (phone_otp_verify).
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await phoneOtpGate(request, "verify", { perUser: 15, perIp: 60, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request);
  const code = cleanOtpInput(body?.code);
  if (!code) {
    return NextResponse.json(
      { ok: false, reason: "wrong", error: "أدخل الرمز المكوّن من ستة أرقام." },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    // Only an account the switch holds may confirm (switch off = no change).
    if (!(await phoneOtpGated(gate.svc, gate.user.id))) {
      return NextResponse.json(
        { ok: false, code: "phone_otp_not_required", error: "لا يلزم حسابك تأكيد رقم الجوال." },
        { status: 409, headers: NO_STORE },
      );
    }
    const out = await verifyPhoneOtp(gate.svc, gate.user, code);
    if (out.ok) return NextResponse.json(out, { headers: NO_STORE });
    return NextResponse.json(out, { status: out.reason === "unavailable" ? 503 : 400, headers: NO_STORE });
  } catch (err) {
    return phoneOtpFailure("verify", err);
  }
}
