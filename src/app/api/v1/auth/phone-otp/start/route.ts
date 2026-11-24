import { NextRequest, NextResponse } from "next/server";
import { readPhoneStatus, startPhoneOtp } from "@/lib/phoneOtp/service";
import { NO_STORE, phoneOtpFailure, phoneOtpGate, readJsonBody } from "@/lib/phoneOtp/routeGate";
import { turnstilePolicy, verifyTurnstileToken } from "@/lib/auth/turnstileServer";

/**
 * POST /api/v1/auth/phone-otp/start — send a six-digit code over WhatsApp to
 * the signed-in user's own mobile (batch l15).
 *
 * Body: { phone?: string, turnstileToken?: string }
 *   phone — «تغيير الرقم»: moves profiles.phone to this Saudi mobile first
 *           (any earlier confirmation is cleared by the database).
 *   turnstileToken — the security check, required before the FIRST code of
 *           the account and on a change of number.
 *
 * 200 { ok, masked, resendAfterSec, expiresInSec }
 * 400 bad number · 403 { code: "captcha" } · 409 { code:
 * "phone_otp_not_required" } (switch off, an older / staff / test / confirmed
 * account) / already confirmed / number taken · 429 limits (60 s, 5 an hour, 10 a day, per number) · 503 WhatsApp
 * could not send («تعذّر إرسال الرمز الآن، حاول بعد قليل») — never a fake success.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await phoneOtpGate(request, "start", { perUser: 8, perIp: 30, windowMs: 10 * 60_000 });
  if (!gate.ok) return gate.response;
  const body = (await readJsonBody(request)) ?? {};
  const newPhone = typeof body.phone === "string" && body.phone.trim() !== "" ? body.phone : null;

  try {
    const status = await readPhoneStatus(gate.svc, gate.user);
    // Only an account the switch holds may ask for a code: nothing is sent
    // (and nothing can be confirmed) while the switch is off, nor for an
    // older, staff, test or already-confirmed account.
    if (!status.required) {
      return NextResponse.json(
        { ok: false, code: "phone_otp_not_required", error: "لا يلزم حسابك تأكيد رقم الجوال." },
        { status: 409, headers: NO_STORE },
      );
    }
    if (!status.sentBefore || newPhone !== null) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      const policy = turnstilePolicy(secret, process.env.NODE_ENV);
      if (policy === "misconfigured") {
        console.error("[auth/phone-otp start] TURNSTILE_SECRET_KEY is not set — codes refused");
        return phoneOtpFailure("start", new Error("turnstile misconfigured"));
      }
      if (policy === "verify") {
        const passed = await verifyTurnstileToken({
          secret: secret as string,
          token: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
          remoteIp: gate.ip,
          fetchImpl: fetch,
        });
        if (!passed) {
          return NextResponse.json(
            { error: "أكمل التحقق الأمني ثم أعد المحاولة.", code: "captcha" },
            { status: 403, headers: NO_STORE },
          );
        }
      }
    }

    const out = await startPhoneOtp(gate.svc, gate.user, { newPhone });
    if (out.ok) return NextResponse.json(out, { headers: NO_STORE });
    const httpStatus =
      out.reason === "bad_phone" || out.reason === "no_phone" ? 400
      : out.reason === "already" || out.reason === "phone_taken" ? 409
      : out.reason === "cooldown" || out.reason === "user_limit" || out.reason === "daily_limit" || out.reason === "target_limit" ? 429
      : 503;
    const headers: Record<string, string> = { ...NO_STORE };
    if (httpStatus === 429 && out.retryAfterSec) headers["Retry-After"] = String(out.retryAfterSec);
    return NextResponse.json(out, { status: httpStatus, headers });
  } catch (err) {
    return phoneOtpFailure("start", err);
  }
}
