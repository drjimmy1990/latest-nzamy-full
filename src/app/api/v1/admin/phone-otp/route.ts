import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { readZernioConfig } from "@/lib/phoneOtp/zernioWhatsApp";
import { otpPepper } from "@/lib/lawyerSignup/otpCode";
import { signupPhoneOtpFrom, SIGNUP_PHONE_OTP_KEY } from "@/lib/phoneOtp/phoneOtpRules";

/**
 * GET /api/v1/admin/phone-otp — the diagnostic of «رمز التحقق عبر واتساب عند
 * التسجيل» (batch l15): whether each server variable is SET (never its
 * value), the template name and language, and the switch with its cutoff.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  const z = readZernioConfig(process.env);
  let setting = signupPhoneOtpFrom(null);
  let settingRead = false;
  try {
    const svc = await createServiceClient();
    const { data, error } = await svc.from("platform_settings").select("value").eq("key", SIGNUP_PHONE_OTP_KEY).maybeSingle();
    if (!error) {
      settingRead = data !== null;
      setting = signupPhoneOtpFrom(data?.value ?? null);
    }
  } catch {
    // the diagnostic still answers; settingRead says the row was not read
  }
  return NextResponse.json(
    {
      apiKeySet: z.apiKey !== null,
      accountIdSet: z.accountId !== null,
      pepperSet: otpPepper(process.env.LAWYER_OTP_PEPPER) !== null,
      template: z.template,
      language: z.language,
      ready: z.ready && otpPepper(process.env.LAWYER_OTP_PEPPER) !== null,
      settingRead,
      enabled: setting.enabled,
      enabledAt: setting.enabledAt,
    },
    { headers: NO_STORE },
  );
}
