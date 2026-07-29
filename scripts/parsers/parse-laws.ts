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
import {
  normalizeType,
  validateEnum,
  nullIfForbidden,
  filterMeta,
  assertManifestLoadable,
} from "./manifest";
import { parseFrontmatter } from "./lib/frontmatter";
import { slugifyArabic as sharedSlugify, findSlugCollisions } from "./lib/slug";
import { applyExclusions, formatExclusionSummary } from "./lib/exclusions";
import { extractArticleHistory, stripDetails, stripArticleHeading } from "./lib/article-history";
import { writeParseReport, printCapped } from "./lib/report";

/** Collected across a whole run so YAML problems are reported, never swallowed. */
const frontmatterWarnings: string[] = [];
/** Articles that carry neither live text nor recovered historical text. */
const emptyArticles: string[] = [];

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

// "added" (45 articles) and "merged" (1) occur in the delivered corpus but were
// absent from this union, so they were silently cast to a value the rest of the
// pipeline treats as meaningful. Both are real lifecycle states.
export type ArticleStatus =
  | "active"
  | "amended"
  | "repealed"
  | "suspended"
  | "added"
  | "merged";

const KNOWN_ARTICLE_STATUSES: readonly string[] = [
  "active", "amended", "repealed", "suspended", "added", "merged",
];

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
  /**
   * The article's superseded wording, recovered from its `<details>` block.
   * For a REPEALED article this is usually the entire substantive content —
   * `text` is legitimately empty because the live article no longer exists.
   * Null means the source carries no prior wording; never synthesised.
   */
  original_text?: string;
  /**
   * `<details>` blocks the extractor could not classify, preserved VERBATIM.
   * Never seeded into any visible column and never indexed — it exists so that
   * unrecognised content is quarantined for human review instead of dropped.
   */
  unparsed_details?: string;
  /** Historic executive-regulation text found inside the article's details. */
  historic_regulation_text?: string;
  chapter_title: string;
  chapter_number?: number;
  regulations: ExecutiveRegulation[];
  amendments: AmendmentEntry[];
  free: boolean;
  instrument?: string;
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
  // New (manifest v1.2) fields — emitted via alias resolution below.
  issue_date_hijri: string;
  issue_date_gregorian: string;
  boe_source_url: string;
  official_source_url: string;
  has_merged_regulation: boolean;
  article_status_summary: string;
  law_guid: string;
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

// The transliteration table and slug function moved to ./lib/slug.ts. They were
// duplicated verbatim across all four parsers, and `library.laws` is keyed BY
// SLUG — so any drift between copies could seed one document under two different
// primary keys. Re-exported so existing import sites keep working.
export const slugifyArabic = sharedSlugify;

// ══════════════════════════════════════════════════════════════════════════════
// YAML Frontmatter extraction (no external dependency)
// ══════════════════════════════════════════════════════════════════════════════

