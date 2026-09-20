import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BUSINESS_INVITE_ROLE_VALUES,
  isInvitableBusinessRole,
  type BusinessRole,
} from "@/lib/auth/businessMembershipAccess";
import { resolveBusinessProfileScope } from "@/lib/auth/businessProfileScope";
import { escapeLikePattern } from "@/lib/services/likePattern";

/**
 * /api/v1/business/members — the company roster (WP-6 B-5, plan §5 Q7 = yes,
 * UAT-TEAM-001 app half). Backed by `public.business_members`
 * (20260603_phase1_002_entities.sql:298-318).
 *
 * Until this route the ONLY writer of that table was the
 * `ensure_business_owner_membership` trigger (20260914), which backfills the
 * owner's own row. `/dashboard/business/team` rendered four invented people
 * and an invite modal whose «إرسال الدعوة» called `setSent(true)` and printed
 * a hardcoded `https://nezamy.sa/invite/x7k2m9p`. This route is the first
 * place a second person can really join a company.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 * GET  /api/v1/business/members
 *   200 `{ data: BusinessMember[], total: number, canManage: boolean }`
 *        — active rows first, then `created_at` ascending (the owner's row,
 *          written at company creation, sorts first among actives).
 *        — `canManage` is true only for the owner; the UI hides its write
 *          controls on it rather than discovering the 403 by pressing them.
 *   403  the caller is neither the owner nor an ACTIVE member
 *   404  no company on this account
 *   500  a read failed — never `{ data: [] }` (see listRead.ts)
 *
 * POST /api/v1/business/members   body `{ email: string, role: BusinessRole }`
 *   201 `{ data: BusinessMember }`
 *   400  missing e-mail, or a role outside the eight invitable ones
 *   403  the caller is not the company owner (also the RLS answer, 42501)
 *   404  no company on this account, or no account a company may add carries
 *        that e-mail (see the invite lookup below)
 *   409  that account is already on this company's roster
 *
 * `BusinessMember` = `{ id, businessId, userId, role, status, displayName,
 * email, isOwner, acceptedAt, createdAt }` — see
 * src/lib/services/businessMembersService.ts.
 *
 * ── WHY A SERVICE CLIENT FOR NAMES AND E-MAILS ─────────────────────────────
 * `profiles` RLS admits the caller's own row and nothing else — the allow-list
 * of three policies in 20260921_01, on top of 20260716. A company roster has
 * to name the OTHER members, and a company owner has to be able to find a
 * colleague's account by e-mail; neither is possible through an RLS client, so
 * both reads go through `createServiceClient()` exactly as
 * `/api/v1/firm/members` (:135-139, :202-208) has always done. This is the
 * established pattern in this codebase for an entity roster, and this route
 * now follows it rather than inventing a second, weaker one.
 *
 * The pattern is what makes it safe, and it has three parts — all three, every
 * time:
 *   1. AUTHORIZE FIRST, with the RLS client. The service client is created
 *      only after `business_profiles` / `business_members` have already proved,
 *      under RLS, that this caller belongs to this company (GET) or owns it
 *      (POST). Never before that, and never to decide it.
 *   2. A NARROW PROJECTION, never a full row: `id, display_name, email` —
 *      plus `user_type` on the invite lookup, because it is what the lookup
 *      filters on. `profiles` also carries phone, address, nationality and the
 *      rest; none of it leaves this route, because none of it is selected.
 *   3. A CLOSED KEY SET. The roster read is `.in("id", userIds)` for exactly
 *      the ids the RLS-scoped `business_members` query already returned —
 *      never an open-ended query. The invite lookup is one e-mail, restricted
 *      to the account types a company may actually add, so its 404 reads the
 *      same whether or not an address belongs to an admin or another entity.
 *
 * This is NOT `service_role` impersonating a user or standing in for a missing
 * policy (plan ground rule 3, UAT-SEC-001): the authorization decision is still
 * RLS's, and is already made before the key is used. It is a server-only
 * projection of two display columns for rows the caller is proven entitled to
 * see.
 *
 * `displayName` / `email` are still `null`-able and still mean «we could not
 * read this» — the DTO carries null rather than "—" so the screen can say
 * «لم نتمكن من قراءة اسم هذا العضو» instead of printing a dash that looks like
 * an empty name. After this change that only happens if the projection itself
 * fails, which the GET treats as non-fatal (the roster was read; the names
 * were not).
 *
 * ── WHO MAY WRITE ───────────────────────────────────────────────────────────
 * The company OWNER (`business_profiles.owner_user_id = auth.uid()`), which
 * is also what the RLS INSERT/UPDATE/DELETE policies enforce through
 * `public.is_business_owner(business_id)` (20260921_03). The ownership check
 * here is not a substitute for those policies — it is what turns their 42501
 * into a specific Arabic 403.
 */

