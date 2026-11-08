/**
 * BUG-01 (owner package 6-Nov) — read-only scan for internal-note text in
 * library bodies. Reads files only: no network, no database.
 *
 *   npx tsx scripts/scan-library-audit-notes.ts <export-folder | law-api.json> [--residual] [--out report.md]
 *
 * <export-folder>  the owner's library export (*.md). Each article body
 *                  (from its ARTICLE_START anchor; front matter and HTML
 *                  comments left out) is scanned with the wide net in
 *                  src/lib/library/auditNoteScan.ts.
 * <law-api.json>   a saved response of /api/library/laws/<slug>: every text
 *                  field of every article is scanned.
 * --residual       report only what is STILL found after the reader's own
 *                  stripper (stripArticleAuditNotes) — what a reader could
 *                  still see. Without it: everything, each line marked
 *                  «removed» or «KEPT» by the stripper.
 *
 * The wide net flags more than notes (an ISO date can be law); read it.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { residualSuspectNotes, scanSuspectNotes, type SuspectNoteHit } from "../src/lib/library/auditNoteScan.ts";
import { stripArticleAuditNotes } from "../src/lib/library/lawPreambleBlocks.ts";

interface Unit {
  where: string;
  text: string;
}

const args = process.argv.slice(2);
const residualOnly = args.includes("--residual");
const outAt = args.indexOf("--out");
const outFile = outAt >= 0 ? args[outAt + 1] : null;
const target = args.find((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
if (!target) {
  console.error("usage: npx tsx scripts/scan-library-audit-notes.ts <export-folder | law-api.json> [--residual] [--out report.md]");
  process.exit(2);
}

function* markdownFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* markdownFiles(p);
    else if (name.endsWith(".md") && !name.includes(".pre_")) yield p;
  }
}

function unitsFromExport(root: string): Unit[] {
  const units: Unit[] = [];
  for (const file of markdownFiles(root)) {
    let t = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    if (t.startsWith("---")) {
      const end = t.indexOf("\n---", 3);
      if (end > 0) t = t.slice(end + 4);
    }
    const parts = t.split(/(?=<!-- ARTICLE_START)/);
    for (const part of parts) {
      const anchor = /^<!-- ARTICLE_START (\{.*?\}) -->/.exec(part);
      if (!anchor) continue;
      let label = "?";
      try {
        const meta = JSON.parse(anchor[1]) as { number?: unknown; number_text?: unknown };
        label = String(meta.number_text ?? meta.number ?? "?");
      } catch {
        /* an unreadable anchor still gets scanned */
      }
      units.push({ where: `${relative(root, file)} — ${label}`, text: part.replace(/<!--[\s\S]*?-->/g, "") });
    }
  }
  return units;
}

function unitsFromLawJson(file: string): Unit[] {
  const law = JSON.parse(readFileSync(file, "utf8")) as { slug?: string; chapters?: Array<{ articles?: Array<Record<string, unknown>> }> };
  const units: Unit[] = [];
  for (const chapter of law.chapters ?? []) {
    for (const a of chapter.articles ?? []) {
      const at = `${law.slug ?? file} — ${String(a.id ?? a.num ?? "?")}`;
      for (const key of ["title", "text", "originalText", "historicRegulationText"]) {
        if (typeof a[key] === "string") units.push({ where: `${at} · ${key}`, text: a[key] as string });
      }
      const regs = Array.isArray(a.regulations) ? (a.regulations as Array<Record<string, unknown>>) : [];
      regs.forEach((r, i) => units.push({ where: `${at} · regulations[${i}]`, text: String(r.text ?? "") }));
      const amends = Array.isArray(a.amendments) ? (a.amendments as Array<Record<string, unknown>>) : [];
      amends.forEach((m, i) => units.push({ where: `${at} · amendments[${i}]`, text: `${m.summary ?? ""}\n${m.fullText ?? ""}` }));
    }
  }
  return units;
}

const units = statSync(target).isDirectory() ? unitsFromExport(target) : unitsFromLawJson(target);
const lines: string[] = [];
const byPattern = new Map<string, number>();
let flagged = 0;
for (const u of units) {
  const hits: SuspectNoteHit[] = residualOnly ? residualSuspectNotes(u.text) : scanSuspectNotes(u.text);
  if (hits.length === 0) continue;
  flagged++;
  const stripped = residualOnly ? "" : stripArticleAuditNotes(u.text).replace(/[ً-ٰٟـ]/g, "");
  lines.push(`### ${u.where}`);
  for (const h of hits) {
    byPattern.set(h.pattern, (byPattern.get(h.pattern) ?? 0) + 1);
    const verdict = residualOnly ? "" : stripped.includes(h.match) ? " [KEPT]" : " [removed]";
    lines.push(`- ${h.pattern}${verdict}: «${h.match}» … ${h.context}`);
  }
}
const summary = [
  `units scanned: ${units.length}; units flagged: ${flagged}${residualOnly ? " (after the reader's stripper)" : ""}`,
  ...[...byPattern.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `  ${n}\t${p}`),
].join("\n");
const report = `${summary}\n\n${lines.join("\n")}\n`;
if (outFile) {
  writeFileSync(outFile, report, "utf8");
  console.log(summary);
  console.log(`report: ${outFile}`);
} else {
  console.log(report);
}
