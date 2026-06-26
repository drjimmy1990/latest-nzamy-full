#!/usr/bin/env npx ts-node
/**
 * parse-laws.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Parses Saudi legal‑system markdown files into structured JSON.
 *
 * Two variants are supported:
 *   BOE  – law-only (هيئة الخبراء format, no regulations)
 *   Qadha – law + merged executive regulation (جمعية قضاء format,
 *           regulation text in block-quotes after each article)
 *
 * Markers handled:
 *   <!-- ARTICLE_START {JSON} -->  …  <!-- ARTICLE_END -->
 *   <!-- CHAPTER_START {JSON} -->  …  <!-- CHAPTER_END -->
 *   <!-- REGULATION {JSON} -->
 *   <!-- AMENDMENT  {JSON} -->
 *
 * Usage:
 *   npx ts-node scripts/parsers/parse-laws.ts --input ./data/laws --output ./output/laws
 *   npx ts-node scripts/parsers/parse-laws.ts --input ./data/laws/companies-law.md
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

export type ArticleStatus = "active" | "amended" | "repealed" | "suspended";

export interface AmendmentEntry {
  date: string;
  decree: string;
  summary: string;
  original_text?: string;
}

export interface ExecutiveRegulation {
  instrument: string;
  ref: string;
  text: string;
}

export interface ParsedArticle {
  number: number;
  number_text: string;
  title: string;
  status: ArticleStatus;
  text: string;
  chapter_title: string;
  chapter_number?: number;
  regulations: ExecutiveRegulation[];
  amendments: AmendmentEntry[];
  free: boolean;
}

export interface ParsedChapter {
  number: number;
  title: string;
  articles: ParsedArticle[];
}

export interface ParsedLaw {
  id: string;
  slug: string;
  title: string;
  title_en: string;
  type: string;                    // "نظام" | "نظام_ولائحة" | "لائحة" …
  section_code: string;
  section_name: string;
  issuing_body: string;
  issuance_decree: string;
  issuance_date: string;
  total_articles: number;
  has_executive_reg: boolean;
  regulation_decree: string;
  preamble: string;
  regulation_preamble: string;
  law_status: string;
  source: string;
  boe_url: string;
  variant: "boe" | "qadha";
  chapters: ParsedChapter[];
  metadata: Record<string, unknown>;
}

export interface LawsParserOutput {
  type: "laws";
  generated_at: string;
  total_files: number;
  total_articles: number;
  laws: ParsedLaw[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Arabic → ASCII slug transliteration
// ══════════════════════════════════════════════════════════════════════════════

const AR_TRANSLIT: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "e", "آ": "aa", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "dh", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ئ": "e", "ؤ": "w",
  "ء": "", "ﻻ": "la", "ﻷ": "la",
};

export function slugifyArabic(text: string): string {
  // Strip diacritics (tashkeel)
  let slug = text.replace(/[\u064B-\u065F\u0670]/g, "");
  // Remove "ال" (the definite article) – keep for readability as "al-"
  slug = slug.replace(/\bال/g, "al-");
  // Transliterate
  let result = "";
  for (const ch of slug) {
    if (AR_TRANSLIT[ch] !== undefined) {
      result += AR_TRANSLIT[ch];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      result += ch.toLowerCase();
    } else if (/[\s\-_]/.test(ch)) {
      result += "-";
    }
    // else: drop the char
  }
  // Clean up
  return result
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 120);
}

// ══════════════════════════════════════════════════════════════════════════════
// YAML Frontmatter extraction (no external dependency)
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
      // Strip surrounding quotes
      if (typeof value === "string" && /^["'].*["']$/.test(value)) {
        value = (value as string).slice(1, -1);
      }
      // Detect numbers
      if (typeof value === "string" && /^\d+$/.test(value)) {
        value = parseInt(value, 10);
      }
      // Detect booleans
      if (value === "true") value = true;
      if (value === "false") value = false;
      meta[m[1]] = value;
    }
  }
  return { meta, body };
}

// ══════════════════════════════════════════════════════════════════════════════
// Core parsing logic
// ══════════════════════════════════════════════════════════════════════════════

function safeJsonParse(str: string, context: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch (err) {
    console.warn(`  ⚠ JSON parse error in ${context}: ${(err as Error).message}`);
    return null;
  }
}

function detectVariant(body: string, meta: Record<string, unknown>): "boe" | "qadha" {
  // Qadha format: has regulation block-quotes or explicit source field
  const source = String(meta.source || "").toLowerCase();
  if (source.includes("قضاء") || source.includes("qadha")) return "qadha";
  if (/<!-- REGULATION\s/i.test(body)) return "qadha";
  return "boe";
}

function extractPreamble(body: string): string {
  // Everything before the first chapter or article marker
  const firstMarker = body.search(/<!--\s*(ARTICLE_START|CHAPTER_START)\s/);
  if (firstMarker === -1) return "";
  return body.slice(0, firstMarker).trim();
}

function parseSingleLaw(filePath: string): ParsedLaw | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseYamlFrontmatter(raw);
  const variant = detectVariant(body, meta);

  const fileBaseName = path.basename(filePath, ".md");
  const slug = (meta.slug as string) || fileBaseName;
  const title = (meta.title as string) || fileBaseName;

  console.log(`  📜 Parsing law: ${title} (${variant} variant)`);

  // ── Parse chapters ─────────────────────────────────────────────────────
  const chapters: ParsedChapter[] = [];
  const chapterRe = /<!--\s*CHAPTER_START\s+(.*?)\s*-->([\s\S]*?)<!--\s*CHAPTER_END\s*-->/g;
  let chapterMatch: RegExpExecArray | null;

  // If there are no CHAPTER markers, treat the whole body as one chapter
  const hasChapters = chapterRe.test(body);
  chapterRe.lastIndex = 0;

  if (!hasChapters) {
    const articles = parseArticlesInBlock(body, "", 0);
    chapters.push({ number: 0, title: "", articles });
  } else {
    while ((chapterMatch = chapterRe.exec(body)) !== null) {
      const chapterMeta = safeJsonParse(chapterMatch[1], `chapter in ${slug}`);
      const chapterBody = chapterMatch[2];
      const chapterNum = Number(chapterMeta?.number || chapters.length + 1);
      const chapterTitle = String(chapterMeta?.title || `الباب ${chapterNum}`);

      const articles = parseArticlesInBlock(chapterBody, chapterTitle, chapterNum);
      chapters.push({ number: chapterNum, title: chapterTitle, articles });
    }
  }

  // Also parse articles outside chapters (if some articles are outside chapter markers)
  if (hasChapters) {
    // Find articles NOT inside any CHAPTER_START/END block
    let outsideBody = body;
    const chapterBlockRe = /<!--\s*CHAPTER_START[\s\S]*?CHAPTER_END\s*-->/g;
    outsideBody = outsideBody.replace(chapterBlockRe, "");
    const orphanArticles = parseArticlesInBlock(outsideBody, "__orphan__", -1);
    if (orphanArticles.length > 0) {
      chapters.push({ number: -1, title: "__orphan__", articles: orphanArticles });
    }
  }

  const totalArticles = chapters.reduce((sum, ch) => sum + ch.articles.length, 0);

  const preambleText = extractPreamble(body);

  // ── Extract regulation preamble (Qadha) ─────────────────────────────────
  let regulationPreamble = "";
  const regPreambleMatch = body.match(
    /<!--\s*REGULATION_PREAMBLE\s*-->([\s\S]*?)<!--\s*REGULATION_PREAMBLE_END\s*-->/
  );
  if (regPreambleMatch) {
    regulationPreamble = regPreambleMatch[1].replace(/^>\s*/gm, "").trim();
  }

  console.log(`    ✓ ${chapters.length} chapters, ${totalArticles} articles`);

  return {
    id: (meta.id as string) || slug,
    slug,
    title,
    title_en: (meta.title_en as string) || "",
    type: (meta.type as string) || "نظام",
    section_code: (meta.section_code as string) || "",
    section_name: (meta.section_name as string) || "",
    issuing_body: (meta.issuing_body as string) || "",
    issuance_decree: (meta.issuance_decree as string) || "",
    issuance_date: (meta.issuance_date as string) || "",
    total_articles: totalArticles,
    has_executive_reg: variant === "qadha" || Boolean(meta.has_executive_reg),
    regulation_decree: (meta.regulation_decree as string) || "",
    preamble: preambleText,
    regulation_preamble: regulationPreamble,
    law_status: (meta.law_status as string) || "active",
    source: (meta.source as string) || "",
    boe_url: (meta.boe_url as string) || "",
    variant,
    chapters,
    metadata: meta,
  };
}

