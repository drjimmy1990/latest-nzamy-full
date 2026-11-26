import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import {
  BREAK_GLASS_MAX_MINUTES,
  BREAK_GLASS_MIN_MINUTES,
  BREAK_GLASS_REASON_MAX,
  BREAK_GLASS_REASON_MIN,
  breakGlassErrorResponse,
} from "@/lib/admin/breakGlass";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/admin/restricted-cases/access — break-glass steps (owner
 * decision س٢١٦, migration 20261206_12):
 *   { action: "request", requestId, reason, minutes? }  → { grantId }
 *   { action: "approve", grantId, note? }               → { expiresAt }
 *   { action: "reject",  grantId, note? }
 *   { action: "revoke",  grantId }
 * Each step runs as the admin's OWN session (createClient), so the database
 * decides: a super admin (is_admin() with 2FA when enrolled + is_super_admin()),
 * a written reason, a second and DIFFERENT super admin to approve, 15–240
 * minutes, the firm notified in the same transaction, an audit row per step.
 * requireStaff("staff.manage") only answers non-super-admins early.
 */
export async function POST(request: NextRequest) {
  const gate = await requireStaff("staff.manage");
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const supabase = await createClient();

  let result: { data: unknown; error: { code?: string; message?: string } | null };
  if (action === "request") {
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const minutes = body?.minutes === undefined ? 60 : Number(body.minutes);
    if (!requestId || requestId.length > 200) {
      return NextResponse.json({ error: "رقم القضية غير صالح." }, { status: 400 });
    }
    if (reason.length < BREAK_GLASS_REASON_MIN || reason.length > BREAK_GLASS_REASON_MAX) {
      return NextResponse.json(
        { error: `اكتب سبباً واضحاً (من ${BREAK_GLASS_REASON_MIN} إلى ${BREAK_GLASS_REASON_MAX} حرف).` },
        { status: 400 },
      );
    }
    if (!Number.isInteger(minutes) || minutes < BREAK_GLASS_MIN_MINUTES || minutes > BREAK_GLASS_MAX_MINUTES) {
      return NextResponse.json(
        { error: `المدة من ${BREAK_GLASS_MIN_MINUTES} إلى ${BREAK_GLASS_MAX_MINUTES} دقيقة.` },
        { status: 400 },
      );
    }
    result = await supabase.rpc("restricted_case_access_request", {
      p_request: requestId, p_reason: reason, p_minutes: minutes,
    });
    if (!result.error) return NextResponse.json({ ok: true, grantId: result.data });
  } else if (action === "approve" || action === "reject" || action === "revoke") {
    const grantId = typeof body?.grantId === "string" ? body.grantId : "";
    if (!UUID_RE.test(grantId)) {
      return NextResponse.json({ error: "رقم الطلب غير صالح." }, { status: 400 });
    }
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : null;
    if (action === "approve") {
      result = await supabase.rpc("restricted_case_access_approve", { p_grant: grantId, p_note: note });
      if (!result.error) return NextResponse.json({ ok: true, expiresAt: result.data });
    } else if (action === "reject") {
      result = await supabase.rpc("restricted_case_access_reject", { p_grant: grantId, p_note: note });
      if (!result.error) return NextResponse.json({ ok: true });
    } else {
      result = await supabase.rpc("restricted_case_access_revoke", { p_grant: grantId });
      if (!result.error) return NextResponse.json({ ok: true });
    }
  } else {
    return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
  }

  const mapped = breakGlassErrorResponse(result.error ?? {});
  if (mapped.status >= 500 && mapped.status !== 503) {
    console.error("[admin/restricted-cases/access] rpc failed:", action, result.error?.code);
  }
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}
