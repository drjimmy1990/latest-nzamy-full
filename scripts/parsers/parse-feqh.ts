#!/usr/bin/env npx ts-node
/**
 * parse-feqh.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Parses Islamic jurisprudence (fiqh) book markdown files from the
 * Shamela Library format.
 *
 * Key characteristics:
 *   - NO YAML frontmatter, NO HTML comment markers
 *   - Page headers:  #### صفحة N - BookTitle - Author - المكتبة الشاملة
 *   - Section markers in brackets: [كتاب الطهارة]
 *   - Hierarchy: ### كتاب > #### باب > #### فصل
 *   - Pure prose with Quranic verses ﴿…﴾ and hadiths «…»
 *   - Optional TOC at the top with indented entries
 *
 * The parser builds a hierarchical chapter/section/page structure.
 *
 * Usage:
 *   npx ts-node scripts/parsers/parse-feqh.ts --input ./data/feqh
 *   npx ts-node scripts/parsers/parse-feqh.ts --input ./data/feqh/rawd-al-murbi.md
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

export interface FeqhVerse {
  type: "quran" | "hadith";
  text: string;
}

export interface FeqhPage {
  page_number: number;
  volume: number;
  text: string;
  verses: FeqhVerse[];
}

export interface FeqhSection {
  title: string;                   // باب / فصل
  level: "bab" | "fasl" | "masala";
  pages: FeqhPage[];
}

export interface FeqhChapter {
  title: string;                   // كتاب
  sections: FeqhSection[];
  pages: FeqhPage[];              // Pages directly under chapter (no section)
}

export interface ParsedFeqhBook {
  id: string;
  slug: string;
  title: string;
  author: string;
  source: string;                  // المكتبة الشاملة
  school: string;                  // المذهب
  type: "sharia" | "wadi" | "comparative";
  category: string;
  investigator: string;
  publisher: string;
  total_volumes: number;
  total_pages: number;
  total_chapters: number;
  toc: string[];
  chapters: FeqhChapter[];
  metadata: Record<string, unknown>;
}

export interface FeqhParserOutput {
  type: "feqh";
  generated_at: string;
  total_books: number;
  total_pages: number;
  books: ParsedFeqhBook[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Arabic → ASCII slug
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
// Book metadata extraction from page headers
// ══════════════════════════════════════════════════════════════════════════════

interface PageHeaderInfo {
  page: number;
  title: string;
  author: string;
  source: string;
}

/**
 * Parse Shamela-style page header:
 * #### صفحة 42 - الروض المربع - البهوتي - المكتبة الشاملة
 */
