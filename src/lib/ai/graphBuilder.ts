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
 *
 * Structure (20261115_10): `buildLawStructure` adds one `law` node per law and
 * one `chapter` node per titled chapter (never embedded), with `PART_OF`
 * (article → chapter → law) and `NEXT_ARTICLE` (reading order). Citations are
 * read by `findArticleMentions`: singular, dual and plural article nouns,
 * digit and word numbers, lists and ranges, and «من النظام / من هذه اللائحة»
 * resolved to the right document.
 */
import { createHash } from "node:crypto";

import { stripArticleAuditNotes, stripAuditNotes } from "../library/lawPreambleBlocks.ts";
import { libraryDocPath } from "../library/libraryMetadata.ts";
import { isPageLocator, isPageNumberedDocument } from "../library/pageLocator.ts";
import { markdownToPlain } from "../text/markdownToPlain.ts";
import { classifyTrack, normalizeSectionCode } from "./graphRouting.ts";

export type GraphNodeType = "article" | "principle" | "decree" | "feqh" | "concept" | "law" | "chapter" | "term";

export type GraphEdgeType =
  | "PART_OF"
  | "NEXT_ARTICLE"
  | "PARENT_LAW"
  | "SUPERSEDES_LAW"
  | "EXEMPTS_FROM"
  | "SUBJECT_TO"
  | "PENALIZES"
  | "DEFINES_TERM"
  | "CITES_ARTICLE"
  | "AMENDS_ARTICLE"
  | "INTERPRETS_ARTICLE"
  | "ESTABLISHES_RULE"
  | "DECONSTRUCTS_CONCEPT"
  | "HAS_CONCEPT"
  // Built by the database from the vectors (graph_rag_build_similarity, 20261116_10), never by this module.
  | "SIMILAR_TO"
  | "REPLACED_BY"
  // The library's own article → executive-regulation link (article_regulations.ref + reg_num), 20261116_10.
  | "IMPLEMENTED_BY";

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
  /** `law_status` / `laws.status` ("repealed", "active", …): picks the old law a repeal clause names. */
  status?: string | null;
  /** laws.section_code ("00".."29"), normalised; null when the law is unfiled. */
  sectionCode?: string | null;
  /** `law:<slug>` when `buildLawStructure` wrote the law's outline node (law-level links need both ends). */
  lawNodeKey?: string | null;
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
  /** The library section ("00".."29"); retrieve routes a question to its section by it (law node metadata only). */
  section_code?: string | null;
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
  /** The regulation document's title, as the library cites it («اللائحة التنفيذية لنظام العمل»). */
  ref?: string | null;
  /** The regulation article's number in that document («12», or «12/3» for a paragraph). */
  reg_num?: string | number | null;
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

// ── 1b. Law Structure: law + chapter nodes, PART_OF and NEXT_ARTICLE edges ────

/** `node_key` length bound of `library_graph.nodes` (20261110_10). */
const MAX_NODE_KEY_LENGTH = 260;

/**
 * The shape of one law in the graph: a `law:<slug>` node, a `chapter:<id>` node
 * per titled chapter that holds articles, `PART_OF` edges (article → chapter →
 * law, or article → law when the article has no titled chapter) and
 * `NEXT_ARTICLE` edges between consecutive articles in reading order.
 *
 * Law and chapter nodes are never embedded (`is_embeddable: false`): every
 * article already carries its law and chapter in its contextual header, so they
 * cost no embedding calls. Retrieval does not return them either; they exist so
 * the explorer can show a law's outline and so an answer can widen to the
 * neighbouring articles.
 *
 * `articles` must be in reading order (the watchdog streams them by `order_index`).
 */
export function buildLawStructure(params: {
  law: RawLawRow;
  chaptersById: ReadonlyMap<string, string>;
  articles: readonly RawArticleRow[];
  articleNodes: readonly GraphNodePayload[];
}): { nodes: GraphNodePayload[]; edges: GraphEdgePayload[] } {
  const { law, chaptersById, articles, articleNodes } = params;
  const lawKey = `law:${law.slug}`;
  const builtKeys = new Set(articleNodes.map((n) => n.node_key));
  const ordered = articles.filter((a) => builtKeys.has(`article:${a.id}`));
  if (ordered.length === 0 || lawKey.length > MAX_NODE_KEY_LENGTH || !law.title?.trim()) {
    return { nodes: [], edges: [] };
  }

  const lawTitle = law.title.trim();
  const lawUrl = libraryDocPath("law", law.slug);
  const header = [
    `المستند: ${lawTitle}`,
    law.type ? `التصنيف: ${law.type}` : "",
    `حالة المستند: ${statusArabic(law.status)}`,
  ]
    .filter(Boolean)
    .join(" | ");

  // Titled chapters that hold at least one built article, in reading order.
  const chapterArticles = new Map<string, RawArticleRow[]>();
  for (const a of ordered) {
    const cid = a.chapter_id ? String(a.chapter_id) : "";
    const title = cid ? (chaptersById.get(cid) ?? "").trim() : "";
    if (!title || `chapter:${cid}`.length > MAX_NODE_KEY_LENGTH) continue;
    const list = chapterArticles.get(cid) ?? [];
    list.push(a);
    chapterArticles.set(cid, list);
  }

  const node = (
    key: string,
    sourceId: string,
    title: string,
    displayText: string,
    url: string,
    metadata: Record<string, unknown>,
  ): GraphNodePayload => ({
    node_key: key,
    node_type: key.startsWith("law:") ? "law" : "chapter",
    source_id: sourceId,
    law_slug: law.slug,
    collection_id: null,
    article_number: null,
    doc_status: law.status ?? "active",
    item_status: "active",
    is_page_numbered: false,
    is_embeddable: false,
    title,
    url,
    display_text: displayText,
    contextual_header: header,
    content_sha256: sha256Hex(buildEmbeddingInput({ contextual_header: header, title, display_text: displayText })),
    metadata,
  });

  const chapterTitles = [...chapterArticles.keys()].map((cid) => (chaptersById.get(cid) ?? "").trim());
  const lawText = clipBody(
    [
      lawTitle,
      law.type ? `التصنيف: ${law.type}` : "",
      `حالة المستند: ${statusArabic(law.status)}`,
      `عدد المواد: ${ordered.length}`,
      chapterTitles.length > 0 ? `الأبواب والفصول:\n${chapterTitles.map((t) => `- ${t}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const nodes: GraphNodePayload[] = [
    node(lawKey, law.slug, lawTitle, lawText, lawUrl, {
      article_count: ordered.length,
      chapter_count: chapterArticles.size,
      section_code: normalizeSectionCode(law.section_code),
    }),
  ];
  const edges: GraphEdgePayload[] = [];
  const edge = (source: string, target: string, type: GraphEdgeType, evidence: string | null): void => {
    edges.push({
      source_key: source,
      target_key: target,
      edge_type: type,
      origin: "auto_watchdog",
      weight: 1.0,
      evidence: evidence ? evidence.slice(0, 180) : null,
    });
  };

  let order = 0;
  for (const [cid, arts] of chapterArticles) {
    const chapterTitle = (chaptersById.get(cid) ?? "").trim();
    const chapterKey = `chapter:${cid}`;
    nodes.push(
      node(
        chapterKey,
        cid,
        `${lawTitle} — ${chapterTitle}`,
        `${chapterTitle}\nمن: ${lawTitle}\nعدد المواد: ${arts.length}`,
        `${lawUrl}#${encodeURIComponent(arts[0].id)}`,
        { article_count: arts.length, order: order++ },
      ),
    );
    edge(chapterKey, lawKey, "PART_OF", `ضمن: ${lawTitle}`);
  }

  for (const a of ordered) {
    const cid = a.chapter_id ? String(a.chapter_id) : "";
    if (cid && chapterArticles.has(cid)) {
      edge(`article:${a.id}`, `chapter:${cid}`, "PART_OF", `ضمن: ${(chaptersById.get(cid) ?? "").trim()}`);
    } else {
      edge(`article:${a.id}`, lawKey, "PART_OF", `ضمن: ${lawTitle}`);
    }
  }

  for (let i = 1; i < ordered.length; i++) {
    edge(`article:${ordered[i - 1].id}`, `article:${ordered[i].id}`, "NEXT_ARTICLE", null);
  }

  return { nodes, edges };
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
  /** Semi-judicial collections: the committee families it belongs to (graphRouting.committeeFamilies). */
  committeeFamilies?: readonly string[];
}): GraphNodePayload[] {
  const { collection, principles } = params;
  const families = params.committeeFamilies ?? [];
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
      metadata: principleRouting(p, collection, courtLabel, families),
    });
  }

  return out;
}

