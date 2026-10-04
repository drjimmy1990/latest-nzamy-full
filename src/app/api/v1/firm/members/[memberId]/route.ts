import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import type { FirmRole } from "@/types/firmBackendReady";

/**
 * /api/v1/firm/members/[memberId] — Phase 2, sibling of `../route.ts`. See
 * that file's header for the table, the RLS shape and why names/emails are
 * read through a service client. This file only PATCHes one row: role and/or
 * status (`active` ⇄ `suspended`/`removed`) — never the owner's own row.
 *
 * ── CONSENT (review 2026-09-21 A5 / F03) ────────────────────────────────────
 * This endpoint may NOT answer an invitation on the invitee's behalf.
 * `POST ../route.ts` now writes `status: 'invited', accepted_at: null`, and
 * the only thing that turns that into a membership is the invited person's own
 * `POST /api/v1/me/invitations/firm/{id}/accept`. Without the check below the
 * whole flow is decorative: two owner-only calls (POST an invitation, then
 * PATCH it to `active`) put a stranger on the roster exactly as before, and
 * the invitation then disappears from their banner so they are never asked.
 *
 * The rule is stated on the TARGET STATE, not on one transition, so
 * `invited → suspended → active` is refused too: `accepted_at` is the only
 * evidence that a person said yes, and only their own answer writes it.
 * Re-activating someone who DID accept and was later suspended still works.
 * The same invariant is enforced in the database by
 * `entity_member_invitation_answer_guard()` (20260922_02), because this route
 * is not the only way to reach the table.
 *
 *   409  `status: "active"` on a row that was never accepted
 */

const FIRM_ROLE_VALUES: readonly FirmRole[] = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_secretary", "office_admin", "finance_manager", "hr_manager",
  "compliance_manager", "external_of_counsel", "legal_consultant",
  "in_house_counsel",
];
const FIRM_ROLE_SET = new Set<string>(FIRM_ROLE_VALUES);
const PATCHABLE_STATUSES = new Set(["active", "suspended", "removed"]);

interface FirmMemberRow {
  id: string;
  firm_id: string;
  user_id: string;
  role: string;
  status: string;
  accepted_at: string | null;
  created_at: string;
}

/**
 * PATCH /api/v1/firm/members/[memberId]
 * Body: { role?, status? } — at least one of the two.
 *
 * Refuses (403) touching the firm owner's own `managing_partner` row: the
 * owner is not a member the owner manages, the same way a lawyer's own
 * hearings route never lets `owner_user_id` be reassigned by the caller.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ memberId: string }> }) {
  try {
    const auth = await assertRole(["firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { memberId } = await context.params;

    const body = await request.json().catch(() => ({}));
    const { role, status } = body as { role?: string; status?: string };

    if (role === undefined && status === undefined) {
      return NextResponse.json({ error: "لا يوجد ما يُحدَّث." }, { status: 400 });
    }
    if (role !== undefined && !FIRM_ROLE_SET.has(role)) {
      return NextResponse.json(
        { error: `الدور يجب أن يكون واحدًا من: ${FIRM_ROLE_VALUES.join(", ")}` },
        { status: 400 },
      );
    }
    if (status !== undefined && !PATCHABLE_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "الحالة يجب أن تكون واحدة من: active, suspended, removed" },
        { status: 400 },
      );
    }

    const { data: firm, error: firmError } = await supabase
      .from("firm_profiles")
      .select("id, owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (firmError) {
      console.error("[firm/members/[id] PATCH] firm_profiles lookup failed:", firmError.message, firmError.code);
      return NextResponse.json({ error: "تعذّر تعديل العضوية." }, { status: 500 });
    }
    if (!firm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 });
    }

    // `status, accepted_at` are read for the CONSENT check below — the row's
    // current state has to be known BEFORE the update, not after it.
    const { data: existing, error: existingError } = await supabase
      .from("firm_members")
      .select("id, firm_id, user_id, status, accepted_at")
      .eq("id", memberId)
      .eq("firm_id", firm.id)
      .maybeSingle();
    if (existingError) {
      console.error("[firm/members/[id] PATCH] firm_members lookup failed:", existingError.message, existingError.code);
      return NextResponse.json({ error: "تعذّر تعديل العضوية." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "العضو غير موجود." }, { status: 404 });
    }
    if (existing.user_id === firm.owner_user_id) {
      return NextResponse.json({ error: "لا يمكن تعديل عضوية صاحب المكتب." }, { status: 403 });
    }

    // CONSENT — see the header. An invitation is answered by the invitee, and
    // by nobody else. 409 rather than 403: the caller IS allowed here, the row
    // is simply not in a state this endpoint may activate.
    const existingAcceptedAt = (existing as { accepted_at?: string | null }).accepted_at ?? null;
    if (status === "active" && existingAcceptedAt === null) {
      return NextResponse.json(
        { error: "لا يمكن تفعيل العضوية قبل أن يقبل المدعوّ الدعوة بنفسه." },
        { status: 409 },
      );
    }

    const patch: Record<string, unknown> = {};
    if (role !== undefined) patch.role = role;
    if (status !== undefined) patch.status = status;

    const { data, error } = await supabase
      .from("firm_members")
      .update(patch)
      .eq("id", memberId)
      .eq("firm_id", firm.id)
      .select("id, firm_id, user_id, role, status, accepted_at, created_at")
      .single();

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
      console.error("[firm/members/[id] PATCH] update error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: "تعذّر تعديل العضوية." }, { status: 500 });
    }

    const row = data as FirmMemberRow;
    const service = await createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", row.user_id)
      .maybeSingle();

    return NextResponse.json({
      data: {
        id: row.id,
        firmId: row.firm_id,
        userId: row.user_id,
        role: row.role as FirmRole,
        status: row.status,
        displayName: profile?.display_name || "—",
        email: profile?.email ?? null,
        isOwner: row.user_id === firm.owner_user_id,
        acceptedAt: row.accepted_at,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error("[firm/members/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تعديل العضوية." }, { status: 500 });
  }
}
