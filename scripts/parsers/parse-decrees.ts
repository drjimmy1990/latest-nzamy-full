#!/usr/bin/env npx ts-node
/**
 * parse-decrees.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Parses Saudi royal decrees, cabinet decisions, and circulars.
 *
 * Primary source:  UNIFIED_DECREE_INDEX.json — dictionary keyed by UUID
 *   Each entry: {id, title, type, issuer, ref, date, summary, cat,
 *                summary_brief, preamble, articles[], hashtags[], official_url}
 *
 * Secondary source: Circular .md files with YAML frontmatter + ARTICLE markers
 *
 * Usage:
 *   npx ts-node scripts/parsers/parse-decrees.ts --input ./data/decrees
 *   npx ts-node scripts/parsers/parse-decrees.ts --input ./data/UNIFIED_DECREE_INDEX.json
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";
import { slugifyArabic as sharedSlugify } from "./lib/slug";
import { parseFrontmatter } from "./lib/frontmatter";
import { applyExclusions, formatExclusionSummary } from "./lib/exclusions";
import { filterMeta } from "./manifest";
import { writeParseReport, printCapped } from "./lib/report";

/** Collected per run so YAML problems are reported, never swallowed. */
const frontmatterWarnings: string[] = [];

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

export type DecreeType = "royal" | "cabinet" | "circular" | "ministerial";

export interface DecreeArticle {
  number: number;
  text: string;
}

export interface ParsedDecree {
  id: string;
  slug: string;
  title: string;
  type: DecreeType;
  issuer: string;
  ref: string;
  date: string;
  summary: string;
  summary_brief: string;
  preamble: string;
  cat: string;
  articles: DecreeArticle[];
  hashtags: string[];
  official_url: string;
  raw_pages: string[];
  metadata: Record<string, unknown>;
}

