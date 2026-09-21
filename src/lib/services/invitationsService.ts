/**
 * invitationsService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for `/api/v1/me/invitations` — the invitations waiting for the
 * signed-in person's answer, and the two ways to answer them.
 *
 * Review 2026-09-21 A5 / F03. Before this, `POST /api/v1/business/members`
 * inserted `status: 'active'` for anyone whose e-mail a company owner typed:
 * no invitation, no notification, and no way out (the roster PATCH is
 * owner-only). Both roster routes now write `status: 'invited'`, and these
 * three calls are the whole of the answering half.
 *
 * Reads follow `listRead.ts`: a failure is `ok: false`, NEVER an empty list.
 * A pending invitation is a consent decision, and «we could not read it»
 * rendered as «you have none» would hide one.
 *
 * Writes THROW with Arabic screen copy, the same contract
 * `businessMembersService` / `firmMembersService` use — one action failing
 * should abort that action loudly, not degrade into silence.
 */

"use client";

// Relative, with the .ts extension, so `node --test` can load this module and
// exercise the pure half below — the `@/` alias is a tsconfig path Node does
// not resolve. Same spelling as dashboardService.ts:15-16.
import { apiGet, apiMutate, isSupabaseMode } from "./api.ts";
import { listOk, listFailed, listFromApi, type ListRead } from "./listRead.ts";

/** The two entity kinds that have a roster route, and so can invite anyone. */
export const INVITATION_KINDS = ["business", "firm"] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

export interface PendingInvitation {
  /** The `*_members` row id — what the accept/decline calls address. */
  id: string;
  kind: InvitationKind;
  entityId: string;
  /**
   * `null` means «we could not read the name», not «unnamed». An invitee
   * cannot read `business_profiles` / `firm_profiles` for themselves — that
   * is what the server's one display-column lookup is for — so a null here
   * is a read failure and the screen says so rather than printing a dash.
   */
  entityName: string | null;
  role: string;
  /** The Arabic label of `role`, resolved server-side against the same maps the rosters use. */
  roleLabel: string;
  invitedAt: string;
}

const BASE = "/api/v1/me/invitations";

const AR = {
  demoMode: "الدعوات غير متاحة في وضع العرض التجريبي",
  noAccept: "لم يُعِد الخادم نتيجة قبول الدعوة.",
  noDecline: "لم يُعِد الخادم نتيجة رفض الدعوة.",
} as const;

export async function getMyInvitations(): Promise<ListRead<PendingInvitation>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: PendingInvitation[]; total?: number }>(BASE);
    return listFromApi(body);
  } catch (error) {
    console.error("[invitationsService] getMyInvitations failed:", error);
    return listFailed<PendingInvitation>();
  }
}

/**
 * The URL an answer is POSTed to. Exported so a unit test can prove the id is
 * encoded — an un-encoded id would let a crafted value walk out of the route
 * segment it belongs to.
 */
export function answerPath(
  kind: InvitationKind,
  id: string,
  answer: "accept" | "decline",
): string {
  return `${BASE}/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${answer}`;
}

/** Joins the entity. Throws with the route's Arabic error on any failure. */
export async function acceptInvitation(kind: InvitationKind, id: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(AR.demoMode);
  const res = await apiMutate<{ data?: { status?: string } }>(
    answerPath(kind, id, "accept"),
    "POST",
  );
  if (res?.data?.status !== "active") throw new Error(AR.noAccept);
}

/** Refuses the invitation (the row becomes `removed`, it is not deleted). */
export async function declineInvitation(kind: InvitationKind, id: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(AR.demoMode);
  const res = await apiMutate<{ data?: { status?: string } }>(
    answerPath(kind, id, "decline"),
    "POST",
  );
  if (res?.data?.status !== "removed") throw new Error(AR.noDecline);
}

/**
 * What to call the inviting entity in a sentence. Its real name when the
 * server could read one, and an explicit «تعذّرت قراءة الاسم» when it could
 * not — never a dash, which would make «we do not know who is asking» look
 * like «nobody is asking». Pure, so the banner and its test agree.
 */
export function inviterNameAr(invitation: Pick<PendingInvitation, "kind" | "entityName">): string {
  if (invitation.entityName) return invitation.entityName;
  return invitation.kind === "business" ? "شركة (تعذّرت قراءة الاسم)" : "مكتب محاماة (تعذّرت قراءة الاسم)";
}

/** «دعوة للانضمام إلى فريق شركة» / «… مكتب محاماة». */
export function invitationKindLabelAr(kind: InvitationKind): string {
  return kind === "business" ? "شركة" : "مكتب محاماة";
}
