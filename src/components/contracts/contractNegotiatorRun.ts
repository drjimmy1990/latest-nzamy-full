/**
 * The contract negotiator: what /ai/contract-negotiator sends to the run and how it
 * reads the result back. The run validates both ends again (tools.ts). The library's
 * verdict on each cited article arrives as `citation_check`.
 *
 * Pure (relative `.ts` imports of pure modules), so `node --test` runs it.
 */
import { NEGOTIATOR_CLAUSES_MAX, NEGOTIATOR_STANCES, REVIEW_RISKS } from "../../lib/ai/tools.ts";
import { REVIEW_RISK_AR, type ReviewRisk } from "./contractReviewRun.ts";
import type { CitationVerdict } from "../ai/CitationCheckList";

export type NegotiatorStance = (typeof NEGOTIATOR_STANCES)[number];
export const NEGOTIATOR_STANCE_AR: Readonly<Record<NegotiatorStance, string>> = { firm: "حازم", balanced: "متوازن", flexible: "مرن" };

export interface NegotiatorClauseDraft {
  text: string;
  theirDemand: string;
  ourGoal: string;
}

export interface NegotiatorForm {
  ourParty: string;
  contractType: string;
  clauses: NegotiatorClauseDraft[];
}

export interface NegotiationAlternative {
  stance: NegotiatorStance;
  text: string;
  rationale: string;
}

export interface NegotiationClause {
  index: number;
  issue: string;
  risk: ReviewRisk;
  alternatives: NegotiationAlternative[];
  fallback: string;
}

export interface Negotiation {
  summary: string;
  clauses: NegotiationClause[];
  citation_check: CitationVerdict[];
}

export function contractNegotiatorInput(form: NegotiatorForm): Record<string, unknown> {
  return {
    our_party: form.ourParty.trim(),
    contract_type: form.contractType.trim() || null,
    clauses: form.clauses.map((c) => ({
      text: c.text.trim(),
      their_demand: c.theirDemand.trim() || null,
      our_goal: c.ourGoal.trim() || null,
    })),
  };
}

/** The first thing that stops the form, in the words the user can act on. */
export function negotiatorFormProblem(form: NegotiatorForm): string | null {
  const party = form.ourParty.trim();
  if (!party) return "حدّد الطرف الذي تمثّله";
  if (party.length > 150) return "اسم الطرف الذي تمثّله أطول من ١٥٠ حرفاً";
  if (form.contractType.trim().length > 150) return "نوع العقد أطول من ١٥٠ حرفاً";
  if (form.clauses.length < 1 || form.clauses.length > NEGOTIATOR_CLAUSES_MAX) return "ألصق بنداً واحداً على الأقل (حتى ١٠ بنود)";
  for (let n = 0; n < form.clauses.length; n += 1) {
    const clause = form.clauses[n];
    const name = `البند ${(n + 1).toLocaleString("ar-SA")}`;
    const text = clause.text.trim().length;
    if (text < 20) return `${name}: ألصق نص البند كاملاً (٢٠ حرفاً على الأقل)`;
    if (text > 4000) return `${name}: النص أطول من ٤٬٠٠٠ حرف`;
    if (clause.theirDemand.trim().length > 1500) return `${name}: طلب الطرف الآخر أطول من ١٬٥٠٠ حرف`;
    if (clause.ourGoal.trim().length > 1500) return `${name}: هدفك أطول من ١٬٥٠٠ حرف`;
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function asNegotiation(output: Record<string, unknown> | null): Negotiation | null {
  if (!output || typeof output.summary !== "string" || !Array.isArray(output.clauses) || output.clauses.length === 0) return null;
  const clauses: NegotiationClause[] = [];
  for (const raw of output.clauses as Array<Record<string, unknown> | null>) {
    if (!raw || !(REVIEW_RISKS as readonly unknown[]).includes(raw.risk) || !Array.isArray(raw.alternatives)) return null;
    const alternatives = (raw.alternatives as Array<Record<string, unknown> | null>).flatMap((a) =>
      a && (NEGOTIATOR_STANCES as readonly unknown[]).includes(a.stance) ? [{ stance: a.stance as NegotiatorStance, text: str(a.text), rationale: str(a.rationale) }] : [],
    );
    if (alternatives.length === 0) return null;
    clauses.push({ index: typeof raw.index === "number" ? raw.index : clauses.length, issue: str(raw.issue), risk: raw.risk as ReviewRisk, alternatives, fallback: str(raw.fallback) });
  }
  return { summary: output.summary, clauses, citation_check: Array.isArray(output.citation_check) ? (output.citation_check as CitationVerdict[]) : [] };
}

const VERDICT_AR: Readonly<Record<CitationVerdict["status"], string>> = {
  ok: "سارية",
  amended: "معدّلة",
  repealed: "ملغاة",
  not_found: "غير موجودة في المكتبة",
  unchecked: "لم يُتحقق منها",
};

/** The negotiation as one text: what the page copies and saves. */
export function negotiationText(n: Negotiation): string {
  const parts = [n.summary];
  n.clauses.forEach((c, position) => {
    const lines = [`البند ${(position + 1).toLocaleString("ar-SA")} — الخطورة: ${REVIEW_RISK_AR[c.risk]}`];
    if (c.issue) lines.push(`الملاحظة: ${c.issue}`);
    for (const a of c.alternatives) {
      lines.push(`${NEGOTIATOR_STANCE_AR[a.stance]}: ${a.text}`);
      if (a.rationale) lines.push(`السبب: ${a.rationale}`);
    }
    if (c.fallback) lines.push(`الموقف الاحتياطي: ${c.fallback}`);
    parts.push(lines.join("\n"));
  });
  if (n.citation_check.length > 0) parts.push(["المواد المذكورة وحالتها في مكتبة نظامي:", ...n.citation_check.map((c) => `- ${c.cited}: ${VERDICT_AR[c.status] ?? VERDICT_AR.unchecked}`)].join("\n"));
  return parts.join("\n\n");
}
