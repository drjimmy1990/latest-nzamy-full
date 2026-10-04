import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * _answer.ts — the shared half of
 * `POST /api/v1/me/invitations/{kind}/{id}/accept` and `…/decline`.
 *
 * Review 2026-09-21 A5 / F03. Until this endpoint a company or firm owner who
 * knew an e-mail address put that person on the roster as `active` and the
 * person had no say and no exit: `PATCH /api/v1/business/members/{id}` is
 * owner-only, and 20260921_03's RLS matrix let only owner/admin UPDATE a
 * `*_members` row. The POST routes now write `status: 'invited'`, and this is
 * the only place the invited person can answer.
 *
 * ── THE WRITE IS RLS-SCOPED, DELIBERATELY ──────────────────────────────────
 * No service client anywhere in this file. The row is reached with the
 * caller's own cookie-scoped client, through the policy
 * `"<x>_members: invitee can answer own invitation"`
 * (20260922_02_members_accept_own_invitation.sql):
 *
 *   using       (user_id = auth.uid() and status = 'invited')
 *   with check  (user_id = auth.uid() and status in ('active','removed'))
 *
 * so the database — not this code — is what refuses somebody else's
 * invitation. The three `.eq()` filters below say the same thing a second
 * time, which is what turns «RLS matched no row» into a specific Arabic 404
 * instead of a silent success on 0 rows.
 *
 * The same migration adds a BEFORE UPDATE trigger that pins every other
 * column (role, permissions, the entity key), because RLS filters rows, not
 * columns, and `authenticated` holds PostgREST's table-level UPDATE grant.
 * That is why this route can send `status` and `accepted_at` and nothing
 * else and still be the whole story for a caller who uses the REST API
 * directly.
 *
 * ── DECLINE IS `removed`, NOT A DELETE ─────────────────────────────────────
 * The same convention the roster routes use: the row stays, so the company
 * keeps a record, and `POST /api/v1/{business,firm}/members` can re-invite a
 * `removed` row later.
 */

export const INVITATION_KINDS = ["business", "firm"] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

/** kind → the membership table it names. The only two with an app surface. */
export const INVITATION_TABLE: Record<InvitationKind, string> = {
  business: "business_members",
  firm: "firm_members",
};

export function isInvitationKind(value: unknown): value is InvitationKind {
  return typeof value === "string" && (INVITATION_KINDS as readonly string[]).includes(value);
}

export const INVITATION_AR = {
  // One sentence for «no such invitation», «not yours» and «already answered»:
  // they are the same answer to the caller, and distinguishing them would let
  // anyone probe for the existence of somebody else's invitation.
  notFound: "لا توجد دعوة بانتظار ردّك بهذا المعرّف — ربما تم الرد عليها أو سحبها.",
  forbidden: "غير مصرح — هذه الدعوة ليست لك.",
  acceptFailed: "تعذّر قبول الدعوة.",
  declineFailed: "تعذّر رفض الدعوة.",
} as const;

export async function answerInvitation(
  params: Promise<{ kind: string; id: string }>,
  answer: "accept" | "decline",
): Promise<NextResponse> {
  const failed = answer === "accept" ? INVITATION_AR.acceptFailed : INVITATION_AR.declineFailed;
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { kind, id } = await params;
    if (!isInvitationKind(kind) || !id || !id.trim()) {
      return NextResponse.json({ error: INVITATION_AR.notFound }, { status: 404 });
    }

    const patch =
      answer === "accept"
        ? { status: "active", accepted_at: new Date().toISOString() }
        : { status: "removed" };

    const { data, error } = await supabase
      .from(INVITATION_TABLE[kind])
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "invited")
      .select("id, status")
      .maybeSingle();

    if (error) {
      // 22P02: `id` was not a uuid at all. That is «no such invitation» to the
      // caller, not a server fault.
      if (error.code === "22P02") {
        return NextResponse.json({ error: INVITATION_AR.notFound }, { status: 404 });
      }
      if (error.code === "42501") {
        return NextResponse.json({ error: INVITATION_AR.forbidden }, { status: 403 });
      }
      if (error.code === "23514") {
        return NextResponse.json({ error: failed }, { status: 400 });
      }
      if (error.code === "23503") {
        return NextResponse.json({ error: failed }, { status: 400 });
      }
      console.error(`[me/invitations ${answer}] update failed:`, error.message, error.details, error.code);
      return NextResponse.json({ error: failed }, { status: 500 });
    }

    // No error and no row: RLS admitted nothing, or the row is no longer
    // `invited`. Never a 200 on 0 rows — the caller would think they had
    // joined.
    if (!data) {
      return NextResponse.json({ error: INVITATION_AR.notFound }, { status: 404 });
    }

    return NextResponse.json({
      data: { id: data.id as string, kind, status: data.status as string },
    });
  } catch (err) {
    console.error(`[me/invitations ${answer}] Unexpected error:`, err);
    return NextResponse.json({ error: failed }, { status: 500 });
  }
}
