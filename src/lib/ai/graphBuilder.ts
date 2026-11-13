/**
 * graphBuilder.ts — Deterministic Saudi Legal Knowledge Graph & Contextual
 * Header Builder across all 4 Nzamy Library corpora (`laws`/`articles`,
 * `principles`, `decrees`, `feqh`) + Saudi Legal Concept Bridge (`concept`).
 *
 * Pure module (relative `.ts` imports only) so `node --test` executes it directly.
 *
 * Why Deterministic Extraction (NOT LLM-Hallucinated Triplets):
 *   Legal graph edges MUST reflect exact statutory hierarchy and cross-reference
 *   mechanics (`EXEMPTS_FROM`, `AMENDS_ARTICLE`, `INTERPRETS_ARTICLE`,
 *   `PARENT_LAW`, `SUPERSEDES_LAW`, `CITES_ARTICLE`, `HAS_CONCEPT`) with zero
 *   fabrication and $0 extraction cost.
 */
import { createHash } from "node:crypto";

import { stripArticleAuditNotes, stripAuditNotes } from "../library/lawPreambleBlocks.ts";
import { libraryDocPath } from "../library/libraryMetadata.ts";
import { isPageLocator, isPageNumberedDocument } from "../library/pageLocator.ts";

export type GraphNodeType = "article" | "principle" | "decree" | "feqh" | "concept";

export type GraphEdgeType =
  | "PARENT_LAW"
  | "SUPERSEDES_LAW"
  | "EXEMPTS_FROM"
  | "CITES_ARTICLE"
  | "AMENDS_ARTICLE"
  | "INTERPRETS_ARTICLE"
  | "ESTABLISHES_RULE"
  | "DECONSTRUCTS_CONCEPT"
  | "HAS_CONCEPT";

export interface GraphNodePayload {
  node_key: string;
  node_type: GraphNodeType;
  source_id: string;
  law_slug: string | null;
  collection_id: string | null;
  article_number: number | null;
  doc_status: string | null;
  item_status: string | null;
  is_page_numbered: boolean;
  is_embeddable: boolean;
  title: string;
  url: string;
  display_text: string;
  contextual_header: string;
  content_sha256: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdgePayload {
  source_key: string;
  target_key: string;
  edge_type: GraphEdgeType;
  origin?: "auto_watchdog" | "owner_curated";
  weight: number;
  evidence: string | null;
  metadata?: Record<string, unknown>;
}

export interface LawIndexEntry {
  slug: string;
  title: string;
  normalizedTitle: string;
  parentLawId?: string | null;
  supersedesLawSlug?: string | null;
  enablingArticle?: string | null;
  /** The law's registry instrument_id (what other laws' `parent_law_id` holds). */
  instrumentId?: string | null;
  articleKeyByNumber: Map<number, string>;
  rootNodeKey: string | null;
}

export type LawIndexMap = Map<string, LawIndexEntry>;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Builds the exact contextualized string sent to the embedding model and hashed for `embedding_vault`. */
export function buildEmbeddingInput(node: {
  contextual_header: string;
  title: string;
  display_text: string;
}): string {
  const parts = [node.contextual_header.trim(), node.title.trim(), node.display_text.trim()].filter(Boolean);
  return parts.join("\n");
}

const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeArabicKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const UNITS_MAP: Readonly<Record<string, number>> = {
  الاولي: 1, الاول: 1, واحد: 1, الواحده: 1, الواحد: 1, الحاديه: 1, الحادي: 1, احدي: 1, احد: 1,
  الثانيه: 2, الثاني: 2, اثنتان: 2, اثنين: 2, اثني: 2, اثنتي: 2,
  الثالثه: 3, الثالث: 3, ثلاث: 3, ثلاثه: 3,
  الرابعه: 4, الرابع: 4, اربع: 4, اربعه: 4,
  الخامسه: 5, الخامس: 5, خمس: 5, خمسه: 5,
  السادسه: 6, السادس: 6, ست: 6, سته: 6,
  السابعه: 7, السابع: 7, سبع: 7, سبعه: 7,
  الثامنه: 8, الثامن: 8, ثمان: 8, ثماني: 8, ثمانيه: 8,
  التاسعه: 9, التاسع: 9, تسع: 9, تسعه: 9,
  العاشره: 10, العاشر: 10, عشر: 10, عشره: 10,
};

const TENS_MAP: Readonly<Record<string, number>> = {
  العشرون: 20, العشرين: 20, عشرون: 20, عشرين: 20,
  الثلاثون: 30, الثلاثين: 30, ثلاثون: 30, ثلاثين: 30,
  الاربعون: 40, الاربعين: 40, اربعون: 40, اربعين: 40,
  الخمسون: 50, الخمسين: 50, خمسون: 50, خمسين: 50,
  الستون: 60, الستين: 60, ستون: 60, ستين: 60,
  السبعون: 70, السبعين: 70, سبعون: 70, سبعين: 70,
  الثمانون: 80, الثمانين: 80, ثمانون: 80, ثمانين: 80,
  التسعون: 90, التسعين: 90, تسعون: 90, تسعين: 90,
};

const HUNDREDS_MAP: Readonly<Record<string, number>> = {
  المائه: 100, المئه: 100, مائه: 100, مئه: 100,
  المائتان: 200, المئتان: 200, المائتين: 200, المئتين: 200, مائتان: 200, مائتين: 200, مئتين: 200,
  الثلاثمائه: 300, ثلاثمائه: 300, الثلاثمئه: 300, ثلاثمئه: 300,
  الاربعمائه: 400, اربعمائه: 400,
  الخمسمائه: 500, خمسمائه: 500,
};

/**
 * Parses Saudi statutory article identifiers: Latin digits (`"77"`), Arabic-Indic
 * digits (`"٧٧"`), or spelled-out Arabic ordinals (`"السابعة والسبعين"` -> `77`,
 * `"التاسعة بعد المائة"` -> `109`, `"الرابعة والخمسين بعد المائتين"` -> `254`).
 */
export function parseArabicArticleNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 && raw <= 9999 ? raw : null;
  }
  if (!raw) return null;
  const ascii = toAsciiDigits(String(raw)).trim();
  if (!ascii) return null;

  const directDigits = /(?:^|\D)(\d{1,4})(?:\D|$)/.exec(ascii);
  if (directDigits) {
    const n = Number(directDigits[1]);
    return n > 0 && n <= 9999 ? n : null;
  }

  const norm = normalizeArabicKey(ascii)
    .replace(/^الماده\s+/, "")
    .replace(/^ماده\s+/, "")
    .trim();
  if (!norm) return null;

  const rawTokens = norm.split(/\s+/).filter((t) => t && t !== "بعد" && t !== "من");
  // Split prefixed conjunction `و` (`والسبعين` -> `السبعين`) when the remainder is a known number word
  const tokens = rawTokens.map((tok) => {
    if (tok.startsWith("و") && tok.length > 2) {
      const stripped = tok.slice(1);
      if (UNITS_MAP[stripped] || TENS_MAP[stripped] || HUNDREDS_MAP[stripped]) {
        return stripped;
      }
    }
    return tok;
  });

  let total = 0;
  let matched = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "و") continue;
    if (HUNDREDS_MAP[t] !== undefined) {
      total += HUNDREDS_MAP[t];
      matched = true;
      continue;
    }
    if (TENS_MAP[t] !== undefined) {
      total += TENS_MAP[t];
      matched = true;
      continue;
    }
    if (UNITS_MAP[t] !== undefined) {
      total += UNITS_MAP[t];
      matched = true;
      continue;
    }
    // Stop at first non-number word once we already parsed the article number phrase
    if (matched) break;
  }

  return matched && total > 0 && total <= 9999 ? total : null;
}