/**
 * Routing labels of a principle (metadata only, never embedded): its track
 * (the principle's own, else its collection's), the class retrieve routes by,
 * a subject section for the Board of Grievances' commercial / criminal
 * circuits, and the committee families of a semi-judicial collection. The
 * watchdog adds `governing_laws` once the collection's citations are known.
 */
function principleRouting(
  p: RawPrincipleRow,
  collection: RawCollectionRow,
  courtLabel: string,
  families: readonly string[],
): Record<string, unknown> {
  const track = (p.track || collection.track || "").trim() || null;
  const routing = classifyTrack({
    track,
    court: [courtLabel, collection.court, collection.court_body].filter(Boolean).join(" "),
    title: collection.title,
  });
  const out: Record<string, unknown> = {
    court: courtLabel || null,
    track,
    track_class: routing.track_class,
    subject_section: routing.subject_section,
  };
  if (routing.track_class === "semi" && families.length > 0) out.committee_families = [...families];
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
    // Decree rows are page layout (identity table, <details> blocks, headings):
    // plain text for the node, and the preamble's «موجز» block only when there
    // is no summary already (it is the same text).
    const summary = markdownToPlain(stripAuditNotes(decree.summary_brief || decree.summary || "", "summary"));
    const preamble = markdownToPlain(stripArticleAuditNotes(decree.preamble || ""), { dropSummaryBlocks: summary !== "" });
    const pageTexts = [...pages]
      .sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0))
      .slice(0, 6)
      .map((pg) => markdownToPlain(stripArticleAuditNotes(pg.content || "")))
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

// Every article reference starts with the noun: «المادة», «للمادة», «بالمادة», «والمادة»,
// «مادة», the dual «المادتين/المادتان» or the plural «المواد». Diacritics may sit
// between the letters («المادّة»).
const MARK = "[\\u064B-\\u0652\\u0670\\u0640]*";
const ARTICLE_NOUN_RE = new RegExp(
  `(?<![\\p{L}\\p{M}])((?:[وف])?(?:بال|لل|ال|ب|ل|ك)?)` +
    `(م${MARK}ا${MARK}د${MARK}(?:ت${MARK}ي${MARK}ن|ت${MARK}ا${MARK}ن|ة)|م${MARK}و${MARK}ا${MARK}د)` +
    `(?![\\p{L}\\p{M}])`,
  "gu",
);

/** A dual names at most two articles; a list or range stops here (a bad range must not explode). */
const MAX_LISTED_ARTICLES = 40;
const MAX_RANGE_SPAN = 30;

/** Words that may sit between the numbers of one list («رقم», a repeated «المادة»). */
const LIST_GLUE_WORDS = new Set(["الماده", "والماده", "المواد", "والمواد", "المادتين", "المادتان", "رقم", "رقمي", "ارقام", "و"]);
const RANGE_WORDS = new Set(["الي", "حتي"]);

function isNumberWord(w: string): boolean {
  return UNITS_MAP[w] !== undefined || TENS_MAP[w] !== undefined || HUNDREDS_MAP[w] !== undefined;
}

export type ArticleNounKind = "single" | "dual" | "plural";

/**
 * The article numbers at the start of `s` (the text right after the noun):
 * «(5)», «(5، 6 و7)», «من (3) إلى (7)», «الخامسة عشرة» (15), «الخامسة والعشرين» (25),
 * «الخامسة والسادسة» (5 and 6), «التاسعة بعد المائة» (109). Reading stops at the
 * first word that is neither a number nor list glue, or at a sentence break.
 * `end` is the index just past the last number read (0 when none).
 */
