import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerBusinessScope } from "@/lib/auth/businessCallerScope";
import {
  DELEGATION_SCOPE_LABEL,
  delegationStatus,
  validateNewDelegation,
  type DelegationScope,
} from "@/lib/auth/businessDelegations";
import { BUSINESS_ROLE_LABEL, type BusinessRole } from "@/lib/auth/businessMembershipAccess";
import {
  DELEGATION_COLUMNS,
  displayNames,
  isMissingRelation,
  toDelegationDto,
  type DelegationRow,
  type MemberLite,
} from "./_shared";
import { riyadhToday } from "@/lib/riyadhToday";
import { recordNotification } from "@/lib/notify";

/**
 * /api/v1/business/delegations — «سجل التفويضات» (owner decision ٣٦; owner
 * decision ٥ «التفويض»). Backed by `public.business_delegations`
 * (supabase/migrations/20261017_30_business_delegations.sql).
 *
 *   GET   the company register: every grant, with its state today. Read by the
 *         owner and by every ACTIVE member (the RLS SELECT policy is
 *         owner / active member / admin). `canManage` is true for the owner
 *         only; `eligibleMembers` (owner only) lists the active members who
 *         can still be delegated.
 *   POST  the owner registers a delegate: { delegateUserId, expiresOn?, note? }.
 *
 * Revocation is PATCH ./[id]. Nothing deletes a row: the register is the record
 * of who could edit the company data, and until when.
 *
 * Every authorization decision is RLS's (the caller's own cookie client). The
 * service client appears once, AFTER the RLS-scoped reads, to project
 * `id, display_name` of exactly the user ids those reads returned — the same
 * rule /api/v1/business/members follows.
 */

const AR = {
  loadFailed: "تعذّر تحميل سجل التفويضات.",
  saveFailed: "تعذّر حفظ التفويض.",
  notReady: "سجل التفويضات غير مفعّل بعد على الخادم.",
  noBusiness: "لا توجد منشأة مرتبطة بهذا الحساب.",
  ownerOnly: "تسجيل التفويضات وإلغاؤها متاح لمالك الحساب فقط.",
  notActiveMember: "لا يمكن تفويض إلا عضو نشط في فريق المنشأة.",
  ownerNotDelegable: "مالك الحساب يملك كل الصلاحيات ولا يحتاج إلى تفويض.",
  alreadyDelegated: "لهذا العضو تفويض سارٍ بالصلاحية نفسها.",
  refused: "رفض الخادم هذا التفويض. تحقق من العضو وتاريخ الانتهاء.",
} as const;

async function readMembers(supabase: SupabaseClient, businessId: string) {
  return supabase.from("business_members").select("user_id, role, status").eq("business_id", businessId);
}

