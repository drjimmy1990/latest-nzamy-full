/**
 * The AI contract review: what /ai/contracts sends to the run and how it reads the
 * report back. The run validates both ends again (tools.ts contractReviewInput /
 * contractReviewOutput); these only shape them. The library's verdict on each cited
 * article arrives as `citation_check`, and the model's `cited` list is gone by then.
 *
 * Pure (relative `.ts` imports of pure modules), so `node --test` runs it.
 */
import { CONTRACT_REVIEW_PASTE_MAX, CONTRACT_REVIEW_PASTE_MIN, CONTRACTS_PRO_TYPES, REVIEW_CATEGORIES, REVIEW_RISKS } from "../../lib/ai/tools.ts";
import { aiSkippedNote, isAiReadable, pasteState, splitAiReadable } from "../ai/aiReadable.ts";
import type { CitationVerdict } from "../ai/CitationCheckList";

export type ReviewRisk = (typeof REVIEW_RISKS)[number];
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_RISK_AR: Readonly<Record<ReviewRisk, string>> = { high: "مرتفعة", medium: "متوسطة", low: "منخفضة" };
export const REVIEW_CATEGORY_AR: Readonly<Record<ReviewCategory, string>> = {
  obligations: "الالتزامات",
  payment: "المقابل والسداد",
  liability: "المسؤولية",
  termination: "الإنهاء والفسخ",
  dispute: "تسوية النزاعات",
  confidentiality: "السرية",
  ip: "الملكية الفكرية",
  compliance: "الامتثال",
  other: "أخرى",
};

export interface ContractReviewClause {
  ref: string;
  quote: string;
  category: ReviewCategory;
  risk: ReviewRisk;
  issue: string;
  defensive_edit: string;
  negotiating_edit: string;
}