export function readArticleNumbers(s: string): { numbers: number[]; end: number } {
  const text = toAsciiDigits(s);
  const out: number[] = [];
  let lastEnd = 0;
  let pendingRange = false;
  let cur: { u: number; t: number; h: number; end: number } | null = null;

  const emit = (n: number, end: number) => {
    if (pendingRange && out.length > 0) {
      const from = out[out.length - 1];
      if (n > from && n - from <= MAX_RANGE_SPAN) {
        for (let k = from + 1; k <= n; k++) out.push(k);
      } else {
        out.push(n);
      }
    } else {
      out.push(n);
    }
    pendingRange = false;
    lastEnd = end;
  };
  const closeCur = () => {
    if (!cur) return;
    const v = cur.u + cur.t + cur.h;
    if (v > 0 && v <= 9999) emit(v, cur.end);
    cur = null;
  };

  let prevEnd = 0;
  for (const m of text.matchAll(/\d+(?:\s*[/\\]\s*\d+)?|[\p{L}\p{M}]+/gu)) {
    const idx = m.index ?? 0;
    if (idx > 140) break;
    // A sentence or clause break ends the reference; a line break only after the
    // first number («المادة\n(١٤)» is one reference, a list does not run over lines).
    if ((prevEnd === 0 ? /[.:;؛]/ : /[.:;\n؛]/).test(text.slice(prevEnd, idx))) break;
    prevEnd = idx + m[0].length;
    const raw = m[0];

    if (/^\d/.test(raw)) {
      closeCur();
      const n = Number(/^\d+/.exec(raw)![0]);
      if (n <= 0 || n > 9999) break;
      emit(n, prevEnd);
      continue;
    }

    const tok = normalizeArabicKey(raw);
    if (!tok) continue;
    const started = out.length > 0 || cur !== null;
    if (LIST_GLUE_WORDS.has(tok)) continue;
    if (tok === "من") {
      if (!started) continue; // «المواد من (3) إلى (7)»
      break; // «… من نظام …» names the document
    }
    if (tok === "بعد") {
      if (cur) continue; // «التاسعة بعد المائة»
      break;
    }
    if (RANGE_WORDS.has(tok)) {
      closeCur();
      if (out.length === 0) break;
      pendingRange = true;
      continue;
    }

    let w = tok;
    if (!isNumberWord(w) && w.startsWith("و") && isNumberWord(w.slice(1))) w = w.slice(1);
    if (!isNumberWord(w)) break;

    const unit = UNITS_MAP[w];
    const ten = TENS_MAP[w];
    const hundred = HUNDREDS_MAP[w];
    const c = cur as { u: number; t: number; h: number; end: number } | null;
    if (unit !== undefined) {
      // «الخامسة عشرة»: a units word, then «عشر/عشرة» → the teens.
      if ((w === "عشر" || w === "عشره") && c && c.u > 0 && c.u < 10 && c.t === 0 && c.h === 0) {
        c.u += 10;
        c.end = prevEnd;
        continue;
      }
      // Units always come first in an Arabic ordinal: a second units word starts the next article.
      closeCur();
      cur = { u: unit, t: 0, h: 0, end: prevEnd };
    } else if (ten !== undefined) {
      if (c && c.t === 0 && c.h === 0 && c.u < 10) {
        c.t = ten;
        c.end = prevEnd;
      } else {
        closeCur();
        cur = { u: 0, t: ten, h: 0, end: prevEnd };
      }
    } else if (hundred !== undefined) {
      if (c && c.h === 0) {
        c.h = hundred;
        c.end = prevEnd;
      } else {
        closeCur();
        cur = { u: 0, t: 0, h: hundred, end: prevEnd };
      }
    }
  }
  closeCur();
  return { numbers: out, end: lastEnd };
}

/** One place a text names one or more articles. */
export interface ArticleMention {
  /** Index of the noun's first letter (its prefix included). */
  start: number;
  /** The noun's attached prefix: «ال», «لل», «بال», «و», … */
  prefix: string;
  kind: ArticleNounKind;
  /** Index just past the last article number. */
  end: number;
  numbers: number[];
}

/** Every article mention in `text`, with the numbers each one names. */
export function findArticleMentions(text: string): ArticleMention[] {
  const out: ArticleMention[] = [];
  for (const m of text.matchAll(ARTICLE_NOUN_RE)) {
    const start = m.index ?? 0;
    const nounEnd = start + m[0].length;
    const noun = m[2].replace(ARABIC_DIACRITICS_RE, "");
    const kind: ArticleNounKind = noun === "مواد" ? "plural" : noun.startsWith("مادت") ? "dual" : "single";
    const { numbers, end } = readArticleNumbers(text.slice(nounEnd, nounEnd + 160));
    if (numbers.length === 0) continue;
    const cap = kind === "single" ? 1 : kind === "dual" ? 2 : MAX_LISTED_ARTICLES;
    out.push({ start, prefix: m[1], kind, end: nounEnd + end, numbers: [...new Set(numbers)].slice(0, cap) });
  }
  return out;
}

// Lead-ins, tested against the 60 characters before the noun plus the noun's own
// prefix («لل», «بال»…). `WHAT_IS_IN` is «ما ورد في / ما نصت عليه …»,
// `PROVISION_OF` is «حكم / أحكام / نص».
const WHAT_IS_IN = String.raw`(?:ما\s+(?:ورد|نصت|نص|جاء)\s+(?:عليه\s+)?(?:في|ب)\s+)`;
const PROVISION_OF = String.raw`(?:(?:حكم|أحكام|نص)\s+)`;

/**
 * This article is an exception from (or overrides) the article it names
 * (`EXEMPTS_FROM`, this → named): «استثناءً من المادة…», «على الرغم من أحكام
 * المادة…», «خلافاً للمادة…».
 */
const EXEMPTION_LEADS = [
  new RegExp(String.raw`(?:و?استثناءً?|و?استثناء)\s+من\s+${PROVISION_OF}?(?:ال)?$`, "u"),
  new RegExp(String.raw`على\s+الرغم\s+(?:مما\s+(?:ورد|نصت|نص|جاء)\s+(?:عليه\s+)?في\s+|من\s+${PROVISION_OF}?)(?:ال)?$`, "u"),
  new RegExp(String.raw`خلاف[اًا]?\s+(?:لما\s+(?:ورد|نصت|نص|جاء)\s+(?:عليه\s+)?في\s+(?:ال)?|ل(?:حكم|أحكام|نص)\s+(?:ال)?|لل|ل)$`, "u"),
];

/**
 * The named article is the exception from this one (`EXEMPTS_FROM`, named →
 * this): «فيما عدا / باستثناء ما ورد في المادة…», «ما لم ينص في المادة…».
 */
const REVERSE_EXEMPTION_LEADS = [
  new RegExp(String.raw`(?:فيما\s+عدا|باستثناء|عدا)\s+${WHAT_IS_IN}?${PROVISION_OF}?(?:ال)?$`, "u"),
  new RegExp(String.raw`ما\s+لم\s+(?:ينص|تنص|يرد)\s+(?:عليه\s+)?(?:في\s+)?(?:ال)?$`, "u"),
];

/**
 * This article applies subject to the one it names (`SUBJECT_TO`): «مع مراعاة
 * المادة…», «مع عدم الإخلال بحكم المادة…», «بما لا يتعارض مع المادة…». A
 * condition, not an exception, so it is weaker than `EXEMPTS_FROM` in retrieval.
 */
