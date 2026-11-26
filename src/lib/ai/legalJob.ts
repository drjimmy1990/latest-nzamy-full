/**
 * legalJob.ts — `LegalJob v1`, the one output contract of «الصائغ» for every
 * consumer (owner package 25-Nov, file 10 §٢.٢ and §٣.١; batch l16 E-S3, first
 * slice). The web platform, n8n v2, MCP and the Word / Chrome add-ins read the
 * same shape:
 *
 *   memo          the whole pleading as clean Markdown (no [S…] markers), ready to
 *                 convert or insert;
 *   structured    { title, sections: [{ heading, body }], requests } — the parts;
 *   lawyer_notes  the lawyer's internal notes (never in the memo), or null;
 *   najiz         the Najiz-ready text, or null;
 *   citations     the library sources the memo relies on, each with
 *                 source_kind "library" — the only kind there is: the drafter
 *                 has no web path, and a citation the app did not send is
 *                 dropped before it gets here (runCore mapCitations).
 *
 * This slice builds the contract from the legal drafter's stored draft (the
 * platform's own output) and validates it. It changes no stored output and no
 * route: the review branches (MCP, Word, Chrome, n8n v2) adopt it when they
 * are merged (file 10 §١.٣).
 *
 * Pure: relative imports only, so `node --test` runs it.
 */
import { stripCitationMarkers } from "./citationMarkers.ts";

export interface LegalJobSection {
  heading: string;
  body: string;
}

export interface LegalJobCitation {
  sid: string;
  source_kind: "library";
  kind: string | null;
  id: string | null;
  title: string | null;
  url: string | null;
}

export interface LegalJobV1 {
  v: 1;
  memo: string;
  structured: { title: string; sections: LegalJobSection[]; requests: string[] };
  lawyer_notes: Record<string, unknown> | null;
  najiz: string | null;
  citations: LegalJobCitation[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const clean = (s: string) => stripCitationMarkers(s).replace(/[ \t]+\n/g, "\n").trim();

/** The memo as Markdown: the title, each section under its heading, the requests numbered. */
export function renderMemoMarkdown(structured: LegalJobV1["structured"]): string {
  const parts = [`# ${clean(structured.title)}`];
  for (const s of structured.sections) parts.push(`## ${clean(s.heading)}`, clean(s.body));
  if (structured.requests.length > 0) {
    parts.push("## الطلبات", structured.requests.map((r, i) => `${i + 1}. ${clean(r)}`).join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * A stored legal-drafter draft (output phase "draft") and its mapped citations
 * (ai_runs.citations) → LegalJob v1. null for anything that is not a draft (the
 * analysis, a section edit) or that lacks its parts.
 */
export function toLegalJobV1(output: unknown, citations: unknown): LegalJobV1 | null {
  if (!isObj(output) || output.phase !== "draft") return null;
  const title = str(output.title);
  if (!title || !Array.isArray(output.sections) || output.sections.length === 0) return null;
  const sections: LegalJobSection[] = [];
  for (const s of output.sections) {
    const heading = isObj(s) ? str(s.heading) : null;
    const body = isObj(s) ? str(s.body) : null;
    if (!heading || !body) return null;
    sections.push({ heading, body });
  }
  const requests = Array.isArray(output.requests) ? output.requests.filter((r): r is string => typeof r === "string") : [];
  const structured = { title, sections, requests };
  const cites: LegalJobCitation[] = [];
  for (const c of Array.isArray(citations) ? citations : []) {
    if (!isObj(c) || typeof c.sid !== "string" || !/^S\d{1,3}$/.test(c.sid)) continue;
    cites.push({ sid: c.sid, source_kind: "library", kind: str(c.kind), id: str(c.id), title: str(c.title), url: str(c.url) });
  }
  return {
    v: 1,
    memo: renderMemoMarkdown(structured),
    structured,
    lawyer_notes: isObj(output.lawyer_notes) ? output.lawyer_notes : null,
    najiz: str(output.najiz),
    citations: cites,
  };
}

/** The contract's checker: an English reason, or null when `job` is a valid LegalJob v1. */
export function legalJobV1Issue(job: unknown): string | null {
  if (!isObj(job) || job.v !== 1) return "not a LegalJob v1 object";
  if (typeof job.memo !== "string" || !job.memo.trim()) return "memo is empty";
  if (/\[S\d{1,3}\]/.test(job.memo)) return "memo carries source markers";
  const st = job.structured;
  if (!isObj(st) || typeof st.title !== "string" || !st.title.trim()) return "structured.title is missing";
  if (!Array.isArray(st.sections) || st.sections.length === 0) return "structured.sections is empty";
  for (const s of st.sections) {
    if (!isObj(s) || typeof s.heading !== "string" || typeof s.body !== "string") return "a section has no heading or body";
  }
  if (!Array.isArray(st.requests) || st.requests.some((r) => typeof r !== "string")) return "structured.requests is not a list of texts";
  if (job.lawyer_notes !== null && !isObj(job.lawyer_notes)) return "lawyer_notes is neither an object nor null";
  if (job.najiz !== null && typeof job.najiz !== "string") return "najiz is neither a text nor null";
  if (!Array.isArray(job.citations)) return "citations is not a list";
  for (const c of job.citations) {
    if (!isObj(c) || typeof c.sid !== "string") return "a citation has no sid";
    if (c.source_kind !== "library") return "a citation is not from the library";
  }
  return null;
}
