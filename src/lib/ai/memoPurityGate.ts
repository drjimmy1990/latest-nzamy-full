/**
 * memoPurityGate.ts — `legal-memo-purity-gate` (owner package 25-Nov, file 10
 * §٤.١; batch l16 E-S8): a deterministic check, no model call, of a written
 * pleading before the lawyer sees it. Fail-closed: a memo that carries any of
 * these is not stored and the run is refunded (runCore settleRunWith), so the
 * lawyer can run the draft again.
 *
 *   - a model's thinking tags (<think>, <thinking>, <reasoning>, …);
 *   - the prompt's own markup or instruction lines (<sources>, <memo>, the
 *     «أعد كائن JSON» rule, the canary — leaksPrompt);
 *   - a Latin operational phrase («as an AI», «system prompt», «Here is the»);
 *   - a square bracket that is opened and never closed (a cut marker «[S1»).
 *
 * Deliberately NOT blocked: the «[....]» blanks. The drafter's prompt asks
 * for them where the lawyer gave no fact (n8n/ai/workflows.mjs, «ضع مكانه
 * فراغاً هكذا [....]»), so they are the lawyer's to fill, not a defect. The
 * owner's «wrong-court addressing» check needs the competent court as data;
 * it is not decidable from the text alone and is not built here.
 *
 * Pure: relative imports only, so `node --test` runs it.
 */
import { leaksPrompt } from "./extractionGuard.ts";

export type PurityIssue = "thinking_tags" | "prompt_markup" | "latin_operational" | "unclosed_bracket";

const THINKING = /<\s*\/?\s*(?:think|thinking|thought|thoughts|reasoning|scratchpad|reflection)\b[^>]*>/i;
/** The drafter's prompt tags and instruction lines (workflows.mjs DRAFTER_BUILD and the shared rules). */
const PROMPT_MARKUP: readonly RegExp[] = [
  /<\s*\/?\s*(?:sources?|memo|memo_text|case_brief|history|must_keep|question|request|post|sender)\b[^>]*>/i,
  /أعد كائن JSON/,
  /بيانات وليس(?:ت)? تعليمات لك/,
  /الشكل:\s*\{/,
];
const LATIN_OPERATIONAL =
  /\b(?:as an ai|ai language model|language model|system prompt|system message|chain of thought|here is the|here's the|i cannot|i can't|i'm sorry|as requested|json object|output format|lorem ipsum|todo)\b/i;

/** A "[" with no "]" after it before the next "[" or the end of the text. */
function hasUnclosedBracket(text: string): boolean {
  let open = false;
  for (const ch of text) {
    if (ch === "[") {
      if (open) return true;
      open = true;
    } else if (ch === "]") {
      open = false;
    }
  }
  return open;
}

/** The first problem in one text, or null. */
export function textPurityIssue(text: string): PurityIssue | null {
  if (typeof text !== "string" || !text) return null;
  if (THINKING.test(text)) return "thinking_tags";
  if (leaksPrompt(text) || PROMPT_MARKUP.some((re) => re.test(text))) return "prompt_markup";
  if (LATIN_OPERATIONAL.test(text)) return "latin_operational";
  if (hasUnclosedBracket(text)) return "unclosed_bracket";
  return null;
}

/**
 * The legal drafter's memo texts: a draft's title, sections and requests, or
 * a section edit's heading and body. The analysis phase («issues») is notes for
 * the lawyer, not the memo, and is not gated.
 */
function memoTexts(output: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") out.push(v);
  };
  if (output.phase === "draft") {
    push(output.title);
    for (const s of Array.isArray(output.sections) ? output.sections : []) {
      if (s && typeof s === "object") {
        push((s as Record<string, unknown>).heading);
        push((s as Record<string, unknown>).body);
      }
    }
    for (const r of Array.isArray(output.requests) ? output.requests : []) push(r);
  } else if (output.phase === "section") {
    push(output.heading);
    push(output.body);
  }
  return out;
}

/** The gate: the first problem in a checked legal-drafter output, or null (also for the analysis phase). */
export function memoPurityIssue(output: Record<string, unknown>): PurityIssue | null {
  for (const t of memoTexts(output)) {
    const issue = textPurityIssue(t);
    if (issue) return issue;
  }
  return null;
}