const QUALIFIER_LEADS = [
  new RegExp(String.raw`مع\s+مراعاة\s+${WHAT_IS_IN}?${PROVISION_OF}?(?:ال)?$`, "u"),
  new RegExp(
    String.raw`(?:مع\s+عدم\s+الإخلال|دون\s+(?:ال)?إخلال|بدون\s+إخلال)\s+(?:(?:بحكم|بأحكام|بنص)\s+(?:ال)?|بما\s+(?:ورد|نصت|نص|جاء)\s+(?:عليه\s+)?في\s+(?:ال)?|بال|ب)?$`,
    "u",
  ),
  new RegExp(String.raw`بما\s+لا\s+يتعارض\s+مع\s+${PROVISION_OF}?(?:ال)?$`, "u"),
];

/** «يعاقب كل من خالف (أحكام) المادة…»: a violation word right before the noun… */
const VIOLATION_LEAD =
  /(?:خالف|يخالف|تخالف|يخالفون|خالفوا|مخالفة|مخالفته|مخالفتها|بمخالفة|لمخالفة|يمتنع\s+عن\s+تنفيذ|لم\s+يلتزم\s+ب|أخل\s+ب|الإخلال\s+ب)\s+(?:أي\s+)?(?:(?:حكم|أحكام|نص|نصوص)\s+(?:من\s+)?)?(?:ال)?$/u;
/** …and a penalty word in the same sentence. */
const PENALTY_WORD = /يعاقب|يُعاقب|يعاقَب|يُعاقَب|تعاقب|تُعاقب|عقوبة|العقوبة|بغرامة|غرامة|بالسجن|يجازى|يُجازى|جزاء|الجزاءات|يغرم|يُغرَّم/u;

/**
 * A penalty article: it imposes a fine, prison or a sanction («يعاقب…»,
 * «بغرامة لا تزيد…», «بالسجن مدة…»). Most of them name no article («كل من
 * خالف أحكام هذا النظام»), so the builder links them to their law's node and
 * retrieval brings them in when a question asks about a penalty.
 */
