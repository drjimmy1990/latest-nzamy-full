/**
 * L12 الرأي الفصل (plan §5 wave 5): what the page sends to the two automatic
 * tools and how it reads their results back. The run validates both ends
 * again (tools.ts legalConsultInput / legalLetterInput and their outputs);
 * these only shape them. Pure, so node --test reads them.
 */
import type { CitationVerdict } from "@/components/ai/CitationCheckList";

export type AiOpinionKind = "consult" | "letter";

export const AI_OPINION_TOOL: Record<AiOpinionKind, string> = {
  consult: "legal-opinion-consult",
  letter: "legal-opinion-letter",
};

export interface ConsultAnswer {
  summary: string;
  sections: Array<{ heading: string; body: string }>;
}

export interface LetterDraft {
  title: string;
  body: string;
  citation_check: CitationVerdict[];
}

/** The consultation's input: the question, and the area's Arabic label when one was picked. */
export function consultRunInput(areaLabel: string | undefined, description: string): Record<string, unknown> {
  return { area: areaLabel && areaLabel.trim() ? areaLabel.trim() : null, question: description.trim() };
}

export interface LetterFields {
  typeLabel: string;
  senderRole: "individual" | "company";
  senderName: string;
  recipientType: "individual" | "company" | "government";
  recipientName: string;
  govEntity: string;
  subject: string;
  legalRef: string;
  deadlineDays: string | null;
  annexes: string[];
}

/** The letter's input, from LetterWorkflow's fields: blanks sent as null, the deadline only when asked for. */
export function letterRunInput(f: LetterFields): Record<string, unknown> {
  const days = f.deadlineDays === null ? null : Number(f.deadlineDays);
  return {
    type: f.typeLabel.trim(),
    sender_role: f.senderRole,
    sender_name: f.senderName.trim(),
    recipient_type: f.recipientType,
    recipient_name: f.recipientName.trim(),
    gov_entity: f.recipientType === "government" && f.govEntity.trim() ? f.govEntity.trim() : null,
    subject: f.subject.trim(),
    legal_ref: f.legalRef.trim() || null,
    deadline_days: days !== null && Number.isFinite(days) ? days : null,
    annexes: f.annexes.map((a) => a.trim()).filter(Boolean),
  };
}

const isSection = (s: unknown): s is { heading: string; body: string } =>
  !!s && typeof (s as { heading?: unknown }).heading === "string" && typeof (s as { body?: unknown }).body === "string";

export function asConsultAnswer(output: Record<string, unknown> | null): ConsultAnswer | null {
  if (!output || typeof output.summary !== "string" || !Array.isArray(output.sections)) return null;
  const sections = output.sections.filter(isSection);
  return sections.length > 0 ? { summary: output.summary, sections } : null;
}

export function asLetterDraft(output: Record<string, unknown> | null): LetterDraft | null {
  if (!output || typeof output.title !== "string" || typeof output.body !== "string" || !output.body.trim()) return null;
  return {
    title: output.title,
    body: output.body,
    citation_check: Array.isArray(output.citation_check) ? (output.citation_check as CitationVerdict[]) : [],
  };
}

/** The consultation as one text, markers kept (the page strips them for copying). */
export function consultAnswerText(a: ConsultAnswer): string {
  return [a.summary, ...a.sections.map((s) => `${s.heading}\n${s.body}`)].join("\n\n");
}

/**
 * The run's refusal in this page's words. The library gate's own message
 * names «المساعد الذكي للمكتبة», which is not this page; every line ends on
 * the team order, so a refusal is never a dead end.
 */
export function aiOpinionErrorText(code: string | null, error: string | null): string {
  const team = "يمكنك طلبها من فريق نظامي أدناه.";
  if (code === "library_tier") return `الاستشارة الآلية تجيب من نصوص مكتبة الأنظمة، وهي متاحة لمشتركي Pro أو أعلى. ${team}`;
  if (code === "library_closed") return `مكتبة الأنظمة مغلقة الآن، فلا تعمل الاستشارة الآلية. ${team}`;
  if (code === "tool_off") return `التوليد الآلي غير مفعّل بعد. ${team}`;
  return `${error || "تعذّر إكمال الطلب"} — ${team}`;
}
