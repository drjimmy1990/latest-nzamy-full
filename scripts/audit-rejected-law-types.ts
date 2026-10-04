/**
 * Read-only join of parse-report-laws.json rejections to their exact source files.
 * Usage: npx tsx scripts/audit-rejected-law-types.ts REPORT MASTER_MANIFEST NEW_OUTPUT_DIR
 * A master-manifest match is recorded only as an untrusted suggestion; this tool
 * never changes legal metadata or the operational normalization map.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { parseFrontmatter } from "./parsers/lib/frontmatter";

const [reportPath, masterPath, outputDir] = process.argv.slice(2);
if (!reportPath || !masterPath || !outputDir) {
  throw new Error("Usage: npx tsx scripts/audit-rejected-law-types.ts REPORT MASTER_MANIFEST NEW_OUTPUT_DIR");
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
  input: string;
  rejectedEnumValues: string[];
  counts: { rejectedEnumValues: number };
};
const master = JSON.parse(readFileSync(masterPath, "utf8")) as {
  manifest_version?: string;
  type_normalization_map?: Record<string, unknown>;
};
if (!Array.isArray(report.rejectedEnumValues) ||
    report.rejectedEnumValues.length !== report.counts.rejectedEnumValues) {
  throw new Error("Rejection list/count mismatch in parse report");
}

const sourceRoot = resolve(report.input);
const files = execFileSync("rg", ["--files", sourceRoot], {
  encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
}).trim().split("\n").filter((p) => p.endsWith(".md"));
const byName = new Map<string, string[]>();
for (const file of files) {
  const path = isAbsolute(file) ? file : resolve(file);
  const name = basename(path);
  byName.set(name, [...(byName.get(name) ?? []), path]);
}

const scalar = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number" ? String(value) : null;
const fields = [
  "id", "title", "number", "hijri_date", "gregorian_date", "status",
  "source", "issuing_authority", "official_source_url", "ncar_document_url",
  "ncar_match", "source_pdf", "source_image", "original_file",
] as const;
const records = report.rejectedEnumValues.map((entry, index) => {
  const separator = ' :: type="';
  const at = entry.lastIndexOf(separator);
  if (at < 0 || !entry.endsWith('"')) throw new Error(`Malformed rejection ${index}: ${entry}`);
  const name = entry.slice(0, at);
  const reportedType = entry.slice(at + separator.length, -1);
  const matches = byName.get(name) ?? [];
  const base = { index: index + 1, name, reported_type: reportedType, matches };
  if (matches.length !== 1) return { ...base, resolution: matches.length ? "ambiguous_basename" : "source_missing" };

  const path = matches[0];
  const raw = readFileSync(path, "utf8");
  const parsed = parseFrontmatter(raw, path);
  const metadata = Object.fromEntries(fields.map((key) => [key, scalar(parsed.meta[key])]));
  const sourceType = scalar(parsed.meta.type);
  const proposal = master.type_normalization_map?.[reportedType];
  return {
    ...base,
    resolution: sourceType === reportedType && parsed.warnings.length === 0 ? "exact" : "source_mismatch_or_warning",
    source_type: sourceType,
    metadata,
    yaml_warnings: parsed.warnings,
    file_sha256: createHash("sha256").update(raw).digest("hex"),
    master_mapping_untrusted: typeof proposal === "string" ? proposal : null,
  };
});

const group = new Map<string, number>();
for (const record of records) group.set(record.reported_type, (group.get(record.reported_type) ?? 0) + 1);
const summary = {
  report_path: resolve(reportPath),
  master_path: resolve(masterPath),
  master_version: master.manifest_version ?? null,
  source_root: sourceRoot,
  source_file_count: files.length,
  rejection_count: records.length,
  exact_source_count: records.filter((r) => r.resolution === "exact").length,
  ambiguous_source_count: records.filter((r) => r.resolution === "ambiguous_basename").length,
  missing_source_count: records.filter((r) => r.resolution === "source_missing").length,
  mismatch_or_warning_count: records.filter((r) => r.resolution === "source_mismatch_or_warning").length,
  unique_raw_types: group.size,
  raw_type_counts: [...group].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  untrusted_master_mapping_count: records.filter((r) => "master_mapping_untrusted" in r && r.master_mapping_untrusted).length,
};

mkdirSync(outputDir, { mode: 0o700 });
writeFileSync(resolve(outputDir, "rejected-law-types.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n", { flag: "wx", mode: 0o600 });
writeFileSync(resolve(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx", mode: 0o600 });
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
