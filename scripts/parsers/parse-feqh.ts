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
import { slugifyArabic as sharedSlugify } from "./lib/slug";
import { parseFrontmatter } from "./lib/frontmatter";
import { applyExclusions, formatExclusionSummary } from "./lib/exclusions";
import { writeParseReport, printCapped } from "./lib/report";
import { parseLocator } from "./lib/feqh-locator";
import { filterMeta } from "./manifest";

/** Collected per run so YAML problems are reported, never swallowed. */
const frontmatterWarnings: string[] = [];

/**
 * ك-05 (2026-08-24): same schema_version visibility parse-laws.ts has had
 * since ب-112. Frontmatter is technically optional here (see the hand-rolled
 * parser in parseSingleBook), but a real run shows 185/185 books at "4.0" —
 * uniform, unlike laws/decrees/precedents where this field is fragmented.
 */
const schemaVersionCounts: Record<string, number> = {};

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
  /** Verbatim page token from the source (e.g. "3", "None"). */
  page_label?: string | null;
  /** Verbatim volume token from the source (e.g. "10", "مقدمة", "7-1"). */
  volume_label?: string | null;
  text: string;
  verses: FeqhVerse[];
  /** ب-126: true only for the genuine fallback — no real locator has appeared
   *  yet anywhere in this document (e.g. front matter before the first page
   *  anchor, or a book with none at all). Never set for a heading that merely
   *  falls in the middle of an already-located real page. */
  is_synthetic_page?: boolean;
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

// Transliteration table + slug function moved to ./lib/slug.ts (was duplicated
// verbatim in all four parsers). Aliased so existing call-sites are unchanged.
const slugifyArabic = sharedSlugify;

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

/**
 * Parse card-v2 campaign (2026-07) page anchor:
 * <!-- PAGE_START {"vol": 1, "page": 5} -->
 * Distinct source family from the Shamela page header above — no title/author/source
 * embedded (that lives in frontmatter instead), just volume + page number.
 */
function parseJsonPageAnchor(line: string): { page: number; volume: number } | null {
  const match = line.match(/^<!--\s*PAGE_START\s*(\{.*?\})\s*-->/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1]);
    return {
      page: Number(obj.page || 0),
      volume: Number(obj.vol || obj.volume || 1),
    };
  } catch {
    return null;
  }
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

type HeadingLevel = "kitab" | "bab" | "fasl" | "masala" | "skip" | null;

