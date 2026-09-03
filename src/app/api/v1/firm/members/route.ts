import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import type { FirmRole } from "@/types/firmBackendReady";

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
    .select("id, owner_user_id")
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
    const auth = await assertRole(["firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: firm, error: firmError } = await resolveOwnFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/members GET] firm_profiles lookup failed:", firmError.message, firmError.code);
      return NextResponse.json({ error: "تعذّر تحميل فريق المكتب." }, { status: 500 });
    }
    if (!firm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 });
    }

    const { data: rows, error: membersError, count } = await supabase
      .from("firm_members")
      .select("id, firm_id, user_id, role, status, accepted_at, created_at", { count: "exact" })
      .eq("firm_id", firm.id);

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

    const data = sorted.map(row => toDto(row, profileById.get(row.user_id), firm.owner_user_id));
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
 * Adds an EXISTING lawyer account, looked up by e-mail, as an active member.
 * Does not create accounts and does not e-mail anyone — inviting someone
 * without a platform account is a later step (`team_invitations` exists,
 * unused). `user_type = 'lawyer'` is enforced on the lookup so this cannot be
 * used to discover whether an e-mail belongs to a client/admin/other entity
 * account — the 404 reads the same either way.
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
    const { data: account, error: accountError } = await service
      .from("profiles")
      .select("id, display_name, email, user_type")
      .ilike("email", email.trim())
      .eq("user_type", "lawyer")
      .maybeSingle();

    if (accountError) {
      console.error("[firm/members POST] profiles lookup failed:", accountError.message, accountError.code);
      return NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: "لا يوجد حساب محامٍ بهذا البريد على المنصّة." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("firm_members")
      .insert({
        firm_id: firm.id,
        user_id: account.id,
        role,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .select("id, firm_id, user_id, role, status, accepted_at, created_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        return NextResponse.json({ error: "هذا المحامي عضو في المكتب مسبقاً." }, { status: 409 });
      }
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

    return NextResponse.json(
      { data: toDto(data as FirmMemberRow, { id: account.id, display_name: account.display_name, email: account.email }, firm.owner_user_id) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[firm/members POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إضافة العضو." }, { status: 500 });
  }
}
