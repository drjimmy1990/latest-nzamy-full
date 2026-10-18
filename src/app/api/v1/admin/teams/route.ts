import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { toStaffRole } from "@/lib/auth/staffRoles";
import { isMissingStaffTable } from "@/lib/auth/staffDecision";
import {
  INVALID_STAFF_ROLE_AR,
  NOT_STAFF_AR,
  OWN_ROLE_AR,
  STAFF_ROLES_NOT_READY_AR,
  inviteStaffRole,
  isSameAccount,
} from "@/lib/auth/staffManagement";
import { checkStaffRoleChange, readStaffRolesOf } from "@/lib/auth/platformStaffServer";

/**
 * /api/v1/admin/teams — Nezamy's own team (every profile with user_type
 * 'admin') and each member's staff role (owner answer ٢١٠, Task 3.4).
 *
 * user_type 'admin' says who is staff; public.platform_staff (20261019_30)
 * says which kind: super_admin, operations or auditor. The role decides which
 * admin-console writes a member may make (requireStaff, Task 3.3). Every role
 * can still read the console's data, and user_type 'admin' still passes the
 * other dashboards' guards (assertRole.ts, UserTypeGuard.tsx).
 *
 *   GET   — the members, each with `staffRole` (null: no row — requireStaff
 *           treats that admin as an auditor), `staffRolesReady` (false only
 *           while the table does not exist yet) and `staffRolesError` (the
 *           roles could not be read now — requireStaff then fails closed to
 *           auditor, so a screen must not read it as "not migrated").
 *   POST  — invite: creates (or promotes) the admin AND writes their role,
 *           `staffRole` in the body, default 'operations'. super_admin only.
 *   PATCH — `{ userId, staffRole }` sets a member's role; `{ id, status }`
 *           sets the descriptive status label (TeamTab). super_admin only.
 *
 * Nobody changes their own role, and the last super admin cannot be demoted:
 * that keeps platform_staff non-empty, so a re-run of 20261019_30 promotes
 * nobody.
 */

