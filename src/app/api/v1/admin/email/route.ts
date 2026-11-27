import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { emailEnvReport } from "@/lib/email/emailDiagnostics";

/**
 * GET /api/v1/admin/email — the diagnostic of «اختبار إرسال بريد» (batch l19,
 * LIVE-18): which e-mail variables this server has (SET or not — never a
 * value; SMTP_USER / SMTP_PASS / RESEND_API_KEY are booleans only), the
 * provider the sender would use, what SMTP still lacks, the mail server's
 * host, port and TLS mode, and the From address every mail carries.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  return NextResponse.json(emailEnvReport(process.env), { headers: NO_STORE });
}
