import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import type { FirmRole } from "@/types/firmBackendReady";
import { FIRM_TEAM_VIEW_ROLES, resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import { escapeLikePattern } from "@/lib/services/likePattern";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import { recordNotification } from "@/lib/notify";

/**
 * /api/v1/firm/members — Phase 2 (خطة_البناء_الكاملة §6, migration
 * 20260903_phase2_clients_and_firm_membership.sql).
 *
 * Backed by `public.firm_members`. Until this file, nothing in the product
 * ever wrote a row here (the migration's DECISION 1) — the firm owner now
 * gets an automatic `managing_partner` row by trigger, and this route is the
 * first place a SECOND person can be added.
 *
 * ── WHO CAN CALL THIS ───────────────────────────────────────────────────────
 * The firm OWNER account only (`firm_profiles.owner_user_id = auth.uid()`),
 * mirroring `/api/v1/firm/activity`. `assertRole(["firm"])` also lets an
 * admin session through — an admin with no `firm_profiles` row of their own
 * gets the same 404 a firm owner without a firm row would, which is correct:
 * this route manages ONE firm's roster, not every firm's.
 *
 * ── WHY A SERVICE CLIENT FOR NAMES/EMAILS ──────────────────────────────────
 * `profiles` RLS (20260716) lets a user read only their own row. Rendering a
 * roster needs the OTHER members' display names and emails, so those two
 * columns are read through `createServiceClient()` — server-only, bypasses
 * RLS — for exactly the ids `firm_members` RLS already admitted, never for an
 * open-ended query. The invite lookup (POST) reads `profiles` the same way,
 * for the same reason: the firm owner otherwise has no way to find an
 * account by e-mail.
 *
 * ── ROLE VALUES ─────────────────────────────────────────────────────────────
 * `FIRM_ROLE_VALUES` mirrors the `role` CHECK constraint on `firm_members`
 * (20260616_entities_setup_and_rls_fix.sql:69-73) exactly. Duplicated here as
 * a runtime array — `FirmRole` in `@/types/firmBackendReady` is a type only —
 * the same reason `lawyer/clients/route.ts` keeps its own `KNOWN_FLAGS`: a
 * route validating a write against a DB CHECK needs the values at runtime,
 * not just at compile time.
 */

const FIRM_ROLE_VALUES: readonly FirmRole[] = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_secretary", "office_admin", "finance_manager", "hr_manager",
  "compliance_manager", "external_of_counsel", "legal_consultant",
  "in_house_counsel",
];
const FIRM_ROLE_SET = new Set<string>(FIRM_ROLE_VALUES);

const MEMBER_COLUMNS = "id, firm_id, user_id, role, status, accepted_at, created_at";

/**
 * Where the invitee will find the invitation — the screen that mounts
 * `PendingInvitationsBanner`. The invite lookup admits `lawyer` and
 * `individual`, and their dashboards are different places.
 */
function inviteeDashboardHref(userType: string | null | undefined): string {
  return userType === "lawyer" ? "/dashboard/lawyer" : "/dashboard/client";
}

interface FirmMemberRow {
  id: string;
  firm_id: string;
  user_id: string;
  role: string;
  status: string;
  accepted_at: string | null;
  created_at: string;
}

interface ProfileLite {
  id: string;
  display_name: string | null;
  email: string | null;
}