function statusArabic(status: string | null | undefined): string {
  const s = (status || "active").toLowerCase();
  if (s === "repealed") return "ملغى";
  if (s === "amended") return "معدّل";
  return "ساري";
}

function clipBody(text: string, maxChars = 9_000): string {
  const t = text.trim();
  return t.length > maxChars ? `${t.slice(0, maxChars)}…` : t;
}

// ── 1. Article + Active Regulation Node Builder ──────────────────────────────

export interface RawLawRow {
  slug: string;
  title: string;
  type?: string | null;
  status?: string | null;
  parent_law_id?: string | null;
  instrument_id?: string | null;
  supersedes_law_slug?: string | null;
  enabling_article?: string | null;
}

export interface RawArticleRow {
  id: string;
  law_slug: string;
  chapter_id?: string | null;
  number?: string | number | null;
  number_text?: string | null;
  title?: string | null;
  heading?: string | null;
  text?: string | null;
  original_text?: string | null;
  executive_reg_text?: string | null;
  status?: string | null;
}

export interface RawRegulationRow {
  id?: string;
  article_id: string;
  text?: string | null;
  status?: string | null;
}

export interface RawAmendmentRow {
  article_id: string;
  summary?: string | null;
  decree_number?: string | null;
}

export function buildArticleGraphNodes(params: {
  law: RawLawRow;
  chaptersById: ReadonlyMap<string, string>;
  articles: readonly RawArticleRow[];
  regulationsByArticleId: ReadonlyMap<string, readonly RawRegulationRow[]>;
  amendmentsByArticleId: ReadonlyMap<string, readonly RawAmendmentRow[]>;
}): GraphNodePayload[] {
  const { law, chaptersById, articles, regulationsByArticleId, amendmentsByArticleId } = params;
  const docPageNumbered = isPageNumberedDocument(articles.map((a) => a.number_text || String(a.number ?? "")));
  const out: GraphNodePayload[] = [];

  for (const art of articles) {
    const unitIsPage = docPageNumbered || isPageLocator(art.number_text) || isPageLocator(String(art.number ?? ""));
    const artNum = unitIsPage
      ? null
      : parseArabicArticleNumber(art.number) ?? parseArabicArticleNumber(art.number_text);

    const primaryBody = stripArticleAuditNotes(art.text || art.original_text || "").trim();
    const childRegs = (regulationsByArticleId.get(art.id) ?? [])
      .filter((r) => (r.status || "active").toLowerCase() !== "repealed")
      .map((r) => stripArticleAuditNotes(r.text || "").trim())
      .filter((txt) => txt.length > 0);
    const fallbackFlatReg = childRegs.length === 0 && art.executive_reg_text
      ? stripArticleAuditNotes(art.executive_reg_text).trim()
      : "";
    const activeRegs = childRegs.length > 0 ? childRegs : fallbackFlatReg ? [fallbackFlatReg] : [];

    const amendSummaries = (amendmentsByArticleId.get(art.id) ?? [])
      .map((am) => stripAuditNotes(am.summary ?? "", "summary").trim())
      .filter((txt) => txt.length > 0);

    const artHeading = (art.heading || art.title || "").trim();
    const bodySections: string[] = [];
    if (artHeading) {
      bodySections.push(stripArticleAuditNotes(artHeading).trim());
    }
    if (primaryBody) {
      bodySections.push(primaryBody);
    }
    if (activeRegs.length > 0) {
      bodySections.push(`«اللائحة التنفيذية المرتبطة»:\n${activeRegs.join("\n")}`);
    }
    if (amendSummaries.length > 0) {
      bodySections.push(`«ملخص التعديل»:\n${amendSummaries[amendSummaries.length - 1]}`);
    }

    const displayText = clipBody(bodySections.join("\n\n"));
    if (!displayText) continue;

    const locatorLabel = unitIsPage
      ? (art.number_text?.trim() || `الصفحة ${art.number ?? ""}`.trim())
      : `المادة ${art.number ?? art.number_text ?? ""}`.trim();
    const title = `${law.title} — ${locatorLabel}${artHeading ? ` (${artHeading})` : ""}`;

    const chapterTitle = art.chapter_id ? chaptersById.get(art.chapter_id) || "" : "";
    const headerParts = [
      `المستند: ${law.title}`,
      law.type ? `التصنيف: ${law.type}` : "",
      `حالة المستند: ${statusArabic(law.status)}`,
      art.status && art.status !== "active" ? `حالة النص: ${statusArabic(art.status)}` : "",
      chapterTitle ? `الباب/الفصل: ${chapterTitle}` : "",
    ].filter(Boolean);
    const contextualHeader = headerParts.join(" | ");

    const url = `${libraryDocPath("law", law.slug)}#${encodeURIComponent(art.id)}`;
    const contentSha = sha256Hex(
      buildEmbeddingInput({
        contextual_header: contextualHeader,
        title,
        display_text: displayText,
      }),
    );

    out.push({
      node_key: `article:${art.id}`,
      node_type: "article",
      source_id: art.id,
      law_slug: law.slug,
      collection_id: null,
      article_number: artNum,
      doc_status: law.status ?? "active",
      item_status: art.status ?? "active",
      is_page_numbered: unitIsPage,
      is_embeddable: true,
      title,
      url,
      display_text: displayText,
      contextual_header: contextualHeader,
      content_sha256: contentSha,
      metadata: {
        has_inline_regulation: activeRegs.length > 0,
        amendment_count: amendSummaries.length,
      },
    });
  }

  return out;
}

// ── 2. Judicial Principles Node Builder ──────────────────────────────────────

export interface RawCollectionRow {
  id: string;
  title: string;
  court?: string | null;
  court_body?: string | null;
  track?: string | null;
  year_hijri?: string | number | null;
}

export interface RawPrincipleRow {
  id: string;
  collection_id: string;
  principle_number?: string | number | null;
  number?: string | number | null;
  text?: string | null;
  ruling_basis?: string | null;
  issuing_body?: string | null;
  court?: string | null;
  track?: string | null;
  year_hijri?: string | number | null;
  hijri_year?: string | number | null;
}

