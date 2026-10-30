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
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    converted_case_request_id: caseRequestId,
    outcome: "converted_to_case",
    status: ["requested", "scheduled", "no_show"].includes(row.status) ? "completed" : row.status,
  };
  if (!row.ended_at) patch.ended_at = nowIso;
  return patch;
}
