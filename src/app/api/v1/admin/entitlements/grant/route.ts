import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type ServerTier } from "@/lib/access-control";
import { grantEntitlement, type GrantAction } from "@/lib/entitlements";

/**
 * POST /api/v1/admin/entitlements/grant — admin directly grants an entitlement
 * to a user (no request needed). Body: { userId, action, tier?, amount?,
 * durationDays?, description? }. Delegates to grantEntitlement().
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  let body: {
    userId?: string;
    action?: GrantAction;
    tier?: string;
    amount?: number;
    durationDays?: number;
    description?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  if (!body.userId || !body.action) {
    return NextResponse.json({ error: "userId و action مطلوبان" }, { status: 400 });
  }

  const result = await grantEntitlement({
    userId: body.userId,
    action: body.action,
    tier: body.tier as ServerTier | undefined,
    amount: typeof body.amount === "number" ? body.amount : undefined,
    durationDays: body.durationDays,
    description: body.description,
    actorId: gate.userId ?? undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result });
}