export function buildPrincipleGraphNodes(params: {
  collection: RawCollectionRow;
  principles: readonly RawPrincipleRow[];
}): GraphNodePayload[] {
  const { collection, principles } = params;
  const out: GraphNodePayload[] = [];
  // nodes.title must be non-blank: a collection with no title still gets a label.
  const collectionTitle = (collection.title ?? "").trim() || "مبادئ قضائية";

  for (const p of principles) {
    const mainText = stripArticleAuditNotes(p.text || "").trim();
    const basisText = stripArticleAuditNotes(p.ruling_basis || "").trim();
    const combined = clipBody(
      [mainText, basisText ? `«مستند الحكم»: ${basisText.slice(0, 1_500)}` : ""].filter(Boolean).join("\n\n"),
    );
    if (!combined) continue;

    const courtLabel = (p.issuing_body || p.court || collection.court || collection.court_body || "").trim();
    const pNum = p.principle_number ?? p.number;
    const trackLabel = (p.track || collection.track || "").trim();
    const yearLabel = p.year_hijri ?? p.hijri_year ?? collection.year_hijri;
    const numLabel = pNum != null && String(pNum).trim() !== "" ? `المبدأ رقم ${pNum}` : "مبدأ قضائي";
    const title = `${collectionTitle} — ${numLabel}`;
    const contextualHeader = [
      `المجموعة القضائية: ${collectionTitle}`,
      courtLabel ? `الجهة القضائية: ${courtLabel}` : "",
      trackLabel ? `المسار: ${trackLabel}` : "",
      yearLabel ? `السنة: ${yearLabel}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const url = `${libraryDocPath("collection", collection.id)}#${encodeURIComponent(p.id)}`;
    const contentSha = sha256Hex(
      buildEmbeddingInput({
        contextual_header: contextualHeader,
        title,
        display_text: combined,
      }),
    );

    out.push({
      node_key: `principle:${p.id}`,
      node_type: "principle",
      source_id: p.id,
      law_slug: null,
      collection_id: collection.id,
      article_number: null,
      doc_status: "active",
      item_status: "active",
      is_page_numbered: false,
      is_embeddable: true,
      title,
      url,
      display_text: combined,
      contextual_header: contextualHeader,
      content_sha256: contentSha,
      metadata: {
        court: courtLabel || null,
        track: p.track ?? null,
      },
    });
  }

  return out;
}

// ── 3. Royal Decrees & Circulars Node Builder ────────────────────────────────

export interface RawDecreeRow {
  id: string;
  title: string;
  type?: string | null;
  issuer?: string | null;
  summary_brief?: string | null;
  summary?: string | null;
  preamble?: string | null;
  status?: string | null;
}

export interface RawDecreePageRow {
  page_number?: number | null;
  content?: string | null;
}

export function buildDecreeGraphNodes(
  items: readonly { decree: RawDecreeRow; pages: readonly RawDecreePageRow[] }[],
): GraphNodePayload[] {
  const out: GraphNodePayload[] = [];
  for (const { decree, pages } of items) {
    const summary = stripAuditNotes(decree.summary_brief || decree.summary || "", "summary").trim();
    const preamble = stripArticleAuditNotes(decree.preamble || "").trim();
    const pageTexts = [...pages]
      .sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0))
      .slice(0, 6)
      .map((pg) => stripArticleAuditNotes(pg.content || "").trim())
      .filter(Boolean);

    const title = (decree.title ?? "").trim() || `أمر أو تعميم ${decree.id}`;
    const displayText = clipBody([summary, preamble, ...pageTexts].filter(Boolean).join("\n\n") || title);
    if (!displayText) continue;

    const contextualHeader = [
      `الأمر/التعميم: ${title}`,
      decree.type ? `النوع: ${decree.type}` : "",
      decree.issuer ? `الجهة المصدرة: ${decree.issuer}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const url = libraryDocPath("order", decree.id);
    const contentSha = sha256Hex(
      buildEmbeddingInput({
        contextual_header: contextualHeader,
        title,
        display_text: displayText,
      }),
    );

    out.push({
      node_key: `decree:${decree.id}`,
      node_type: "decree",
      source_id: decree.id,
      law_slug: null,
      collection_id: null,
      article_number: null,
      doc_status: decree.status ?? "active",
      item_status: decree.status ?? "active",
      is_page_numbered: false,
      is_embeddable: true,
      title,
      url,
      display_text: displayText,
      contextual_header: contextualHeader,
      content_sha256: contentSha,
      metadata: {
        type: decree.type ?? null,
        issuer: decree.issuer ?? null,
      },
    });
  }
  return out;
}

// ── 4. Fiqh Jurisprudence Node Builder ───────────────────────────────────────

export interface RawFeqhBookRow {
  id: string;
  title: string;
  author?: string | null;
  type?: string | null;
}

export interface RawFeqhBlockRow {
  id: string;
  book_id: string;
  section_id?: string | null;
  chapter_id?: string | null;
  topic?: string | null;
  matn?: string | null;
  sharh?: string | null;
}

export function buildFeqhGraphNodes(params: {
  book: RawFeqhBookRow;
  chaptersById: ReadonlyMap<string, string>;
  sectionsById?: ReadonlyMap<string, string>;
  blocks: readonly RawFeqhBlockRow[];
  includeFeqhVectors: boolean;
}): GraphNodePayload[] {
  const { book, chaptersById, sectionsById, blocks, includeFeqhVectors } = params;
  const out: GraphNodePayload[] = [];
  const typeLabel = book.type === "wadi" ? "فقه قانوني وضعي" : "فقه إسلامي";
  const bookTitle = (book.title ?? "").trim() || "مرجع فقهي";

  for (const b of blocks) {
    const topic = stripArticleAuditNotes(b.topic || "").trim();
    const matn = stripArticleAuditNotes(b.matn || "").trim();
    const sharh = stripArticleAuditNotes(b.sharh || "").trim();

    const displayText = clipBody(
      [topic ? `الموضوع: ${topic}` : "", matn ? `المتن: ${matn}` : "", sharh ? `الشرح: ${sharh}` : ""]
        .filter(Boolean)
        .join("\n"),
      6_000,
    );
    if (!displayText) continue;

    const chapterTitle =
      (b.chapter_id ? chaptersById.get(b.chapter_id) || "" : "") ||
      (b.section_id && sectionsById ? sectionsById.get(b.section_id) || "" : "");
    const title = `${bookTitle}${topic ? ` — ${topic}` : chapterTitle ? ` — ${chapterTitle}` : ""}`;
    const contextualHeader = [
      `المرجع الفقهي: ${bookTitle}`,
      book.author ? `المؤلف: ${book.author}` : "",
      `التصنيف: ${typeLabel}`,
      chapterTitle ? `الكتاب/الباب: ${chapterTitle}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const url = `${libraryDocPath("book", book.id)}#${encodeURIComponent(b.id)}`;
    const contentSha = sha256Hex(
      buildEmbeddingInput({
        contextual_header: contextualHeader,
        title,
        display_text: displayText,
      }),
    );

    out.push({
      node_key: `feqh:${b.id}`,
      node_type: "feqh",
      source_id: b.id,
      law_slug: null,
      collection_id: null,
      article_number: null,
      doc_status: "active",
      item_status: "active",
      is_page_numbered: false,
      is_embeddable: includeFeqhVectors,
      title,
      url,
      display_text: displayText,
      contextual_header: contextualHeader,
      content_sha256: contentSha,
      metadata: {
        book_id: book.id,
        book_type: book.type ?? "sharia",
      },
    });
  }

  return out;
}