function detectHeadingLevel(line: string): { level: HeadingLevel; title: string } | null {
  // Markdown heading: ### كتاب الطهارة
  // `#{1,5}` (not `{2,5}`) — card-v2 campaign (2026-07) books use bare `#` for their
  // top-level headings (e.g. "# مقدمة", "# ١ - الحق الشخصي..."), which the original
  // `{2,5}` pattern silently ignored entirely (heading never detected, its whole
  // section's text fell into whatever chapter/section preceded it instead).
  const mdMatch = line.match(/^(#{1,5})\s+(.*)/);
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

  // Card-v2 campaign (2026-07) identity-card heading (e.g. "### 📊 بطاقة تعريف
  // الكتاب") — metadata for a human reader, not book content; skip its heading AND
  // the table/text under it rather than letting it become a bogus first "chapter".
  if (title.includes("بطاقة تعريف") || title.includes("فهرس المحتويات")) {
    return { level: "skip", title };
  }

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

  const schemaVersionKey = String(meta.schema_version ?? "").trim() || "(missing)";
  schemaVersionCounts[schemaVersionKey] = (schemaVersionCounts[schemaVersionKey] || 0) + 1;

  // Extract TOC
  const { toc, bodyAfterToc } = extractToc(body);

  // ── Extract book metadata from first page header ─────────────────────
  let bookTitle = (meta.title as string) || "";
  let bookAuthor = (meta.author as string) || "";
  let bookSource = "المكتبة الشاملة";
  let maxVolume = 1;

  // Strip <details>...</details> blocks (card-v2 campaign identity card, wrapped
  // variant) before line-splitting — it's metadata for a human reader, not book
  // content, and would otherwise become a bogus first chapter full of table markup.
  const cleanedBody = bodyAfterToc.replace(/<details>[\s\S]*?<\/details>/g, "");
  const lines = cleanedBody.split(/\r?\n/);

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
  /** Locators recognised in this file — reported so 0 is visible, not silent. */
  let locatorsSeen = 0;
  let pageBuffer: string[] = [];
  let totalPages = 0;

  function flushPage() {
    // BUG (fixed 2026-07-20): this used to require `currentPage` to already be set
    // (only true right after a Shamela-style `#### صفحة N - ...` header matched).
    // Card-v2 campaign books (2026-07) either use a different page-anchor format
    // (`parseJsonPageAnchor`, handled below) or no page anchors at all — for those,
    // `currentPage` stayed null for the ENTIRE file, so this guard silently discarded
    // every accumulated `pageBuffer`, no matter how much real text it held. Now a
    // page is synthesized on demand so text is never dropped just because no
    // Shamela-style header happened to precede it.
    if (pageBuffer.length > 0) {
      const text = pageBuffer.join("\n").trim();
      if (text) {
        // ب-126: spread a COPY of currentPage rather than reusing the object
        // reference — each heading-triggered flush is its own distinct FeqhPage
        // in the output (attached to whichever section/chapter is current at
        // that point), even when several of them share one real page identity
        // because a heading fell in the middle of that physical page.
        const page: FeqhPage = currentPage
          ? { ...currentPage, text: "", verses: [] }
          : {
              page_number: totalPages + 1,
              volume: maxVolume,
              text: "",
              verses: [],
              is_synthetic_page: true,
            };
        page.text = text;
        page.verses = extractVerses(text);

        if (page.volume > maxVolume) maxVolume = page.volume;

        // Attach page to current section or chapter
        if (currentSection) {
          currentSection.pages.push(page);
        } else if (currentChapter) {
          currentChapter.pages.push(page);
        } else {
          // Orphan page — create a default chapter
          currentChapter = { title: "مقدمة", sections: [], pages: [] };
          chapters.push(currentChapter);
          currentChapter.pages.push(page);
        }
        totalPages++;
      }
    }
    pageBuffer = [];
    // ب-126: currentPage's identity now PERSISTS across heading-triggered
    // flushes — a chapter/section heading is not itself a real page boundary.
    // This used to null currentPage here whenever its buffered text was
    // emitted, so the FIRST heading after a real locator consumed that
    // locator's identity correctly, but every SUBSEQUENT heading before the
    // next real locator found currentPage null again and fabricated a brand
    // new page_number for text that was still on the same physical page —
    // confirmed on المغني ج1: 665/1,014 "pages" (66%) ended up with no real
    // page_label. A real locator still replaces currentPage explicitly
    // (assigned directly where `loc` is parsed, above); nothing else should.
  }

  // True while inside a "skip" heading's span (e.g. the identity card block) — its
  // own text (a metadata table, not book content) must not become a page or chapter.
  let skipping = false;

  for (const line of lines) {
    // ── Structural comment-only markers (card-v2 campaign) — strip, keep content ──
    // <!-- SHARH_START/END --> and <!-- MATN_START/END --> wrap real prose (they're
    // not paired with a text-bearing line themselves), so just drop the marker line
    // and let the surrounding text flow through untouched.
    if (/^<!--\s*(SHARH_START|SHARH_END|MATN_START|MATN_END)\s*-->$/.test(line.trim())) {
      continue;
    }

    // ── Page/volume locator ──
    // One parser for every shape measured in the corpus. Production recognised
    // only a 4-part Shamela header (10 lines, 1 book) plus a column-0-anchored
    // PAGE_START; the dominant `الجزء N - صفحة M` shape (57,975 lines, 117
    // books) was invisible, so real volume/page numbers were discarded and a
    // sequential counter with volume=1 was synthesised in their place.
    const loc = parseLocator(line);
    if (loc) {
      flushPage();
      currentPage = {
        // Fall back to the running counter ONLY when the source gives no number.
        page_number: loc.page ?? totalPages + 1,
        // Volume is no longer hardcoded to 1. null means the source states none.
        volume: loc.volume ?? 0,
        page_label: loc.pageLabel,
        volume_label: loc.volumeLabel,
        text: "",
        verses: [],
      };
      locatorsSeen++;
      continue;
    }

    // ── Chapter / Section heading ──
    const heading = detectHeadingLevel(line);
    if (heading) {
      if (heading.level === "skip") {
        // Save whatever real content preceded the card block, then discard the
        // block's own text (the identity table) instead of flushing it as a page.
        flushPage();
        skipping = true;
        continue;
      }
      if (skipping) {
        // This heading ends the skipped block — discard its buffered table text
        // (never flush it) rather than treating it as this new heading's content.
        pageBuffer = [];
        currentPage = null;
        skipping = false;
      } else {
        flushPage();
      }

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
    if (!skipping) {
      pageBuffer.push(line);
    }
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

export function parseFeqh(inputPath: string, reportDir?: string): FeqhParserOutput {
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

  // Drop non-content artefacts before parsing. Reported, never silent. This also
  // replaces the `bookId.includes("EXTRACTION_REPORT")` skip that seed-library.ts
  // was doing at seed time — filtering belongs here, where it can be counted.
  const { kept: contentFiles, countsByRule, excluded: excludedList } = applyExclusions(files);
  const excludedCount = files.length - contentFiles.length;

  console.log(`\n📖 Feqh Parser — ${files.length} file(s) found\n`);
  if (excludedCount > 0) {
    console.log(`   ⊘ ${excludedCount} non-content file(s) excluded:`);
    for (const line of formatExclusionSummary(countsByRule)) console.log(`      • ${line}`);
    console.log(`   → ${contentFiles.length} book file(s) to parse\n`);
  }

  const books: ParsedFeqhBook[] = [];
  const failedFiles: string[] = [];
  let totalPages = 0;

  for (const file of contentFiles) {
    try {
      const book = parseSingleBook(file);
      if (book) {
        books.push(book);
        totalPages += book.total_pages;
      }
    } catch (err) {
      console.error(`  ✗ Failed to parse ${file}: ${(err as Error).message}`);
      failedFiles.push(file);
    }
  }

  console.log(`\n✅ Feqh Parser Summary`);
  console.log(`  Books: ${books.length}`);
  console.log(`  Total pages: ${totalPages}`);
  console.log(`  Schools: ${[...new Set(books.map(b => b.school))].join(", ")}\n`);

  // ── Identity guard ──────────────────────────────────────────────────────────
  // seed-library.ts keys feqh_books by `book.id || book.slug`, so a duplicate
  // collapses two books into one row on upsert.
  const byId = new Map<string, string[]>();
  for (const b of books) {
    const key = String(b.id || b.slug);
    const list = byId.get(key);
    if (list) list.push(b.title);
    else byId.set(key, [b.title]);
  }
  const idCollisions = [...byId.entries()].filter(([, v]) => v.length > 1);
  if (idCollisions.length > 0) {
    console.error(`\n🛑 ${idCollisions.length} BOOK ID COLLISION(S) — distinct books sharing one key:`);
    for (const [id, titles] of idCollisions.slice(0, 20)) {
      console.error(`   "${id}"`);
      for (const t of titles) console.error(`      ← ${t}`);
    }
    if (idCollisions.length > 20) console.error(`   … and ${idCollisions.length - 20} more`);
  }

  // A book that seeds with zero pages contributes a title and author but no
  // readable text — it looks present on the site and is empty when opened.
  const emptyBooks = books.filter((b) => b.total_pages === 0);
  if (emptyBooks.length > 0) {
    console.warn(`\n⚠️  ${emptyBooks.length} book(s) parsed with ZERO pages (would seed with no text):`);
    for (const b of emptyBooks.slice(0, 20)) console.warn(`   • ${b.title}`);
    if (emptyBooks.length > 20) console.warn(`   … and ${emptyBooks.length - 20} more`);
  }

  printCapped("⚠️  frontmatter warning(s)", frontmatterWarnings);

  // ك-05 — schema_version distribution (see parse-laws.ts for the original).
  const schemaVersionSummary = Object.entries(schemaVersionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${v}: ${n}`);
  printCapped("ℹ️  schema_version distribution", schemaVersionSummary);

  if (failedFiles.length > 0) {
    console.error(`\n🛑 ${failedFiles.length} file(s) failed to parse and are MISSING from the output.`);
  }

  // Complete, uncapped record — the console preview above is truncated on purpose.
  if (reportDir) {
    const p = writeParseReport(reportDir, {
      type: "feqh",
      generated_at: new Date().toISOString(),
      input: resolvedPath,
      counts: {
        books: books.length,
        pages: totalPages,
        excluded: excludedCount,
        frontmatterWarnings: frontmatterWarnings.length,
        bookIdCollisions: idCollisions.length,
        emptyBooks: emptyBooks.length,
        failed: failedFiles.length,
        schemaVersionVariants: Object.keys(schemaVersionCounts).length,
      },
      schemaVersionCounts,
      excluded: excludedList,
      frontmatterWarnings,
      identityCollisions: idCollisions.map(([key, members]) => ({ key, members })),
      failed: failedFiles,
      notes: { emptyBooks: emptyBooks.map((b) => b.title) },
    });
    if (p) console.log(`\n📄 Full parse report: ${p}`);
  }

  // Rule ق-3: losing documents or corrupting identity must not exit 0.
  if (idCollisions.length > 0 || failedFiles.length > 0) {
    console.error(
      `\n✗ Parse completed with unrecoverable problems ` +
        `(${idCollisions.length} id collision(s), ${failedFiles.length} failed file(s)). Refusing to report success.`,
    );
    process.exitCode = 1;
  }

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

  const result = parseFeqh(inputPath, outputDir);

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "feqh.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
