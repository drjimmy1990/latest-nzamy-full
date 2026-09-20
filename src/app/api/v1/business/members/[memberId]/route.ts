import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import {
  decideBusinessMemberPatch,
  type BusinessRole,
} from "@/lib/auth/businessMembershipAccess";

/**
 * /api/v1/business/members/[memberId] — WP-6 B-5, sibling of `../route.ts`.
 * Read that file's header for the table, the contract shape, and the three
 * rules the one service-client read below follows (authorize first with the
 * RLS client; a narrow `id, display_name, email` projection, never a full row;
 * a closed key set). The same pattern `/api/v1/firm/members` has always used.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 * PATCH /api/v1/business/members/{memberId}   body `{ role?, status? }`
 *   — at least one of the two; `role` is one of the EIGHT invitable roles
 *     (never `owner`), `status` is one of `active` | `suspended` | `removed`.
 *   200 `{ data: BusinessMember }`
 *   400  nothing to update, or an unrecognised role/status
 *   403  the caller does not own this company, or the target row IS the
 *        owner's own row
 *   404  no company on this account, or no such member in THIS company
 *   500  a read or the write failed
 *
 * `removed` is a status, not a DELETE: the row stays so the company keeps a
 * record of who was on the roster and when, and so an `on delete cascade`
 * from `profiles` is the only thing that ever really erases one. Nothing in
 * the product treats a `removed` row as a member — every membership read in
 * this repo filters `status = 'active'`.
 *
 * THE OWNER'S OWN ROW IS NOT EDITABLE HERE, the same rule
 * `/api/v1/firm/members/[memberId]` applies to a firm's managing partner.
 * `business_profiles.owner_user_id` is what every RLS write policy reads
 * (`public.is_business_owner`), so demoting or removing the matching
 * membership row would leave a company whose roster and whose access control
 * disagree — and, if it were the last owner row, one nobody can administer.
 * Transferring ownership is a different operation on a different column.
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

const AR = {
  patchFailed: "تعذّر تعديل العضوية.",
  noBusiness: "لا توجد شركة مرتبطة بهذا الحساب.",
  ownerOnly: "إدارة أعضاء الشركة متاحة لمالك الحساب فقط.",
  memberNotFound: "العضو غير موجود.",
  cannotEditOwner: "لا يمكن تعديل عضوية مالك الشركة.",
} as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ memberId: string }> }) {
  try {
    const auth = await assertRole(["corporate"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { memberId } = await context.params;

    const body = await request.json().catch(() => ({}));
    const decision = decideBusinessMemberPatch(body as { role?: unknown; status?: unknown });
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: decision.status });
    }

    // Ownership, before anything is read or written. A member's own company
    // read would succeed (RLS admits it), so the owner column is what decides.
    const { data: business, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (businessError) {
      console.error("[business/members/[id] PATCH] business_profiles lookup failed:", businessError.message, businessError.code);
      return NextResponse.json({ error: AR.patchFailed }, { status: 500 });
    }
    if (!business) {
      const { data: membership, error: membershipError } = await supabase
        .from("business_members")
        .select("business_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (membershipError) {
        console.error("[business/members/[id] PATCH] membership lookup failed:", membershipError.message, membershipError.code);
        return NextResponse.json({ error: AR.patchFailed }, { status: 500 });
      }
      return membership
        ? NextResponse.json({ error: AR.ownerOnly }, { status: 403 })
        : NextResponse.json({ error: AR.noBusiness }, { status: 404 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("business_members")
      .select("id, business_id, user_id")
      .eq("id", memberId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (existingError) {
      console.error("[business/members/[id] PATCH] business_members lookup failed:", existingError.message, existingError.code);
      return NextResponse.json({ error: AR.patchFailed }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: AR.memberNotFound }, { status: 404 });
    }
    if (existing.user_id === business.owner_user_id) {
      return NextResponse.json({ error: AR.cannotEditOwner }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("business_members")
      .update(decision.patch)
      .eq("id", memberId)
      .eq("business_id", business.id)
      .select("id, business_id, user_id, role, status, accepted_at, created_at")
      .single();

    if (error || !data) {
      if (error?.code === "23514") {
        return NextResponse.json({ error: AR.patchFailed }, { status: 400 });
      }
      if (error?.code === "42501") {
        return NextResponse.json({ error: AR.ownerOnly }, { status: 403 });
      }
      console.error("[business/members/[id] PATCH] update error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: AR.patchFailed }, { status: 500 });
    }

    const row = data as BusinessMemberRow;
    // The member's name for the response — see ../route.ts's header. The
    // service client is created only HERE: by this line the caller has been
    // proved, under RLS, to own this company (`business` above) and this row
    // has been proved to belong to it (`existing` above). Three columns, one
    // id, taken from the row the update itself just returned.
    const service = await createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", row.user_id)
      .maybeSingle();

    return NextResponse.json({
      data: {
        id: row.id,
        businessId: row.business_id,
        userId: row.user_id,
        role: row.role as BusinessRole,
        status: row.status,
        displayName: profile?.display_name ?? null,
        email: profile?.email ?? null,
        isOwner: row.user_id === business.owner_user_id,
        acceptedAt: row.accepted_at,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error("[business/members/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: AR.patchFailed }, { status: 500 });
  }
}