// Frontmatter is now parsed by js-yaml via ./lib/frontmatter.ts. The previous
// hand-rolled line matcher silently dropped every indented sub-key (nested
// blocks like article_status_summary and latest_update), stored raw quote
// characters from malformed scalars, and let broken YAML pass unnoticed.
// Warnings are accumulated per run and reported at the end — never swallowed.
function parseYamlFrontmatter(
  raw: string,
  sourcePath = "<unknown>",
): { meta: Record<string, unknown>; body: string } {
  const { meta, body, warnings } = parseFrontmatter(raw, sourcePath);
  if (warnings.length) frontmatterWarnings.push(...warnings);
  return { meta: filterMeta(meta), body };
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
  // Normalise line endings at read time. 1,331 of 1,533 delivered files use
  // CRLF, and JS regex treats \r as a line terminator that `.` will not match —
  // so `/^###?\s+.*\n/m` never fired on them and the article's heading was left
  // embedded in its text. Normalising once here fixes every downstream pattern.
  const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const { meta, body } = parseYamlFrontmatter(raw, filePath);
  const variant = detectVariant(body, meta);

  const fileBaseName = path.basename(filePath, ".md");
  const rawSlug = (meta.slug as string) || fileBaseName;
  // Normalize slugs: if slug contains spaces or Arabic chars, run it through slugifyArabic
  // to produce a URL-safe slug. PostgREST breaks with spaces in PK values.
  const slug = /[\s\u0600-\u06FF]/.test(rawSlug) ? slugifyArabic(rawSlug) : rawSlug;
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
    const articles = parseArticlesInBlock(body, "", 0, path.basename(filePath));
    chapters.push({ number: 0, title: "", articles });
  } else {
    while ((chapterMatch = chapterRe.exec(body)) !== null) {
      const chapterMeta = safeJsonParse(chapterMatch[1], `chapter in ${slug}`);
      const chapterBody = chapterMatch[2];
      const chapterNum = Number(chapterMeta?.number || chapters.length + 1);
      const chapterTitle = String(chapterMeta?.title || `الباب ${chapterNum}`);

      const articles = parseArticlesInBlock(chapterBody, chapterTitle, chapterNum, path.basename(filePath));
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

  // ── Field resolution (manifest v1.2 keys with legacy aliases) ────────────
  // The new content uses issue_date_hijri / boe_source_url / has_merged_regulation
  // / status; older files used issuance_date / boe_url / has_executive_reg / law_status.
  // Resolve both; enforce enums + type_normalization_map from the manifest.
  const issue_date_hijri = nullIfForbidden(meta.issue_date_hijri ?? meta.issuance_date) || "";
  const issue_date_gregorian = nullIfForbidden(meta.issue_date_gregorian) || "";
  const boe_source_url = nullIfForbidden(meta.boe_source_url ?? meta.boe_url) || "";
  const official_source_url = nullIfForbidden(meta.official_source_url) || "";
  const has_merged_regulation = Boolean(meta.has_merged_regulation ?? meta.has_executive_reg ?? (variant === "qadha"));
  const article_status_summary = nullIfForbidden(meta.article_status_summary) || "";
  const law_guid = nullIfForbidden(meta.law_guid ?? meta.id) || "";
  const statusRaw = nullIfForbidden(meta.status ?? meta.law_status) || "active";
  const typeCanonical = normalizeType(meta.type);
  // section_code in files is "00".."30" / "97".."99" (zero-padded). An unquoted
  // YAML `00` becomes int 0 → normalize back to a 2-digit string before validating.
  const scRaw = meta.section_code == null ? "" : String(meta.section_code).trim();
  const sectionCode = validateEnum(
    "section_code",
    /^\d+$/.test(scRaw) ? scRaw.padStart(2, "0") : scRaw,
    "غير_مصنف"
  );

  return {
    id: law_guid || slug,
    slug,
    title,
    title_en: (meta.title_en as string) || "",
    type: validateEnum("type", typeCanonical, "نظام"),
    section_code: sectionCode,
    section_name: (meta.section_name as string) || "",
    issuing_body: (meta.issuing_body as string) || "",
    issuance_decree: (meta.issuance_decree as string) || "",
    issuance_date: issue_date_hijri, // seeder maps this → issue_date_hijri column
    total_articles: totalArticles,
    has_executive_reg: has_merged_regulation, // legacy alias kept for the seeder
    regulation_decree: (meta.regulation_decree as string) || "",
    preamble: preambleText,
    regulation_preamble: regulationPreamble,
    law_status: validateEnum("status", statusRaw, "active"), // seeder maps → status column
    source: (meta.source as string) || "",
    boe_url: boe_source_url, // legacy alias kept for the seeder
    issue_date_hijri,
    issue_date_gregorian,
    boe_source_url,
    official_source_url,
    has_merged_regulation,
    article_status_summary,
    law_guid,
    variant,
    chapters,
    metadata: meta,
  };
}

function parseArticlesInBlock(
  block: string,
  chapterTitle: string,
  chapterNumber: number,
  /** Source file, used only to make diagnostics actionable. */
  sourceLabel = "<unknown>"
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

    const number = Number(artMeta.number || 0);
    const numberText = String(artMeta.number_text || artMeta.number || "");
    const artTitle = String(artMeta.title || "");

    const rawStatus = String(artMeta.status || "active");
    if (!KNOWN_ARTICLE_STATUSES.includes(rawStatus)) {
      // Defaulting an unknown lifecycle state to "active" would publish an
      // article as current law on nothing but a guess.
      throw new Error(
        `unknown article status "${rawStatus}" (article ${numberText || number}). ` +
          `Known: ${KNOWN_ARTICLE_STATUSES.join(", ")}`,
      );
    }
    const status = rawStatus as ArticleStatus;

    // ── Recover historical text BEFORE anything is stripped ───────────────
    // The superseded wording lives inside <details>. It must be pulled out
    // first, then removed from the live text — previously it was never read and
    // never stripped, so it ended up concatenated into `text`.
    const history = extractArticleHistory(articleBody);
    for (const h of history.entries) {
      amendments.push({
        date: "",
        decree: "",
        summary: h.source_summary,
        original_text: h.original_text,
      });
    }
    // The primary prior wording: prefer a repeal over an amendment, since for a
    // repealed article it IS the article's substantive content.
    const primaryHistory =
      history.entries.find((h) => h.kind === "repealed")?.original_text ??
      history.entries[0]?.original_text;

    // ── Clean article text ──────────────────────────────────────────────
    let cleanText = articleBody;
    // 1. Regulation blocks (already captured above).
    cleanText = cleanText.replace(/<!--\s*REGULATION[\s\S]*?(?=<!--|$)/g, "");
    // 2. <details> — the superseded text, now safely extracted.
    cleanText = stripDetails(cleanText);
    // 3. ALL HTML comments. The old pattern required whitespace after the word
    //    AMENDMENT, so it matched neither `<!-- AMENDMENTS -->` (135 in the
    //    corpus) nor `<!-- END_AMENDMENT -->` (190), leaving both as literal
    //    text in the article.
    cleanText = cleanText.replace(/<!--[\s\S]*?-->/g, "");
    // 4. Heading LABEL only — never the whole line. A large part of the corpus
    //    writes the article's entire text on the heading line, and deleting the
    //    line would delete the law (measured: 6,700 articles).
    const cleanTextBeforeHeadingStrip = cleanText.replace(/^>\s*/gm, "").trim();
    cleanText = stripArticleHeading(cleanText, numberText);
    // 5. Block-quote markers.
    cleanText = cleanText.replace(/^>\s*/gm, "").trim();

    // ── Invariant: the heading strip must only ever remove the LABEL ────────
    // This is the check that actually protects statutory text. A naive "delete
    // the heading line" empties 6,700 articles in this corpus because so many
    // carry their whole text on that line. stripArticleHeading removes a matched
    // label prefix and nothing else; assert that, so a future edit loosening it
    // fails loudly here instead of quietly deleting law.
    const preHeading = cleanTextBeforeHeadingStrip
      .split("\n")
      .filter((l) => l.trim() && !/^\s*#{1,6}\s/.test(l)).length;
    const postHeading = cleanText.split("\n").filter((l) => l.trim()).length;
    if (postHeading < preHeading) {
      throw new Error(
        `heading strip removed ${preHeading - postHeading} non-heading line(s) from article ` +
          `${numberText || number} — it must only remove the label. This is a parser bug.`,
      );
    }

    // An article with neither live text nor recovered history is a real
    // observation about the SOURCE (e.g. a bare page marker), not a cleaning
    // failure — the invariant above already rules that out. Counted and
    // reported rather than fatal, so one thin article cannot block 1,500 good
    // files, but it can never pass unnoticed either.
    if (!cleanText && !primaryHistory && history.unparsed.length === 0) {
      emptyArticles.push(
        `${sourceLabel} :: article ${numberText || number} (status "${status}")`,
      );
    }

    articles.push({
      number,
      number_text: numberText,
      title: artTitle,
      status,
      text: cleanText,
      original_text: primaryHistory,
      unparsed_details: history.unparsed.length ? history.unparsed.join("\n\n") : undefined,
      historic_regulation_text: history.regulationBlocks.length
        ? history.regulationBlocks.join("\n\n")
        : undefined,
      chapter_title: String(artMeta.chapter || chapterTitle),
      chapter_number: chapterNumber >= 0 ? chapterNumber : undefined,
      regulations,
      amendments,
      free: artMeta.free !== false,
      instrument: artMeta.instrument ? String(artMeta.instrument) : undefined,
    });
  }

  return articles;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export function parseLaws(inputPath: string, reportDir?: string): LawsParserOutput {
  // Load and validate the seed contract ONCE, before any file is touched and
  // OUTSIDE the per-file try/catch below. Previously getManifest() threw lazily
  // inside the loop, the catch swallowed it per file, and the run printed
  // "Parsed 0 laws" and exited 0 — a total failure that looked like success.
  assertManifestLoadable();

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

  // Drop non-content artefacts (maintainer backups, extraction reports, the
  // explicitly non-legislative folder) before parsing. Reported, never silent.
  const { kept: contentFiles, countsByRule, excluded: excludedList } = applyExclusions(files);
  const excludedCount = files.length - contentFiles.length;

  console.log(`\n🏛️  Law Parser — ${files.length} file(s) found\n`);
  if (excludedCount > 0) {
    console.log(`   ⊘ ${excludedCount} non-content file(s) excluded:`);
    for (const line of formatExclusionSummary(countsByRule)) console.log(`      • ${line}`);
    console.log(`   → ${contentFiles.length} legal document(s) to parse\n`);
  }
  files.length = 0;
  files.push(...contentFiles);

  const laws: ParsedLaw[] = [];
  let totalArticles = 0;

  const failed: Array<{ file: string; error: string }> = [];
  const slugSources: Array<{ slug: string; source: string }> = [];

  for (const file of files) {
    try {
      const law = parseSingleLaw(file);
      if (law) {
        laws.push(law);
        totalArticles += law.total_articles;
        slugSources.push({ slug: law.slug, source: file });
      }
    } catch (err) {
      // Recorded, not swallowed. A file that fails to parse is a legal document
      // missing from the library; the run must not report success (see below).
      console.error(`  ✗ Failed to parse ${file}: ${(err as Error).message}`);
      failed.push({ file, error: (err as Error).message });
    }
  }

  console.log(`\n✅ Parsed ${laws.length} laws with ${totalArticles} total articles\n`);

  // ── Slug collisions ─────────────────────────────────────────────────────────
  // `library.laws` is keyed by slug and upserted with merge-duplicates, so two
  // documents sharing a slug means one is SILENTLY discarded at seed time. This
  // must stop the pipeline before anything is written. Never auto-disambiguate:
  // a machine-invented slug becomes a fabricated citation URL for a real law.
  const collisions = findSlugCollisions(slugSources);
  if (collisions.length > 0) {
    console.error(`\n🛑 ${collisions.length} SLUG COLLISION(S) — distinct documents mapping to one primary key:`);
    for (const c of collisions) {
      console.error(`   "${c.slug}"`);
      for (const s of c.sources) console.error(`      ← ${s}`);
    }
    console.error(
      `\n   Seeding would keep only ONE of each group and discard the rest.\n` +
        `   Fix the source files (give them distinct \`slug:\` frontmatter) and re-run.`,
    );
  }

  // ── Frontmatter warnings ────────────────────────────────────────────────────
  printCapped("⚠️  frontmatter warning(s)", frontmatterWarnings);
  printCapped(
    "⚠️  article(s) with neither live text nor recovered history",
    emptyArticles,
  );

  if (failed.length > 0) {
    console.error(`\n🛑 ${failed.length} file(s) failed to parse and are MISSING from the output.`);
  }

  // Complete, uncapped record — the console preview above is truncated on purpose.
  if (reportDir) {
    const p = writeParseReport(reportDir, {
      type: "laws",
      generated_at: new Date().toISOString(),
      input: inputPath,
      counts: {
        laws: laws.length,
        articles: totalArticles,
        excluded: excludedCount,
        frontmatterWarnings: frontmatterWarnings.length,
        slugCollisions: collisions.length,
        failed: failed.length,
        emptyArticles: emptyArticles.length,
      },
      excluded: excludedList,
      frontmatterWarnings,
      notes: { emptyArticles },
      identityCollisions: collisions.map((c) => ({ key: c.slug, members: c.sources })),
      failed: failed.map((f) => `${f.file}: ${f.error}`),
    });
    if (p) console.log(`\n📄 Full parse report: ${p}`);
  }

  // Rule ق-3: a run that lost documents or would corrupt identity must not exit 0.
  if (collisions.length > 0 || failed.length > 0) {
    console.error(
      `\n✗ Parse completed with unrecoverable problems ` +
        `(${collisions.length} collision(s), ${failed.length} failed file(s)). ` +
        `Refusing to report success.`,
    );
    process.exitCode = 1;
  }

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

  const result = parseLaws(path.resolve(inputPath), outputDir);

  // Write output
  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "laws.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
