import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { rateLimit } from "@/lib/rateLimit";
import { sendAdminTestCode } from "@/lib/phoneOtp/service";

/**
 * POST /api/v1/admin/phone-otp/test-send — «أرسل رمزًا تجريبيًا إلى جوالي» (batch
 * l15): one WhatsApp code through the live template to the signed-in super
 * admin's OWN profile mobile. The operator's live probe before the switch-on.
 * Answers only { result: "sent" | "unavailable" | "failed" | "no_phone",
 * httpStatus } — Zernio's HTTP status, never its body, the key or the number.
 * The code is not stored and confirms nothing. 3 per 10 minutes.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST() {
  const gate = await requireStaff("settings.write");
  if (!gate.ok) return gate.response;
  const rl = rateLimit(`admin-phone-otp-test:${gate.userId}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "انتظر قليلًا قبل رمز تجريبي آخر." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  try {
    const out = await sendAdminTestCode(await createServiceClient(), gate.userId);
    await logAdminAction({
      actorId: gate.userId,
      action: "phone_otp_test_sent",
      targetType: "platform_setting",
      targetId: "signup_phone_otp",
      before: null,
      after: { result: out.result, http_status: out.httpStatus },
    });
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/phone-otp/test]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر الإرسال التجريبي الآن." }, { status: 503, headers: NO_STORE });
  }
}
