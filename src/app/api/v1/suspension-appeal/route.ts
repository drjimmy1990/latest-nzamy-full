import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { APPEAL_AR, parseAppeal } from "@/lib/auth/suspensionTerms";
import { insertAppealWith } from "@/lib/accountSuspension/suspensionServer";

/**
 * POST /api/v1/suspension-appeal  { email, message } — owner س٢١٥: the right
 * of appeal against an admin suspension. Public: a suspended account cannot
 * sign in (GoTrue refuses it), so the form on /account-suspended asks for the
 * account's e-mail instead of a session.
 *
 * When the e-mail is an account with an open suspension, one appeal is
 * recorded on it (public.account_suspension_appeals, 20261206_20; a second
 * one while the first waits is ignored). The answer is the SAME whether or not
 * the e-mail matched — the form never tells anyone whether an address is an
 * account or whether it is suspended. The administration sees the appeal on
 * the account's page and answers it there (lift, or reject with a note).
 *
 * Rate limit: the proxy's strict bucket (src/lib/rateLimitRoutes.ts), as the
 * contact form. 500 only when the database could not be asked at all.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: APPEAL_AR.required }, { status: 400 });
  }
  const parsed = parseAppeal(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const admin = await createServiceClient();
    const outcome = await insertAppealWith(admin, { email: parsed.email, message: parsed.message });
    if (outcome.state === "failed" || outcome.state === "migration_missing") {
      console.error("[suspension-appeal] could not record the appeal:", outcome.state === "failed" ? outcome.error : "20261206_20 not applied");
      return NextResponse.json({ error: APPEAL_AR.failed }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: APPEAL_AR.received });
  } catch (err) {
    console.error("[suspension-appeal] POST error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: APPEAL_AR.failed }, { status: 500 });
  }
}
