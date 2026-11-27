import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { rateLimit } from "@/lib/rateLimit";
import { renderEmailAr, sendEmailDetailed } from "@/lib/email/sendEmail";
import { emailEnvReport, explainEmailSend } from "@/lib/email/emailDiagnostics";

/**
 * POST /api/v1/admin/email/test-send — «أرسل بريدًا تجريبيًا إلى بريدي» (batch
 * l19, LIVE-18): one test mail through the platform's one sender
 * (sendEmail.ts) to the signed-in admin's OWN account address — read from
 * the auth user, never from the request. Super admin only (settings.write),
 * 3 per 10 minutes, audited.
 *
 * Answers { result, errorClass, messageAr, provider, code, originalCode,
 * responseCode, httpStatus }: the result, an honest Arabic sentence, and the error / reply
 * codes only — never the server's reply text, an address or a secret.
 * "sent" means the mail server ACCEPTED the message; arrival is checked in
 * the inbox.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST() {
  const gate = await requireStaff("settings.write");
  if (!gate.ok) return gate.response;
  const rl = rateLimit(`admin-email-test:${gate.userId}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "انتظر قليلًا قبل بريد تجريبي آخر." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  try {
    const svc = await createServiceClient();
    const { data, error } = await svc.auth.admin.getUserById(gate.userId);
    const to = error ? "" : (data?.user?.email ?? "").trim();
    if (!to) {
      return NextResponse.json(
        { result: "failed", errorClass: "bad_recipient", messageAr: "لا يوجد عنوان بريد في حسابك." },
        { headers: NO_STORE },
      );
    }

    const when = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date());
    const mail = renderEmailAr({
      heading: "رسالة اختبار من نظامي",
      paragraphs: [
        "هذه رسالة اختبار أرسلتها من لوحة الإدارة للتأكد من أن بريد المنصة يعمل.",
        "إن وصلتك فإرسال البريد من التطبيق سليم. لا يلزمك أي إجراء.",
      ],
      details: [["وقت الإرسال", when]],
      footer: ["أُرسلت بطلبك من: لوحة الإدارة ← الإعدادات ← اختبار إرسال بريد."],
    });
    const detail = await sendEmailDetailed({
      to,
      subject: "رسالة اختبار من نظامي",
      text: mail.text,
      html: mail.html,
      tag: "admin_email_test",
      userIds: [gate.userId],
    });
    const explained = explainEmailSend(detail, emailEnvReport(process.env).smtpMissing);

    await logAdminAction({
      actorId: gate.userId,
      action: "email_test_sent",
      targetType: "platform_setting",
      targetId: "email",
      before: null,
      after: {
        result: detail.result,
        error_class: explained.errorClass,
        provider: detail.provider,
        code: detail.failure?.code ?? null,
        original_code: detail.failure?.originalCode ?? null,
        response_code: detail.failure?.responseCode ?? null,
      },
    });

    return NextResponse.json(
      {
        result: detail.result,
        errorClass: explained.errorClass,
        messageAr: explained.messageAr,
        provider: detail.provider,
        code: detail.failure?.code ?? null,
        originalCode: detail.failure?.originalCode ?? null,
        responseCode: detail.failure?.responseCode ?? null,
        httpStatus: detail.failure?.httpStatus ?? null,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/email/test-send]", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "تعذّر الإرسال التجريبي الآن." }, { status: 503, headers: NO_STORE });
  }
}
