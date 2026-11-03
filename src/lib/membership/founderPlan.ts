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
 * Pure: relative imports only (a type, and the import-free digit formatter),
 * so `node --test` loads it directly.
 */

import type { DraftKindId } from "../ai/draftKinds.ts";
import { toArabicDigits } from "../services/arabicCount.ts";

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

// ── the «استخدم رصيد باقة المؤسس» choice on the four tools (Task 7) ─────────

/** A tool's price line while the choice is checked. */
export const FOUNDER_CREDIT_PRICE_TEXT = "من رصيد باقة المؤسس — بلا نقاط";

/** The "N points deducted" line of a run the server paid with a credit (`creditUsed`). */
export const FOUNDER_CREDIT_USED_TEXT = "استُخدم من رصيد باقة المؤسس";

/** A failed credit run (useAiRun's poll path): the credit came back, not points (R20). */
export const FOUNDER_CREDIT_REFUNDED_FAILURE = "تعذّر إكمال الطلب، وأُعيد رصيد باقة المؤسس";

/**
 * The checkbox label, Arabic-Indic digits:
 *   drafting_work      → «استخدم عملاً من باقة المؤسس (متبقٍ ٥ من ٦)»
 *   independent_output → «استخدم مخرجك المستقل من باقة المؤسس (١ من ١)»
 */
export function founderCreditLabel(kind: FounderCreditKind, remaining: number, total: number): string {
  const left = toArabicDigits(remaining);
  const of = toArabicDigits(total);
  return kind === "drafting_work"
    ? `استخدم عملاً من باقة المؤسس (متبقٍ ${left} من ${of})`
    : `استخدم مخرجك المستقل من باقة المؤسس (${left} من ${of})`;
}

export type FounderCreditChoiceView =
  | { show: false }
  | { show: true; label: string; defaultChecked: boolean };

const HIDDEN: FounderCreditChoiceView = Object.freeze({ show: false }) as FounderCreditChoiceView;

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Whether the choice renders, from GET /api/v1/membership/founder's reply
 * (anything: an error body, null while loading, a malformed reply) and
 * whether this run would spend this credit at all (`eligible`: the drafter's
 * kind, first turn). Hidden unless `member` is exactly true and whole
 * `remaining` > 0. A drafting work is checked by default; the one shared
 * independent output is not — the lawyer chooses where to spend it.
 *
 * A hidden choice means the page must send no `useCredit`: the run would
 * otherwise 402 «لا يتبقى لك رصيد…» or silently fall back to points while
 * the page said «بلا نقاط».
 */
export function founderCreditChoiceView(
  kind: FounderCreditKind,
  reply: unknown,
  eligible = true,
): FounderCreditChoiceView {
  if (!eligible || !reply || typeof reply !== "object") return HIDDEN;
  const r = reply as { member?: unknown; credits?: unknown };
  if (r.member !== true || !r.credits || typeof r.credits !== "object") return HIDDEN;
  const credit = (r.credits as Record<string, unknown>)[kind];
  if (!credit || typeof credit !== "object") return HIDDEN;
  const { remaining, total } = credit as { remaining?: unknown; total?: unknown };
  if (!isCount(remaining) || !isCount(total) || remaining === 0) return HIDDEN;
  return {
    show: true,
    label: founderCreditLabel(kind, remaining, total),
    defaultChecked: kind === "drafting_work",
  };
}

/**
 * The React key for a page's FounderCreditChoice. Once a run the server paid
 * with a credit settles (done, or waiting for review), the key changes, so the
 * choice remounts, reads the balance again and hides itself when nothing is
 * left — a second click never asks for a credit that was just spent. A failed
 * run keeps the key: its credit was refunded and the count shown still holds.
 */
export function founderCreditChoiceKey(
  phase: "idle" | "starting" | "running" | "done" | "review" | "error",
  creditUsed: boolean,
  runId: string | null,
): string {
  return creditUsed && (phase === "done" || phase === "review") ? `spent:${runId ?? ""}` : "choice";
}

/**
 * The server's failure messages say «وأُعيدت نقاطك» whatever paid the run
 * (runCore AI_COPY.failed/timeout/noSources/ungrounded). For a run started
 * with a founder credit the page says the credit came back instead (R20);
 * every other message is left exactly as it was.
 */
export function founderCreditRefundText(message: string, creditRun: boolean): string {
  return creditRun ? message.replace("وأُعيدت نقاطك", "وأُعيد رصيد باقة المؤسس") : message;
}