const PENALTY_ARTICLE_RE =
  /(?:^|[\s(«"،-])(?:يعاقب|يُعاقب|يعاقَب|يُعاقَب|تعاقب|تُعاقب|يجازى|يُجازى)\s|بغرامة\s+(?:لا|مالية|قدرها|تصل|تعادل|مقدارها)|بالسجن\s+(?:مدة|لمدة)|(?:العقوبات|الجزاءات)\s+(?:الآتية|التالية)/u;

export function isPenaltyArticle(displayText: string): boolean {
  return PENALTY_ARTICLE_RE.test(lawOwnText(displayText));
}

/** The sentence around `[from, to)`: from the last break before it to the next one after it. */
function sentenceAround(text: string, from: number, to: number): string {
  let start = 0;
  for (const ch of [".", "\n", "؛"]) start = Math.max(start, text.lastIndexOf(ch, from - 1) + 1);
  const rest = text.slice(to);
  const stop = rest.search(/[.\n؛]/);
  return text.slice(start, to + (stop < 0 ? rest.length : stop));
}

/** The text right after a mention's last number, without the closing bracket. */
function textAfterMention(text: string, end: number, len: number): string {
  return text.slice(end, end + len).replace(/^[\s)\]»"']+/, "");
}

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
  edgeType: "EXEMPTS_FROM" | "SUBJECT_TO" | "PENALIZES" | "CITES_ARTICLE";
  /** `EXEMPTS_FROM` only: the named article is the exception from this one («فيما عدا ما ورد في المادة…»). */
  reverse?: boolean;
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

/** «من هذا النظام», «من هذه اللائحة», «من هذه الاتفاقية»: the document itself, whatever it calls itself. */
const THIS_DOC_REF = /^\s*(?:من|في|ب)\s*(?:(?:هذا|هذه)\s+ال[\p{L}\p{M}]+|النظام\s+هذا)/u;
/**
 * A bare definite noun nothing names: «من النظام», «من اللائحة», «من التنظيم».
 * «من النظام الأساسي …» or «من اللائحة التنفيذية …» go on to name a document
 * and do not match.
 */
const BARE_DOC_REF =
  /^\s*(?:من|في)\s+ال(نظام|لائحة|تنظيم|قواعد|ضوابط|اتفاقية|ميثاق|قرار|تعليمات|لوائح)(?:\s*$|[\s)]*[^\s\p{L}\p{M}]|\s+(?:المشار|المذكور)|\s+و)/u;
/** «من نظام …», «من اللائحة …», «من النظام الأساسي …»: some other document, named or not. */
const OTHER_DOC_REF = /^\s*(?:من|في)\s+(?:(?:ال)?(?:نظام|لائحة|قرار|مرسوم|أمر|قواعد|ضوابط|تنظيم))/;

/** The stem a document's own title carries when it calls itself by `noun` («لائحة» → «لائح»). */
const DOC_NOUN_STEM: Readonly<Record<string, string>> = {
  نظام: "نظام",
  لائحة: "لائح",
  لوائح: "لائح",
  تنظيم: "تنظيم",
  قواعد: "قواعد",
  ضوابط: "ضوابط",
  اتفاقية: "اتفاقي",
  ميثاق: "ميثاق",
  قرار: "قرار",
  تعليمات: "تعليمات",
};

function isRegulationTitle(title: string): boolean {
  return /لائح|قواعد|ضوابط|تعليمات/.test(title);
}

/**
 * The law a reference points to:
 *  - the article's own document when nothing follows the number, or «من هذا النظام / هذه اللائحة …»;
 *  - for a bare «من النظام»: the parent law of a regulation, else the law itself;
 *  - for a bare «من اللائحة / التنظيم …»: the document itself when its title says so;
 *  - the named law when «من نظام …» resolves;
 *  - null when it names a document the library cannot resolve — never a guess at
 *    the same-numbered article of the current law.
 */
function targetLawFor(after: string, currentLaw: LawIndexEntry, lawMap: LawIndexMap): LawIndexEntry | null {
  if (THIS_DOC_REF.test(after)) return currentLaw;
  const bare = BARE_DOC_REF.exec(after);
  if (bare) {
    const noun = bare[1];
    if (noun === "نظام") {
      const parent = currentLaw.parentLawId ? lawMap.get(currentLaw.parentLawId) : undefined;
      if (parent) return parent;
      return isRegulationTitle(currentLaw.title) ? null : currentLaw;
    }
    return currentLaw.title.includes(DOC_NOUN_STEM[noun] ?? noun) ? currentLaw : null;
  }
  if (OTHER_DOC_REF.test(after)) return findLawByTitleFragment(after, lawMap);
  return currentLaw;
}

/** The words around a mention (≤ 180 chars, same line): what the explorer shows as evidence. */
function mentionEvidence(text: string, mention: ArticleMention, tail = 1): string {
  const from = Math.max(0, mention.start - 30);
  const seg = text.slice(from, mention.end + tail);
  const nl = seg.lastIndexOf("\n", mention.start - from);
  return (nl >= 0 ? seg.slice(nl + 1) : seg).trim().slice(0, 180);
}

/**
 * Every `EXEMPTS_FROM` / `CITES_ARTICLE` reference in an article's own words:
 * digits or spelled-out ordinals, single articles, duals, lists and ranges.
 * Needs no law index, so the watchdog keeps these small records instead of the
 * article texts until all laws are streamed.
 */
export function scanArticleRefs(displayText: string): ArticleRefCandidate[] {
  const text = lawOwnText(displayText);
  const out: ArticleRefCandidate[] = [];
  for (const mention of findArticleMentions(text)) {
    const lead = text.slice(Math.max(0, mention.start - 60), mention.start) + mention.prefix;
    const kind = classifyLead(text, mention, lead);
    const after = detach(textAfterMention(text, mention.end, 65));
    const evidence = detach(mentionEvidence(text, mention));
    for (const num of mention.numbers) {
      out.push(kind.reverse ? { edgeType: kind.edgeType, reverse: true, num, after, evidence } : { edgeType: kind.edgeType, num, after, evidence });
    }
  }
  return out;
}

/** What a mention's lead-in makes it: exception (either way), condition, penalty, or a plain citation. */
function classifyLead(
  text: string,
  mention: ArticleMention,
  lead: string,
): { edgeType: ArticleRefCandidate["edgeType"]; reverse?: boolean } {
  if (EXEMPTION_LEADS.some((re) => re.test(lead))) return { edgeType: "EXEMPTS_FROM" };
  if (REVERSE_EXEMPTION_LEADS.some((re) => re.test(lead))) return { edgeType: "EXEMPTS_FROM", reverse: true };
  if (QUALIFIER_LEADS.some((re) => re.test(lead))) return { edgeType: "SUBJECT_TO" };
  const near = text.slice(Math.max(0, mention.start - 40), mention.start) + mention.prefix;
  if (VIOLATION_LEAD.test(near) && PENALTY_WORD.test(sentenceAround(text, mention.start, mention.end))) {
    return { edgeType: "PENALIZES" };
  }
  return { edgeType: "CITES_ARTICLE" };
}

/** Link weights per type: what retrieval multiplies a hop's transfer by. */
const REF_WEIGHT: Readonly<Record<ArticleRefCandidate["edgeType"], number>> = {
  EXEMPTS_FROM: 1.25,
  PENALIZES: 1.2,
  SUBJECT_TO: 1.1,
  CITES_ARTICLE: 0.9,
};

/** The edges of one article from its scanned references, once every law is in `lawMap`. */
export function resolveArticleEdges(
  node: { node_key: string; law_slug: string | null; is_page_numbered: boolean; refs: readonly ArticleRefCandidate[] },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  if (!node.law_slug || node.is_page_numbered) return [];
  const currentLaw = lawMap.get(node.law_slug);
  if (!currentLaw) return [];

  const edges = new Map<string, GraphEdgePayload>();
  const addEdge = (targetKey: string, edgeType: GraphEdgeType, weight: number, evidence: string, sourceKey = node.node_key) => {
    if (!targetKey || !sourceKey || targetKey === sourceKey) return;
    const dedupeKey = `${sourceKey}|${targetKey}|${edgeType}`;
    if (!edges.has(dedupeKey)) {
      edges.set(dedupeKey, {
        source_key: sourceKey,
        target_key: targetKey,
        edge_type: edgeType,
        origin: "auto_watchdog",
        weight,
        evidence: evidence.slice(0, 180),
      });
    }
  };

  // The strongest kind wins per named article: an exception, then a condition,
  // then a penalty; a plain citation only for articles none of those named.
  // A reversed exception («فيما عدا ما ورد في المادة ٥») runs from the named
  // article to this one: article 5 is the exception.
  const linkedTargets = new Set<string>();
  for (const kind of ["EXEMPTS_FROM", "SUBJECT_TO", "PENALIZES", "CITES_ARTICLE"] as const) {
    for (const ref of node.refs) {
      if (ref.edgeType !== kind) continue;
      const targetKey = targetLawFor(ref.after, currentLaw, lawMap)?.articleKeyByNumber.get(ref.num);
      if (!targetKey || linkedTargets.has(targetKey)) continue;
      linkedTargets.add(targetKey);
      if (ref.reverse) addEdge(node.node_key, kind, REF_WEIGHT[kind], ref.evidence, targetKey);
      else addEdge(targetKey, kind, REF_WEIGHT[kind], ref.evidence);
    }
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

/** «من نظام …», «من النظام الأساسي …», «من اللائحة التنفيذية لنظام …»: the document a mention names. */
const NAMED_DOC_RE = /^\s*من\s+((?:نظام|النظام|اللائحة|لائحة|قواعد|تنظيم)\s+[^\n،.;:()]{3,55})/;

/**
 * The library document a principle or decree names right after its article
 * numbers. A reference to a regulation («من اللائحة …») never resolves to the
 * law it implements: article N of the regulation is not article N of the law.
 */
function namedDocAfter(after: string, lawMap: LawIndexMap): LawIndexEntry | null {
  const m = NAMED_DOC_RE.exec(after);
  if (!m) return null;
  const law = findLawByTitleFragment(m[1], lawMap);
  if (!law) return null;
  if (/^(?:ال)?لائحة/.test(m[1]) && !/لائح/.test(law.title)) return null;
  return law;
}

/** Edges from one text to every article it names as «المادة/المواد … من نظام <title>». */
function namedArticleEdges(
  sourceKey: string,
  text: string,
  lawMap: LawIndexMap,
  edgeType: "INTERPRETS_ARTICLE" | "AMENDS_ARTICLE",
  weight: number,
  lead?: RegExp,
): GraphEdgePayload[] {
  const edges = new Map<string, GraphEdgePayload>();
  for (const mention of findArticleMentions(text)) {
    if (lead) {
      const before = text.slice(Math.max(0, mention.start - 40), mention.start) + mention.prefix;
      if (!lead.test(before)) continue;
    }
    const law = namedDocAfter(textAfterMention(text, mention.end, 90), lawMap);
    if (!law) continue;
    const evidence = mentionEvidence(text, mention, 60);
    for (const num of mention.numbers) {
      const targetKey = law.articleKeyByNumber.get(num);
      if (!targetKey || targetKey === sourceKey) continue;
      const k = `${sourceKey}|${targetKey}`;
      if (!edges.has(k)) {
        edges.set(k, {
          source_key: sourceKey,
          target_key: targetKey,
          edge_type: edgeType,
          origin: "auto_watchdog",
          weight,
          evidence,
        });
      }
    }
  }
  return [...edges.values()];
}

/** True when a text may name an article (the cheap test before the full scan). */
export function mayNameArticle(text: string): boolean {
  return /م[ً-ْ]*ا[ً-ْ]*د|مواد/.test(text);
}

/**
 * Extracts `INTERPRETS_ARTICLE` edges from Judicial Principles that cite
 * `"المادة (X) من نظام <Law Title>"` — also lists, ranges and spelled-out numbers.
 */
export function extractPrincipleInterpretationEdges(
  principleNode: { node_key: string; display_text: string },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  return namedArticleEdges(principleNode.node_key, principleNode.display_text, lawMap, "INTERPRETS_ARTICLE", 1.15);
}

/** «تعديل / إضافة / حذف / إلغاء (حكم|نص)? المادة …»: the lead-in of an amendment. */
const AMENDMENT_LEAD = /(?:تعديل|إضافة|حذف|إلغاء)\s+(?:حكم\s+|نص\s+)?(?:ال)?$/;

/**
 * Extracts `AMENDS_ARTICLE` edges from Royal Decrees that cite `"تعديل المادة (X) من نظام <Law Title>"`.
 */
export function extractDecreeAmendmentEdges(
  decreeNode: { node_key: string; display_text: string },
  lawMap: LawIndexMap,
): GraphEdgePayload[] {
  return namedArticleEdges(decreeNode.node_key, decreeNode.display_text, lawMap, "AMENDS_ARTICLE", 1.2, AMENDMENT_LEAD);
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

// ── 7. Defined terms (`term` nodes, `DEFINES_TERM`) ──────────────────────────

/** «يقصد بالألفاظ والعبارات الآتية… المعاني المبينة أمامها»: the opening of a definitions article. */
const DEFINITIONS_LEAD =
  /يُ?قصد\s+ب(?:ال)?(?:ألفاظ|الفاظ|كلمات|عبارات|مصطلحات|تعبيرات)|تعني\s+(?:ال)?(?:ألفاظ|كلمات|عبارات|مصطلحات)|يكون\s+لل(?:ألفاظ|كلمات|عبارات|مصطلحات)|لل(?:ألفاظ|مصطلحات|كلمات)\s+(?:والعبارات\s+)?الآتية|المعاني\s+(?:المبينة|الموضحة|المحددة)/u;
/** One «المصطلح: تعريفه» line of a definitions list (markdown bold and list marks removed first). */
const DEFINITION_LINE =
  /^[\s\-–•>]*(?:\(?[0-9٠-٩]{1,3}\s*[).\-–]\s*|\(?[أ-ي]\s*[).\-–]\s+)?([^:\n]{2,45}?)\s*[:：]\s*(.+)$/u;
/** «ويقصد بمصطلح "الإتاوات" …»: one definition inside an ordinary article. */
const INLINE_DEFINITION =
  /يُ?قصد\s+ب(?:مصطلح|عبارة|كلمة|لفظ|لفظة|تعبير)?\s*[«"“]([^»"”\n]{2,40})[»"”]\s*(?:المستخدم[ةه]?\s+[^،,\n]{0,40}\s+)?([^\n]{20,320})/gu;

/**
 * Terms every law defines as a label for itself or an authority (الوزارة، الهيئة،
 * المجلس…): they mean a different body in each law and would join unrelated laws.
 */
const BOILERPLATE_TERMS = new Set(
  [
    "الهيئة", "الوزارة", "الوزير", "المجلس", "الرئيس", "النظام", "اللائحة", "اللوائح", "القواعد", "الضوابط",
    "المحافظ", "المملكة", "الجهة المختصة", "الجهات المختصة", "الرئيس التنفيذي", "مجلس الإدارة", "الأمين العام",
    "الأمانة", "الوكالة", "الوكيل", "المدير العام", "المدير", "الصندوق", "المركز", "المؤسسة", "الإدارة",
    "الجهة", "المحكمة", "الديوان", "الترتيبات التنظيمية", "التنظيم", "الاتفاقية", "الدولة", "الدول الأعضاء",
    "اللجنة", "الهيئة العامة", "الأمير", "البلدية", "المحافظة", "المنطقة", "الجامعة", "الكلية", "الشركة",
    "البنك", "البنك المركزي", "المصرف", "المجمع", "الإدارة العامة", "المستشفى", "المعهد", "السجل", "الدليل",
    "الخطة", "الاستراتيجية", "البرنامج", "المنصة", "النظام الأساسي", "الوزارة المختصة", "اللائحة التنفيذية",
    "الأمانة العامة", "الإدارة المختصة", "الجهات ذات العلاقة", "الجهات المعنية", "الجهة المشرفة", "الوحدة",
  ].map((t) => normalizeArabicKey(t)),
);

/** A definition that only names a document («نظام الشركات الصادر بالمرسوم…») defines nothing. */
const DOCUMENT_REFERENCE_DEFINITION = /^(?:ال)?(?:نظام|لائحة|قرار|مرسوم|أمر|قواعد|ضوابط|تنظيم|اتفاقية)\s[^\n]{0,80}(?:الصادر|الصادرة|الموافق)/u;

const MAX_TERMS_PER_ARTICLE = 80;
const TERM_DEFINITION_MAX_CHARS = 320;

export interface TermDefinition {
  /** As the law writes it («الأجر الفعلي»). */
  term: string;
  /** `normalizeArabicKey(term)`: the same term in every law. */
  normalized: string;
  definition: string;
}

function keepDefinition(term: string, definition: string): TermDefinition | null {
  const cleanTerm = term
    .replace(/[«»"“”()[\]]/g, "")
    .replace(/^[\s\-–.]*(?:[0-9٠-٩]{1,3}|[أ-ي]ـ?)\s*[-–.)]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = normalizeArabicKey(cleanTerm);
  const def = definition.replace(/\s+/g, " ").trim();
  if (!normalized || /[0-9٠-٩۰-۹]/.test(normalized) || normalized.split(" ").length > 5) return null;
  if (BOILERPLATE_TERMS.has(normalized) || def.length < 35) return null;
  if (DOCUMENT_REFERENCE_DEFINITION.test(def)) return null;
  // «اللجنة الوطنية: اللجنة الوطنية للتربية…» only spells the name out.
  if (normalizeArabicKey(def).startsWith(normalized)) return null;
  // detach: the watchdog keeps these until every law is streamed, not the article texts.
  return { term: detach(cleanTerm), normalized: detach(normalized), definition: detach(def.slice(0, TERM_DEFINITION_MAX_CHARS)) };
}

/**
 * The terms an article defines: the «المصطلح: تعريفه» lines after a definitions
 * lead-in, and «يقصد بمصطلح "…"» sentences. Only the article's own words (not a
 * fused regulation), boilerplate labels and name-only definitions left out.
 */
export function extractDefinitions(displayText: string): TermDefinition[] {
  const text = lawOwnText(displayText);
  const out = new Map<string, TermDefinition>();
  const add = (d: TermDefinition | null) => {
    if (d && !out.has(d.normalized) && out.size < MAX_TERMS_PER_ARTICLE) out.set(d.normalized, d);
  };
  const lead = DEFINITIONS_LEAD.exec(text);
  if (lead) {
    for (const raw of text.slice(lead.index).split("\n").slice(1, 200)) {
      // Markdown bold, table pipes and heading marks («### ٣ -. أصل الوثيقة: …», «| المرخص له: | …»).
      const line = raw.replace(/\*+/g, "").replace(/\|/g, " ").replace(/^\s*#+\s*/, "");
      const m = DEFINITION_LINE.exec(line);
      if (m) add(keepDefinition(m[1], m[2]));
    }
  }
  for (const m of text.matchAll(INLINE_DEFINITION)) add(keepDefinition(m[1], m[2]));
  return [...out.values()];
}

/** One definition as the watchdog keeps it until every law is streamed. */
export interface DefinitionRecord extends TermDefinition {
  articleKey: string;
  lawSlug: string;
  lawTitle: string;
}

/** `node_key` of the term node for a normalized term. */
export function termNodeKey(normalized: string): string {
  return `term:${normalized}`;
}

const TERM_NODE_MAX_LAWS = 8;

/**
 * One `term` node per normalized term, with the definitions of up to eight
 * laws in its text, and a `DEFINES_TERM` link from every defining article.
 * Retrieval uses a term only to bring in the definition from the laws a
 * question already reached, so a term defined in 100 regulations is not a
 * bridge between them.
 */
export function buildTermGraph(records: readonly DefinitionRecord[]): { nodes: GraphNodePayload[]; edges: GraphEdgePayload[] } {
  const byTerm = new Map<string, DefinitionRecord[]>();
  for (const r of records) {
    if (termNodeKey(r.normalized).length > MAX_NODE_KEY_LENGTH) continue;
    const list = byTerm.get(r.normalized) ?? [];
    list.push(r);
    byTerm.set(r.normalized, list);
  }

  const nodes: GraphNodePayload[] = [];
  const edges: GraphEdgePayload[] = [];
  for (const [normalized, defs] of [...byTerm].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const key = termNodeKey(normalized);
    const lawSlugs = [...new Set(defs.map((d) => d.lawSlug))];
    // The surface form most laws use.
    const formCount = new Map<string, number>();
    for (const d of defs) formCount.set(d.term, (formCount.get(d.term) ?? 0) + 1);
    const title = [...formCount].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    const shown: string[] = [];
    const seenLaw = new Set<string>();
    for (const d of defs) {
      if (seenLaw.has(d.lawSlug) || shown.length >= TERM_NODE_MAX_LAWS) continue;
      seenLaw.add(d.lawSlug);
      shown.push(`— في ${d.lawTitle}: ${d.definition}`);
    }
    const displayText = clipBody(
      [`تعريف «${title}»:`, ...shown, lawSlugs.length > shown.length ? `ومعرَّف كذلك في ${lawSlugs.length - shown.length} مستند آخر.` : ""]
        .filter(Boolean)
        .join("\n"),
      4_000,
    );
    const header = `مصطلح نظامي معرَّف | عدد المستندات المعرِّفة: ${lawSlugs.length}`;
    nodes.push({
      node_key: key,
      node_type: "term",
      source_id: normalized,
      law_slug: null,
      collection_id: null,
      article_number: null,
      doc_status: "active",
      item_status: "active",
      is_page_numbered: false,
      is_embeddable: true,
      title,
      url: "",
      display_text: displayText,
      contextual_header: header,
      content_sha256: sha256Hex(buildEmbeddingInput({ contextual_header: header, title, display_text: displayText })),
      metadata: { law_count: lawSlugs.length, laws: lawSlugs.slice(0, 20) },
    });
    const seenArticle = new Set<string>();
    for (const d of defs) {
      if (seenArticle.has(d.articleKey)) continue;
      seenArticle.add(d.articleKey);
      edges.push({
        source_key: d.articleKey,
        target_key: key,
        edge_type: "DEFINES_TERM",
        origin: "auto_watchdog",
        weight: 1.0,
        evidence: `«${d.term}»: ${d.definition}`.slice(0, 180),
      });
    }
  }
  return { nodes, edges };
}

// ── 8. Law-level links: penalty articles, repeal clauses ─────────────────────

/** `PENALIZES` from a penalty article to its own law's node: «كل من خالف أحكام هذا النظام». */
export function lawPenaltyEdge(articleKey: string, lawNodeKey: string, displayText: string): GraphEdgePayload {
  const own = lawOwnText(displayText);
  const hit = PENALTY_ARTICLE_RE.exec(own);
  const at = hit ? hit.index : 0;
  return {
    source_key: articleKey,
    target_key: lawNodeKey,
    edge_type: "PENALIZES",
    origin: "auto_watchdog",
    weight: 1.0,
    evidence: sentenceAround(own, at + 1, at + 2).trim().slice(0, 180) || null,
  };
}

/** «يلغي هذا النظام نظام … الصادر…», «يحل هذا النظام محل …»: the document a law repeals. */
const REPEAL_CLAUSE =
  /(?:يلغي|يُلغي|تلغي|تُلغي|يلغى|يُلغى|تلغى|تُلغى|ويلغي|ويُلغي|وتلغى|ويلغى|ويُلغى)\s+(?:هذا\s+(?:النظام|التنظيم)\s+|هذه\s+(?:اللائحة|القواعد|الضوابط)\s+)?((?:ال)?(?:نظام|لائحة|تنظيم|قواعد|ضوابط)\s+[^\n.؛]{3,140})|(?:يحل|تحل)\s+(?:هذا\s+(?:النظام|التنظيم)|هذه\s+(?:اللائحة|القواعد|الضوابط))\s+محل\s+([^\n.؛]{3,140})/gu;
/** Where a cited title stops: «… الصادر بالمرسوم…», «… لعام 1426هـ». */
const TITLE_TAIL = /\s+(?:الصادر|الصادره|المقر|المقره|الموافق|المعتمد|المعتمده|بالمرسوم|بقرار|رقم|لعام|لسنه|وتاريخ)(?:\s.*)?$/u;

/** A title without its issue tail and year: what a repeal clause and a library title share. */
export function titleCore(title: string): string {
  return normalizeArabicKey(title).replace(TITLE_TAIL, "").replace(/\s+\d+\s*ه?$/u, "").trim();
}

/** The cited titles of every repeal clause in an article's own words. */
export function scanRepealClauses(displayText: string): string[] {
  const text = lawOwnText(displayText);
  const out: string[] = [];
  for (const m of text.matchAll(REPEAL_CLAUSE)) {
    const core = titleCore(m[1] ?? m[2] ?? "");
    if (core.split(" ").length >= 2 && !out.includes(core)) out.push(detach(core));
  }
  return out;
}

/**
 * `SUPERSEDES_LAW` between law nodes (new → old) from `supersedes_law_slug` and
 * from repeal clauses. A clause resolves only when exactly one other library
 * law has that title (a repealed one preferred when several do): a guess
 * between two versions of a law would link the wrong one.
 */
export function resolveLawSupersession(
  lawSlug: string,
  repealCores: readonly string[],
  lawMap: LawIndexMap,
  coreIndex: ReadonlyMap<string, readonly LawIndexEntry[]>,
): GraphEdgePayload[] {
  const current = lawMap.get(lawSlug);
  if (!current?.lawNodeKey) return [];
  const out = new Map<string, GraphEdgePayload>();
  const add = (old: LawIndexEntry | undefined, evidence: string) => {
    if (!old?.lawNodeKey || old.slug === current.slug || out.has(old.slug)) return;
    out.set(old.slug, {
      source_key: current.lawNodeKey as string,
      target_key: old.lawNodeKey,
      edge_type: "SUPERSEDES_LAW",
      origin: "auto_watchdog",
      weight: 1.0,
      evidence: evidence.slice(0, 180),
    });
  };
  if (current.supersedesLawSlug) {
    const old = lawMap.get(current.supersedesLawSlug);
    add(old, `يحل محل: ${old?.title ?? ""}`);
  }
  const isRepealed = (e: LawIndexEntry) => (e.status ?? "").toLowerCase() === "repealed";
  const ownCore = titleCore(current.title).replace(/\s+/g, "");
  for (const core of repealCores) {
    const candidates = (coreIndex.get(core) ?? []).filter((e) => e.slug !== current.slug);
    const repealed = candidates.filter(isRepealed);
    const pick = candidates.length === 1 ? candidates[0] : repealed.length === 1 ? repealed[0] : undefined;
    if (!pick) continue;
    // A repealed law cannot have replaced one still in force, and a law that
    // repeals its own name (an older version) is only safe when the library
    // marks the other copy repealed: otherwise either copy could be the old one.
    if (isRepealed(current) && !isRepealed(pick)) continue;
    if (core.replace(/\s+/g, "") === ownCore && !(isRepealed(pick) && !isRepealed(current))) continue;
    add(pick, `يلغي: ${pick.title}`);
  }
  return [...out.values()];
}

/** title core → the laws that carry it (for `resolveLawSupersession`). */
export function buildTitleCoreIndex(lawMap: LawIndexMap): Map<string, LawIndexEntry[]> {
  const index = new Map<string, LawIndexEntry[]>();
  for (const e of lawMap.values()) {
    const core = titleCore(e.title);
    if (!core) continue;
    const list = index.get(core) ?? [];
    list.push(e);
    index.set(core, list);
  }
  return index;
}

// ── 9. The library's own regulation links ────────────────────────────────────

/** One `article_regulations` row, kept for `resolveRegulationEdges` once every law is indexed. */
export interface RegulationLinkCandidate {
  /** `article:<id>` of the system article the regulation text hangs on. */
  article_key: string;
  law_slug: string;
  ref?: string | null;
  reg_num?: string | number | null;
  status?: string | null;
}

/** normalised title → the laws that carry it (for `resolveRegulationEdges`). */
export function buildNormalizedTitleIndex(lawMap: LawIndexMap): Map<string, LawIndexEntry[]> {
  const index = new Map<string, LawIndexEntry[]>();
  for (const e of lawMap.values()) {
    if (!e.normalizedTitle) continue;
    const list = index.get(e.normalizedTitle) ?? [];
    list.push(e);
    index.set(e.normalizedTitle, list);
  }
  return index;
}

/**
 * «12» / «١٢» → 12. Anything else is not one whole article and gives null:
 * «12/3», «12.5», «12 مكرر», «12 أ», «5 فقرة 2», «جدول الغرامات رقم 9», a
 * section name. The library's reg_num holds only digits when it names one
 * article (13,304 of the ~15.7k rows), so nothing else is guessed at.
 */
export function wholeRegulationNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!/^[0-9٠-٩۰-۹]{1,4}$/.test(text)) return null;
  const n = parseArabicArticleNumber(text);
  return n !== null && n > 0 ? n : null;
}

/**
 * `IMPLEMENTED_BY` (system article → the article of its executive regulation
 * that implements it), from the library's own article_regulations rows: `ref`
 * names the regulation document, `reg_num` its article. The regulation's text
 * already sits inside the system article's node; this link joins the two
 * documents so an answer that lands on the regulation article finds the
 * system article it implements, and the explorer shows the pair.
 *
 * A link is made only when the reference is certain: one whole article number,
 * a title that names exactly one in-force library document, never the
 * article's own law, and an
 * article with that number in the regulation.
 */
export function resolveRegulationEdges(
  candidates: readonly RegulationLinkCandidate[],
  lawMap: LawIndexMap,
  titleIndex: ReadonlyMap<string, readonly LawIndexEntry[]>,
): GraphEdgePayload[] {
  const out = new Map<string, GraphEdgePayload>();
  for (const c of candidates) {
    if ((c.status ?? "active").toLowerCase() === "repealed") continue;
    const num = wholeRegulationNumber(c.reg_num);
    const refKey = normalizeArabicKey(c.ref ?? "");
    if (num === null || !refKey || !lawMap.has(c.law_slug)) continue;
    const docs = (titleIndex.get(refKey) ?? []).filter((e) => e.slug !== c.law_slug);
    const inForce = docs.filter((e) => (e.status ?? "").toLowerCase() !== "repealed");
    const doc = inForce.length === 1 ? inForce[0] : undefined;
    const targetKey = doc?.articleKeyByNumber.get(num);
    if (!doc || !targetKey || targetKey === c.article_key) continue;
    const key = `${c.article_key}|${targetKey}`;
    if (out.has(key)) continue;
    out.set(key, {
      source_key: c.article_key,
      target_key: targetKey,
      edge_type: "IMPLEMENTED_BY",
      origin: "auto_watchdog",
      weight: 0.9,
      evidence: `${doc.title} — المادة ${num}`.slice(0, 180),
    });
  }
  return [...out.values()];
}