function parseArticlesInBlock(
  block: string,
  chapterTitle: string,
  chapterNumber: number
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const articleRe =
    /<!--\s*ARTICLE_START\s+(.*?)\s*-->([\s\S]*?)<!--\s*ARTICLE_END\s*-->/g;
  let match: RegExpExecArray | null;

  while ((match = articleRe.exec(block)) !== null) {
    const artMeta = safeJsonParse(match[1], "article");
    if (!artMeta) continue;

    let articleBody = match[2];

    // ── Extract regulation blocks ──────────────────────────────────────────
    const regulations: ExecutiveRegulation[] = [];
    const regRe = /<!--\s*REGULATION\s+(.*?)\s*-->([\s\S]*?)(?=<!--|$)/g;
    let regMatch: RegExpExecArray | null;
    while ((regMatch = regRe.exec(articleBody)) !== null) {
      const regMeta = safeJsonParse(regMatch[1], "regulation");
      const regText = regMatch[2]
        .replace(/^>\s*/gm, "") // Strip block-quote markers
        .trim();
      regulations.push({
        instrument: String(regMeta?.instrument || "لائحة تنفيذية"),
        ref: String(regMeta?.ref || ""),
        text: regText,
      });
    }

    // ── Extract amendment blocks ──────────────────────────────────────────
    const amendments: AmendmentEntry[] = [];
    const amendRe = /<!--\s*AMENDMENT\s+(.*?)\s*-->/g;
    let amendMatch: RegExpExecArray | null;
    while ((amendMatch = amendRe.exec(articleBody)) !== null) {
      const amendMeta = safeJsonParse(amendMatch[1], "amendment");
      if (amendMeta) {
        amendments.push({
          date: String(amendMeta.date || ""),
          decree: String(amendMeta.decree || ""),
          summary: String(amendMeta.summary || ""),
          original_text: (amendMeta.original_text as string) || undefined,
        });
      }
    }

    // ── Clean article text ──────────────────────────────────────────────
    let cleanText = articleBody;
    // Remove regulation blocks
    cleanText = cleanText.replace(/<!--\s*REGULATION[\s\S]*?(?=<!--|$)/g, "");
    // Remove amendment markers
    cleanText = cleanText.replace(/<!--\s*AMENDMENT\s+.*?-->/g, "");
    // Remove markdown heading
    cleanText = cleanText.replace(/^###?\s+.*\n/m, "");
    // Strip block-quote markers and clean
    cleanText = cleanText.replace(/^>\s*/gm, "").trim();

    const number = Number(artMeta.number || 0);
    const numberText = String(artMeta.number_text || artMeta.number || "");
    const artTitle = String(artMeta.title || "");
    const status = (artMeta.status as ArticleStatus) || "active";

    articles.push({
      number,
      number_text: numberText,
      title: artTitle,
      status,
      text: cleanText,
      chapter_title: String(artMeta.chapter || chapterTitle),
      chapter_number: chapterNumber >= 0 ? chapterNumber : undefined,
      regulations,
      amendments,
      free: artMeta.free !== false,
    });
  }

  return articles;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export function parseLaws(inputPath: string): LawsParserOutput {
  const stats = fs.statSync(inputPath);
  const files: string[] = [];

  if (stats.isDirectory()) {
    const entries = fs.readdirSync(inputPath, { recursive: true }) as string[];
    for (const entry of entries) {
      const full = path.join(inputPath, entry);
      if (full.endsWith(".md") && fs.statSync(full).isFile()) {
        files.push(full);
      }
    }
  } else {
    files.push(inputPath);
  }

  console.log(`\n🏛️  Law Parser — ${files.length} file(s) found\n`);

  const laws: ParsedLaw[] = [];
  let totalArticles = 0;

  for (const file of files) {
    try {
      const law = parseSingleLaw(file);
      if (law) {
        laws.push(law);
        totalArticles += law.total_articles;
      }
    } catch (err) {
      console.error(`  ✗ Failed to parse ${file}: ${(err as Error).message}`);
    }
  }

  console.log(`\n✅ Parsed ${laws.length} laws with ${totalArticles} total articles\n`);

  return {
    type: "laws",
    generated_at: new Date().toISOString(),
    total_files: files.length,
    total_articles: totalArticles,
    laws,
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
    console.error("Usage: npx ts-node parse-laws.ts --input <path> [--output <dir>]");
    process.exit(1);
  }

  const result = parseLaws(path.resolve(inputPath));

  // Write output
  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "laws.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
