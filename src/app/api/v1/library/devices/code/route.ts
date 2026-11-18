import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { maskEmail, renderEmailAr, sendEmail } from "@/lib/email/sendEmail";
import { deviceCodeEmail, deviceCodePepper, deviceLabelFromUserAgent, hashDeviceCode } from "@/lib/library/deviceLimit";
import { currentDeviceHash, deviceCodesAvailable } from "@/lib/library/deviceLimitServer";
import { headers } from "next/headers";

/**
 * POST /api/v1/library/devices/code — send the e-mail code of THIS browser,
 * a new library device waiting for verification (owner ٤٠, 18 Nov 2026:
 * «كل جهاز جديد يتطلب رمز تحقق على البريد»; 20261127_60).
 *
 * The user comes from the session; the device from the httpOnly device cookie
 * (only the browser that holds it can ask). The code (six digits) is e-mailed
 * to the account's own address; only its HMAC is stored
 * (library_device_code_issue: 10 minutes, one send per 60 seconds). Nothing
 * is read from the request body.
 *
 *   200 { sent: true, to: "a***@d***" }
 *   409 not_pending   this device does not wait for a code
 *   429 cooldown      { retryAfter } seconds
 *   503 unavailable   e-mail or the code key is not configured, or 20261127_60 has not run
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (isAuthUnavailable(user, error)) return authUnavailableResponse();
    if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401, headers: NO_STORE });
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;

    const pepper = deviceCodePepper(process.env);
    if (!pepper || !deviceCodesAvailable() || !user.email) {
      return NextResponse.json(
        { error: "تعذّر إرسال رمز التحقق الآن. تواصل مع الدعم الفني.", code: "unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    const hash = await currentDeviceHash();
    if (!hash) {
      return NextResponse.json(
        { error: "هذا المتصفح لا يحمل معرّف جهاز. افتح المكتبة أولاً ثم اطلب الرمز.", code: "not_pending" },
        { status: 409, headers: NO_STORE },
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const service = await createServiceClient();
    const { data, error: rpcError } = await service.rpc("library_device_code_issue", {
      p_user: user.id,
      p_device_hash: hash,
      p_code_hash: hashDeviceCode(pepper, user.id, hash, code),
    });
    if (rpcError) {
      const missing = rpcError.code === "PGRST202" || rpcError.code === "42883";
      if (!missing) console.error("[library devices code] issue failed:", rpcError.code ?? "no-code");
      return NextResponse.json(
        { error: "تعذّر إرسال رمز التحقق الآن. حاول بعد قليل.", code: "unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    const answer = (data ?? {}) as { state?: string; retry_after?: number };
    if (answer.state === "cooldown") {
      const retryAfter = typeof answer.retry_after === "number" ? answer.retry_after : 60;
      return NextResponse.json(
        { error: "أُرسل رمز قبل قليل. انتظر دقيقة قبل طلب رمز جديد.", code: "cooldown", retryAfter },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
      );
    }
    if (answer.state !== "issued") {
      return NextResponse.json(
        { error: "هذا الجهاز لا ينتظر رمز تحقق. أعد تحميل الصفحة.", code: "not_pending" },
        { status: 409, headers: NO_STORE },
      );
    }

    const label = deviceLabelFromUserAgent((await headers()).get("user-agent"));
    const mail = deviceCodeEmail(code, label);
    const rendered = renderEmailAr({ heading: mail.heading, paragraphs: mail.paragraphs });
    const sent = await sendEmail({
      to: user.email,
      subject: mail.subject,
      text: rendered.text,
      html: rendered.html,
      tag: "library_device_code",
    });
    if (sent !== "sent") {
      return NextResponse.json(
        { error: "تعذّر إرسال البريد الآن. حاول بعد دقيقة.", code: "unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.json({ sent: true, to: maskEmail(user.email) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[library devices code] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500, headers: NO_STORE });
  }
}
