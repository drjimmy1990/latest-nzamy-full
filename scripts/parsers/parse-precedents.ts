#!/usr/bin/env npx ts-node
/**
 * parse-precedents.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Parses Saudi judicial precedent and principle markdown files.
 *
 * Two source formats:
 *
 * 1. Principle collections  (.md with YAML frontmatter)
 *    - Frontmatter: court, year_hijri, part, total_principles, …
 *    - Markers: <!-- PRINCIPLE_START {JSON} --> … <!-- PRINCIPLE_END -->
 *    - Sub-principles with Arabic lettering (أ، ب، ج) in block-quotes
 *    - Ruling details in <details> blocks: facts, reasons, ruling
 *
 * 2. Court precedent files  (.md with YAML frontmatter)
 *    - Frontmatter: court_type, ruling_number, case_number, …
 *    - Full ruling text as body
 *
 * Usage:
 *   npx ts-node scripts/parsers/parse-precedents.ts --input ./data/precedents
 *   npx ts-node scripts/parsers/parse-precedents.ts --input ./data/precedents/supreme-1443.md
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

export interface SubPrinciple {
  letter: string;         // أ، ب، ج …
  keywords: string[];
  text: string;
}

export interface PrincipleDetail {
  facts: string;
  reasons: string;
  ruling: string;          // المنطوق
  ruling_basis: string;
}

export interface ParsedPrinciple {
  number: number;
  issuing_body: string;
  issuing_body_abbr: string;
  session_date: string;
  case_number: string;
  decision_number: string;
  source_type: string;
  reference: string;
  text: string;
  classification_keywords: string[];
  sub_principles: SubPrinciple[];
  details: PrincipleDetail;
  free: boolean;
}

export interface ParsedPrincipleCollection {
  id: string;
  slug: string;
  title: string;
  court: string;
  court_type: string;        // ordinary | admin | semi
  year_hijri: number;
  part: number;
  source_id: string;
  total_principles: number;
  principles: ParsedPrinciple[];
  metadata: Record<string, unknown>;
}

export interface ParsedCourtPrecedent {
  id: string;
  slug: string;
  title: string;
  court: string;
  court_type: string;
  ruling_number: string;
  case_number: string;
  year: string;
  date: string;
  subject: string;
  cat: string;
  summary: string;
  summary_brief: string;
  facts: string;
  reasons: string;
  ruling: string;
  preamble: string;
  hashtags: string[];
  is_redacted: boolean;
  metadata: Record<string, unknown>;
}

export interface PrecedentsParserOutput {
  type: "precedents";
  generated_at: string;
  total_collections: number;
  total_principles: number;
  total_court_precedents: number;
  collections: ParsedPrincipleCollection[];
  court_precedents: ParsedCourtPrecedent[];
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
// YAML frontmatter (minimal parser)
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

function safeJsonParse(str: string, ctx: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    console.warn(`  ⚠ JSON parse error in ${ctx}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Parse sub-principles  (أ، ب، ج … in block-quotes)
// ══════════════════════════════════════════════════════════════════════════════

const ARABIC_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"];

function extractSubPrinciples(text: string): SubPrinciple[] {
  const subs: SubPrinciple[] = [];
  // Pattern: Arabic letter followed by ) or - at start of block-quote line
  const subRe = /^>\s*([أبجدهـوزحطيكلمنصعفقرستثخذضظغ])\s*[)\-–]\s*(.*)/gm;
  let match: RegExpExecArray | null;

  while ((match = subRe.exec(text)) !== null) {
    const letter = match[1];
    const subText = match[2].trim();

    // Extract keywords from brackets or parentheses
    const keywords: string[] = [];
    const kwRe = /[[\(](.*?)[\])\)]/g;
    let kwMatch: RegExpExecArray | null;
    while ((kwMatch = kwRe.exec(subText)) !== null) {
      keywords.push(kwMatch[1].trim());
    }

    subs.push({ letter, keywords, text: subText });
  }

  return subs;
}

// ══════════════════════════════════════════════════════════════════════════════
// Parse <details> blocks for ruling details
// ══════════════════════════════════════════════════════════════════════════════

function extractDetails(text: string): PrincipleDetail {
  const details: PrincipleDetail = {
    facts: "",
    reasons: "",
    ruling: "",
    ruling_basis: "",
  };

  // Match <details> blocks with <summary> headers
  const detailsRe = /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g;
  let match: RegExpExecArray | null;

  while ((match = detailsRe.exec(text)) !== null) {
    const header = match[1].trim();
    const content = match[2].trim();

    if (header.includes("وقائع") || header.includes("facts")) {
      details.facts = content;
    } else if (header.includes("أسباب") || header.includes("reasons") || header.includes("تسبيب")) {
      details.reasons = content;
    } else if (header.includes("منطوق") || header.includes("ruling") || header.includes("حكم")) {
      details.ruling = content;
    } else if (header.includes("سند") || header.includes("basis")) {
      details.ruling_basis = content;
    }
  }

  return details;
}

// ══════════════════════════════════════════════════════════════════════════════
// Parse principle collection files
// ══════════════════════════════════════════════════════════════════════════════

function parsePrincipleCollection(filePath: string): ParsedPrincipleCollection | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseYamlFrontmatter(raw);

  const fileId = path.basename(filePath, ".md");
  const title = String(meta.title || fileId);

  console.log(`  ⚖️  Parsing principle collection: ${title}`);

  // Check if this file contains PRINCIPLE_START markers
  if (!body.includes("PRINCIPLE_START")) {
    return null;
  }

  const principles: ParsedPrinciple[] = [];
  const principleRe =
    /<!--\s*PRINCIPLE_START\s+(.*?)\s*-->([\s\S]*?)<!--\s*PRINCIPLE_END\s*-->/g;
  let match: RegExpExecArray | null;

  while ((match = principleRe.exec(body)) !== null) {
    const pMeta = safeJsonParse(match[1], `principle in ${fileId}`);
    if (!pMeta) continue;

    const principleBody = match[2];

    // Clean text: remove block-quote markers, details blocks, etc.
    let cleanText = principleBody;
    cleanText = cleanText.replace(/<details>[\s\S]*?<\/details>/g, "");
    cleanText = cleanText.replace(/^>\s*/gm, "").trim();

    // Extract sub-principles
    const subPrinciples = extractSubPrinciples(principleBody);

    // Extract details from <details> blocks
    const details = extractDetails(principleBody);

    // Extract classification keywords from brackets in the text
    const keywords: string[] = [];
    const kwRe = /\[([^\]]+)\]/g;
    let kwMatch: RegExpExecArray | null;
    while ((kwMatch = kwRe.exec(cleanText)) !== null) {
      keywords.push(kwMatch[1].trim());
    }

    principles.push({
      number: Number(pMeta.number || principles.length + 1),
      issuing_body: String(pMeta.issuing_body || ""),
      issuing_body_abbr: String(pMeta.issuing_body_abbr || ""),
      session_date: String(pMeta.session_date || ""),
      case_number: String(pMeta.case_number || ""),
      decision_number: String(pMeta.decision_number || ""),
      source_type: String(pMeta.source_type || ""),
      reference: String(pMeta.reference || pMeta.ref || ""),
      text: cleanText,
      classification_keywords: keywords,
      sub_principles: subPrinciples,
      details,
      free: pMeta.free !== false,
    });
  }

  console.log(`    ✓ ${principles.length} principles extracted`);

  return {
    id: fileId,
    slug: (meta.slug as string) || slugifyArabic(title) || fileId,
    title,
    court: String(meta.court || ""),
    court_type: String(meta.court_type || meta.track || "ordinary"),
    year_hijri: Number(meta.year_hijri || 0),
    part: Number(meta.part || 1),
    source_id: String(meta.source_id || ""),
    total_principles: principles.length,
    principles,
    metadata: meta,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Parse court precedent files (individual rulings)
// ══════════════════════════════════════════════════════════════════════════════

function parseCourtPrecedent(filePath: string): ParsedCourtPrecedent | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseYamlFrontmatter(raw);

  // Only parse as precedent if it has the right frontmatter markers
  if (!meta.court_type && !meta.ruling_number && !meta.case_number) {
    return null;
  }

  const fileId = path.basename(filePath, ".md");
  const title = String(meta.title || fileId);

  console.log(`  📘 Parsing court precedent: ${title}`);

  // Extract sections from body
  const details = extractDetails(body);

  // Look for structured sections by heading
  let facts = details.facts;
  let reasons = details.reasons;
  let ruling = details.ruling;

  // Alternative: section headers in markdown
  if (!facts) {
    const factsMatch = body.match(/##\s*(?:وقائع|الوقائع)\s*\n([\s\S]*?)(?=##|$)/);
    if (factsMatch) facts = factsMatch[1].trim();
  }
  if (!reasons) {
    const reasonsMatch = body.match(/##\s*(?:أسباب|التسبيب|الأسباب)\s*\n([\s\S]*?)(?=##|$)/);
    if (reasonsMatch) reasons = reasonsMatch[1].trim();
  }
  if (!ruling) {
    const rulingMatch = body.match(/##\s*(?:المنطوق|الحكم|منطوق)\s*\n([\s\S]*?)(?=##|$)/);
    if (rulingMatch) ruling = rulingMatch[1].trim();
  }

  // Extract hashtags from metadata or body
  let hashtags: string[] = [];
  if (Array.isArray(meta.hashtags)) {
    hashtags = meta.hashtags as string[];
  } else {
    // Extract #hashtag patterns from body
    const hashRe = /#([\u0600-\u06FF\w]+)/g;
    let hashMatch: RegExpExecArray | null;
    while ((hashMatch = hashRe.exec(body)) !== null) {
      hashtags.push(hashMatch[1]);
    }
  }

  // Preamble: everything before the first ## section
  let preamble = "";
  const firstHeading = body.search(/^##\s/m);
  if (firstHeading > 0) {
    preamble = body.slice(0, firstHeading).trim();
  }

  return {
    id: fileId,
    slug: (meta.slug as string) || slugifyArabic(title) || fileId,
    title,
    court: String(meta.court || ""),
    court_type: String(meta.court_type || "ordinary"),
    ruling_number: String(meta.ruling_number || ""),
    case_number: String(meta.case_number || ""),
    year: String(meta.year || meta.year_hijri || ""),
    date: String(meta.date || ""),
    subject: String(meta.subject || ""),
    cat: String(meta.cat || meta.section_code || ""),
    summary: String(meta.summary || ""),
    summary_brief: String(meta.summary_brief || ""),
    facts,
    reasons,
    ruling,
    preamble,
    hashtags,
    is_redacted: Boolean(meta.is_redacted || meta.isRedacted),
    metadata: meta,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export function parsePrecedents(inputPath: string): PrecedentsParserOutput {
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

  console.log(`\n⚖️  Precedent Parser — ${files.length} file(s) found\n`);

  const collections: ParsedPrincipleCollection[] = [];
  const courtPrecedents: ParsedCourtPrecedent[] = [];

  for (const file of files) {
    try {
      // Try as principle collection first
      const collection = parsePrincipleCollection(file);
      if (collection && collection.principles.length > 0) {
        collections.push(collection);
        continue;
      }

      // Then try as court precedent
      const precedent = parseCourtPrecedent(file);
      if (precedent) {
        courtPrecedents.push(precedent);
      }
    } catch (err) {
      console.error(`  ✗ Failed to parse ${file}: ${(err as Error).message}`);
    }
  }

  const totalPrinciples = collections.reduce((s, c) => s + c.principles.length, 0);

  console.log(`\n✅ Precedent Parser Summary`);
  console.log(`  Collections: ${collections.length} (${totalPrinciples} principles)`);
  console.log(`  Court precedents: ${courtPrecedents.length}\n`);

  return {
    type: "precedents",
    generated_at: new Date().toISOString(),
    total_collections: collections.length,
    total_principles: totalPrinciples,
    total_court_precedents: courtPrecedents.length,
    collections,
    court_precedents: courtPrecedents,
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
    console.error("Usage: npx ts-node parse-precedents.ts --input <path> [--output <dir>]");
    process.exit(1);
  }

  const result = parsePrecedents(inputPath);

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const outFile = path.join(path.resolve(outputDir), "precedents.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  console.log(`📁 Output written to: ${outFile}`);
}