// ── 5. Curated Saudi Legal Concept Bridge (Dual-Level Colloquial -> Statutory) ─

interface SaudiLegalConceptSpec {
  slug: string;
  title: string;
  colloquialAndLegalSummary: string;
  targetLaws: Array<{ titleMatch: string; articles: number[] }>;
}

const SAUDI_LEGAL_CONCEPTS: readonly SaudiLegalConceptSpec[] = [
  {
    slug: "unfair-dismissal",
    title: "الفصل التعسفي وإنهاء عقد العمل لسبب غير مشروع",
    colloquialAndLegalSummary:
      "طردوني من الشركة فجأة بدون سبب، فصل تعسفي، إنهاء خدمات الموظف أو العامل دون مبرر مشروع، تعويض المادة 77 وحالات الفسخ المشروع دون مكافأة في المادة 80 وأسباب انتهاء العقد المادة 74 من نظام العمل.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [77, 80, 74, 75, 81] }],
  },
  {
    slug: "end-of-service-award",
    title: "مكافأة نهاية الخدمة والاستقالة",
    colloquialAndLegalSummary:
      "حاسبة وحساب مكافأة نهاية الخدمة، استقالة العامل قبل سنتين أو بعد سنتين أو خمس أو عشر سنوات، تصفية المستحقات عند انتهاء العقد أو الاستقالة، المادة 84 والمادة 85 والمادة 88 من نظام العمل.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [84, 85, 87, 88] }],
  },
  {
    slug: "worker-abandonment-resignation",
    title: "ترك العامل للعمل دون إشعار وحقوقه النظامية",
    colloquialAndLegalSummary:
      "حق العامل في ترك العمل دون إشعار مع الاحتفاظ بحقوقه النظامية بسبب عدم دفع الرواتب أو تأخر الأجور أو المعاملة الجائرة أو الغش في شروط العقد، المادة 81 من نظام العمل.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [81, 90] }],
  },
  {
    slug: "probation-period",
    title: "فترة التجربة في عقد العمل وتمديدها",
    colloquialAndLegalSummary:
      "فصل الموظف في فترة التجربة، مدة التجربة 90 يوماً أو تمديدها إلى 180 يوماً باتفاق مكتوب، إنهاء العقد خلال التجربة دون تعويض أو مكافأة، المادة 53 والمادة 54 من نظام العمل.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [53, 54] }],
  },
  {
    slug: "non-compete-confidentiality",
    title: "شرط عدم المنافسة وإفشاء أسرار العمل",
    colloquialAndLegalSummary:
      "منع الموظف من العمل لدى منافس بعد الاستقالة، شرط عدم المنافسة لمدة سنتين كحد أقصى وحماية أسرار صاحب العمل، المادة 83 من نظام العمل.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [83] }],
  },
  {
    slug: "wages-overtime-leaves",
    title: "الأجور والعمل الإضافي والإجازة السنوية",
    colloquialAndLegalSummary:
      "تأخير الرواتب وحماية الأجور، حساب ساعات العمل الإضافي أوفر تايم أجر الساعة مضافاً إليه 50%، رصيد الإجازة السنوية والتعويض عنها، المواد 90 و107 و109 و111 من نظام العمل.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [90, 107, 109, 111] }],
  },
  {
    slug: "workplace-injury",
    title: "إصابات العمل والأمراض المهنية",
    colloquialAndLegalSummary:
      "إصابة العامل أثناء العمل أو بسببه، المعونة المالية والعلاج والتعويض عن العجز الكلي أو الجزئي، نظام العمل ونظام التأمينات الاجتماعية.",
    targetLaws: [{ titleMatch: "نظام العمل", articles: [133, 137, 138] }],
  },
  {
    slug: "promissory-note-enforcement",
    title: "السند لأمر والكمبيالة والشيك والتنفيذ الجبري",
    colloquialAndLegalSummary:
      "سند لأمر عبر نافذ، شيك بدون رصيد، اعتراض على سند تنفيذي ومنازعة تنفيذ شكلية أو موضوعية، إيقاف الخدمات والحجز التنفيذي، نظام الأوراق التجارية ونظام التنفيذ.",
    targetLaws: [
      { titleMatch: "نظام الاوراق التجاريه", articles: [87, 88, 118] },
      { titleMatch: "نظام التنفيذ", articles: [9, 34, 46] },
    ],
  },
  {
    slug: "civil-contract-breach-rescission",
    title: "فسخ العقد والإخلال بالالتزام التعاقدي والشرط الجزائي",
    colloquialAndLegalSummary:
      "الطرف الثاني أخل بالعقد وما نفذ التزاماته، فسخ العقد، العربون، الشرط الجزائي وتخفيضه إذا كان مبالغاً فيه، القوة القاهرة والظروف الطارئة، نظام المعاملات المدنية.",
    targetLaws: [{ titleMatch: "نظام المعاملات المدنيه", articles: [94, 97, 107, 108, 178, 179] }],
  },
  {
    slug: "hidden-defects-sale",
    title: "ضمان العيوب الخفية في البيع والعقار والسلع",
    colloquialAndLegalSummary:
      "اشتريت عقار أو سيارة أو بضاعة وطلع فيها عيب خفي ما كنت أعرفه، خيار العيب ورد المبيع أو أرش النقص والتقادم، نظام المعاملات المدنية.",
    targetLaws: [{ titleMatch: "نظام المعاملات المدنيه", articles: [338, 339, 344] }],
  },
  {
    slug: "tort-harm-compensation",
    title: "المسؤولية التقصيرية والتعويض عن الضرر المادي والمعنوي",
    colloquialAndLegalSummary:
      "كل خطأ سبب ضرراً للغير يلزم من ارتكبه بالتعويض، أركان المسؤولية التقصيرية الخطأ والضرر وعلاقة السببية والتعويض المعنوي، نظام المعاملات المدنية.",
    targetLaws: [{ titleMatch: "نظام المعاملات المدنيه", articles: [120, 136, 138] }],
  },
  {
    slug: "construction-muqawala-delay",
    title: "عقود المقاولات وغرامة التأخير والأعمال الإضافية",
    colloquialAndLegalSummary:
      "المقاول تأخر في تسليم المبنى أو المشروع أو ترك العمل، غرامة التأخير، عيوب البناء والضمان العشري، الأوامر التغييرية، نظام المعاملات المدنية ونظام المنافسات والمشتريات الحكومية.",
    targetLaws: [
      { titleMatch: "نظام المعاملات المدنيه", articles: [461, 469, 475] },
      { titleMatch: "نظام المنافسات والمشتريات الحكوميه", articles: [72, 73, 76] },
    ],
  },
  {
    slug: "lease-eviction-rent",
    title: "عقود الإيجار وإخلاء العقار وتأخر سداد الأجرة",
    colloquialAndLegalSummary:
      "المستأجر ما يدفع الإيجار، إخلاء المستأجر، فسخ عقد الإيجار الموحد في منصة إيجار، صيانة العين المؤجرة، نظام المعاملات المدنية ونظام التنفيذ.",
    targetLaws: [{ titleMatch: "نظام المعاملات المدنيه", articles: [407, 425, 434] }],
  },
  {
    slug: "llc-manager-liability",
    title: "مسؤولية مدير الشركة ذات المسؤولية المحدودة وعزله",
    colloquialAndLegalSummary:
      "مدير الشركة خالف النظام أو تجاوز صلاحياته أو حمل الشركة ديوناً ومخالفات، المسؤولية الشخصية والتضامنية للمدير وأعضاء مجلس الإدارة وعزل المدير، نظام الشركات.",
    targetLaws: [{ titleMatch: "نظام الشركات", articles: [28, 29, 165, 179] }],
  },
  {
    slug: "partners-exit-dissolution",
    title: "تخارج الشركاء وحل وتصفية الشركة",
    colloquialAndLegalSummary:
      "خلاف بين الشركاء، بيع الحصص وحق الاسترداد، إخراج شريك أو التخارج، بلوغ خسائر الشركة نصف رأس المال وحل وتصفية الشركة، نظام الشركات.",
    targetLaws: [{ titleMatch: "نظام الشركات", articles: [178, 182, 243] }],
  },
  {
    slug: "bankruptcy-financial-restructuring",
    title: "الإفلاس والتسوية الوقائية وإعادة التنظيم المالي",
    colloquialAndLegalSummary:
      "تعثر الشركة عن سداد الديون، تعليق المطالبات، التسوية الوقائية، إعادة التنظيم المالي، التصفية الإدارية، نظام الإفلاس.",
    targetLaws: [{ titleMatch: "نظام الافلاس", articles: [13, 41, 46, 92] }],
  },
  {
    slug: "commercial-concealment-tasattur",
    title: "مكافحة التستر التجاري وعقوباته",
    colloquialAndLegalSummary:
      "تمكين غير السعودي من ممارسة نشاط تجاري لحسابه الخاص، جريمة التستر التجاري وعقوبات السجن والغرامة والمصادرة، نظام مكافحة التستر.",
    targetLaws: [{ titleMatch: "نظام مكافحه التستر", articles: [3, 4, 9] }],
  },
  {
    slug: "commercial-agency-franchise",
    title: "الوكالات التجارية والامتياز التجاري الفرنشايز",
    colloquialAndLegalSummary:
      "إنهاء أو عدم تجديد عقد الوكالة التجارية أو الموزع أو الامتياز التجاري وتعويض الوكيل أو الممنوح، نظام الوكالات التجارية ونظام الامتياز التجاري.",
    targetLaws: [
      { titleMatch: "نظام الوكالات التجاريه", articles: [1, 3] },
      { titleMatch: "نظام الامتياز التجاري", articles: [7, 16, 18] },
    ],
  },
  {
    slug: "personal-status-custody-alimony",
    title: "الأحوال الشخصية: الطلاق والخلع والفسخ والحضانة والنفقة",
    colloquialAndLegalSummary:
      "طلب فسخ النكاح للضرر أو الخلع، حضانة الأطفال بعد الطلاق وزيارة المحضون، نفقة الزوجة والأولاد والنفقة الماضية، نظام الأحوال الشخصية.",
    targetLaws: [{ titleMatch: "نظام الاحوال الشخصيه", articles: [44, 99, 108, 126, 127, 134] }],
  },
  {
    slug: "inheritance-will-waqf",
    title: "المواريث والوصية وقسمة التركات",
    colloquialAndLegalSummary:
      "تقسيم الإرث والتركة بين الورثة، الوصية في حدود الثلث، محاسبة المصفي القضائي للتركة، نظام الأحوال الشخصية.",
    targetLaws: [{ titleMatch: "نظام الاحوال الشخصيه", articles: [176, 197, 198] }],
  },
  {
    slug: "evidence-electronic-proof",
    title: "الإثبات بالكتابة والدليل الرقمي واليمين والشهادة",
    colloquialAndLegalSummary:
      "هل رسائل الواتساب والإيميل دليل في المحكمة؟ حجية الدليل الرقمي والمحررات العادية والرسمية والإقرار واليمين الحاسمة، نظام الإثبات.",
    targetLaws: [{ titleMatch: "نظام الاثبات", articles: [14, 29, 54, 55, 66, 93] }],
  },
  {
    slug: "statute-of-limitations-commercial",
    title: "التقادم المانع من سماع الدعوى والمدد النظامية",
    colloquialAndLegalSummary:
      "متى تسقط الدعوى بالتقادم؟ عدم سماع الدعوى التجارية بعد مضي خمس سنوات، عدم سماع الدعوى العمالية بعد اثني عشر شهراً، وتقادم الحقوق المدنية، نظام المحاكم التجارية ونظام العمل ونظام المعاملات المدنية.",
    targetLaws: [
      { titleMatch: "نظام المحاكم التجاريه", articles: [24] },
      { titleMatch: "نظام العمل", articles: [234] },
      { titleMatch: "نظام المعاملات المدنيه", articles: [295] },
    ],
  },
  {
    slug: "jurisdiction-pleadings-appeal",
    title: "الاختصاص القضائي وصحيفة الدعوى والاستئناف والنقض",
    colloquialAndLegalSummary:
      "الدفع بعدم الاختصاص النوعي أو المكاني، مهلة الاعتراض بالاستئناف 30 يوماً والدعاوى المستعجلة 10 أيام، وطلب النقض أمام المحكمة العليا، نظام المرافعات الشرعية ونظام المحاكم التجارية.",
    targetLaws: [
      { titleMatch: "نظام المرافعات الشرعيه", articles: [31, 36, 187, 193] },
      { titleMatch: "نظام المحاكم التجاريه", articles: [16, 79] },
    ],
  },
  {
    slug: "administrative-court-mazalim",
    title: "دعاوى إلغاء القرارات الإدارية والتعويض أمام ديوان المظالم",
    colloquialAndLegalSummary:
      "التظلم الوجوبي قبل رفع دعوى إلغاء القرار الإداري، عيب عدم الاختصاص أو مخالفة النظام أو إساءة استعمال السلطة، نظام ديوان المظالم ونظام المرافعات أمام ديوان المظالم.",
    targetLaws: [
      { titleMatch: "نظام ديوان المظالم", articles: [13] },
      { titleMatch: "نظام المرافعات امام ديوان المظالم", articles: [8] },
    ],
  },
  {
    slug: "criminal-arrest-detention",
    title: "القبض والتوقيف والتحقيق الجنائي وحقوق المتهم",
    colloquialAndLegalSummary:
      "حالات التلبس والقبض والتفتيش، مدة التوقيف النظامية والإفراج المؤقت وحق الاستعانة بمحامٍ، نظام الإجراءات الجزائية.",
    targetLaws: [{ titleMatch: "نظام الاجراءات الجزائيه", articles: [2, 4, 35, 112, 114] }],
  },
  {
    slug: "cybercrime-defamation-extortion",
    title: "الجرائم المعلوماتية: الابتزاز والتشهير والاحتيال الإلكتروني",
    colloquialAndLegalSummary:
      "تهديد وابتزاز بالصور، تشهير وإساءة عبر مواقع التواصل الاجتماعي تويتر وسناب، اختراق حسابات واحتيال مالي وبنكي، نظام مكافحة جرائم المعلوماتية ونظام مكافحة الاحتيال المالي وخيانة الأمانة.",
    targetLaws: [
      { titleMatch: "نظام مكافحه جرائم المعلوماتيه", articles: [3, 4, 6] },
      { titleMatch: "نظام مكافحه الاحتيال المالي وخيانه الامانه", articles: [1, 2] },
    ],
  },
  {
    slug: "anti-bribery-forgery",
    title: "جرائم التزوير والرشوة واستغلال النفوذ",
    colloquialAndLegalSummary:
      "تزوير محرر رسمي أو عرفي أو توقيع واستعمال محرر مزور، جريمة الرشوة والوساطة، النظام الجزائي لجرائم التزوير ونظام مكافحة الرشوة.",
    targetLaws: [
      { titleMatch: "النظام الجزائي لجرائم التزوير", articles: [2, 8, 9] },
      { titleMatch: "نظام مكافحه الرشوه", articles: [1, 2, 5] },
    ],
  },
  {
    slug: "value-added-tax-zakat",
    title: "ضريبة القيمة المضافة والزكاة والتصرفات العقارية والاعتراض الضريبي",
    colloquialAndLegalSummary:
      "غرامة التأخر في الإقرار الضريبي والتهرب الضريبي، الاعتراض لدى هيئة الزكاة والضريبة والجمارك واللجان الضريبية، نظام ضريبة القيمة المضافة.",
    targetLaws: [{ titleMatch: "نظام ضريبه القيمه المضافه", articles: [40, 42, 49] }],
  },
  {
    slug: "intellectual-property-trademark",
    title: "العلامات التجارية وحقوق المؤلف وبراءات الاختراع",
    colloquialAndLegalSummary:
      "تقليد علامة تجارية مسجلة أو التعدي على مصنف أدبي أو برمجي والتعويض وشطب العلامة، نظام العلامات التجارية ونظام حماية حقوق المؤلف.",
    targetLaws: [{ titleMatch: "نظام حمايه حقوق المؤلف", articles: [21, 22] }],
  },
  {
    slug: "arbitration-award-nullity",
    title: "التحكيم وشرط التحكيم ودعوى بطلان حكم التحكيم",
    colloquialAndLegalSummary:
      "الدفع بوجود شرط تحكيم قبل الكلام في الموضوع، تعيين المحكمين، حالات دعوى بطلان حكم التحكيم خلال 60 يوماً وتنفيذه، نظام التحكيم.",
    targetLaws: [{ titleMatch: "نظام التحكيم", articles: [11, 50, 51, 55] }],
  },
  {
    slug: "personal-data-protection",
    title: "حماية البيانات الشخصية وخصوصية الأفراد",
    colloquialAndLegalSummary:
      "جمع ومعالجة البيانات الشخصية دون موافقة صاحبها، إفشاء أو تسريب البيانات ونقلها خارج المملكة، نظام حماية البيانات الشخصية.",
    targetLaws: [{ titleMatch: "نظام حمايه البيانات الشخصيه", articles: [5, 10, 35, 36] }],
  },
  {
    slug: "consumer-protection-ecommerce",
    title: "التجارة الإلكترونية وحق المستهلك في الاسترجاع والفسخ",
    colloquialAndLegalSummary:
      "طلب متجر إلكتروني تأخر في التوصيل أو أرسل منتجاً مخالفاً، حق المستهلك في فسخ العقد خلال 7 أيام أو تأخر التسليم عن 15 يوماً، نظام التجارة الإلكترونية.",
    targetLaws: [{ titleMatch: "نظام التجاره الالكترونيه", articles: [13, 14] }],
  },
];