function toDto(row: FirmMemberRow, profile: ProfileLite | undefined, ownerUserId: string) {
  return {
    id: row.id,
    firmId: row.firm_id,
    userId: row.user_id,
    role: row.role as FirmRole,
    status: row.status,
    displayName: profile?.display_name || "—",
    email: profile?.email ?? null,
    isOwner: row.user_id === ownerUserId,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

/**
 * Reads the caller's own firm row. `null` (not thrown) when the account has
 * none — the caller decides how to answer that, same split
 * `firm/activity/route.ts` makes, except this route's contract (per the
 * build task) is a 404, not an empty list: a member roster with no firm
 * behind it is a broken account state, not a genuinely empty one.
 */
async function resolveOwnFirm(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("firm_profiles")
    // `name_ar` is read for the invitation notification only — an invitee has
    // to be told WHICH office is asking — and `firm_profiles` RLS already
    // admits the owner's own row.
    .select("id, owner_user_id, name_ar")
    .eq("owner_user_id", userId)
    .maybeSingle();
}

/**
 * GET /api/v1/firm/members
 * Response: `{ data: FirmMember[], total }` — active members first, then by
 * `created_at` ascending (the owner's own row, inserted at firm creation, is
 * always the earliest and so sorts first among actives).
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: callerFirm, error: firmError } = await resolveCallerFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/members GET] firm_profiles lookup failed:", firmError.message, firmError.code);
      return NextResponse.json({ error: "تعذّر تحميل فريق المكتب." }, { status: 500 });
    }
    if (!callerFirm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 });
    }
    if (auth.userType !== "admin" && !FIRM_TEAM_VIEW_ROLES.has(callerFirm.role)) {
      return NextResponse.json({ error: "غير مصرح — صلاحيات غير كافية" }, { status: 403 });
    }

    const { data: rows, error: membersError, count } = await supabase
      .from("firm_members")
      .select("id, firm_id, user_id, role, status, accepted_at, created_at", { count: "exact" })
      .eq("firm_id", callerFirm.id);

    if (membersError) {
      console.error("[firm/members GET] firm_members query failed:", membersError.message, membersError.code);
      return NextResponse.json({ error: "تعذّر تحميل فريق المكتب." }, { status: 500 });
    }

    const memberRows = (rows ?? []) as FirmMemberRow[];
    const userIds = [...new Set(memberRows.map(r => r.user_id))];

    let profiles: ProfileLite[] = [];
    if (userIds.length > 0) {
      const service = await createServiceClient();
      const { data: profileRows, error: profileError } = await service
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      if (profileError) {
        console.error("[firm/members GET] profiles lookup failed:", profileError.message, profileError.code);
        return NextResponse.json({ error: "تعذّر تحميل فريق المكتب." }, { status: 500 });
      }
      profiles = (profileRows ?? []) as ProfileLite[];
    }
    const profileById = new Map(profiles.map(p => [p.id, p]));

    const sorted = [...memberRows].sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    });

    const data = sorted.map(row => toDto(row, profileById.get(row.user_id), callerFirm.ownerUserId));
    return NextResponse.json({ data, total: count ?? data.length });
  } catch (err) {
    console.error("[firm/members GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل فريق المكتب." }, { status: 500 });
  }
}

/**
 * POST /api/v1/firm/members
 * Body: { email, role }
 *
 * INVITES an EXISTING lawyer/individual account, looked up by e-mail. Does not
 * create accounts and does not e-mail anyone — inviting someone without a
 * platform account is a later step (`team_invitations` exists, unused). The
 * `user_type` filter on the lookup means this cannot be used to discover
 * whether an e-mail belongs to a client/admin/other entity account — the 404
 * reads the same either way.
 *
 * ── AN INVITATION, NOT A MEMBERSHIP (review 2026-09-21 A5 / F03) ───────────
 * This used to insert `status: 'active', accepted_at: now()`, so a firm owner
 * who knew an e-mail address put that person on the roster without asking.
 * It now writes `status: 'invited', accepted_at: null` and notifies them; the
 * invitee answers at `/api/v1/me/invitations/firm/{id}/accept` (or
 * `/decline`), whose database arm is
 * 20260922_02_members_accept_own_invitation.sql. An `invited` row grants
 * nothing — every membership read in this repo filters `status = 'active'`.
 *
 * A `removed` or `suspended` row is PATCHed back to `invited` (200 instead of
 * a permanent 409): removal is a status and `unique(firm_id, user_id)` is
 * total, so without that arm a colleague removed once could never be re-added.
 *
 * Responses: 201 a new invitation · 200 a re-invitation · 409 the account
 * already holds an `invited` or `active` row.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json().catch(() => ({}));
    const { email, role } = body as { email?: string; role?: string };

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    }
    if (!role || !FIRM_ROLE_SET.has(role)) {
      return NextResponse.json(
        { error: `الدور يجب أن يكون واحدًا من: ${FIRM_ROLE_VALUES.join(", ")}` },
        { status: 400 },
      );
    }

    const { data: firm, error: firmError } = await resolveOwnFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/members POST] firm_profiles lookup failed:", firmError.message, firmError.code);
      return NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
    }
    if (!firm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 });
    }

    const service = await createServiceClient();
    // PostgREST maps `*` to `%` and hands the rest to SQL ILIKE, where `%` and
    // `_` are wildcards. An e-mail address is a literal: neutralise all of them so
    // an owner cannot enumerate other accounts with a pattern (review MUST FIX 1).
    const emailPattern = escapeLikePattern(email.trim());

    const { data: account, error: accountError } = await service
      .from("profiles")
      .select("id, display_name, email, user_type")
      .ilike("email", emailPattern)
      .in("user_type", ["lawyer", "individual"])
      .maybeSingle();

    if (accountError) {
      console.error("[firm/members POST] profiles lookup failed:", accountError.message, accountError.code);
      return NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: "لا يوجد حساب مهني مؤهل بهذا البريد على المنصّة." }, { status: 404 });
    }

    // AN INVITATION — `status: 'invited'`, `accepted_at: null`. See the POST
    // header: this used to be `active` + `now()`, which is review finding A5.
    let created = true;
    let { data, error } = await supabase
      .from("firm_members")
      .insert({
        firm_id: firm.id,
        user_id: account.id,
        role,
        status: "invited",
        accepted_at: null,
      })
      .select(MEMBER_COLUMNS)
      .single();

    if (error?.code === "23505") {
      // A row already exists. Removal is a STATUS, so it may well be somebody
      // who is not a member at all — re-invite `removed`/`suspended` in place
      // through the owner's RLS UPDATE arm (20260921_03), and leave `invited`
      // and `active` alone, because those are the two states a second
      // invitation would quietly overwrite.
      const reinvite = await supabase
        .from("firm_members")
        .update({ role, status: "invited", accepted_at: null })
        .eq("firm_id", firm.id)
        .eq("user_id", account.id)
        .in("status", ["removed", "suspended"])
        .select(MEMBER_COLUMNS)
        .maybeSingle();
      if (reinvite.error) {
        console.error("[firm/members POST] re-invite failed:", reinvite.error.message, reinvite.error.code);
        return reinvite.error.code === "42501"
          ? NextResponse.json({ error: "غير مصرح — صلاحيات غير كافية" }, { status: 403 })
          : NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
      }
      if (!reinvite.data) {
        return NextResponse.json(
          { error: "هذا المستخدم عضو في المكتب مسبقاً أو لديه دعوة قائمة بانتظار الرد." },
          { status: 409 },
        );
      }
      created = false;
      data = reinvite.data;
      error = null;
    }

    if (error || !data) {
      if (error?.code === "23514") {
        return NextResponse.json(
          { error: `الدور يجب أن يكون واحدًا من: ${FIRM_ROLE_VALUES.join(", ")}` },
          { status: 400 },
        );
      }
      if (error?.code === "42501") {
        return NextResponse.json({ error: "غير مصرح — صلاحيات غير كافية" }, { status: 403 });
      }
      console.error("[firm/members POST] insert error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
    }

    // The invitee is told who invited them and as what — an invitation nobody
    // is told about is the same silence review A5 is about. Best-effort by
    // contract (notify.ts swallows its own failures); the row is written
    // either way.
    const firmName = (firm.name_ar as string | null) ?? "مكتب محاماة";
    await recordNotification({
      userId: account.id,
      title: "دعوة للانضمام إلى فريق مكتب محاماة",
      body: `دعاك «${firmName}» للانضمام إلى فريقه بصفة «${FIRM_ROLE_LABEL[role as FirmRole] ?? role}». يمكنك قبول الدعوة أو رفضها من لوحتك.`,
      href: inviteeDashboardHref(account.user_type as string | null),
    });

    return NextResponse.json(
      { data: toDto(data as FirmMemberRow, { id: account.id, display_name: account.display_name, email: account.email }, firm.owner_user_id) },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    console.error("[firm/members POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
  }
}
