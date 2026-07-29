/**
 * exclusions.ts — files under the library tree that are NOT legal documents.
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by all four parsers so "what counts as a legal document" is decided in
 * exactly one place.
 *
 * Every rule here corresponds to a folder or filename the library maintainers
 * themselves marked as non-content. Nothing is excluded on a guess: if it is not
 * provably an artefact, it stays in and the collision guard surfaces it instead.
 *
 * Excluded paths are COUNTED AND REPORTED by the parsers, never dropped
 * silently — the whole point of this pass is that nothing disappears quietly.
 */

export interface ExclusionRule {
  /** Stable id used in the parser's summary output. */
  id: string;
  /** Why this is not a legal document. */
  reason: string;
  test: (absPath: string) => boolean;
}

/** Normalize Windows separators so rules can be written with "/". */
const norm = (p: string) => p.replace(/\\/g, "/");

export const EXCLUSION_RULES: ExclusionRule[] = [
  {
    id: "deleted_backups_archive",
    reason:
      "Maintainers' own backup snapshots (.backup_*/.bak_*) from dated audit runs — " +
      "the live version of each file exists elsewhere in the tree.",
    test: (p) => norm(p).includes("/deleted_backups_archive/"),
  },
  {
    id: "extraction_report",
    reason:
      "PDF/OCR extraction tooling reports, not legal text. They carry no slug, so " +
      "they all collapsed onto one primary key.",
    // Matches both the bare name and the per-volume suffixed variants found in the
    // MOJ folders (e.g. PDF_EXTRACTION_REPORT_المجلد_26.md), which an exact-name
    // rule missed — they then surfaced as "unclassified" instead.
    test: (p) => /\/(PDF_)?EXTRACTION_REPORT[^/]*\.md$/i.test(norm(p)),
  },
  {
    id: "folder_index",
    reason:
      "Generated folder navigation index (INDEX.md), not a legal document — it has " +
      "no frontmatter and matches no parser.",
    test: (p) => /\/INDEX\.md$/.test(norm(p)),
  },
  {
    id: "extraction_memory",
    reason:
      "EXTRACTION_MEMORY_* — working notes kept by the extraction tooling between " +
      "runs (V1, V2, … per batch), not legal text.",
    test: (p) => /\/EXTRACTION_MEMORY[^/]*\.md$/i.test(norm(p)),
  },
  {
    id: "tooling_report",
    reason: "Per-volume tooling output (…_report.md), not legal text.",
    test: (p) => /_report\.md$/i.test(norm(p)),
  },
  {
    id: "empty_stub_folder",
    reason:
      "Folder is named 'ملفات_قوالب_فارغة' (empty template files) — the maintainers " +
      "marked these as empty stubs; the files are named crsd_stub_*.",
    test: (p) => norm(p).includes("/ملفات_قوالب_فارغة"),
  },
  {
    id: "no_real_content_folder",
    reason:
      "Folder is named 'ملفات_بلا_محتوى_حقيقي' — literally 'files with no real " +
      "content', as marked by the maintainers.",
    test: (p) => norm(p).includes("/ملفات_بلا_محتوى_حقيقي"),
  },
  {
    id: "non_legislative",
    reason:
      "Folder is explicitly named '_غير_تشريعي_مؤكد_لا_يُصنف' — confirmed non-legislative, " +
      "do not classify. Mostly agency application forms and inspection checklists.",
    test: (p) => norm(p).includes("/_غير_تشريعي_مؤكد_لا_يُصنف/"),
  },
];

export interface ExclusionResult {
  kept: string[];
  excluded: Array<{ file: string; ruleId: string }>;
  /** ruleId → count, for the parser summary. */
  countsByRule: Record<string, number>;
}

/**
 * Partition a file list into content and non-content.
 *
 * Callers MUST report `countsByRule` — an exclusion that happens invisibly is
 * indistinguishable from data loss.
 */
export function applyExclusions(files: string[]): ExclusionResult {
  const kept: string[] = [];
  const excluded: Array<{ file: string; ruleId: string }> = [];
  const countsByRule: Record<string, number> = {};

  for (const f of files) {
    const rule = EXCLUSION_RULES.find((r) => r.test(f));
    if (rule) {
      excluded.push({ file: f, ruleId: rule.id });
      countsByRule[rule.id] = (countsByRule[rule.id] || 0) + 1;
    } else {
      kept.push(f);
    }
  }
  return { kept, excluded, countsByRule };
}

/** Human-readable summary line per rule that actually matched. */
export function formatExclusionSummary(countsByRule: Record<string, number>): string[] {
  return Object.entries(countsByRule).map(([id, n]) => {
    const rule = EXCLUSION_RULES.find((r) => r.id === id);
    return `${n} file(s) excluded — ${id}: ${rule?.reason ?? ""}`;
  });
}
