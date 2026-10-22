import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { readAdminBalance } from "@/lib/payments/pointsAdmin";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { STAFF_CHECK_UNAVAILABLE_AR, usersPatchActions } from "@/lib/auth/staffDecision";
import type { StaffAction } from "@/lib/auth/staffRoles";
import { isAssignableUserType } from "@/lib/auth/userTypes";
import { checkStaffRoleChange } from "@/lib/auth/platformStaffServer";

/**
 * GET /api/v1/admin/users/[id] — Fetch single user with full details
 *
 * Includes: profile, all subscriptions (history), lawyer_profile,
 *           and last 20 credit_transactions.
 *
 * Requires: authenticated admin user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json(
      { error: "غير مصرح — يرجى تسجيل الدخول" },
      { status: 401 },
    );
  }

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Fetch profile ──────────────────────────────────────────────────────
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 },
      );
    }

    // ── Fetch all subscriptions (history) ──────────────────────────────────
    const { data: subscriptions } = await adminClient
      .from("subscriptions")
      .select(
        `
        *,
        subscription_plans (
          id,
          name_ar,
          name_en,
          tier,
          price_monthly,
          price_yearly
        )
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // ── Fetch lawyer profile ───────────────────────────────────────────────
    const { data: lawyerProfile } = await adminClient
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // ── Fetch recent credit transactions ───────────────────────────────────
    const { data: creditTransactions } = await adminClient
      .from("credit_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    // A failed balance read shows «—» (null); it never fails the page.
    const pointsBalance = await readAdminBalance(adminClient, userId);
    // ── Separate active subscription from history ──────────────────────────
    const activeSubscription =
      subscriptions?.find(
        (s: Record<string, unknown>) => s.status === "active",
      ) ?? null;

    return NextResponse.json({
      data: {
        ...profile,
        subscription: activeSubscription,
        subscription_history: subscriptions ?? [],
        lawyer_profile: lawyerProfile ?? null,
        credit_transactions: creditTransactions ?? [],
        credit_balance: pointsBalance,
      },
    });
  } catch (err) {
    console.error("[admin/users/[id]] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب بيانات المستخدم" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/v1/admin/users/[id] — Update user profile
 *
 * Body: { status?: "suspended", user_type?: string, metadata?: object, verified?: boolean }
 *
 * Owner answer ٢١٠: each field needs its own staff action (usersPatchActions):
 * user_type and metadata need users.change_type, a suspension users.suspend,
 * and verified verifications.decide. A body with none of them is a 400.
 *
 * user_type is checked on the server: never "admin" (only the staff-management
 * path creates staff), and otherwise one of the types the database allows.
 *
 * If status is 'suspended', also cancels any active subscription.
 *
 * Demoting an admin to another type (Task 3.4) removes them from staff: it is
 * refused while they are the last super admin (400 «لا يمكن إزالة آخر مشرف
 * رئيسي»), and once the profile write succeeds their platform_staff row is
 * deleted, so a later promotion cannot bring the old role back.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  // ── Body first: the staff actions it needs depend on its fields ────────────
  // Unparseable JSON is answered only after the gate below.
  const parsed: unknown = await request.json().catch(() => undefined);
  const actions = usersPatchActions(parsed);

  // ── Staff gate (owner ٢١٠) ─────────────────────────────────────────────────
  // A body that writes nothing still needs a signed-in admin before its 400.
  const needed: StaffAction[] = actions.length > 0 ? actions : ["read"];
  let actorId = "";
  for (const action of needed) {
    const gate = await requireStaff(action);
    if (!gate.ok) return gate.response;
    actorId = gate.userId;
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  if (actions.length === 0) {
    return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
  }
  const body = parsed as { status?: unknown; user_type?: unknown; metadata?: unknown; verified?: unknown };

  if (body.user_type !== undefined) {
    if (body.user_type === "admin") {
      return NextResponse.json({ error: "لا يمكن منح صلاحية المشرف من هنا" }, { status: 403 });
    }
    if (typeof body.user_type !== "string" || !isAssignableUserType(body.user_type)) {
      return NextResponse.json({ error: "نوع الحساب غير صالح" }, { status: 400 });
    }
  }
  if (
    body.metadata !== undefined &&
    (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata))
  ) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const adminClient = await createServiceClient();

  try {
    // ── The fields as they are now, for the audit row ──────────────────────
    const { data: existing, error: existingError } = await adminClient
      .from("profiles")
      .select("user_type, verified_at, metadata")
      .eq("id", userId)
      .maybeSingle();

    // A type change on an account whose current type cannot be read could be
    // an admin's demotion: refuse rather than skip the rule below (fail closed).
    if (body.user_type !== undefined && existingError) {
      console.error("[admin/users/[id]] PATCH: reading the account before a type change failed:", existingError.code, existingError.message);
      return NextResponse.json({ error: STAFF_CHECK_UNAVAILABLE_AR }, { status: 503 });
    }

    // ── Demoting an admin: the last super admin stays (owner ٢١٠) ──────────
    // body.user_type is never "admin" here (refused above), so a change on an
    // admin account takes them out of staff.
    const leavesStaff =
      body.user_type !== undefined && (existing as { user_type?: unknown } | null)?.user_type === "admin";
    let staffChange: { previousRole: string | null; tableMissing: boolean } | null = null;
    if (leavesStaff) {
      const change = await checkStaffRoleChange(adminClient, { targetId: userId, targetIsAdmin: true, nextRole: null });
      if (!change.ok) {
        return NextResponse.json({ error: change.error }, { status: change.status });
      }
      staffChange = { previousRole: change.previousRole, tableMissing: change.tableMissing };
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.user_type !== undefined) {
      updateData.user_type = body.user_type;
    }

    if (body.metadata !== undefined) {
      updateData.metadata = body.metadata;
    }

    if (body.verified !== undefined) {
      updateData.verified_at = body.verified ? new Date().toISOString() : null;
    }

    // ── Update profile ─────────────────────────────────────────────────────
    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    // ── The audit row's profile half (owner ٢١٠): the profile write is done ──
    const prior = (existing ?? {}) as Record<string, unknown>;
    const current = (updatedProfile ?? {}) as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (body.user_type !== undefined) {
      before.user_type = prior.user_type ?? null;
      after.user_type = current.user_type ?? null;
    }
    if (body.metadata !== undefined) {
      before.metadata = prior.metadata ?? null;
      after.metadata = current.metadata ?? null;
    }
    if (body.verified !== undefined) {
      before.verified_at = prior.verified_at ?? null;
      after.verified_at = current.verified_at ?? null;
    }

    // ── A demoted admin's role row goes (owner ٢١٠) ────────────────────────
    // Only after the demotion is written. public.staff_role() already ignores
    // a non-admin's row, but a row left behind would return with its old role
    // the day the account is promoted again. A failed delete is logged: the
    // demotion itself stands.
    if (staffChange && !staffChange.tableMissing) {
      const { error: staffDeleteError } = await adminClient
        .from("platform_staff")
        .delete()
        .eq("user_id", userId);
      before.staff_role = staffChange.previousRole;
      after.staff_role = staffDeleteError ? staffChange.previousRole : null;
      if (staffDeleteError) {
        console.error("[admin/users/[id]] PATCH: removing the demoted admin's staff role failed:", staffDeleteError.code, staffDeleteError.message);
      }
    }

    // ── Handle suspension ──────────────────────────────────────────────────
    // No table holds a "suspended" status (the profile is not marked): a
    // suspension cancels the active subscriptions, then sets the auth tier to
    // free. Each result is checked. A write that fails stops the suspension
    // with a 500, and the audit row records what really happened, under
    // user_suspension_failed, so a half-done suspension never reads as done.
    if (body.status === "suspended") {
      const suspensionFailed = async (detail: Record<string, unknown>) => {
        await logAdminAction({
          actorId,
          action: "user_suspension_failed",
          targetType: "profile",
          targetId: userId,
          before,
          after: { ...after, ...detail },
          metadata: { fields: Object.keys(after) },
        });
        return NextResponse.json({ error: "تعذّر إكمال الإيقاف" }, { status: 500 });
      };

      const { data: cancelledRows, error: cancelError } = await adminClient
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("status", "active")
        .select("id");
      if (cancelError) {
        console.error("[admin/users/[id]] suspension: cancelling subscriptions failed:", cancelError.code, cancelError.message);
        return suspensionFailed({ cancelled_count: null, cancel_error: cancelError.code ?? "error", auth_tier: "unchanged" });
      }
      const cancelledCount = cancelledRows?.length ?? 0;

      const { data: tierResult, error: tierError } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { tier: "free" },
      });
      if (tierError) {
        console.error("[admin/users/[id]] suspension: setting the auth tier failed:", tierError.message);
        return suspensionFailed({ cancelled_count: cancelledCount, auth_tier: "unchanged", tier_error: tierError.message });
      }

      after.cancelled_count = cancelledCount;
      after.auth_tier = (tierResult?.user?.user_metadata as { tier?: unknown } | undefined)?.tier ?? null;
    }

    await logAdminAction({
      actorId,
      action:
        body.status === "suspended"
          ? "user_suspended"
          : body.user_type !== undefined
            ? "user_type_updated"
            : body.verified !== undefined
              ? body.verified
                ? "user_verified"
                : "user_verification_revoked"
              : "user_metadata_updated",
      targetType: "profile",
      targetId: userId,
      before,
      after,
      metadata: { fields: Object.keys(after) },
    });

    return NextResponse.json({
      success: true,
      message: "تم تحديث بيانات المستخدم بنجاح",
      data: updatedProfile,
    });
  } catch (err) {
    console.error("[admin/users/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث بيانات المستخدم" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/admin/users/[id] — Delete user account
 *
 * Requires: a staff role with users.delete (owner ٢١٠). An admin cannot
 * delete their own account from here (controller ruling on Task 3.3): the
 * audit row could not even be written, its actor would be gone. The last
 * super admin cannot be deleted either (Task 3.4); a deleted admin's
 * platform_staff row goes with the auth user (ON DELETE CASCADE).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const gate = await requireStaff("users.delete");
  if (!gate.ok) return gate.response;

  // UUIDs compare case-insensitively: an upper-cased form of one's own id is
  // the same account.
  if (userId.toLowerCase() === gate.userId.toLowerCase()) {
    return NextResponse.json({ error: "لا يمكنك حذف حسابك من لوحة الإدارة" }, { status: 400 });
  }

  const adminClient = await createServiceClient();

  try {
    // Who is being deleted, read first: afterwards the profile is gone and the
    // audit row is the only trace of it.
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("email, display_name, user_type")
      .eq("id", userId)
      .maybeSingle();

    // Unreadable: it could be the last super admin. Refuse rather than skip
    // the rule below (fail closed).
    if (targetError) {
      console.error("[admin/users/[id]] DELETE: reading the account failed:", targetError.code, targetError.message);
      return NextResponse.json({ error: STAFF_CHECK_UNAVAILABLE_AR }, { status: 503 });
    }

    // The last super admin stays (owner ٢١٠): 400, or 503 when unreadable.
    // Only an admin holds a role, so deleting anyone else reads nothing here.
    let previousRole: string | null = null;
    if (target?.user_type === "admin") {
      const change = await checkStaffRoleChange(adminClient, { targetId: userId, targetIsAdmin: true, nextRole: null });
      if (!change.ok) {
        return NextResponse.json({ error: change.error }, { status: change.status });
      }
      previousRole = change.previousRole;
    }

    // Delete user from auth (cascades to profiles, subscriptions, lawyer_profiles etc.)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "user_deleted",
      targetType: "profile",
      targetId: userId,
      before: target ? { ...target, staff_role: previousRole } : null,
      after: null,
    });

    return NextResponse.json({
      success: true,
      message: "تم حذف المستخدم بنجاح",
    });
  } catch (err) {
    console.error("[admin/users/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف المستخدم" },
      { status: 500 },
    );
  }
}