export function buildCuratedConceptNodes(): GraphNodePayload[] {
  return SAUDI_LEGAL_CONCEPTS.map((c) => {
    const contextualHeader = "مفهوم قانوني سعودي وجسر دلالي بين الصياغة العامية والنصوص النظامية";
    const contentSha = sha256Hex(
      buildEmbeddingInput({
        contextual_header: contextualHeader,
        title: c.title,
        display_text: c.colloquialAndLegalSummary,
      }),
    );
    return {
      node_key: `concept:${c.slug}`,
      node_type: "concept",
      source_id: c.slug,
      law_slug: null,
      collection_id: null,
      article_number: null,
      doc_status: "active",
      item_status: "active",
      is_page_numbered: false,
      is_embeddable: true,
      title: c.title,
      url: "",
      display_text: c.colloquialAndLegalSummary,
      contextual_header: contextualHeader,
      content_sha256: contentSha,
      metadata: {
        target_laws: c.targetLaws.map((t) => t.titleMatch),
      },
    };
  });
}

// ── 6. Deterministic Legal Edge Extractors ───────────────────────────────────

const EXEMPTION_PATTERNS = [
  /(?:استثناءً?|استثناء)\s+من\s+(?:حكم\s+|أحكام\s+|نص\s+)?الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?/g,
  /(?:مع\s+عدم\s+الإخلال|دون\s+إخلال|دون\s+الإخلال)\s+ب(?:حكم\s+|أحكام\s+|ما\s+ورد\s+في\s+)?الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?/g,
  /ما\s+لم\s+ينص\s+(?:عليه\s+)?في\s+الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?/g,
];