export async function GET(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  const adminClient = await createServiceClient();

  try {
    const { data, error } = await adminClient
      .from("profiles")
      .select("*")
      .eq("user_type", "admin")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The roles. Missing table (20261019_30 not applied): staffRolesReady
    // false. A failed read: staffRolesError true. Either way every staffRole
    // is null and the list still loads.
    const rows = data || [];
    const rolesRead = await readStaffRolesOf(
      adminClient,
      rows.map((p: { id?: unknown }) => p.id).filter((id: unknown): id is string => typeof id === "string"),
    );
    const roles = rolesRead.status === "ok" ? rolesRead.roles : null;

    const team = rows.map((p: any) => {
      const meta = p.metadata || {};
      return {
        id: p.id,
        name: p.display_name,
        email: p.email,
        role: meta.role || "مسؤول",
        department: meta.department || "الإدارة",
        description: meta.description || "",
        access: meta.access_list || meta.access || [],
        accessList: meta.access_list || meta.access || [],
        dashboardTabs: meta.tabs_list || meta.dashboardTabs || [],
        tabsList: meta.tabs_list || meta.dashboardTabs || [],
        status: meta.status || "active",
        staffRole: roles?.get(p.id) ?? null,
      };
    });

    return NextResponse.json({
      team,
      staffRolesReady: rolesRead.status !== "table_missing",
      staffRolesError: rolesRead.status === "failed",
    });

  } catch (err: any) {
    console.error("[admin/teams] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب أعضاء الفريق" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // 1. Staff gate (owner ٢١٠): inviting a member creates an admin.
  const gate = await requireStaff("staff.manage");
  if (!gate.ok) return gate.response;

  try {
    const { name, email, role, department, staffRole: rawStaffRole } = await request.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "الاسم والبريد الإلكتروني مطلوبان لدعوة العضو" },
        { status: 400 }
      );
    }

    // The staff role (owner ٢١٠): absent → operations; anything else must be
    // one of the three. Checked before any write.
    const staffRole = inviteStaffRole(rawStaffRole);
    if (!staffRole) {
      return NextResponse.json({ error: INVALID_STAFF_ROLE_AR }, { status: 400 });
    }

    const adminClient = await createServiceClient();

    let userId = "";
    // The account's type before this invite (null: a new account), for the audit row.
    let previousUserType: string | null = null;

    // Create the user in auth.users. user_type "admin" makes them staff; the
    // platform_staff row written below decides what they may do in the console.
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        user_type: "admin",
        display_name: name
      }
    });

    if (authError) {
      // Check if user already exists
      if (authError.message.includes("already registered") || authError.message.includes("exists")) {
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id, user_type")
          .eq("email", email)
          .maybeSingle();

        if (existingProfile) {
          userId = existingProfile.id;
          previousUserType = typeof existingProfile.user_type === "string" ? existingProfile.user_type : null;
        } else {
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    } else if (authUser?.user) {
      userId = authUser.user.id;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "فشل إنشاء مستخدم جديد في المصادقة" },
        { status: 400 }
      );
    }

    // An invite to an existing account sets its role, so the role rules apply:
    // inviting your own address cannot change your own role, and re-inviting
    // the last super admin under another role cannot demote them.
    if (isSameAccount(userId, gate.userId)) {
      return NextResponse.json({ error: OWN_ROLE_AR }, { status: 400 });
    }
    const change = await checkStaffRoleChange(adminClient, {
      targetId: userId,
      targetIsAdmin: previousUserType === "admin",
      nextRole: staffRole,
    });
    if (!change.ok) {
      return NextResponse.json({ error: change.error }, { status: change.status });
    }
    const previousRole = change.previousRole;

    // The role row first, upserted, so an old row (a former admin's) never
    // survives to bring back an old role, and the account is never an admin
    // under a stale role. Before 20261019_30 runs there is no table: the
    // invite goes on without a role (every admin keeps full access until it
    // runs, and its first apply makes every admin a super_admin).
    if (!change.tableMissing) {
      const { error: staffError } = await adminClient
        .from("platform_staff")
        .upsert(
          { user_id: userId, staff_role: staffRole, granted_by: gate.userId, granted_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (staffError && !isMissingStaffTable(staffError.code)) {
        console.error("[admin/teams] POST: writing the staff role failed:", staffError.code, staffError.message);
        return NextResponse.json({ error: "تعذّر حفظ دور العضو — لم تُرسَل الدعوة" }, { status: 500 });
      }
    }

    // Upsert the profile to set the user details and metadata
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: userId,
        user_type: "admin",
        display_name: name,
        email,
        metadata: {
          role: role || "مسؤول",
          department: department || "الإدارة",
          status: "invited",
          description: "",
          access_list: [],
          tabs_list: []
        }
      });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "staff_member_invited",
      targetType: "profile",
      targetId: userId,
      before: { user_type: previousUserType, staff_role: previousRole },
      after: {
        user_type: "admin",
        staff_role: change.tableMissing ? null : staffRole,
        email,
        role: role || "مسؤول",
        department: department || "الإدارة",
      },
      metadata: { existing_account: !authUser?.user },
    });

    return NextResponse.json({
      success: true,
      message: "تم إرسال الدعوة بنجاح"
    });

  } catch (err: any) {
    console.error("[admin/teams] POST error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إرسال الدعوة" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  // 1. Staff gate (owner ٢١٠): a staff member's record is staff management.
  const gate = await requireStaff("staff.manage");
  if (!gate.ok) return gate.response;

  try {
    const parsed: unknown = await request.json().catch(() => undefined);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    // ── { userId, staffRole }: set a member's staff role (owner ٢١٠) ─────────
    if ("staffRole" in parsed) {
      const body = parsed as { userId?: unknown; staffRole?: unknown };
      const targetId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!targetId) {
        return NextResponse.json({ error: "معرّف العضو مطلوب لتغيير الدور" }, { status: 400 });
      }
      const nextRole = toStaffRole(body.staffRole);
      if (!nextRole) {
        return NextResponse.json({ error: INVALID_STAFF_ROLE_AR }, { status: 400 });
      }
      if (isSameAccount(targetId, gate.userId)) {
        return NextResponse.json({ error: OWN_ROLE_AR }, { status: 400 });
      }

      const adminClient = await createServiceClient();

      // Only an admin holds a role: a row on any other account would lie
      // dormant and come back the day the account is promoted.
      const { data: target, error: targetError } = await adminClient
        .from("profiles")
        .select("user_type")
        .eq("id", targetId)
        .maybeSingle();
      if (targetError) {
        console.error("[admin/teams] PATCH: reading the member failed:", targetError.code, targetError.message);
        return NextResponse.json({ error: "حدث خطأ أثناء تحديث دور عضو الفريق" }, { status: 500 });
      }
      if (!target) {
        return NextResponse.json({ error: "عضو الفريق غير موجود" }, { status: 404 });
      }
      if (target.user_type !== "admin") {
        return NextResponse.json({ error: NOT_STAFF_AR }, { status: 400 });
      }

      // The last super admin stays one (400), and an unreadable role or count
      // is a 503, never a guess.
      const change = await checkStaffRoleChange(adminClient, { targetId, targetIsAdmin: true, nextRole });
      if (!change.ok) {
        return NextResponse.json({ error: change.error }, { status: change.status });
      }
      if (change.tableMissing) {
        return NextResponse.json({ error: STAFF_ROLES_NOT_READY_AR }, { status: 503 });
      }
      const previousRole = change.previousRole;
      if (previousRole === nextRole) {
        return NextResponse.json({ success: true, staffRole: nextRole, message: "الدور لم يتغيّر" });
      }

      const { error: upsertError } = await adminClient
        .from("platform_staff")
        .upsert(
          { user_id: targetId, staff_role: nextRole, granted_by: gate.userId, granted_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (upsertError) {
        if (isMissingStaffTable(upsertError.code)) {
          return NextResponse.json({ error: STAFF_ROLES_NOT_READY_AR }, { status: 503 });
        }
        console.error("[admin/teams] PATCH: writing the staff role failed:", upsertError.code, upsertError.message);
        return NextResponse.json({ error: "تعذّر حفظ الدور — لم يتغيّر شيء" }, { status: 500 });
      }

      await logAdminAction({
        actorId: gate.userId,
        action: "staff_role_updated",
        targetType: "profile",
        targetId,
        before: { staff_role: previousRole },
        after: { staff_role: nextRole },
      });

      return NextResponse.json({ success: true, staffRole: nextRole, message: "تم تحديث دور عضو الفريق" });
    }

    // ── { id, status }: the descriptive status label (TeamTab) ──────────────
    const { id, status } = parsed as { id?: unknown; status?: unknown };

    if (!id || !status) {
      return NextResponse.json(
        { error: "المعرف والحالة مطلوبان لتحديث حالة العضو" },
        { status: 400 }
      );
    }

    const adminClient = await createServiceClient();

    // Fetch the existing profile to modify the metadata object
    const { data: profile, error: fetchError } = await adminClient
      .from("profiles")
      .select("metadata")
      .eq("id", id)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: "عضو الفريق غير موجود" },
        { status: 404 }
      );
    }

    // NOTE: this writes metadata.status only — a display label. It revokes
    // nothing: user_type stays "admin" and the staff role is unchanged. What a
    // member may do is their staff role (the branch above).
    const currentMetadata = profile.metadata && typeof profile.metadata === "object" ? profile.metadata : {};
    const updatedMetadata = {
      ...currentMetadata,
      status
    };

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        metadata: updatedMetadata
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "staff_member_status_updated",
      targetType: "profile",
      targetId: String(id),
      before: { status: (currentMetadata as Record<string, unknown>).status ?? null },
      after: { status },
    });

    return NextResponse.json({
      success: true,
      message: "تم تحديث حالة عضو الفريق بنجاح"
    });

  } catch (err: any) {
    console.error("[admin/teams] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث حالة عضو الفريق" },
      { status: 500 }
    );
  }
}
