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
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const { error } = await admin
      .from("entitlement_requests")
      .update({ status: "approved", decided_by: gate.userId, decided_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordNotification({
      userId: requesterId,
      title: "تمت الموافقة على طلبك",
      body: "تم تفعيل ما طلبته على حسابك.",
      href: "/dashboard",
    });

    return NextResponse.json({ success: true, data: { status: "approved", grant: result } });
  }

  return NextResponse.json(
    { error: "action يجب أن يكون approve أو reject" },
    { status: 400 },
  );
}