const CITATION_PATTERNS = [
  /(?:وفقاً?|وفقا|طبقاً?|طبقا|عملاً?|عملا|استناداً?|استنادا|تطبيقاً?|تطبيقا)\s+(?:للماد(?:ة|تين)|ل(?:حكم\s+|أحكام\s+|نص\s+)الماد(?:ة|تين))\s*\(?([^)،.\n;:]{1,42})\)?/g,
  /بموجب\s+(?:حكم\s+|أحكام\s+|نص\s+)?الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?/g,
  /(?:المشار\s+إليها|المنصوص\s+عليها)\s+في\s+الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?/g,
  /الماد(?:ة|تين)\s*\(?(\d{1,4}|[٠-٩]{1,4})\)?/g,
];

function findLawByTitleFragment(fragment: string, lawMap: LawIndexMap): LawIndexEntry | null {
  const normFrag = normalizeArabicKey(fragment);
  if (!normFrag || normFrag.length < 6) return null;
  let best: LawIndexEntry | null = null;
  let bestLen = 0;
  for (const entry of lawMap.values()) {
    if (!entry.normalizedTitle) continue;
    if (normFrag.includes(entry.normalizedTitle) && entry.normalizedTitle.length > bestLen) {
      best = entry;
      bestLen = entry.normalizedTitle.length;
    }
  }
  return best;
}