function parsePageHeader(line: string): PageHeaderInfo | null {
  const headerRe =
    /^#{1,5}\s*صفحة\s+(\d+)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*)/;
  const match = line.match(headerRe);
  if (!match) return null;

  return {
    page: parseInt(match[1], 10),
    title: match[2].trim(),
    author: match[3].trim(),
    source: match[4].trim(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Extract Quranic verses and hadiths
// ══════════════════════════════════════════════════════════════════════════════

function extractVerses(text: string): FeqhVerse[] {
  const verses: FeqhVerse[] = [];

  // Quranic verses: ﴿…﴾
  const quranRe = /﴿([\s\S]*?)﴾/g;
  let match: RegExpExecArray | null;
  while ((match = quranRe.exec(text)) !== null) {
    verses.push({ type: "quran", text: match[1].trim() });
  }

  // Hadiths: «…»
  const hadithRe = /«([\s\S]*?)»/g;
  while ((match = hadithRe.exec(text)) !== null) {
    verses.push({ type: "hadith", text: match[1].trim() });
  }

  return verses;
}

// ══════════════════════════════════════════════════════════════════════════════
// TOC extraction
// ══════════════════════════════════════════════════════════════════════════════

function extractToc(body: string): { toc: string[]; bodyAfterToc: string } {
  const toc: string[] = [];

  // Look for TOC patterns: indented lines at the top of the file
  // before the first page header or chapter heading
  const lines = body.split(/\r?\n/);
  let tocEnd = 0;
  let inToc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines at the start
    if (!inToc && !line) continue;

    // TOC entries are typically indented or start with specific patterns
    if (line.startsWith("[") && line.endsWith("]")) {
      // Section marker in brackets: [كتاب الطهارة]
      toc.push(line.slice(1, -1));
      inToc = true;
      tocEnd = i + 1;
      continue;
    }

    // Indented TOC entries
    if (inToc && (lines[i].startsWith("  ") || lines[i].startsWith("\t"))) {
      toc.push(line);
      tocEnd = i + 1;
      continue;
    }

    // Non-indented text after TOC — we're past the TOC
    if (inToc && line && !lines[i].startsWith("  ") && !lines[i].startsWith("\t")) {
      // Check if it's another TOC entry (starts with number or Arabic chars)
      if (/^(كتاب|باب|فصل|مسألة)\s/.test(line)) {
        toc.push(line);
        tocEnd = i + 1;
        continue;
      }
      break;
    }

    // Page header — not part of TOC
    if (/^#{1,5}\s*صفحة/.test(line)) {
      break;
    }

    // Chapter heading — not part of TOC
    if (/^###?\s*(كتاب|باب|فصل)/.test(line)) {
      break;
    }

    // If we encounter actual content before any TOC, there's no TOC
    if (!inToc && line && !line.startsWith("#")) {
      break;
    }
  }

  const bodyAfterToc = lines.slice(tocEnd).join("\n");
  return { toc, bodyAfterToc };
}

// ══════════════════════════════════════════════════════════════════════════════
// Detect heading level (chapter / bab / fasl)
// ══════════════════════════════════════════════════════════════════════════════

type HeadingLevel = "kitab" | "bab" | "fasl" | "masala" | null;

function detectHeadingLevel(line: string): { level: HeadingLevel; title: string } | null {
  // Markdown heading: ### كتاب الطهارة
  const mdMatch = line.match(/^(#{2,5})\s+(.*)/);
  if (!mdMatch) {
    // Bracket notation: [كتاب الطهارة]
    const bracketMatch = line.match(/^\[(.+)\]$/);
    if (bracketMatch) {
      const inner = bracketMatch[1].trim();
      if (inner.startsWith("كتاب")) return { level: "kitab", title: inner };
      if (inner.startsWith("باب")) return { level: "bab", title: inner };
      if (inner.startsWith("فصل")) return { level: "fasl", title: inner };
      if (inner.startsWith("مسألة")) return { level: "masala", title: inner };
      return { level: "kitab", title: inner }; // Default bracket = chapter
    }
    return null;
  }

  const hashes = mdMatch[1].length;
  const title = mdMatch[2].trim();

  // Detect by keyword first
  if (title.startsWith("كتاب")) return { level: "kitab", title };
  if (title.startsWith("باب")) return { level: "bab", title };
  if (title.startsWith("فصل")) return { level: "fasl", title };
  if (title.startsWith("مسألة")) return { level: "masala", title };

  // Fallback by heading level
  if (hashes <= 3) return { level: "kitab", title };
  return { level: "bab", title };
}

// ══════════════════════════════════════════════════════════════════════════════
// Main book parser
// ══════════════════════════════════════════════════════════════════════════════

function parseSingleBook(filePath: string): ParsedFeqhBook | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const fileId = path.basename(filePath, ".md");

  console.log(`  📖 Parsing feqh book: ${fileId}`);

  // Check for optional YAML frontmatter (some feqh files might have one)
  let meta: Record<string, unknown> = {};
  let body = raw;

  if (raw.startsWith("---")) {
    const fmMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
    if (fmMatch) {
      body = raw.slice(fmMatch[0].length);
      for (const line of fmMatch[1].split(/\r?\n/)) {
        const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
        if (m) {
          let val: unknown = m[2].trim();
          if (typeof val === "string" && /^["'].*["']$/.test(val)) val = (val as string).slice(1, -1);
          if (typeof val === "string" && /^\d+$/.test(val)) val = parseInt(val, 10);
          meta[m[1]] = val;
        }
      }
    }
  }

  // Extract TOC
  const { toc, bodyAfterToc } = extractToc(body);

  // ── Extract book metadata from first page header ─────────────────────
  let bookTitle = (meta.title as string) || "";
  let bookAuthor = (meta.author as string) || "";
  let bookSource = "المكتبة الشاملة";
  let maxVolume = 1;

  const lines = bodyAfterToc.split(/\r?\n/);

  // Scan for first page header to extract book info
  for (const line of lines) {
    const header = parsePageHeader(line);
    if (header) {
      if (!bookTitle) bookTitle = header.title;
      if (!bookAuthor) bookAuthor = header.author;
      bookSource = header.source || bookSource;
      break;
    }
  }

  if (!bookTitle) bookTitle = fileId;

  // ── Build chapter hierarchy ──────────────────────────────────────────
  const chapters: FeqhChapter[] = [];
  let currentChapter: FeqhChapter | null = null;
  let currentSection: FeqhSection | null = null;
  let currentPage: FeqhPage | null = null;
  let pageBuffer: string[] = [];
  let totalPages = 0;

  function flushPage() {
    if (currentPage && pageBuffer.length > 0) {
      const text = pageBuffer.join("\n").trim();
      currentPage.text = text;
      currentPage.verses = extractVerses(text);

      if (currentPage.volume > maxVolume) maxVolume = currentPage.volume;

      // Attach page to current section or chapter
      if (currentSection) {
        currentSection.pages.push(currentPage);
      } else if (currentChapter) {
        currentChapter.pages.push(currentPage);
      } else {
        // Orphan page — create a default chapter
        currentChapter = { title: "مقدمة", sections: [], pages: [] };
        chapters.push(currentChapter);
        currentChapter.pages.push(currentPage);
      }
      totalPages++;
    }
    pageBuffer = [];
    currentPage = null;
  }

  for (const line of lines) {
    // ── Page header ──
    const header = parsePageHeader(line);
    if (header) {
      flushPage();
      currentPage = {
        page_number: header.page,
        volume: 1, // Will be updated if volume info is available
        text: "",
        verses: [],
      };

      // Try to detect volume from page number pattern or metadata
      // Some files encode volume in the page number (e.g., 1001 = vol 1, page 1)
      continue;
    }

    // ── Chapter / Section heading ──
    const heading = detectHeadingLevel(line);
    if (heading) {
      flushPage();

      if (heading.level === "kitab") {
        // New chapter
        currentChapter = { title: heading.title, sections: [], pages: [] };
        chapters.push(currentChapter);
        currentSection = null;
      } else if (heading.level === "bab" || heading.level === "fasl" || heading.level === "masala") {
        // New section
        if (!currentChapter) {
          currentChapter = { title: "مقدمة", sections: [], pages: [] };
          chapters.push(currentChapter);
        }
        currentSection = {
          title: heading.title,
          level: heading.level === "bab" ? "bab" : heading.level === "fasl" ? "fasl" : "masala",
          pages: [],
        };
        currentChapter.sections.push(currentSection);
      }
      continue;
    }

    // ── Regular content line ──
    pageBuffer.push(line);
  }

  // Flush the last page
  flushPage();

  // If no chapters were created, wrap everything in a default
  if (chapters.length === 0 && totalPages > 0) {
    // This means we had pages but no chapter markers
    // The pages should already be attached from orphan handling above
  }

  // ── Detect school (madhab) from title/author ──
  let school = (meta.school as string) || "";
  if (!school) {
    const combined = `${bookTitle} ${bookAuthor}`.toLowerCase();
    if (combined.includes("حنبل") || combined.includes("بهوتي") || combined.includes("المقنع") || combined.includes("المغني")) {
      school = "hanbali";
    } else if (combined.includes("شافعي") || combined.includes("نووي") || combined.includes("المجموع")) {
      school = "shafi";
    } else if (combined.includes("مالك") || combined.includes("خليل") || combined.includes("الموطأ")) {
      school = "maliki";
    } else if (combined.includes("حنفي") || combined.includes("كاساني") || combined.includes("بدائع")) {
      school = "hanafi";
    } else {
      school = "unknown";
    }
  }

  // ── Detect type ──
  let bookType: "sharia" | "wadi" | "comparative" = "sharia";
  if (meta.type === "wadi" || meta.type === "comparative") {
    bookType = meta.type as "wadi" | "comparative";
  } else if (school === "unknown" && !bookTitle.includes("فقه")) {
    bookType = "wadi";
  }

  console.log(`    ✓ ${chapters.length} chapters, ${totalPages} pages, school: ${school}`);

  return {
    id: fileId,
    slug: (meta.slug as string) || slugifyArabic(bookTitle) || fileId,
    title: bookTitle,
    author: bookAuthor,
    source: bookSource,
    school,
    type: bookType,
    category: (meta.category as string) || "",
    investigator: (meta.investigator as string) || "",
    publisher: (meta.publisher as string) || "",
    total_volumes: maxVolume,
    total_pages: totalPages,
    total_chapters: chapters.length,
    toc,
    chapters,
    metadata: meta,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export function parseFeqh(inputPath: string): FeqhParserOutput {
  const resolvedPath = path.resolve(inputPath);
  const stats = fs.statSync(resolvedPath);
  const files: string[] = [];

  if (stats.isDirectory()) {
    const entries = fs.readdirSync(resolvedPath, { recursive: true }) as string[];
    for (const entry of entries) {
      const full = path.join(resolvedPath, entry);
      if (full.endsWith(".md") && fs.statSync(full).isFile()) {
        files.push(full);
      }
    }
  } else {
    files.push(resolvedPath);
  }

  console.log(`\n📖 Feqh Parser — ${files.length} file(s) found\n`);

  const books: ParsedFeqhBook[] = [];
  let totalPages = 0;

  for (const file of files) {
    try {
      const book = parseSingleBook(file);
      if (book) {
        books.push(book);
        totalPages += book.total_pages;
      }
    } catch (err) {
      console.error(`  ✗ Failed to parse ${file}: ${(err as Error).message}`);
    }
  }

  console.log(`\n✅ Feqh Parser Summary`);
  console.log(`  Books: ${books.length}`);
  console.log(`  Total pages: ${totalPages}`);
  console.log(`  Schools: ${[...new Set(books.map(b => b.school))].join(", ")}\n`);

  return {
    type: "feqh",
    generated_at: new Date().toISOString(),
    total_books: books.length,
    total_pages: totalPages,
    books,
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
    console.error("Usage: npx ts-node parse-feqh.ts --input <path> [--output <dir>]");
    process.exit(1);
  }

  const result = parseFeqh(inputPath);

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "feqh.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
