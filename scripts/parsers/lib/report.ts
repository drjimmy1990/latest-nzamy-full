/**
 * report.ts — full, machine-readable parse reports.
 * ─────────────────────────────────────────────────────────────────────────────
 * The parsers print a capped preview of warnings to the console (a few hundred
 * lines of Arabic paths is unreadable and scrolls the summary away). Capping the
 * CONSOLE is fine; capping the RECORD is not — "… and 873 more" is exactly the
 * silent-loss pattern this whole pass exists to remove.
 *
 * So every run also writes the COMPLETE lists to a sidecar JSON next to the
 * parser output, and the console prints where to find it.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { getManifestProvenance } from "../manifest";

export interface ParseReport {
  type: string;
  generated_at: string;
  input: string;
  counts: Record<string, number>;
  /** Files skipped as non-content, with the rule that matched. */
  excluded?: Array<{ file: string; ruleId: string }>;
  /** Every frontmatter warning, uncapped. */
  frontmatterWarnings?: string[];
  /** ب-112: every rejected type/status/section_code enum value, uncapped. */
  rejectedEnumValues?: string[];
  /** Frontmatter `schema_version` → file count for this run (ب-88 sibling finding). */
  schemaVersionCounts?: Record<string, number>;
  /** Distinct records mapping to the same primary key. */
  identityCollisions?: Array<{ key: string; members: string[] }>;
  /** Files that matched no parser branch. */
  unclassified?: string[];
  /** Files that threw during parsing and are absent from the output. */
  failed?: string[];
  /** Anything else worth recording, per parser. */
  notes?: Record<string, unknown>;
  /** Exact parser contract and output snapshot required by the live preflight. */
  manifest?: { version: string; sha256: string };
  output_sha256?: string;
}

/** Hash large parser outputs in bounded memory. */
export function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

/**
 * Write the report and return its path. Never throws: a reporting failure must
 * not take down a parse run that otherwise succeeded.
 */
export function writeParseReport(outputDir: string, report: ParseReport): string | null {
  try {
    fs.mkdirSync(path.resolve(outputDir), { recursive: true });
    const dest = path.join(path.resolve(outputDir), `parse-report-${report.type}.json`);
    fs.writeFileSync(dest, JSON.stringify({
      ...report,
      counts: { rejectedEnumValues: report.rejectedEnumValues?.length ?? 0, ...report.counts },
      rejectedEnumValues: report.rejectedEnumValues ?? [],
      manifest: getManifestProvenance(),
    }, null, 2), "utf-8");
    return dest;
  } catch (e) {
    console.error(`  ⚠ could not write parse report: ${(e as Error).message}`);
    return null;
  }
}

/** Bind the complete parser output after it has been written by the CLI. */
export function bindParseReportToOutput(outputDir: string, type: string, outputFile: string): void {
  const reportPath = path.join(path.resolve(outputDir), `parse-report-${type}.json`);
  if (!fs.existsSync(reportPath)) {
    console.warn(`⚠ Parse report missing; live seeding will refuse ${type}: ${reportPath}`);
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as ParseReport;
  if (report.type !== type || !report.manifest?.sha256) {
    throw new Error(`Cannot bind invalid parse report for ${type}: ${reportPath}`);
  }
  report.output_sha256 = sha256File(outputFile);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
}

/**
 * Print a capped preview to the console and say how many were withheld and
 * where the complete list lives. Use this instead of slicing silently.
 */
export function printCapped(label: string, items: string[], cap = 15, indent = "   "): void {
  if (items.length === 0) return;
  console.warn(`\n${label} (${items.length}):`);
  for (const item of items.slice(0, cap)) console.warn(`${indent}• ${item}`);
  if (items.length > cap) {
    console.warn(`${indent}… ${items.length - cap} more — see the full list in the parse report JSON`);
  }
}
