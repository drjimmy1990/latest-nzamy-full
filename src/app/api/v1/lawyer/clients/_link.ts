import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * _link.ts — shared guard for pointing a platform account (`client_user_id`)
 * at something a lawyer controls: a `lawyer_clients` card (POST/PATCH on
 * this route) or, directly, a `contracts` row (POST/PATCH on
 * ../contracts — that route also accepts `clientUserId` in its own body,
 * independently of any card, so it calls this same guard rather than trusting
 * the value unchecked).
 * ─────────────────────────────────────────────────────────
 * Until this check existed, both places wrote `body.clientUserId` straight
 * into a `client_user_id` column with no verification at all — a lawyer
 * could bind an arbitrary uuid. On a card, that becomes exploitable the
 * moment it is copied onto a contract; on a contract directly, it is
 * immediate: the contracts SELECT policy grants read access to
 * `client_user_id = auth.uid()` (20260905_phase3_consultations_and_contracts.sql),
 * so setting it to a stranger's uuid hands that stranger the contract on the spot.
 *
 * "Linkable" means the RLS-scoped `supabase` client — the same client every
 * caller here already carries, never a service-role client — can prove a
 * PRIOR relationship: a `service_requests` or `consultations` row naming
 * `clientUserId` as `requester_user_id` that this lawyer (or an active
 * colleague at the same firm, through `can_access_case_row`) is already
 * allowed to read. RLS does the actual scoping; this helper only checks
 * whether the row comes back.
 */

export type LinkCheckResult =
  | { ok: true }
  | { ok: false; status: number; error: string; cardId?: string };

export async function assertLinkableAccount(
  supabase: SupabaseClient,
  userId: string,
  clientUserId: string,
  /**
   * The card being patched, if any. Excluded from the "already linked to
   * another card" check so re-saving a card that already carries this exact
   * `clientUserId` is not itself a 409 — only ANOTHER card claiming it is.
   */
  excludeCardId?: string,
  /**
   * Enforce the "already linked to another card" 409. The two routes in this
   * folder — which write `lawyer_clients.client_user_id` itself — need it:
   * one account, one card. Callers that only stamp `client_user_id` onto an
   * UNRELATED row (contracts POST/PATCH copying it onto a contract) don't —
   * the account legitimately already having a card is not a conflict with
   * that write. Defaults to true for the folder's own two callers.
   */
  checkCardConflict: boolean = true,
): Promise<LinkCheckResult> {
  if (clientUserId === userId) {
    return { ok: false, status: 400, error: "لا يمكن ربط بطاقة بحسابك أنت" };
  }

  // The service_requests SELECT policy also lets any verified lawyer browse
  // UNASSIGNED marketplace requests (20260815_marketplace_excludes_ai_workspace),
  // so "a row comes back" is not, by itself, a relationship with this lawyer.
  // Require the request to be assigned to the caller, or to belong to the
  // caller's active firm — the same test the consultations policy applies.
  const { data: membership } = await supabase
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const firmId = (membership as { firm_id?: string } | null)?.firm_id ?? null;
  const relationship = firmId ? `assigned_to.eq.${userId},firm_id.eq.${firmId}` : `assigned_to.eq.${userId}`;

  const [requests, consultations, existingCards] = await Promise.all([
    supabase.from("service_requests").select("id").eq("requester_user_id", clientUserId).or(relationship).limit(1),
    supabase.from("consultations").select("id").eq("requester_user_id", clientUserId).limit(1),
    supabase.from("lawyer_clients").select("id").eq("client_user_id", clientUserId).limit(5),
  ]);

  if (requests.error) {
    console.error("[lawyer/clients/_link] service_requests check failed:", requests.error.message, requests.error.code);
  }
  if (consultations.error) {
    console.error("[lawyer/clients/_link] consultations check failed:", consultations.error.message, consultations.error.code);
  }

  if (checkCardConflict) {
    if (existingCards.error) {
      console.error("[lawyer/clients/_link] existing-card check failed:", existingCards.error.message, existingCards.error.code);
      // Fail CLOSED: a query error here must not read as "no other card holds
      // this account" — that would let a duplicate link through silently.
      return { ok: false, status: 500, error: "تعذّر التحقق من ربط الحساب." };
    }

    const conflictingCard = (existingCards.data ?? []).find((row) => row.id !== excludeCardId) as
      | { id: string }
      | undefined;
    if (conflictingCard) {
      return { ok: false, status: 409, error: "هذا الحساب مربوط ببطاقة أخرى", cardId: conflictingCard.id };
    }
  } else if (existingCards.error) {
    console.error("[lawyer/clients/_link] existing-card check failed (non-enforcing):", existingCards.error.message, existingCards.error.code);
  }

  const hasRequest = (requests.data ?? []).length > 0;
  const hasConsultation = (consultations.data ?? []).length > 0;
  if (!hasRequest && !hasConsultation) {
    return { ok: false, status: 400, error: "لا يمكن ربط البطاقة إلا بحساب سبق أن طلب خدمة منك أو من مكتبك" };
  }

  return { ok: true };
}

export interface LinkPropagationCounts {
  contracts: number;
  serviceRequests: number;
  consultations: number;
}

/**
 * Best-effort propagation after a successful LINK: backfills the three
 * tables that already record a relationship with `clientUserId` but don't
 * yet point at this card. Every write goes through the RLS-scoped
 * `supabase` client, so it only ever touches rows the caller may already
 * update (see the migrations' update policies) — this fills in a link, it
 * never bypasses one. A failed leg is logged and counted as 0; it never
 * fails the request — the card itself is already saved by the time this runs.
 */
export async function propagateLink(
  supabase: SupabaseClient,
  cardId: string,
  clientUserId: string,
): Promise<LinkPropagationCounts> {
  const [contracts, serviceRequests, consultations] = await Promise.all([
    supabase
      .from("contracts")
      .update({ client_user_id: clientUserId })
      .eq("lawyer_client_id", cardId)
      .is("client_user_id", null)
      .select("id"),
    supabase
      .from("service_requests")
      .update({ lawyer_client_id: cardId })
      .eq("requester_user_id", clientUserId)
      .is("lawyer_client_id", null)
      .select("id"),
    supabase
      .from("consultations")
      .update({ lawyer_client_id: cardId })
      .eq("requester_user_id", clientUserId)
      .is("lawyer_client_id", null)
      .select("id"),
  ]);

  if (contracts.error) {
    console.error("[lawyer/clients/_link] contracts propagation failed:", contracts.error.message, contracts.error.code);
  }
  if (serviceRequests.error) {
    console.error("[lawyer/clients/_link] service_requests propagation failed:", serviceRequests.error.message, serviceRequests.error.code);
  }
  if (consultations.error) {
    console.error("[lawyer/clients/_link] consultations propagation failed:", consultations.error.message, consultations.error.code);
  }

  return {
    contracts: contracts.data?.length ?? 0,
    serviceRequests: serviceRequests.data?.length ?? 0,
    consultations: consultations.data?.length ?? 0,
  };
}
