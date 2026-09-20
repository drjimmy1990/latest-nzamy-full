#!/usr/bin/env npx tsx
/**
 * article-history.corpus-check.ts — runs the REAL extractor over the delivered
 * corpus and reports coverage. Not a unit test: it measures how much historical
 * text the extractor recovers from actual source files, and how much it has to
 * quarantine.
 *
 * Run:
 *   npx tsx scripts/parsers/lib/article-history.corpus-check.ts "<library root>"
 *
 * Exists because the only meaningful check on a heuristic extractor over
 * free-form Arabic legal prose is what it does to the real corpus. Re-run it
 * after any change to article-history.ts.
 */

import * as fs from "fs";
import * as path from "path";
import { extractArticleHistory, stripDetails, stripArticleHeading, unwrapLiveAnnexes } from "./article-history";
import { applyExclusions } from "./exclusions";

const root =
  process.argv[2] ||
  path.resolve(process.cwd(), "last_owner/01_المكتبة_القانونية/أنظمة ولوائح");

// Long-path prefix: hundreds of these paths exceed the 260-char Windows limit
// and readdir/readFile fail silently on them without it (rule ق-4).
const L = (p: string): string => (p.startsWith("\\\\?\\") ? p : "\\\\?\\" + p);

function walk(dir: string, out: string[] = []): string[] {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(L(dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const ART = /<!--\s*ARTICLE_START\s+(.*?)\s*-->([\s\S]*?)<!--\s*ARTICLE_END\s*-->/g;

const files = applyExclusions(walk(root)).kept;

let articles = 0;
let withDetails = 0;
let recovered = 0;
let quarantined = 0;
let regBlocks = 0;
let articlesFullyClassified = 0;
let emptyLiveTextWithHistory = 0;
let emptyLiveTextWithoutHistory = 0;
const byLabel: Record<string, number> = {};
const byStatus: Record<string, number> = {};

// Safety comparison across ALL articles: how many would a naive "delete every
// heading line" empty, versus the label-only strip actually used?
let naiveWouldEmpty = 0;
let labelOnlyEmpties = 0;

for (const f of files) {
  let raw: string;
  try {
    raw = fs.readFileSync(L(f), "utf-8");
  } catch {
    continue;
  }
  raw = raw.replace(/\r\n/g, "\n"); // CRLF normalisation, as the parser now does

  ART.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ART.exec(raw)) !== null) {
    articles++;

    {
      let anchorMeta: Record<string, unknown> = {};
      try { anchorMeta = JSON.parse(m[1]); } catch { /* checked elsewhere */ }
      // ك-03 (2026-08-23): unwrap ب-114's allowlisted live-annex blocks before
      // stripping, so this tool measures the same reality parse-laws.ts does
      // (see the ⚠️ note on ب-114 — this script previously used stripDetails()
      // alone and under-reported live text for the 26 known live-annex cases).
      const base = stripDetails(unwrapLiveAnnexes(m[2])).replace(/<!--[\s\S]*?-->/g, "").replace(/^>\s*/gm, "").trim();
      if (base) {
        const naive = base.replace(/^[ \t]*#{1,6}[ \t]+.*$/gm, "").trim();
        if (!naive) naiveWouldEmpty++;
        const safe = stripArticleHeading(base, String(anchorMeta.number_text || ""))
          .replace(/^>\s*/gm, "").trim();
        if (!safe) labelOnlyEmpties++;
      }
    }
    const body = m[2];
    if (!body.includes("<details")) continue;
    withDetails++;

    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(m[1]);
    } catch {
      /* anchor JSON is checked elsewhere */
    }
    const status = String(meta.status || "active");

    const r = extractArticleHistory(body);
    recovered += r.entries.length;
    quarantined += r.unparsed.length;
    regBlocks += r.regulationBlocks.length;
    if (r.unparsed.length === 0) articlesFullyClassified++;
    for (const e of r.entries) byLabel[e.label] = (byLabel[e.label] || 0) + 1;
    if (r.entries.length) byStatus[status] = (byStatus[status] || 0) + 1;

    // After stripping history, does any live text remain? An article left empty
    // is correct ONLY when its content was genuinely historical (a repealed
    // article whose body is just a struck-through heading). Uses the SAME
    // label-only heading strip the parser uses, so this measures reality.
    const live = stripArticleHeading(
      stripDetails(unwrapLiveAnnexes(body)).replace(/<!--[\s\S]*?-->/g, ""),
      String(meta.number_text || ""),
    )
      .replace(/^>\s*/gm, "")
      .trim();
    if (!live) {
      if (r.entries.length) emptyLiveTextWithHistory++;
      else emptyLiveTextWithoutHistory++;
    }
  }
}

const pct = (n: number, d: number) => (d === 0 ? "0.0" : ((n / d) * 100).toFixed(1));

console.log(`\n${"═".repeat(66)}`);
console.log("  Article history extractor — corpus coverage");
console.log(`${"═".repeat(66)}\n`);
console.log(`  files (after exclusions)        ${String(files.length).padStart(8)}`);
console.log(`  articles                        ${String(articles).padStart(8)}`);
console.log(`  articles with <details>         ${String(withDetails).padStart(8)}`);
console.log(`     fully classified             ${String(articlesFullyClassified).padStart(8)}   ${pct(articlesFullyClassified, withDetails)}%`);
console.log(`  historical texts recovered      ${String(recovered).padStart(8)}   (was 0)`);
console.log(`  blocks quarantined              ${String(quarantined).padStart(8)}`);
console.log(`  historic regulation blocks      ${String(regBlocks).padStart(8)}`);
console.log(`\n  live text empty AND history recovered   ${String(emptyLiveTextWithHistory).padStart(6)}  ← expected (repealed)`);
console.log(`  live text empty AND no history          ${String(emptyLiveTextWithoutHistory).padStart(6)}  ← must stay low`);

console.log(`\n  ── heading-strip safety (all ${articles} articles) ──`);
console.log(`  emptied by a naive "delete heading line" ${String(naiveWouldEmpty).padStart(6)}  ← statutory text destroyed`);
console.log(`  emptied by the label-only strip used     ${String(labelOnlyEmpties).padStart(6)}`);
console.log(`  articles PROTECTED by label-only strip   ${String(naiveWouldEmpty - labelOnlyEmpties).padStart(6)}`);

console.log(`\n  recovered by label:`);
for (const [k, v] of Object.entries(byLabel).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`     ${String(v).padStart(5)}  ${k}`);
}
console.log(`\n  recovered by article status:`);
for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(v).padStart(5)}  ${k}`);
}
console.log("");