async function readOwnerId(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select("owner_user_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) {
    console.error("[business/delegations] owner lookup failed:", error.message, error.code);
    return null;
  }
  return (data?.owner_user_id as string | undefined) ?? null;
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const scope = await resolveCallerBusinessScope(supabase, user.id, "business/delegations GET");
    if (scope.readFailed && !scope.businessId) {
      return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
    }
    if (!scope.businessId) {
      return NextResponse.json({ error: AR.noBusiness }, { status: 404 });
    }

    const [rowsRes, membersRes] = await Promise.all([
      supabase
        .from("business_delegations")
        .select(DELEGATION_COLUMNS)
        .eq("business_id", scope.businessId)
        .order("granted_at", { ascending: false })
        .limit(200),
      readMembers(supabase, scope.businessId),
    ]);

    if (rowsRes.error) {
      if (isMissingRelation(rowsRes.error.code)) {
        return NextResponse.json({ error: AR.notReady, reason: "not_ready" }, { status: 503 });
      }
      console.error("[business/delegations GET] query failed:", rowsRes.error.message, rowsRes.error.code);
      return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
    }
    if (membersRes.error) {
      console.error("[business/delegations GET] members query failed:", membersRes.error.message, membersRes.error.code);
      return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
    }

    const rows = (rowsRes.data ?? []) as DelegationRow[];
    const members = (membersRes.data ?? []) as MemberLite[];
    const memberByUser = new Map(members.map((m) => [m.user_id, m]));
    const isOwner = scope.scope === "owner";
    const ownerId = isOwner ? user.id : await readOwnerId(supabase, scope.businessId);

    const today = riyadhToday();
    const liveDelegateIds = new Set(
      rows
        .filter((r) => delegationStatus(
          { revokedAt: r.revoked_at, expiresOn: r.expires_on, memberActive: memberByUser.get(r.delegate_user_id)?.status === "active" },
          today,
        ) === "active")
        .map((r) => r.delegate_user_id),
    );
    const eligible = isOwner
      ? members.filter((m) => m.status === "active" && m.user_id !== ownerId && !liveDelegateIds.has(m.user_id))
      : [];

    const names = await displayNames([
      ...rows.flatMap((r) => [r.delegate_user_id, r.granted_by, r.revoked_by]),
      ...eligible.map((m) => m.user_id),
    ]);

    return NextResponse.json({
      data: rows.map((r) => toDelegationDto(r, names, memberByUser.get(r.delegate_user_id), today)),
      total: rows.length,
      canManage: isOwner,
      // The caller's own standing, so the screen can say «أنت مفوَّض» and link
      // to the company data form.
      callerScope: scope.scope,
      eligibleMembers: eligible.map((m) => ({
        userId: m.user_id,
        name: names.get(m.user_id) ?? null,
        role: BUSINESS_ROLE_LABEL[m.role as BusinessRole] ?? null,
      })),
    });
  } catch (err) {
    console.error("[business/delegations GET] Unexpected error:", err);
    return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json().catch(() => null);
    const today = riyadhToday();
    const parsed = validateNewDelegation(body, today);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const scope = await resolveCallerBusinessScope(supabase, user.id, "business/delegations POST", {
      withDelegation: false,
    });
    if (scope.scope !== "owner" || !scope.businessId) {
      if (scope.readFailed) return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
      return NextResponse.json({ error: AR.ownerOnly }, { status: 403 });
    }
    if (parsed.value.delegateUserId === user.id) {
      return NextResponse.json({ error: AR.ownerNotDelegable }, { status: 400 });
    }

    // The trigger refuses a non-member too (23514); asking first is what lets
    // the owner read WHY in Arabic.
    const { data: member, error: memberErr } = await supabase
      .from("business_members")
      .select("user_id, role, status")
      .eq("business_id", scope.businessId)
      .eq("user_id", parsed.value.delegateUserId)
      .maybeSingle();
    if (memberErr) {
      console.error("[business/delegations POST] member lookup failed:", memberErr.message, memberErr.code);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    if (!member || member.status !== "active") {
      return NextResponse.json({ error: AR.notActiveMember }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("business_delegations")
      .insert({
        business_id: scope.businessId,
        delegate_user_id: parsed.value.delegateUserId,
        scope: parsed.value.scope,
        note: parsed.value.note,
        expires_on: parsed.value.expiresOn,
      })
      .select(DELEGATION_COLUMNS)
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") return NextResponse.json({ error: AR.alreadyDelegated }, { status: 409 });
      if (insertErr.code === "23514") return NextResponse.json({ error: AR.refused }, { status: 400 });
      if (isMissingRelation(insertErr.code)) {
        return NextResponse.json({ error: AR.notReady, reason: "not_ready" }, { status: 503 });
      }
      console.error("[business/delegations POST] insert failed:", insertErr.message, insertErr.code);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }

    const row = inserted as DelegationRow;
    await recordNotification({
      userId: row.delegate_user_id,
      title: "تفويض جديد من مالك المنشأة",
      body: `فوّضك مالك الحساب بصلاحية «${DELEGATION_SCOPE_LABEL[row.scope as DelegationScope] ?? row.scope}».`,
      href: "/dashboard/business/delegations",
    });

    const names = await displayNames([row.delegate_user_id, row.granted_by]);
    return NextResponse.json(
      { data: toDelegationDto(row, names, member as MemberLite, today) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[business/delegations POST] Unexpected error:", err);
    return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
  }
}
