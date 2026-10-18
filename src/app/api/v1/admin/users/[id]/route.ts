import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { usersPatchActions } from "@/lib/auth/staffDecision";
import type { StaffAction } from "@/lib/auth/staffRoles";
import { isAssignableUserType } from "@/lib/auth/userTypes";

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
        credit_balance: (lawyerProfile?.credit_balance as number) ?? 0,
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
    const { data: existing } = await adminClient
      .from("profiles")
      .select("user_type, verified_at, metadata")
      .eq("id", userId)
      .maybeSingle();

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

    // ── Handle suspension ──────────────────────────────────────────────────
    if (body.status === "suspended") {
      // Cancel any active subscriptions
      await adminClient
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("status", "active");

      // Downgrade auth metadata tier to free
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { tier: "free" },
      });
    }

    // ── Audit (owner ٢١٠): one row for this request ────────────────────────
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
    if (body.status === "suspended") {
      after.status = "suspended";
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
 * Requires: a staff role with users.delete (owner ٢١٠).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const gate = await requireStaff("users.delete");
  if (!gate.ok) return gate.response;

  const adminClient = await createServiceClient();

  try {
    // Who is being deleted, read first: afterwards the profile is gone and the
    // audit row is the only trace of it.
    const { data: target } = await adminClient
      .from("profiles")
      .select("email, display_name, user_type")
      .eq("id", userId)
      .maybeSingle();

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
      before: target ?? null,
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