interface BusinessMemberRow {
  id: string;
  business_id: string;
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

function toDto(row: BusinessMemberRow, profile: ProfileLite | undefined, ownerUserId: string | null) {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    role: row.role as BusinessRole,
    status: row.status,
    // null, not "—": see the header. An unreadable name and an empty one are
    // different facts and the screen has to be able to tell them apart. With
    // the service-client projection in place this is now rare — it means the
    // projection itself failed, not that RLS refused.
    displayName: profile?.display_name ?? null,
    email: profile?.email ?? null,
    isOwner: ownerUserId !== null && row.user_id === ownerUserId,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

/**
 * The caller's company and whether they own it. Two RLS-scoped reads, decided
 * by the same pure function `/api/v1/profile` uses, so «owner», «member» and
 * «none» mean the same thing on both endpoints.
 */
async function resolveCallerBusiness(supabase: SupabaseClient, userId: string) {
  const [owned, membership] = await Promise.all([
    supabase.from("business_profiles").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
    supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (owned.error) {
    console.error("[business/members] owned business lookup failed:", owned.error.message, owned.error.code);
  }
  if (membership.error) {
    console.error(
      "[business/members] membership lookup failed:",
      membership.error.message,
      membership.error.code,
    );
  }

  return resolveBusinessProfileScope({
    ownedId: (owned.data?.id as string | undefined) ?? null,
    ownedFailed: Boolean(owned.error),
    memberId: (membership.data?.business_id as string | undefined) ?? null,
    memberFailed: Boolean(membership.error),
  });
}

/** The company's owner_user_id, or null when it could not be read. */
async function readOwnerUserId(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select("owner_user_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) {
    console.error("[business/members] owner lookup failed:", error.message, error.code);
    return null;
  }
  return (data?.owner_user_id as string | undefined) ?? null;
}

/**
 * The `profiles.user_type` values the invite lookup will resolve — the firm
 * route's `.in("user_type", ["lawyer", "individual"])` (:207), decided for a
 * company instead of a firm.
 *
 * IN: `individual` (an employee's own personal account, the normal case);
 * `lawyer` (in-house counsel, and the `seconded` role is literally a محامٍ
 * معار); `corporate` (the owner's OWN account type — leaving it out would turn
 * «you are already a member» into «no such account» when an owner types their
 * own address, which would be a lie).
 *
 * OUT: `admin`, and every other entity type (`firm`, `provider`, `government`,
 * `ngo`, `micro`) — an organisation account is not an employee, and a lookup
 * that cannot see them cannot be used to discover that an address belongs to
 * one. The 404 reads identically either way, exactly as on the firm route.
 */
const INVITABLE_ACCOUNT_TYPES = ["individual", "lawyer", "corporate"] as const;

const AR = {
  loadFailed: "تعذّر تحميل فريق الشركة.",
  addFailed: "تعذّر إضافة العضو.",
  noBusiness: "لا توجد شركة مرتبطة بهذا الحساب.",
  notAMember: "غير مصرح — هذه القائمة متاحة لأعضاء الشركة فقط.",
  ownerOnly: "إدارة أعضاء الشركة متاحة لمالك الحساب فقط.",
  emailRequired: "البريد الإلكتروني مطلوب.",
  // Renamed from `accountNotReadable`: the lookup is no longer limited by what
  // the CALLER may read, so a message blaming their access would now be a lie.
  // Says what the firm route's 404 says — no eligible account carries this
  // address — without confirming or denying that the address exists at all.
  accountNotFound:
    "لا يوجد حساب مؤهل بهذا البريد على المنصّة. تأكّد من البريد أو تواصل مع فريق نظامي لإضافة العضو.",
  alreadyMember: "هذا المستخدم عضو في الشركة مسبقاً.",
} as const;

export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const scope = await resolveCallerBusiness(supabase, user.id);
    if (scope.readFailed) {
      return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
    }
    if (!scope.businessId) {
      // "none" after two successful reads: this account genuinely has no
      // company, whether as owner or as an active member.
      return NextResponse.json(
        { error: auth.userType === "corporate" ? AR.noBusiness : AR.notAMember },
        { status: auth.userType === "corporate" ? 404 : 403 },
      );
    }

    const { data: rows, error: membersError, count } = await supabase
      .from("business_members")
      .select("id, business_id, user_id, role, status, accepted_at, created_at", { count: "exact" })
      .eq("business_id", scope.businessId);

    if (membersError) {
      console.error("[business/members GET] query failed:", membersError.message, membersError.code);
      return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
    }

    const memberRows = (rows ?? []) as BusinessMemberRow[];
    const userIds = [...new Set(memberRows.map((r) => r.user_id))];

    // Names and e-mails, through the service client — the firm route's
    // pattern (firm/members/route.ts:135-139) and the header's three rules.
    // It is created HERE, after `resolveCallerBusiness` has already proved
    // under RLS that this caller belongs to this company, and it is asked for
    // three columns of exactly the ids the RLS-scoped `business_members` query
    // above returned. Not a full row, not an open query, not an authorization
    // decision.
    let profiles: ProfileLite[] = [];
    if (userIds.length > 0) {
      const service = await createServiceClient();
      const { data: profileRows, error: profileError } = await service
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      if (profileError) {
        // Not fatal, unlike the firm route's 500 on the same failure: the
        // roster itself WAS read, and null already means "we could not read
        // this" in this DTO (see the header). Throwing away a roster the user
        // is entitled to because one display column failed would be the
        // «we could not read it» → «there is nothing» inversion in reverse.
        console.error("[business/members GET] profiles lookup failed:", profileError.message, profileError.code);
      } else {
        profiles = (profileRows ?? []) as ProfileLite[];
      }
    }
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const ownerUserId = await readOwnerUserId(supabase, scope.businessId);

    const sorted = [...memberRows].sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    });

    const data = sorted.map((row) => toDto(row, profileById.get(row.user_id), ownerUserId));
    return NextResponse.json({
      data,
      total: count ?? data.length,
      canManage: scope.scope === "owner",
    });
  } catch (err) {
    console.error("[business/members GET] Unexpected error:", err);
    return NextResponse.json({ error: AR.loadFailed }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["corporate"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json().catch(() => ({}));
    const { email, role } = body as { email?: string; role?: string };

    if (!email || !email.trim()) {
      return NextResponse.json({ error: AR.emailRequired }, { status: 400 });
    }
    if (!isInvitableBusinessRole(role)) {
      return NextResponse.json(
        { error: `الدور يجب أن يكون واحدًا من: ${BUSINESS_INVITE_ROLE_VALUES.join(", ")}` },
        { status: 400 },
      );
    }

    const { data: business, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (businessError) {
      console.error("[business/members POST] business_profiles lookup failed:", businessError.message, businessError.code);
      return NextResponse.json({ error: AR.addFailed }, { status: 500 });
    }
    if (!business) {
      // Either this account owns no company, or it is a MEMBER of one — both
      // mean "you may not add people", and the member deserves the specific
      // reason rather than a bare 404.
      const scope = await resolveCallerBusiness(supabase, user.id);
      if (scope.scope === "member") {
        return NextResponse.json({ error: AR.ownerOnly }, { status: 403 });
      }
      return NextResponse.json({ error: AR.noBusiness }, { status: 404 });
    }

    // Service client, created only now — `business` above is the proof, under
    // RLS, that this caller owns a company. One e-mail, four columns, and only
    // the account types a company may actually add: the firm route's invite
    // lookup (firm/members/route.ts:202-208) with a company's list instead of
    // a firm's. See the header and INVITABLE_ACCOUNT_TYPES.
    const service = await createServiceClient();
    // PostgREST maps `*` to `%` and hands the rest to SQL ILIKE, where `%` and
    // `_` are wildcards. An e-mail address is a literal: neutralise all of them so
    // an owner cannot enumerate other accounts with a pattern (review MUST FIX 1).
    const emailPattern = escapeLikePattern(email.trim());

    const { data: account, error: accountError } = await service
      .from("profiles")
      .select("id, display_name, email, user_type")
      .ilike("email", emailPattern)
      .in("user_type", [...INVITABLE_ACCOUNT_TYPES])
      .maybeSingle();

    if (accountError) {
      console.error("[business/members POST] profiles lookup failed:", accountError.message, accountError.code);
      return NextResponse.json({ error: AR.addFailed }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: AR.accountNotFound }, { status: 404 });
    }

    // `status: 'active'` with `accepted_at`, exactly as /api/v1/firm/members
    // POST does: there is no invite e-mail and no acceptance screen anywhere in
    // the product, so a row parked at 'invited' would be a pending invitation
    // nobody can accept. `team_invitations` exists and is unused; wiring it is
    // its own task.
    const { data, error } = await supabase
      .from("business_members")
      .insert({
        business_id: business.id,
        user_id: account.id,
        role,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .select("id, business_id, user_id, role, status, accepted_at, created_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        // uq_business_members_business_user (20260914:18-19)
        return NextResponse.json({ error: AR.alreadyMember }, { status: 409 });
      }
      if (error?.code === "23514") {
        return NextResponse.json(
          { error: `الدور يجب أن يكون واحدًا من: ${BUSINESS_INVITE_ROLE_VALUES.join(", ")}` },
          { status: 400 },
        );
      }
      if (error?.code === "42501") {
        return NextResponse.json({ error: AR.ownerOnly }, { status: 403 });
      }
      console.error("[business/members POST] insert error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: AR.addFailed }, { status: 500 });
    }

    return NextResponse.json(
      {
        data: toDto(
          data as BusinessMemberRow,
          { id: account.id, display_name: account.display_name, email: account.email },
          business.owner_user_id as string,
        ),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[business/members POST] Unexpected error:", err);
    return NextResponse.json({ error: AR.addFailed }, { status: 500 });
  }
}
