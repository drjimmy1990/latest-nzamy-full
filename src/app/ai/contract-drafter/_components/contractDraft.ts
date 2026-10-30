/**
 * L11 محترف العقود المختصر (plan §5 wave 5): what the page sends to the run
 * and how it reads the draft back. The run validates both ends again
 * (tools.ts contractDraftInput / contractDraftOutput); these only shape them.
 */
import type { ContractField } from "./contractTypes";
import type { CitationVerdict } from "@/components/ai/CitationCheckList";

export interface ContractDraft {
  title: string;
  preamble: string;
  sections: Array<{ heading: string; body: string }>;
  citation_check: CitationVerdict[];
}

/** The filled fields only, each under its Arabic label: the model reads what the user read. */
export function contractDraftFields(fields: ContractField[], formData: Record<string, string>): Array<{ label: string; value: string }> {
  return fields
    .map((f) => ({ label: f.labelAr, value: (formData[f.id] ?? "").trim() }))
    .filter((f) => f.value.length > 0);
}

export function asContractDraft(output: Record<string, unknown> | null): ContractDraft | null {
  if (!output || typeof output.title !== "string" || !Array.isArray(output.sections)) return null;
  const sections = output.sections.filter(
    (s): s is { heading: string; body: string } =>
      !!s && typeof (s as { heading?: unknown }).heading === "string" && typeof (s as { body?: unknown }).body === "string",
  );
  if (sections.length === 0) return null;
  return {
    title: output.title,
    preamble: typeof output.preamble === "string" ? output.preamble : "",
    sections,
    citation_check: Array.isArray(output.citation_check) ? (output.citation_check as CitationVerdict[]) : [],
  };
}

/** The draft as one text: what the page shows, copies and exports. */
export function contractDraftText(draft: ContractDraft): string {
  const parts = [draft.title];
  if (draft.preamble) parts.push(draft.preamble);
  for (const s of draft.sections) parts.push(`${s.heading}\n${s.body}`);
  return parts.join("\n\n");
}
