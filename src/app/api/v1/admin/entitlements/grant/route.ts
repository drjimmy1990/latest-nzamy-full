import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type ServerTier } from "@/lib/access-control";
import { grantEntitlement, type GrantAction } from "@/lib/entitlements";

/**
 * POST /api/v1/admin/entitlements/grant — admin directly grants an entitlement
 * to a user (no request needed). Body: { userId, action, tier?, amount?,
 * durationDays?, description? }. Delegates to grantEntitlement().
 *
 * `replaceActive: true` is passed unconditionally (review 2026-09-21 A3/C01
 * follow-up). grantEntitlement now skips a plan grant that would downgrade the
 * user, which is right for the self-service flows (invite accept, library code
 * redemption) and wrong here: this route IS the deliberate-downgrade tool.
 * Granting the `free` tier is the only way an admin revokes a plan, so without
 * the override every revoke — and every sideways/equal grant — would answer
 * 200 while writing nothing, and the console
 * (src/app/dashboard/admin/entitlements/page.tsx:88) would report «تم تنفيذ
 * المنحة بنجاح» over a no-op. It is not read from the body on purpose: the
 * console sends no such field, so a passthrough flag would leave exactly that
 * silent no-op in place.
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
    // See the header: an admin acts deliberately, and `free` is the revoke.
    replaceActive: true,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result });
}
