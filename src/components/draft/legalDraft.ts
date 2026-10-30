/**
 * L14 الصائغ القانوني (plan §5 wave 5): what the wizard sends to the two runs
 * and how it reads them back. The run validates both ends again (tools.ts
 * legalDrafterInput / legalDrafterOutput); these only shape them.
 *
 *   analysis («issues») — the wizard's facts or files → facts, issues,
 *                         proposed defences, requests, what is missing;
 *   draft               — what the lawyer kept and edited → the pleading.
 *
 * Pure: `node --test` runs it.
 */
import type { CitationVerdict } from "@/components/ai/CitationCheckList";

export const FACTS_MIN = 30;

export interface DraftIssue { title: string; detail: string }
export interface DraftDefense { title: string; basis: string; issue: number | null; kept: boolean }

export interface DraftAnalysis {
  facts_summary: string;
  issues: DraftIssue[];
  defenses: DraftDefense[];
  requests: string[];
  missing: string[];
}

export interface Pleading {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  requests: string[];
  citation_check: CitationVerdict[];
}

/** What the wizard collected (useDraftState), as the analysis needs it. */
export interface WizardFacts {
  kind: string;
  clientRole: string;
  legalBranch: string;
  caseText: string;
  notes: string;
  plaintiffName: string;
  defendantName: string;
  judgment: { court: string; number: string; date: string; text: string; reasons: string };
  readableFiles: number;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

const text = (v: unknown): string => (typeof v === "string" ? v : "");

const stripMarkers = (t: string) => t.replace(/\s?\[S\d{1,3}\]/g, "");

/** The analysis run's input. Typed facts too short count as "in the files" when there are files to read. */
export function analysisInput(w: WizardFacts): Record<string, unknown> {
  const facts = w.caseText.trim();
  const inFiles = facts.length < FACTS_MIN && w.readableFiles > 0;
  return {
    phase: "issues",
    kind: w.kind,
    client_role: w.clientRole,
    branch: w.legalBranch,
    facts: inFiles ? "" : facts,
    facts_in_files: inFiles,
    plaintiff_name: w.plaintiffName,
    defendant_name: w.defendantName,
    notes: w.notes,
    judgment: w.judgment,
  };
}

/** Typed facts or readable files: what the analysis needs before it can start. */
export function canAnalyse(w: Pick<WizardFacts, "caseText" | "readableFiles">): boolean {
  return w.caseText.trim().length >= FACTS_MIN || w.readableFiles > 0;
}

export function asDraftAnalysis(output: Record<string, unknown> | null): DraftAnalysis | null {
  if (!output || output.phase !== "issues" || !Array.isArray(output.issues) || !Array.isArray(output.defenses)) return null;
  return {
    facts_summary: text(output.facts_summary),
    issues: output.issues.map((r) => ({ title: text((r as DraftIssue)?.title), detail: text((r as DraftIssue)?.detail) })),
    defenses: output.defenses.map((r) => {
      const d = r as { title?: unknown; basis?: unknown; issue?: unknown };
      return { title: text(d?.title), basis: text(d?.basis), issue: typeof d?.issue === "number" ? d.issue : null, kept: true };
    }),
    requests: strings(output.requests),
    missing: strings(output.missing),
  };
}

/**
 * The draft run's input: the analysis as the lawyer left it. Only the kept
 * defences; blank rows dropped. The [S…] markers are taken out of the bases:
 * the draft searches the library again and numbers its own sources, so an old
 * S2 would point at the wrong text.
 */
export function draftInput(analysisSent: Record<string, unknown>, edited: DraftAnalysis): Record<string, unknown> {
  const { facts_in_files: _f, search_text: _s, ...base } = analysisSent;
  void _f; void _s;
  return {
    ...base,
    phase: "draft",
    facts: edited.facts_summary.trim(),
    issues: edited.issues
      .map((i) => ({ title: i.title.trim(), detail: i.detail.trim() }))
      .filter((i) => i.title),
    defenses: edited.defenses
      .filter((d) => d.kept)
      .map((d) => ({ title: d.title.trim(), basis: stripMarkers(d.basis).trim() }))
      .filter((d) => d.title),
    requests: edited.requests.map((r) => r.trim()).filter(Boolean),
  };
}

/** Why «اكتب المذكرة» is not ready yet, or null when it is. */
export function draftBlocker(edited: DraftAnalysis): string | null {
  if (edited.facts_summary.trim().length < FACTS_MIN) return `الوقائع ${FACTS_MIN} حرفاً على الأقل`;
  if (!edited.issues.some((i) => i.title.trim())) return "أبقِ مسألة واحدة على الأقل";
  if (!edited.defenses.some((d) => d.kept && d.title.trim())) return "اعتمد دفعاً واحداً على الأقل";
  return null;
}

export function asPleading(output: Record<string, unknown> | null): Pleading | null {
  if (!output || output.phase !== "draft" || typeof output.title !== "string" || !Array.isArray(output.sections)) return null;
  const sections = output.sections.filter(
    (s): s is { heading: string; body: string } =>
      !!s && typeof (s as { heading?: unknown }).heading === "string" && typeof (s as { body?: unknown }).body === "string",
  );
  if (sections.length === 0) return null;
  return {
    title: output.title,
    sections,
    requests: strings(output.requests),
    citation_check: Array.isArray(output.citation_check) ? (output.citation_check as CitationVerdict[]) : [],
  };
}

/** The pleading as one plain text, without the source markers: what is copied and exported. */
export function pleadingText(p: Pleading): string {
  const parts = [p.title];
  for (const s of p.sections) parts.push(`${s.heading}\n${stripMarkers(s.body)}`);
  if (p.requests.length > 0) parts.push(`الطلبات\n${p.requests.map((r, n) => `${n + 1}. ${r}`).join("\n")}`);
  return parts.join("\n\n");
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The pleading as a Word document: HTML that Word opens as a .doc, right to
 * left, one heading per section. No letterhead — that is the firm's own
 * export (not built here).
 */
export function pleadingWordHtml(p: Pleading): string {
  const para = (t: string) => esc(t).split(/\n+/).map((l) => `<p>${l}</p>`).join("");
  const body = [
    `<h1>${esc(p.title)}</h1>`,
    ...p.sections.map((s) => `<h2>${esc(s.heading)}</h2>${para(stripMarkers(s.body))}`),
    p.requests.length > 0 ? `<h2>الطلبات</h2><ol>${p.requests.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>` : "",
  ].join("");
  return (
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="ar" dir="rtl">` +
    `<head><meta charset="utf-8"><title>${esc(p.title)}</title>` +
    `<style>body{direction:rtl;font-family:'Traditional Arabic','Arial';font-size:14pt;line-height:1.8}h1{text-align:center;font-size:18pt}h2{font-size:15pt;margin-top:14pt}</style>` +
    `</head><body>${body}</body></html>`
  );
}
