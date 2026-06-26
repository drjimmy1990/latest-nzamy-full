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

const AR_TRANSLIT: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "e", "آ": "aa", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "dh", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ئ": "e", "ؤ": "w",
  "ء": "", "ﻻ": "la", "ﻷ": "la",
};

function slugifyArabic(text: string): string {
  let slug = text.replace(/[\u064B-\u065F\u0670]/g, "");
  slug = slug.replace(/\bال/g, "al-");
  let result = "";
  for (const ch of slug) {
    if (AR_TRANSLIT[ch] !== undefined) result += AR_TRANSLIT[ch];
    else if (/[a-zA-Z0-9]/.test(ch)) result += ch.toLowerCase();
    else if (/[\s\-_]/.test(ch)) result += "-";
  }
  return result.replace(/-{2,}/g, "-").replace(/^-|-$/g, "").substring(0, 120);
}

// ══════════════════════════════════════════════════════════════════════════════
// YAML frontmatter (minimal parser — same as parse-laws)
// ══════════════════════════════════════════════════════════════════════════════

function parseYamlFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!match) return { meta: {}, body: raw };
  const yamlStr = match[1];
  const body = raw.slice(match[0].length);
  const meta: Record<string, unknown> = {};
  for (const line of yamlStr.split(/\r?\n/)) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (m) {
      let value: unknown = m[2].trim();
      if (typeof value === "string" && /^["'].*["']$/.test(value)) value = (value as string).slice(1, -1);
      if (typeof value === "string" && /^\d+$/.test(value)) value = parseInt(value, 10);
      if (value === "true") value = true;
      if (value === "false") value = false;
      meta[m[1]] = value;
    }
  }
  return { meta, body };
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
  const { meta, body } = parseYamlFrontmatter(raw);

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
    issuer: String(meta.issuer || meta.issuing_body || ""),
    ref: String(meta.ref || meta.reference || ""),
    date: String(meta.date || ""),
    summary: String(meta.summary || ""),
    summary_brief: String(meta.summary_brief || ""),
    preamble,
    cat: String(meta.cat || meta.section_code || ""),
    articles,
    hashtags: ((meta.hashtags as string[]) || []),
    official_url: String(meta.official_url || ""),
    raw_pages: [],
    metadata: meta,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export function parseDecrees(inputPath: string): DecreesParserOutput {
  const resolvedPath = path.resolve(inputPath);
  const stats = fs.statSync(resolvedPath);
  const allDecrees: ParsedDecree[] = [];

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

    // Then process markdown files
    for (const entry of entries) {
      const full = path.join(resolvedPath, entry);
      if (full.endsWith(".md") && fs.statSync(full).isFile()) {
        try {
          const d = parseCircularMd(full);
          if (d) allDecrees.push(d);
        } catch (err) {
          console.error(`  ✗ Failed to parse circular ${full}: ${(err as Error).message}`);
        }
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
  const result = parseDecrees(inputPath);

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "decrees.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