/** One article reference found in an article's own words, kept small until every law is known. */
export interface ArticleRefCandidate {
  edgeType: "EXEMPTS_FROM" | "CITES_ARTICLE";
  num: number;
  /** The words right after the number (≤ 65 chars): «من نظام …» names the law it belongs to. */
  after: string;
  evidence: string;
}

/** Sections the builder fuses after an article's own text: they cite «هذه اللائحة», not the law. */
const FUSED_SECTION_MARKERS = ["«اللائحة التنفيذية المرتبطة»", "«ملخص التعديل»"];

/** The article's own words, without the fused regulation / amendment sections. */
export function lawOwnText(displayText: string): string {
  let cut = displayText.length;
  for (const marker of FUSED_SECTION_MARKERS) {
    const i = displayText.indexOf(marker);
    if (i >= 0 && i < cut) cut = i;
  }
  return displayText.slice(0, cut);
}

/** A fresh copy: a V8 slice can keep its whole parent string (an article's text) alive. */
function detach(s: string): string {
  return Buffer.from(s, "utf8").toString("utf8");
}

/** «من هذا النظام»: the article's own law. */
const THIS_LAW_REF = /^\s*(?:من|في|ب)\s*(?:هذا\s+النظام|النظام\s+هذا)/;
/** «من نظام …», «من اللائحة …», «من النظام الأساسي …»: some other document, named or not. */
const OTHER_DOC_REF = /^\s*(?:من|في)\s+(?:هذه\s+اللائحة|(?:ال)?(?:نظام|لائحة|قرار|مرسوم|أمر|قواعد|ضوابط|تنظيم))/;

/**
 * The law a reference points to: the article's own law when nothing follows the
 * number (or «من هذا النظام»); the named law when «من نظام …» resolves; null when
 * it names another document the library cannot resolve — never a guess at the
 * same-numbered article of the current law.
 */
function targetLawFor(after: string, currentLaw: LawIndexEntry, lawMap: LawIndexMap): LawIndexEntry | null {
  if (THIS_LAW_REF.test(after)) return currentLaw;
  if (OTHER_DOC_REF.test(after)) return findLawByTitleFragment(after, lawMap);
  return currentLaw;
}

/**
 * Every `EXEMPTS_FROM` / `CITES_ARTICLE` reference in an article's own words.
 * Needs no law index, so the watchdog keeps these small records instead of the
 * article texts until all laws are streamed.
 */
export function scanArticleRefs(displayText: string): ArticleRefCandidate[] {
  const text = lawOwnText(displayText);
  // «المادة» and «للمادة» (the alif drops after لِـ) both contain «ماد».
  if (!/ماد(?:ة|تين)/.test(text)) return [];
  const out: ArticleRefCandidate[] = [];
  const scan = (patterns: readonly RegExp[], edgeType: ArticleRefCandidate["edgeType"]) => {
    for (const pat of patterns) {
      pat.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text)) !== null) {
        const num = parseArabicArticleNumber(m[1]);
        if (!num) continue;
        // A spelled-out number can swallow «… من نظام X» into the capture: keep that tail too.
        const inCapture = m[1].search(/\s(?:من|في)\s/);
        const end = m.index + m[0].length;
        const after = (inCapture >= 0 ? m[1].slice(inCapture) : "") + text.slice(end, end + 65);
        out.push({ edgeType, num, after: detach(after), evidence: detach(m[0].trim().slice(0, 180)) });
      }
    }
  };
  scan(EXEMPTION_PATTERNS, "EXEMPTS_FROM");
  scan(CITATION_PATTERNS, "CITES_ARTICLE");
  return out;
}

/** The edges of one article from its scanned references, once every law is in `lawMap`. */
export function resolveArticleEdges(
  node: { node_key: string; law_slug: string | null; is_page_numbered: boolean; refs: readonly ArticleRefCandidate[] },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  if (!node.law_slug || node.is_page_numbered) return [];
  const currentLaw = lawMap.get(node.law_slug);
  if (!currentLaw) return [];

  const edges = new Map<string, GraphEdgePayload>();
  const addEdge = (targetKey: string, edgeType: GraphEdgeType, weight: number, evidence: string) => {
    if (!targetKey || targetKey === node.node_key) return;
    const dedupeKey = `${node.node_key}|${targetKey}|${edgeType}`;
    if (!edges.has(dedupeKey)) {
      edges.set(dedupeKey, {
        source_key: node.node_key,
        target_key: targetKey,
        edge_type: edgeType,
        origin: "auto_watchdog",
        weight,
        evidence: evidence.slice(0, 180),
      });
    }
  };

  // 1. Statutory exception / qualification edges (`EXEMPTS_FROM`) first, then
  // 2. general cross-references (`CITES_ARTICLE`) to articles not already exempted.
  const exemptedTargets = new Set<string>();
  for (const ref of node.refs) {
    if (ref.edgeType !== "EXEMPTS_FROM") continue;
    const targetKey = targetLawFor(ref.after, currentLaw, lawMap)?.articleKeyByNumber.get(ref.num);
    if (targetKey) {
      exemptedTargets.add(targetKey);
      addEdge(targetKey, "EXEMPTS_FROM", 1.25, ref.evidence);
    }
  }
  for (const ref of node.refs) {
    if (ref.edgeType !== "CITES_ARTICLE") continue;
    const targetKey = targetLawFor(ref.after, currentLaw, lawMap)?.articleKeyByNumber.get(ref.num);
    if (targetKey && !exemptedTargets.has(targetKey)) addEdge(targetKey, "CITES_ARTICLE", 0.9, ref.evidence);
  }

  // 3. Law-level hierarchy edges (`PARENT_LAW` & `SUPERSEDES_LAW`) attached once on the law's root article.
  // `parentLawId` is a registry instrument_id; `resolveParentLawSlugs` maps it to a slug first.
  if (currentLaw.rootNodeKey === node.node_key) {
    if (currentLaw.parentLawId) {
      const parent = lawMap.get(currentLaw.parentLawId);
      if (parent) {
        const enablingNum = parseArabicArticleNumber(currentLaw.enablingArticle);
        const parentTarget = (enablingNum ? parent.articleKeyByNumber.get(enablingNum) : null) ?? parent.rootNodeKey;
        if (parentTarget) {
          addEdge(parentTarget, "PARENT_LAW", 1.15, `النظام الأساسي المرتبط: ${parent.title}`);
        }
      }
    }
    if (currentLaw.supersedesLawSlug) {
      const oldLaw = lawMap.get(currentLaw.supersedesLawSlug);
      if (oldLaw?.rootNodeKey) {
        addEdge(oldLaw.rootNodeKey, "SUPERSEDES_LAW", 1.0, `يحل محل: ${oldLaw.title}`);
      }
    }
  }

  return [...edges.values()];
}