export interface ContractReview {
  summary: string;
  overall_risk: ReviewRisk;
  clauses: ContractReviewClause[];
  missing: Array<{ title: string; why: string }>;
  citation_check: CitationVerdict[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const isRisk = (v: unknown): v is ReviewRisk => (REVIEW_RISKS as readonly unknown[]).includes(v);

/** The run's input from the review wizard's answers. A pasted contract is added by the page. */
export function contractReviewInput(s: { rPartyFocus: string; rFears: string; rOtherParty: string; contractType: string }): Record<string, unknown> {
  const type = Object.prototype.hasOwnProperty.call(CONTRACTS_PRO_TYPES, s.contractType) ? CONTRACTS_PRO_TYPES[s.contractType] : null;
  return {
    represented_party: s.rPartyFocus.trim(),
    concerns: s.rFears.trim() || null,
    other_party: s.rOtherParty.trim() || null,
    contract_type: type,
  };
}

export type ContractReviewSource =
  | { kind: "file"; fileIds: string[]; left: string[]; pasteIgnored: boolean }
  | { kind: "paste"; text: string; left: string[] }
  | { kind: "none"; reason: string };

/**
 * What one run reads: the tool takes one contract. The first file the model can open,
 * or the pasted text when the server may send it. `left` names the files that stay
 * out, and `reason` says why nothing can run, so no button promises a run that the
 * server would refuse.
 */
export function contractReviewSource(
  attachments: ReadonlyArray<{ documentId: string; name: string }>,
  pasted: string,
  textFiles: boolean,
): ContractReviewSource {
  const { ids, skipped } = splitAiReadable(attachments, textFiles);
  const paste = pasteState(pasted, { min: CONTRACT_REVIEW_PASTE_MIN, max: CONTRACT_REVIEW_PASTE_MAX });
  if (ids.length > 0) {
    const readable = attachments.filter((a) => isAiReadable(a.name, textFiles)).map((a) => a.name);
    return { kind: "file", fileIds: [ids[0]], left: [...readable.slice(1), ...skipped], pasteIgnored: !paste.empty };
  }
  if (textFiles && paste.ok) return { kind: "paste", text: pasted.trim(), left: skipped };
  if (!paste.empty && !textFiles) {
    return { kind: "none", reason: "المراجعة الذكية تقرأ ملف PDF أو صورة، والنص الملصق يصل إلى طلب الفريق فقط. ارفع العقد ملفاً لمراجعته آلياً." };
  }
  if (paste.tooShort) return { kind: "none", reason: "النص الملصق قصير — الصق العقد كاملاً (١٠٠ حرف على الأقل)" };
  if (paste.tooLong) return { kind: "none", reason: "النص الملصق أطول من ٤٥٬٠٠٠ حرف (١٥ صفحة) — ارفعه ملفاً" };
  if (skipped.length > 0) {
    return { kind: "none", reason: textFiles ? aiSkippedNote(skipped) : "ملف Word لا يُقرأ آلياً — ارفع العقد بصيغة PDF أو صورة، أو اطلب مراجعة الفريق أدناه." };
  }
  return { kind: "none", reason: "ارفع ملف العقد في الخطوة السابقة." };
}

export function asContractReview(output: Record<string, unknown> | null): ContractReview | null {
  if (!output || typeof output.summary !== "string" || !isRisk(output.overall_risk) || !Array.isArray(output.clauses)) return null;
  const clauses: ContractReviewClause[] = [];
  for (const c of output.clauses as Array<Record<string, unknown> | null>) {
    if (!c || !isRisk(c.risk) || typeof c.issue !== "string") continue;
    clauses.push({
      ref: str(c.ref),
      quote: str(c.quote),
      category: (REVIEW_CATEGORIES as readonly unknown[]).includes(c.category) ? (c.category as ReviewCategory) : "other",
      risk: c.risk,
      issue: c.issue,
      defensive_edit: str(c.defensive_edit),
      negotiating_edit: str(c.negotiating_edit),
    });
  }
  if (clauses.length === 0) return null;
  const missing = Array.isArray(output.missing)
    ? (output.missing as Array<Record<string, unknown> | null>).filter((m) => m && typeof m.title === "string").map((m) => ({ title: str(m!.title), why: str(m!.why) }))
    : [];
  return {
    summary: output.summary,
    overall_risk: output.overall_risk,
    clauses,
    missing,
    citation_check: Array.isArray(output.citation_check) ? (output.citation_check as CitationVerdict[]) : [],
  };
}

export function reviewRiskCounts(r: ContractReview): { high: number; medium: number; low: number } {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of r.clauses) counts[c.risk] += 1;
  return counts;
}

/** Clauses by category and risk word, in the registry's order, without the empty rows. */
export function reviewRiskMatrix(r: ContractReview): Array<{ category: ReviewCategory; high: number; medium: number; low: number }> {
  return REVIEW_CATEGORIES.flatMap((category) => {
    const row = { category, high: 0, medium: 0, low: 0 };
    for (const c of r.clauses) if (c.category === category) row[c.risk] += 1;
    return row.high + row.medium + row.low > 0 ? [row] : [];
  });
}

const VERDICT_AR: Readonly<Record<CitationVerdict["status"], string>> = {
  ok: "سارية",
  amended: "معدّلة",
  repealed: "ملغاة",
  not_found: "غير موجودة في المكتبة",
  unchecked: "لم يُتحقق منها",
};

/** The report as one text: what the page copies and saves. A manual edit replaces that clause's suggestions. */
export function contractReviewText(r: ContractReview, manual: Record<number, string>): string {
  const parts = [`مراجعة العقد — الخطورة العامة: ${REVIEW_RISK_AR[r.overall_risk]}`, r.summary];
  r.clauses.forEach((c, n) => {
    const own = manual[n]?.trim();
    const lines = [`${c.ref || `بند ${(n + 1).toLocaleString("ar-SA")}`} — ${REVIEW_CATEGORY_AR[c.category]} — الخطورة: ${REVIEW_RISK_AR[c.risk]}`];
    if (c.quote) lines.push(`النص: ${c.quote}`);
    lines.push(`الملاحظة: ${c.issue}`);
    if (own) lines.push(`تعديلي: ${own}`);
    else {
      if (c.defensive_edit) lines.push(`تعديل دفاعي: ${c.defensive_edit}`);
      if (c.negotiating_edit) lines.push(`تعديل تفاوضي: ${c.negotiating_edit}`);
    }
    parts.push(lines.join("\n"));
  });
  if (r.missing.length > 0) parts.push(["بنود ناقصة:", ...r.missing.map((m) => (m.why ? `- ${m.title}: ${m.why}` : `- ${m.title}`))].join("\n"));
  if (r.citation_check.length > 0) parts.push(["المواد المذكورة وحالتها في مكتبة نظامي:", ...r.citation_check.map((c) => `- ${c.cited}: ${VERDICT_AR[c.status] ?? VERDICT_AR.unchecked}`)].join("\n"));
  return parts.join("\n\n");
}
