/**
 * founderPlan.ts — the lawyer founder membership (P3): its ids, what one
 * activation grants, and which AI run may spend which founder credit.
 *
 * The SQL is the truth (supabase/migrations/20261101_10_founder_membership.sql:
 * founder_activate writes a 12-month seat, drafting_work 6 + independent_output
 * 1 credits with the same end, and a 365-day lib-founder library grant); the
 * constants here mirror it for checkout copy, the AI run route and the UI.
 *
 * The price lives in the one price book (src/lib/pricing/priceBook.ts, entry
 * "lawyer-founder-2026", kind "membership"). This module does NOT import the
 * book, so the book may later import helpers from here without a cycle;
 * founderPlan.test.ts holds the two ids together.
 *
 * Pure: relative type imports only, so `node --test` loads it directly.
 */

import type { DraftKindId } from "../ai/draftKinds.ts";

export const FOUNDER_PLAN_ID = "lawyer-founder-2026";
export const FOUNDER_CAMPAIGN_ID = "founder-2026";

/** The membership lasts this long from activation (founder_activate: now() + 12 months). */
export const FOUNDER_MEMBERSHIP_MONTHS = 12;

/** The lib-founder library grant's length (founder_activate → library_grant_access(…, 365, …)). */
export const FOUNDER_LIBRARY_DAYS = 365;

export type FounderCreditKind = "drafting_work" | "independent_output";

/** Credits one activation writes (founder_credits rows). */
export const FOUNDER_CREDITS: Readonly<Record<FounderCreditKind, number>> = Object.freeze({
  drafting_work: 6,
  independent_output: 1,
});

/** The tool a drafting work is spent on, at its first turn only. */
export const FOUNDER_DRAFTER_TOOL = "legal-drafter";

/**
 * The drafter kinds a work may be spent on (manifest). `rejoinder` is left
 * out until the owner answers ٣٩٩ (controller ruling R3).
 */
export const FOUNDER_DRAFT_KINDS: readonly DraftKindId[] = Object.freeze([
  "claim",
  "reply",
  "supplementary",
  "closing",
  "appeal",
  "cassation",
  "petition",
] as const);

/**
 * The tools the one independent output may be spent on. Direction support
 * has no tool yet («قريبًا») and spends nothing. `wargaming` is
 * consultantBlocked: the choice UI must not offer it to a consultant.
 */
export const FOUNDER_OUTPUT_TOOLS = ["contracts-pro", "legal-opinion-consult", "legal-opinion-letter", "wargaming"] as const;

export type FounderOutputTool = (typeof FOUNDER_OUTPUT_TOOLS)[number];

function isFounderDraftKind(kind: unknown): kind is DraftKindId {
  return typeof kind === "string" && (FOUNDER_DRAFT_KINDS as readonly string[]).includes(kind);
}

function isFounderOutputTool(tool: string): tool is FounderOutputTool {
  return (FOUNDER_OUTPUT_TOOLS as readonly string[]).includes(tool);
}

/**
 * The founder credit a run of `tool` with `input` at `turn` would spend, or
 * null when it spends none. Only a first turn (0) spends: a later turn of the
 * same conversation never consumes a second credit.
 *   - legal-drafter with an eligible `input.kind` → drafting_work;
 *   - one of the four output tools → independent_output;
 *   - anything else → null.
 */
export function creditKindForRun(
  tool: string,
  input: Record<string, unknown>,
  turn: number,
): FounderCreditKind | null {
  if (turn !== 0) return null;
  if (tool === FOUNDER_DRAFTER_TOOL) return isFounderDraftKind(input?.kind) ? "drafting_work" : null;
  if (isFounderOutputTool(tool)) return "independent_output";
  return null;
}
