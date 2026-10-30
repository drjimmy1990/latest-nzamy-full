import { NextRequest, NextResponse } from "next/server";
import { requireStaff, type ServerTier } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { grantEntitlement, type GrantAction } from "@/lib/entitlements";
import { libraryEndsAtAr } from "@/lib/libraryAccess";
import { parseLibraryGrantBody } from "@/lib/libraryAccessAdmin";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { recordNotification } from "@/lib/notify";

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
 *
 * Owner answer ٢١٠: needs a staff role with entitlements.grant, and each
 * successful grant is audited.
 *
 * `action: "library"` (owner note ١٨ C02) grants the LIBRARY ONLY — one
 * library_access_grants row, never a `subscriptions` row, so the AI tools and
 * the tier are untouched (owner ١٩٩). Body: { userId, action: "library",
 * planRef? (default lib-admin), durationDays (1–3660), reason (MANDATORY),
 * notes? } — parseLibraryGrantBody. It goes through grantLibraryAccess →
 * public.library_grant_access (20261030_65): atomic, stacked after the user's
 * latest active grant, the reason kept in the service-role-only side table.
 * Same gate as every other action here: entitlements.grant. Owner question
 * (note ١٨ §6.2) still open: should only the super admin grant the library?
 * Today it is whoever holds entitlements.grant. It is not handled by
 * grantEntitlement (src/lib/entitlements.ts) on purpose: that function writes
 * `subscriptions`.
 */
export async function POST(request: NextRequest) {
  const gate = await requireStaff("entitlements.grant");
  if (!gate.ok) return gate.response;

  let body: {
    userId?: string;
    action?: GrantAction | "library";
    tier?: string;
    amount?: number;
    durationDays?: number;
    description?: string;
    planRef?: string;
    reason?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  if (!body.userId || !body.action) {
    return NextResponse.json({ error: "userId و action مطلوبان" }, { status: 400 });
  }

  // The library only, never a plan (owner note ١٨ C02) — see the header.
  if (body.action === "library") return grantLibrary(body as Record<string, unknown>, gate.userId);
  const action: GrantAction = body.action;

  const result = await grantEntitlement({
    userId: body.userId,
    action,
    tier: body.tier as ServerTier | undefined,
    amount: typeof body.amount === "number" ? body.amount : undefined,
    durationDays: body.durationDays,
    description: body.description,
    actorId: gate.userId,
    // See the header: an admin acts deliberately, and `free` is the revoke.
    replaceActive: true,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await logAdminAction({
    actorId: gate.userId,
    action: "entitlement_granted",
    targetType: "profile",
    targetId: body.userId,
    after: {
      action: body.action,
      tier: body.tier ?? null,
      amount: typeof body.amount === "number" ? body.amount : null,
      durationDays: body.durationDays ?? null,
    },
    metadata: { description: body.description ?? null },
  });

  return NextResponse.json({ success: true, data: result });
}

/**
 * The direct library grant (owner note ١٨ C02): validate, grant atomically,
 * then the audit row and the user's notice — both only after the grant
 * succeeded. Not limited to professional accounts: LIVE-F05 restricts SALES;
 * an admin's grant is a deliberate, reasoned exception and is audited.
 */
async function grantLibrary(body: Record<string, unknown>, adminId: string) {
  const parsed = parseLibraryGrantBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  const grant = await grantLibraryAccess({
    userId: input.userId,
    planRef: input.planRef,
    days: input.days,
    source: "admin",
    grantedBy: adminId,
    reason: input.reason,
    notes: input.notes,
  });
  if (!grant.ok) {
    // grant.error is English or raw Postgres: logged here, never sent.
    console.error("[admin/entitlements/grant] library grant failed:", grant.code, grant.error);
    const needsSql = grant.code === "PGRST202" || grant.code === "42883";
    const error = needsSql
      ? "منح المكتبة المباشر يحتاج تشغيل ملف قاعدة البيانات 20261030_65 أولاً"
      : grant.code === "23503"
        ? "المستخدم غير موجود"
        : "تعذّر منح اشتراك المكتبة. حاول مرة أخرى.";
    return NextResponse.json({ error }, { status: needsSql ? 503 : 400 });
  }

  await logAdminAction({
    actorId: adminId,
    action: "library_grant_created",
    targetType: "profile",
    targetId: input.userId,
    after: {
      grant_id: grant.grantId ?? null,
      plan_ref: input.planRef,
      days: input.days,
      starts_at: grant.startsAt ?? null,
      ends_at: grant.endsAt,
    },
    metadata: { source: "admin", reason: input.reason, notes: input.notes },
  });

  const untilAr = libraryEndsAtAr(grant.endsAt);
  await recordNotification({
    userId: input.userId,
    title: "تم تفعيل اشتراك المكتبة القانونية",
    body: untilAr ? `اشتراك المكتبة القانونية ساري حتى ${untilAr}.` : "تم تفعيل اشتراك المكتبة القانونية.",
    href: "/laws",
  });

  return NextResponse.json({
    success: true,
    data: {
      action: "library",
      grant: {
        id: grant.grantId ?? null,
        planRef: input.planRef,
        days: input.days,
        startsAt: grant.startsAt ?? null,
        endsAt: grant.endsAt,
      },
    },
  });
}
