/**
 * L13 محترف العقود (plan §5 wave 5): what /ai/contracts sends to the run and
 * how it reads the contract back. The run validates both ends again
 * (tools.ts contractsProInput / contractsProOutput); these only shape them.
 *
 * Pure (type-only imports), so `node --test` runs it.
 */
import type { PartyData } from "./types";
import type { CitationVerdict } from "../ai/CitationCheckList";

/** Each party type's fields, under the labels PartyForm shows (SharedComponents.tsx). */
const PARTY_FIELDS: Record<PartyData["type"], Array<[keyof PartyData, string]>> = {
  company: [
    ["companyName", "اسم الشركة"],
    ["commercialReg", "السجل التجاري"],
    ["unifiedNum", "الرقم الموحد (700)"],
    ["representative", "الممثل النظامي"],
    ["representativeRole", "صفة الممثل"],
    ["address", "العنوان"],
  ],
  individual: [
    ["fullName", "الاسم الكامل"],
    ["idNumber", "رقم الهوية / الإقامة"],
    ["nationality", "الجنسية"],
  ],
  government: [
    ["entityName", "اسم الجهة"],
    ["unifiedNumGov", "الرقم الموحد"],
    ["contactPerson", "المسؤول / جهة التواصل"],
  ],
};

/** The filled fields of one party, each under its label: the model reads what the user read. */
function partyInput(p: PartyData): { kind: PartyData["type"]; fields: Array<{ label: string; value: string }> } {
  return {
    kind: p.type,
    fields: PARTY_FIELDS[p.type]
      .map(([key, label]) => ({ label, value: String(p[key] ?? "").trim() }))
      .filter((f) => f.value.length > 0),
  };
}

export interface ContractsWizard {
  complexity: "simple" | "detailed";
  contractType: string;
  language: "ar" | "en" | "ar_en" | "custom";
  customLanguageName: string;
  customLanguageLayout: "single" | "dual";
  customLanguageBase: "ar" | "en";
  party1: PartyData;
  party2: PartyData;
  contractDesc: string;
  courtType: string;
  /** The ticked clauses (their edited titles), detailed path only. */
  selectedClauses: string[];
  additionalClauses: string[];
}

/**
 * The run's input from the wizard. The simple path never visits the type,
 * language or clauses steps, so it sends none of them (a generic Arabic
 * contract) rather than defaults the user never saw.
 */
export function contractsProInput(w: ContractsWizard) {
  const detailed = w.complexity === "detailed";
  const language = !detailed
    ? { mode: "ar" }
    : w.language === "custom"
      ? { mode: "custom", name: w.customLanguageName.trim(), layout: w.customLanguageLayout, base: w.customLanguageBase }
      : { mode: w.language };
  const clauses = [...(detailed ? w.selectedClauses : []), ...w.additionalClauses]
    .map((c) => c.trim())
    .filter((c, n, all) => c.length > 0 && all.indexOf(c) === n);
  return {
    type: detailed && w.contractType ? w.contractType : null,
    complexity: w.complexity,
    language,
    parties: [partyInput(w.party1), partyInput(w.party2)],
    description: w.contractDesc.trim(),
    court: w.courtType.trim() || null,
    clauses,
  };
}

export interface ContractsProSection {
  heading: string;
  body: string;
  heading_alt?: string;
  body_alt?: string;
}

export interface ContractsProDraft {
  title: string;
  title_alt: string;
  preamble: string;
  preamble_alt: string;
  primary: string;
  /** The facing language of a bilingual contract, or null. */
  alt: string | null;
  sections: ContractsProSection[];
  citation_check: CitationVerdict[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function asContractsProDraft(output: Record<string, unknown> | null): ContractsProDraft | null {
  if (!output || typeof output.title !== "string" || !Array.isArray(output.sections)) return null;
  const sections = output.sections.filter(
    (s): s is ContractsProSection =>
      !!s && typeof (s as { heading?: unknown }).heading === "string" && typeof (s as { body?: unknown }).body === "string",
  );
  if (sections.length === 0) return null;
  const lang = output.language && typeof output.language === "object" ? (output.language as Record<string, unknown>) : {};
  const alt = typeof lang.alt === "string" && lang.alt ? lang.alt : null;
  return {
    title: output.title,
    title_alt: str(output.title_alt),
    preamble: str(output.preamble),
    preamble_alt: str(output.preamble_alt),
    primary: typeof lang.primary === "string" ? lang.primary : "العربية",
    alt,
    sections,
    citation_check: Array.isArray(output.citation_check) ? (output.citation_check as CitationVerdict[]) : [],
  };
}

/**
 * The contract as one text: what the page copies, saves and exports. A
 * bilingual contract gives the whole primary text, then the whole translation.
 */
export function contractsProText(d: ContractsProDraft): string {
  const side = (title: string, preamble: string, pick: (s: ContractsProSection) => [string, string]) => {
    const parts = [title];
    if (preamble) parts.push(preamble);
    for (const s of d.sections) parts.push(pick(s).join("\n"));
    return parts.join("\n\n");
  };
  const primary = side(d.title, d.preamble, (s) => [s.heading, s.body]);
  if (!d.alt) return primary;
  return `${primary}\n\n— ${d.alt} —\n\n${side(d.title_alt, d.preamble_alt, (s) => [s.heading_alt ?? "", s.body_alt ?? ""])}`;
}
