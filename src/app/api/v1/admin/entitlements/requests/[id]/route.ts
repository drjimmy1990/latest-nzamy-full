import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin, type ServerTier } from "@/lib/access-control";
import { grantEntitlement, type GrantAction } from "@/lib/entitlements";
import { recordNotification } from "@/lib/notify";

/**
 * PATCH /api/v1/admin/entitlements/requests/[id] — admin decides a request.
 * Body: { action: 'approve' | 'reject', grantAction?, tier?, amount?, durationDays? }
 * On approve: applies grantEntitlement (library/media requests → plan tier the
 * admin picks), then marks the request approved and notifies the requester.
 *
 * This route deliberately does NOT pass `replaceActive` (review 2026-09-21
 * A3/C01 follow-up). POST /api/v1/admin/entitlements/grant does, because
 * granting `free` there is the only revoke an admin has — but nobody submits a
 * REQUEST asking to be moved down, so here the override would buy nothing and
 * cost something concrete: src/app/dashboard/admin/entitlements/requests/page.tsx:75
 * sends `tier: tierFor[row.id] ?? "pro"` and its selector shows "pro" until the
 * admin touches it, so approving a max/corp holder's library request without
 * changing the dropdown would cancel that subscription and insert a 30-day pro.
 *
 * Without the override grantEntitlement declines that write and reports
 * `alreadyEntitled`, and the approve arm below tells the two outcomes apart:
 * the request is still marked approved (the admin decided, and the account
 * already holds what was asked for or better, so there is nothing left to do),
 * but the requester is told exactly that instead of «تم تفعيل ما طلبته على
 * حسابك», and the response carries `alreadyEntitled` so the console can say so
 * too once its page reads the body. The admin's own toast already reads «تمت
 * الموافقة» — the approval, not an activation — so it stays true either way.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  let body: {
    action?: "approve" | "reject";
    grantAction?: GrantAction;
    tier?: string;
    amount?: number;
    durationDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const admin = await createServiceClient();
  const { data: reqRow, error: fetchErr } = await admin
    .from("entitlement_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!reqRow) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: "تم البت في هذا الطلب مسبقًا" }, { status: 409 });
  }

  const requesterId = reqRow.user_id as string;
  const nowIso = new Date().toISOString();

  // ── Reject ─────────────────────────────────────────────────────────────────
  if (body.action === "reject") {
    const { error } = await admin
      .from("entitlement_requests")
      .update({ status: "rejected", decided_by: gate.userId, decided_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await recordNotification({
      userId: requesterId,
      title: "تم رفض طلبك",
      body: "نعتذر، لم تتم الموافقة على طلبك في الوقت الحالي.",
      href: "/dashboard",
    });
    return NextResponse.json({ success: true, data: { status: "rejected" } });
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  if (body.action === "approve") {
    // Map the request kind → a concrete grant action. library/media → plan.
    const kind = reqRow.kind as string;
    const grantAction: GrantAction =
      body.grantAction ??
      (kind === "credits" ? "credits" : kind === "wallet" ? "wallet" : "plan");

    const reqAmount =
      reqRow.amount == null ? undefined : Number(reqRow.amount);

    const result = await grantEntitlement({
      userId: requesterId,
      action: grantAction,
      tier: body.tier as ServerTier | undefined,
      amount: typeof body.amount === "number" ? body.amount : reqAmount,
      durationDays: body.durationDays,
      actorId: gate.userId ?? undefined,
      // No `replaceActive` — see the header. An approval must never move a
      // requester DOWN; grantEntitlement declines instead and says so.
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const { error } = await admin
      .from("entitlement_requests")
      .update({ status: "approved", decided_by: gate.userId, decided_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Nothing was written when the account already holds an equal-or-better
    // plan: the approval stands, but the requester must NOT be told a
    // subscription was activated.
    const alreadyEntitled = result.alreadyEntitled === true;
    const noticeBody = alreadyEntitled
      ? "حسابك يحمل بالفعل هذه الباقة أو أعلى منها، فلم نغيّر اشتراكك الحالي."
      : "تم تفعيل ما طلبته على حسابك.";

    await recordNotification({
      userId: requesterId,
      title: "تمت الموافقة على طلبك",
      body: noticeBody,
      href: "/dashboard",
    });

    return NextResponse.json({
      success: true,
      data: { status: "approved", alreadyEntitled, grant: result },
    });
  }

  return NextResponse.json(
    { error: "action يجب أن يكون approve أو reject" },
    { status: 400 },
  );
}
