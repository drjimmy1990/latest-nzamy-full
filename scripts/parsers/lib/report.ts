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

export interface ParseReport {
  type: string;
  generated_at: string;
  input: string;
  counts: Record<string, number>;
  /** Files skipped as non-content, with the rule that matched. */
  excluded?: Array<{ file: string; ruleId: string }>;
  /** Every frontmatter warning, uncapped. */
  frontmatterWarnings?: string[];
  /** Distinct records mapping to the same primary key. */
  identityCollisions?: Array<{ key: string; members: string[] }>;
  /** Files that matched no parser branch. */
  unclassified?: string[];
  /** Files that threw during parsing and are absent from the output. */
  failed?: string[];
  /** Anything else worth recording, per parser. */
  notes?: Record<string, unknown>;
}

/**
 * Write the report and return its path. Never throws: a reporting failure must
 * not take down a parse run that otherwise succeeded.
 */
export function writeParseReport(outputDir: string, report: ParseReport): string | null {
  try {
    fs.mkdirSync(path.resolve(outputDir), { recursive: true });
    const dest = path.join(path.resolve(outputDir), `parse-report-${report.type}.json`);
    fs.writeFileSync(dest, JSON.stringify(report, null, 2), "utf-8");
    return dest;
  } catch (e) {
    console.error(`  ⚠ could not write parse report: ${(e as Error).message}`);
    return null;
  }
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