/**
 * `laws.parent_law_id` holds the parent's registry `instrument_id`, while
 * `lawMap` is keyed by slug: rewrite each entry's `parentLawId` to the parent's
 * slug (null when the parent is not in the library). Call once all laws are in.
 */
export function resolveParentLawSlugs(lawMap: LawIndexMap): void {
  const slugByInstrument = new Map<string, string>();
  for (const e of lawMap.values()) {
    const id = e.instrumentId?.trim();
    if (id) slugByInstrument.set(id, e.slug);
  }
  for (const e of lawMap.values()) {
    const ref = e.parentLawId?.trim();
    if (!ref) continue;
    e.parentLawId = slugByInstrument.get(ref) ?? (lawMap.has(ref) ? ref : null);
  }
}

/**
 * Extracts `EXEMPTS_FROM`, `CITES_ARTICLE`, `PARENT_LAW`, and `SUPERSEDES_LAW`
 * edges for an article node. Strictly skips article-number extraction when
 * `is_page_numbered === true` so `"Page 5"` never impersonates `"Article 5"`.
 */
export function extractArticleEdges(
  node: {
    node_key: string;
    law_slug: string | null;
    is_page_numbered: boolean;
    display_text: string;
  },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  if (!node.law_slug || node.is_page_numbered) return [];
  return resolveArticleEdges({ ...node, refs: scanArticleRefs(node.display_text) }, lawMap);
}

/**
 * Extracts `INTERPRETS_ARTICLE` edges from Judicial Principles that cite
 * `"المادة (X) من نظام <Law Title>"`.
 */
export function extractPrincipleInterpretationEdges(
  principleNode: { node_key: string; display_text: string },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  const edges = new Map<string, GraphEdgePayload>();
  const pat = /الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?\s+من\s+(نظام\s+[^\n،.;:()]{3,55})/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(principleNode.display_text)) !== null) {
    const artNum = parseArabicArticleNumber(m[1]);
    if (!artNum) continue;
    const matchedLaw = findLawByTitleFragment(m[2], lawMap);
    if (!matchedLaw) continue;
    const targetKey = matchedLaw.articleKeyByNumber.get(artNum);
    if (!targetKey) continue;
    const k = `${principleNode.node_key}|${targetKey}`;
    if (!edges.has(k)) {
      edges.set(k, {
        source_key: principleNode.node_key,
        target_key: targetKey,
        edge_type: "INTERPRETS_ARTICLE",
        origin: "auto_watchdog",
        weight: 1.15,
        evidence: m[0].trim().slice(0, 180),
      });
    }
  }
  return [...edges.values()];
}

/**
 * Extracts `AMENDS_ARTICLE` edges from Royal Decrees that cite `"تعديل المادة (X) من نظام <Law Title>"`.
 */
export function extractDecreeAmendmentEdges(
  decreeNode: { node_key: string; display_text: string },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  const edges = new Map<string, GraphEdgePayload>();
  const pat = /(?:تعديل|إضافة|حذف)\s+(?:حكم\s+|نص\s+)?الماد(?:ة|تين)\s*\(?([^)،.\n;:]{1,42})\)?\s+من\s+(نظام\s+[^\n،.;:()]{3,55})/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(decreeNode.display_text)) !== null) {
    const artNum = parseArabicArticleNumber(m[1]);
    if (!artNum) continue;
    const matchedLaw = findLawByTitleFragment(m[2], lawMap);
    if (!matchedLaw) continue;
    const targetKey = matchedLaw.articleKeyByNumber.get(artNum);
    if (!targetKey) continue;
    const k = `${decreeNode.node_key}|${targetKey}`;
    if (!edges.has(k)) {
      edges.set(k, {
        source_key: decreeNode.node_key,
        target_key: targetKey,
        edge_type: "AMENDS_ARTICLE",
        origin: "auto_watchdog",
        weight: 1.2,
        evidence: m[0].trim().slice(0, 180),
      });
    }
  }
  return [...edges.values()];
}

/**
 * Connects curated `concept:<slug>` nodes to matching articles in `lawMap` via `HAS_CONCEPT`.
 */
export function extractConceptEdges(lawMap: LawIndexMap): GraphEdgePayload[] {
  const byNormalizedTitle = new Map<string, LawIndexEntry[]>();
  for (const entry of lawMap.values()) {
    if (!entry.normalizedTitle) continue;
    const bucket = byNormalizedTitle.get(entry.normalizedTitle) ?? [];
    bucket.push(entry);
    byNormalizedTitle.set(entry.normalizedTitle, bucket);
  }

  const out: GraphEdgePayload[] = [];
  for (const concept of SAUDI_LEGAL_CONCEPTS) {
    const sourceKey = `concept:${concept.slug}`;
    for (const target of concept.targetLaws) {
      const normTitle = normalizeArabicKey(target.titleMatch);
      // Match exact normalized title first, otherwise substring match
      let matchedLaws = byNormalizedTitle.get(normTitle) ?? [];
      if (matchedLaws.length === 0) {
        matchedLaws = [...lawMap.values()].filter(
          (e) => e.normalizedTitle && (e.normalizedTitle === normTitle || e.normalizedTitle.startsWith(normTitle)),
        );
      }
      for (const law of matchedLaws) {
        let linkedAny = false;
        for (const artNum of target.articles) {
          const artKey = law.articleKeyByNumber.get(artNum);
          if (artKey) {
            out.push({
              source_key: sourceKey,
              target_key: artKey,
              edge_type: "HAS_CONCEPT",
              origin: "auto_watchdog",
              weight: 1.15,
              evidence: `${concept.title} -> ${law.title} م${artNum}`,
            });
            linkedAny = true;
          }
        }
        if (!linkedAny && law.rootNodeKey) {
          out.push({
            source_key: sourceKey,
            target_key: law.rootNodeKey,
            edge_type: "HAS_CONCEPT",
            origin: "auto_watchdog",
            weight: 0.85,
            evidence: `${concept.title} -> ${law.title}`,
          });
        }
      }
    }
  }
  return out;
}
