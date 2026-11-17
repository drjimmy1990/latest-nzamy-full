/**
 * convertConsultationCore — the decision behind POST …/consultations/[id]/convert
 * (CODE-F13), kept free of Supabase so `node --test` can drive it.
 *
 * Converting is TWO writes: the case (a service_requests row carrying
 * `source_consultation_id`, UNIQUE via uq_service_requests_source_consultation,
 * migration 20260905_phase3 §1d) and then the link on the consultation
 * (`converted_case_request_id`). They are not one transaction. The route used
 * to treat the second write as best-effort: if it failed, the consultation
 * stayed unlinked, the response was still 200, and every retry then hit the
 * unique index and got 409 — forever, with the case orphaned.
 *
 * The fix keeps the constraint and makes the route idempotent instead:
 *   - before inserting, look for a case already born from this consultation;
 *     if there is one, the earlier call got half way — repair the link;
 *   - on a 23505 from the insert (a concurrent double click), look again and
 *     repair the same way;
 *   - the link write must be CONFIRMED (a row back); if it is not, answer 5xx
 *     so the caller retries, and the retry lands on the repair path.
 */

export type ConvertDeps = {
  /** The case already carrying `source_consultation_id = <this consultation>`, if any. */
  findExistingCaseId: () => Promise<{ id: string | null; failed: boolean }>;
  /** Insert the new case; `code` is the Postgres error code on failure. */
  insertCase: () => Promise<{ ok: true } | { ok: false; code?: string }>;
  /** Write the link on the consultation; true only when a row came back. */
  linkConsultation: (caseRequestId: string) => Promise<boolean>;
};

export type ConvertOutcome =
  /** The consultation already names its case — the existing 409. */
  | { kind: "already_converted"; caseRequestId: string }
  /** A new case, and the consultation now links to it. */
  | { kind: "created"; caseRequestId: string }
  /** A case from an earlier, half-finished call; the link is now written. */
  | { kind: "repaired"; caseRequestId: string }
  /** The case exists but the link did not take — retrying repairs it. */
  | { kind: "link_failed"; caseRequestId: string }
  /** Could not tell whether a case already exists — nothing was written. */
  | { kind: "lookup_failed" }
  /** 23505, yet no case for this consultation can be found. */
  | { kind: "conflict_unresolved" }
  /** Any other insert failure; the route maps `code` to its usual error. */
  | { kind: "insert_failed"; code?: string };

/** Postgres unique_violation. */
export const UNIQUE_VIOLATION = "23505";

export async function convertConsultation(
  input: { linkedCaseId: string | null; newCaseId: string },
  deps: ConvertDeps,
): Promise<ConvertOutcome> {
  if (input.linkedCaseId) return { kind: "already_converted", caseRequestId: input.linkedCaseId };

  const before = await deps.findExistingCaseId();
  if (before.failed) return { kind: "lookup_failed" };
  if (before.id) return link(before.id, "repaired", deps);

  const inserted = await deps.insertCase();
  if (!inserted.ok) {
    if (inserted.code !== UNIQUE_VIOLATION) return { kind: "insert_failed", code: inserted.code };
    // Lost a race with a concurrent conversion of the same consultation.
    const after = await deps.findExistingCaseId();
    if (after.failed || !after.id) return { kind: "conflict_unresolved" };
    return link(after.id, "repaired", deps);
  }
  return link(input.newCaseId, "created", deps);
}

async function link(
  caseRequestId: string,
  kind: "created" | "repaired",
  deps: ConvertDeps,
): Promise<ConvertOutcome> {
  const linked = await deps.linkConsultation(caseRequestId).catch(() => false);
  return linked ? { kind, caseRequestId } : { kind: "link_failed", caseRequestId };
}

/**
 * The consultation side of a conversion — ONE builder, so the repair path
 * writes exactly what the first attempt would have.
 */
export function buildConsultationLinkPatch(
  row: { status: string; ended_at: string | null },
  caseRequestId: string,
  nowIso: string,
  /** N01-1: the client card the conversion resolved, when the consultation had none. */
  lawyerClientId?: string | null,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    converted_case_request_id: caseRequestId,
    outcome: "converted_to_case",
    status: ["requested", "scheduled", "no_show"].includes(row.status) ? "completed" : row.status,
  };
  if (!row.ended_at) patch.ended_at = nowIso;
  if (lawyerClientId) patch.lawyer_client_id = lawyerClientId;
  return patch;
}

// ─── N01-1 (owner 13-Nov, spec 01 «الجسر 1») ────────────────────────────────
// A consultation from a platform account that has no `lawyer_clients` card
// used to become a case with `lawyer_client_id = null`, so the client never
// appeared under «الموكلون». The route now finds or creates the card BEFORE
// the case is inserted and links it to both rows. What to do is decided here.

export type ClientCardPlan =
  /** The consultation already names its card — use it, create nothing. */
  | { kind: "keep"; lawyerClientId: string }
  /** No platform account to file a card for (or it is the caller's own). */
  | { kind: "none" }
  /** Look for a visible card of this account; create one when none exists. */
  | { kind: "find_or_create"; clientUserId: string };

export function planClientCard(input: {
  lawyerClientId: string | null;
  requesterUserId: string | null;
  callerId: string;
}): ClientCardPlan {
  if (input.lawyerClientId) return { kind: "keep", lawyerClientId: input.lawyerClientId };
  if (!input.requesterUserId || input.requesterUserId === input.callerId) return { kind: "none" };
  return { kind: "find_or_create", clientUserId: input.requesterUserId };
}

/** What hydrateConsultations shows when it knows no name — never a card name. */
export const GENERIC_CLIENT_NAME = "عميل نظامي";

/** A card needs a real name (lawyer_clients.name is NOT NULL, non-blank). */
export function cardNameFrom(name: string | null | undefined): string | null {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed === GENERIC_CLIENT_NAME) return null;
  return trimmed;
}