export interface DecreesParserOutput {
  type: "decrees";
  generated_at: string;
  total_decrees: number;
  total_articles: number;
  decrees: ParsedDecree[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Arabic → ASCII slug (shared logic)
// ══════════════════════════════════════════════════════════════════════════════

// Transliteration table + slug function moved to ./lib/slug.ts (was duplicated
// verbatim in all four parsers). Aliased so existing call-sites are unchanged.
const slugifyArabic = sharedSlugify;

// ══════════════════════════════════════════════════════════════════════════════
// YAML frontmatter (minimal parser — same as parse-laws)
// ══════════════════════════════════════════════════════════════════════════════

// Frontmatter now parsed by js-yaml via ./lib/frontmatter.ts. The previous
// line-by-line matcher silently dropped indented sub-keys, kept raw quote
// characters from malformed scalars, and let broken YAML pass unnoticed.
function parseYamlFrontmatter(
  raw: string,
  sourcePath = "<unknown>",
): { meta: Record<string, unknown>; body: string } {
  const { meta, body, warnings } = parseFrontmatter(raw, sourcePath);
  if (warnings.length) frontmatterWarnings.push(...warnings);
  return { meta: filterMeta(meta), body };
}

// ══════════════════════════════════════════════════════════════════════════════
// Parse from UNIFIED_DECREE_INDEX.json
// ══════════════════════════════════════════════════════════════════════════════

function parseUnifiedIndex(filePath: string): ParsedDecree[] {
  console.log(`  📋 Reading unified decree index: ${path.basename(filePath)}`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const index: Record<string, Record<string, unknown>> = JSON.parse(raw);

  const decrees: ParsedDecree[] = [];

  for (const [uuid, entry] of Object.entries(index)) {
    const title = String(entry.title || "");
    const rawArticles = (entry.articles || []) as string[];

    // Parse articles: each entry in the array is a page of text
    // Pages are separated by "---" within entries
    const articles: DecreeArticle[] = [];
    const rawPages: string[] = [];

    for (let i = 0; i < rawArticles.length; i++) {
      const pageText = rawArticles[i];
      rawPages.push(pageText);

      // Try to split pages that contain "---" separator
      const subPages = pageText.split(/\n---\n/);
      for (const subPage of subPages) {
        const trimmed = subPage.trim();
        if (trimmed) {
          articles.push({
            number: articles.length + 1,
            text: trimmed,
          });
        }
      }
    }

    const decreeType = detectDecreeType(String(entry.type || ""));
    const slug = String(entry.id || uuid);

    decrees.push({
      id: uuid,
      slug,
      title,
      type: decreeType,
      issuer: String(entry.issuer || ""),
      ref: String(entry.ref || ""),
      date: String(entry.date || ""),
      summary: String(entry.summary || ""),
      summary_brief: String(entry.summary_brief || ""),
      preamble: String(entry.preamble || ""),
      cat: String(entry.cat || ""),
      articles,
      hashtags: (entry.hashtags || []) as string[],
      official_url: String(entry.official_url || ""),
      raw_pages: rawPages,
      metadata: entry,
    });
  }

  console.log(`    ✓ ${decrees.length} decrees from unified index`);
  return decrees;
}

function detectDecreeType(typeStr: string): DecreeType {
  const lower = typeStr.toLowerCase();
  if (lower.includes("royal") || lower.includes("ملكي")) return "royal";
  if (lower.includes("cabinet") || lower.includes("مجلس الوزراء") || lower.includes("وزراء")) return "cabinet";
  if (lower.includes("circular") || lower.includes("تعميم")) return "circular";
  if (lower.includes("ministerial") || lower.includes("وزاري")) return "ministerial";
  // Default based on Arabic text
  if (typeStr.includes("أمر")) return "royal";
  if (typeStr.includes("قرار")) return "cabinet";
  return "cabinet";
}

// ══════════════════════════════════════════════════════════════════════════════
// Parse circular markdown files
// ══════════════════════════════════════════════════════════════════════════════

function parseCircularMd(filePath: string): ParsedDecree | null {
  console.log(`  📄 Parsing circular markdown: ${path.basename(filePath)}`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseYamlFrontmatter(raw, filePath);

  const fileId = path.basename(filePath, ".md");
  const title = String(meta.title || fileId);

  // Extract articles using ARTICLE_START/END markers
  const articles: DecreeArticle[] = [];
  const articleRe = /<!--\s*ARTICLE_START\s+(.*?)\s*-->([\s\S]*?)<!--\s*ARTICLE_END\s*-->/g;
  let match: RegExpExecArray | null;

  while ((match = articleRe.exec(body)) !== null) {
    let artMeta: Record<string, unknown> = {};
    try {
      artMeta = JSON.parse(match[1]);
    } catch {
      // Fall through with empty meta
    }
    const text = match[2].replace(/^>\s*/gm, "").trim();
    articles.push({
      number: Number(artMeta.number || articles.length + 1),
      text,
    });
  }

  // If no ARTICLE markers, treat the entire body as a single article
  if (articles.length === 0 && body.trim().length > 0) {
    articles.push({ number: 1, text: body.trim() });
  }

  // Extract preamble (text before first article marker)
  let preamble = "";
  const firstArt = body.indexOf("<!-- ARTICLE_START");
  if (firstArt > 0) {
    preamble = body.slice(0, firstArt).trim();
  }

  return {
    id: fileId,
    slug: slugifyArabic(title) || fileId,
    title,
    type: detectDecreeType(String(meta.type || "circular")),
    // Section 30 مراسيم/قرارات (2026-06 extraction round) use `issuing_authority`
    // rather than `issuer`/`issuing_body`.
    issuer: String(meta.issuer || meta.issuing_body || meta.issuing_authority || ""),
    // Section 30 circulars (2026-07 card-v2 campaign) use `tameem_number`/`decree_number`
    // rather than `ref`/`reference`; مراسيم use `decree_date`, circulars `issue_date_hijri`.
    ref: String(meta.ref || meta.reference || meta.tameem_number || meta.decree_number || ""),
    date: String(meta.date || meta.issue_date_hijri || meta.decree_date || ""),
    summary: String(meta.summary || ""),
    summary_brief: String(meta.summary_brief || ""),
    preamble,
    cat: String(meta.cat || meta.section_code || ""),
    articles,
    hashtags: ((meta.hashtags as string[]) || []),
    official_url: String(meta.official_url || meta.source || ""),
    raw_pages: [],
    metadata: meta,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export function parseDecrees(inputPath: string, reportDir?: string): DecreesParserOutput {
  const resolvedPath = path.resolve(inputPath);
  const stats = fs.statSync(resolvedPath);
  const allDecrees: ParsedDecree[] = [];
  const failedFiles: string[] = [];
  let excludedTotal = 0;
  let excludedList: Array<{ file: string; ruleId: string }> = [];

  if (stats.isFile()) {
    if (resolvedPath.endsWith(".json")) {
      allDecrees.push(...parseUnifiedIndex(resolvedPath));
    } else if (resolvedPath.endsWith(".md")) {
      const d = parseCircularMd(resolvedPath);
      if (d) allDecrees.push(d);
    }
  } else if (stats.isDirectory()) {
    const entries = fs.readdirSync(resolvedPath, { recursive: true }) as string[];

    // Process JSON indices first
    for (const entry of entries) {
      const full = path.join(resolvedPath, entry);
      if (
        full.endsWith(".json") &&
        (entry.toLowerCase().includes("decree") || entry.toLowerCase().includes("index")) &&
        fs.statSync(full).isFile()
      ) {
        try {
          allDecrees.push(...parseUnifiedIndex(full));
        } catch (err) {
          console.error(`  ✗ Failed to parse JSON index ${full}: ${(err as Error).message}`);
        }
      }
    }

    // Then process markdown files, minus non-content artefacts.
    const mdFiles = entries
      .map((e) => path.join(resolvedPath, e))
      .filter((f) => f.endsWith(".md") && fs.statSync(f).isFile());

    const { kept, countsByRule, excluded } = applyExclusions(mdFiles);
    const excludedCount = mdFiles.length - kept.length;
    excludedTotal = excludedCount;
    excludedList = excluded;
    if (excludedCount > 0) {
      console.log(`\n   ⊘ ${excludedCount} non-content file(s) excluded:`);
      for (const line of formatExclusionSummary(countsByRule)) console.log(`      • ${line}`);
      console.log("");
    }

    for (const full of kept) {
      try {
        const d = parseCircularMd(full);
        if (d) allDecrees.push(d);
      } catch (err) {
        // Recorded, not swallowed — see the failure report below.
        console.error(`  ✗ Failed to parse circular ${full}: ${(err as Error).message}`);
        failedFiles.push(full);
      }
    }
  }

  const totalArticles = allDecrees.reduce((sum, d) => sum + d.articles.length, 0);
  console.log(`\n📜 Decree Parser Summary`);
  console.log(`  Total decrees: ${allDecrees.length}`);
  console.log(`  Total articles: ${totalArticles}`);
  console.log(
    `  By type: royal=${allDecrees.filter(d => d.type === "royal").length}, ` +
    `cabinet=${allDecrees.filter(d => d.type === "cabinet").length}, ` +
    `circular=${allDecrees.filter(d => d.type === "circular").length}\n`
  );

  // ── Identity guard ──────────────────────────────────────────────────────────
  // seed-library.ts derives decrees_circulars.id from this `id` via toUuid(), so
  // two decrees sharing an id collapse to one row on upsert and the other is
  // silently discarded. Fail before anything is written.
  const byId = new Map<string, string[]>();
  for (const d of allDecrees) {
    const list = byId.get(d.id);
    if (list) list.push(d.title);
    else byId.set(d.id, [d.title]);
  }
  const idCollisions = [...byId.entries()].filter(([, v]) => v.length > 1);
  if (idCollisions.length > 0) {
    console.error(`\n🛑 ${idCollisions.length} DECREE ID COLLISION(S) — distinct decrees sharing one key:`);
    for (const [id, titles] of idCollisions.slice(0, 20)) {
      console.error(`   "${id}"`);
      for (const t of titles) console.error(`      ← ${t}`);
    }
    if (idCollisions.length > 20) console.error(`   … and ${idCollisions.length - 20} more`);
  }

  printCapped("⚠️  frontmatter warning(s)", frontmatterWarnings);

  if (failedFiles.length > 0) {
    console.error(`\n🛑 ${failedFiles.length} file(s) failed to parse and are MISSING from the output.`);
  }

  // Complete, uncapped record — the console preview above is truncated on purpose.
  if (reportDir) {
    const p = writeParseReport(reportDir, {
      type: "decrees",
      generated_at: new Date().toISOString(),
      input: resolvedPath,
      counts: {
        decrees: allDecrees.length,
        articles: totalArticles,
        excluded: excludedTotal,
        frontmatterWarnings: frontmatterWarnings.length,
        idCollisions: idCollisions.length,
        failed: failedFiles.length,
      },
      excluded: excludedList,
      frontmatterWarnings,
      identityCollisions: idCollisions.map(([key, members]) => ({ key, members })),
      failed: failedFiles,
    });
    if (p) console.log(`\n📄 Full parse report: ${p}`);
  }

  // Rule ق-3: a run that lost documents or would corrupt identity must not exit 0.
  if (idCollisions.length > 0 || failedFiles.length > 0) {
    console.error(
      `\n✗ Parse completed with unrecoverable problems ` +
        `(${idCollisions.length} id collision(s), ${failedFiles.length} failed file(s)). Refusing to report success.`,
    );
    process.exitCode = 1;
  }

  return {
    type: "decrees",
    generated_at: new Date().toISOString(),
    total_decrees: allDecrees.length,
    total_articles: totalArticles,
    decrees: allDecrees,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CLI entry point
// ══════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  const outputIdx = args.indexOf("--output");

  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : args[0];
  const outputDir = outputIdx >= 0 ? args[outputIdx + 1] : "./output";

  if (!inputPath) {
    console.error("Usage: npx ts-node parse-decrees.ts --input <path> [--output <dir>]");
    process.exit(1);
  }

  console.log(`\n📋 Decree Parser — processing: ${inputPath}\n`);
  const result = parseDecrees(inputPath, outputDir);

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "decrees.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
