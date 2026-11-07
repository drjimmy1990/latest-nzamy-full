// ─── Types ────────────────────────────────────────────────────────────────────
export type ArticleStatus =
  | "active"
  | "repealed"
  | "amended"
  | "suspended"
  | "added"
  | "merged"
  | "status_undeclared";

/**
 * A reader-facing notice on an article's status. Owner answer ٢٥٩ (أ): an
 * article with no recorded status shows nothing — the old «لم يُتحقّق من …»
 * notice is gone, and no status is invented in its place. Every other status
 * keeps its own presentation (the repeal toggle, the badges), so there is no
 * notice left to give: always null. Kept as the one switch its three callers
 * (the reader and both search cards) read.
 */
export function articleStatusNotice(_status: ArticleStatus, _isRTL: boolean): string | null {
  return null;
}

/** Historical-text toggle is exclusively for an explicit repeal status. */
export function isRepealedArticleStatus(status: ArticleStatus): boolean {
  return status === "repealed";
}

export interface AmendmentEntry {
  date: string | null;
  source: string | null;
  /** T28-22: true when the amending instrument and its date are withheld
   *  from a non-subscriber (the API sends them as null). */
  sourceLocked?: boolean;
  summary: string;
  fullText: string;
}

export interface ExecutiveRegulation {
  ref: string;
  text: string;
  regNum?: string | null;
  status?: string;
  isSecondaryDisplay?: boolean;
}

// One secondary instrument's own articles, flattened across every نظام
// article it's attached to and pre-sorted/deduplicated server-side (excludes
// is_secondary_display duplicates) — powers the "اللائحة وحدها" flat view.
export interface RegulationInstrument {
  ref: string;
  articles: {
    regNum: string | null;
    text: string;
    status: string;
    systemArticleNumber: string | null;
  }[];
}

export interface JudicialPrinciple {
  id: string;
  source: string;  // مصدر المبدأ مثل: المحكمة العليا، ديوان المظالم
  ref: string;     // رقم الحكم أو المرجع
  text: string;    // نص المبدأ
}

export interface JudicialPrecedent {
  id: string;
  court: string;   // المحكمة
  caseNum: string; // رقم القضية
  year: string;    // سنة الحكم
  summary: string; // ملخص الحكم
  relevance: string; // صلته بالمادة
}

export interface LawArticle {
  id: string;
  num: string;
  /** Numeric article number as the source states it. */
  number?: number | string | null;
  /** The source's own written locator, e.g. "السادسة والأربعون". */
  numberText?: string | null;
  title: string;
  status: ArticleStatus;
  free: boolean;
  text: string;
  instrument?: string;
  executiveReg?: ExecutiveRegulation;
  regulations?: ExecutiveRegulation[];
  amendments?: AmendmentEntry[];
  /**
   * ⚠️ Never populated. The corpus has no repeal-provenance field: all 41,845
   * ARTICLE_START anchors were surveyed and none carries one, so filling these
   * would mean inventing a legal citation (rule ق-2). Kept because the reader
   * already guards on their absence and may get a real source later.
   */
  repealedBy?: string;
  repealedDate?: string;
  /**
   * Superseded wording recovered from the source. For a repealed article this
   * is the article's entire substance — `text` is legitimately empty.
   */
  originalText?: string;
  /** Historic executive-regulation text found in the article's history block. */
  historicRegulationText?: string;
  /**
   * Owner 2026-11-07: the line that introduced the regulation at the end of
   * `text` («اللائحة التنفيذية لنظام المرور (…)»), lifted out by the law API
   * for an unlocked article with regulation rows — the subtitle of the
   * reader's «اللائحة التنفيذية» section.
   */
  regulationHeading?: string;
  principles?: JudicialPrinciple[];
  precedents?: JudicialPrecedent[];
}

export interface LawChapter {
  title: string;
  articles: LawArticle[];
  /**
   * Two-level chapters (2026-10-04, migration 20261004_02). All optional: the
   * detail API sends them once it carries library.chapters.id / level /
   * parent_chapter_id; a chapter without them renders exactly as the flat list
   * always did (see [slug]/_chapter-tree.ts).
   */
  id?: string;
  /** 1 = top-level heading («الباب»), 2 = a chapter under the level-1 heading before it. */
  level?: 1 | 2;
  /** For level 2: the id of its level-1 chapter; null/absent = shown as a top-level chapter. */
  parentChapterId?: string | null;
}

export interface LawAppendix {
  id: string;
  type: "جدول" | "ملحق";
  title: string;
  content: string;
}

export type LawDocumentType =
  | "نظام"
  | "لائحة"
  | "لائحة تنفيذية"
  | "نظام_ولائحة"
  | "قرار"
  | "تعميم"
  | "قواعد"
  | "ضوابط"
  | "أمر سامي"
  | "دليل"
  | "دليل إرشادي"
  | "دليل إرشادي / تنظيم إداري"
  | "سياسة"
  | "جداول"
  | "تعليمات"
  | "ملحق"
  | "ضوابط التنفيذ";

/** Document-level lifecycle/archival status, distinct from ArticleStatus. */
export type LawStatus =
  | "active"
  | "partially_active"
  | "deferred_effective"
  | "issued_publication_unverified"
  | "suspended"
  | "repealed"
  | "superseded_duplicate"
  | "merged_into_parent"
  | "status_undeclared";

export interface LawSystem {
  // ── الحقول الأساسية الحالية ──
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  issuanceDecree: string;        // مرسوم ملكي رقم (م/51) وتاريخ 1426هـ
  issuanceDate: string;          // 1426/8/23هـ
  source: string;                // جمعية قضاء / هيئة الخبراء / وزارة العدل
  preamble: string;              // نص الديباجة
  chapters: LawChapter[];
  regulationPreamble?: string;   // نص ديباجة اللائحة
  regulationInstruments?: RegulationInstrument[]; // العرض المسطَّح "اللائحة وحدها"
  /** F13 — regulation articles withheld by the paywall */
  regulationInstrumentsLocked?: number;
  appendices?: LawAppendix[];    // جداول/ملاحق مستوى الوثيقة (اختياري — أنظمة قليلة فقط)
  /** Registry identity of the parent instrument, not a BOE law_guid. */
  parentLawId?: string;
  /** Verbatim display name stated by the secondary instrument itself. */
  parentLaw?: string;
  enablingArticle?: string;
  /** Present only when the API resolved one safe, unambiguous parent row. */
  parentLawLink?: { slug: string; title: string } | null;

  /**
   * The document's kind exactly as the source states it, straight from
   * `library.laws.type`. Kept separate from the curated `document_type` union
   * below, which comes from law-metadata-map.ts and covers only a handful of
   * hand-listed laws.
   */
  documentType?: string;

  // ── حقول البطاقة التعريفية — كلها اختيارية ──
  document_type?: LawDocumentType;          // نوع الوثيقة
  section_code?: string;                    // "06" (رمز القسم)
  section_name?: string;                    // "القسم العمالي"
  issuing_authority?: string;               // "مجلس الوزراء"
  cabinet_decision?: string;               // "قرار مجلس الوزراء رقم (219) وتاريخ ..."
  latestAmendmentDecree?: string;           // "مرسوم ملكي (م/44) وتاريخ 1446هـ"
  latestAmendmentDate?: string;             // "1446هـ"
  total_articles?: number;                  // 245
  has_executive_reg?: boolean;              // هل تحتوي لائحة تنفيذية مدمجة
  regulation_decree?: string;               // رقم أداة اللائحة التنفيذية
  boe_url?: string;                         // رابط هيئة الخبراء
  law_status?: LawStatus;                   // حالة النظام (مختلف عن ArticleStatus)
  /** N2.1: the file's identity card (subscribers only, owner ٢٦٠); absent when the preamble has none. */
  metadata_card?: {
    main: { key: string; value: string }[];
    more: { key: string; value: string }[];
  };
  /** N2.1: the موجز as Markdown, lifted out of the preamble; '' / absent when there is none. */
  summary?: string;
  /** The file's own label for it («📝 موجز المستند (خلاصة سريعة)», «📝 موجز الذكاء الاصطناعي»). */
  summaryLabel?: string;
}

// ─── Feqh Book & Principles Types ──────────────────────────────────────────────
export interface FeqhBlock {
  id: string;
  topic: string;
  /**
   * NULL when the source states no volume. It used to be hardcoded to 1 by the
   * parser for every book; 116,828 blocks now carry a real volume. Render via
   * `formatLocator` in book/[slug]/_locator.ts — interpolating this directly
   * prints the literal string "null".
   */
  vol: number | null;
  page: number | null;
  /** Verbatim source tokens — not always numeric ("مقدمة", "7-1"). */
  volLabel?: string | null;
  pageLabel?: string | null;
  matn: string;
  sharh: string;
  hashiyah: string[];
}

export interface FeqhSection {
  title: string;
  blocks: FeqhBlock[];
}

export interface FeqhChapter {
  title: string;
  sections: FeqhSection[];
}

export interface FeqhBookVolume {
  number: number | string;
  title: string;
}

export interface FeqhBookSystem {
  id: string;
  title: string;
  author: string;
  school: string;
  investigator: string;
  publisher: string;
  totalVolumes: number;
  chapters: FeqhChapter[];
  volumes?: FeqhBookVolume[];
}

export interface PrincipleDetail {
  ruling_basis?: string;
  facts?: string;
  reasons?: string;
  ruling?: string;
  [key: string]: string | undefined;
}

export interface JudicialParagraph {
  letter: string;
  keywords: string[];
  text: string;
}

export interface JudicialPrincipleItem {
  id: string;
  number: string;
  issuing_body: string;
  session_date: string;
  decision_number: string;
  reference: string;
  classification_keywords: string[];
  text: string;
  paragraphs?: JudicialParagraph[];
  details: PrincipleDetail;
}

export interface JudicialPrinciplesVolume {
  number: number | string;
  title: string;
  total_pages?: number;
  total_principles?: number;
  principles: JudicialPrincipleItem[];
}

export interface JudicialPrinciplesSystem {
  id: string;
  title: string;
  court: string;
  yearHijri: number;
  part?: number;
  sourceId: string;
  principles: JudicialPrincipleItem[];
  volumes?: JudicialPrinciplesVolume[];
  /** N2.4: the other volumes of its tagged series (null when it stands alone). */
  series?: import("@/lib/library/precedentVolumes").CollectionSeriesInfo | null;
  /** The route's paywall summary (hasFullAccess drives the volume locks). */
  paywall?: { hasFullAccess?: boolean };
}

// q390: the bundled نظام الشركات (COMPANIES_LAW, 17 articles of law text) and
// LAW_ARTICLES were deleted — no reader used them, and this module ships to
// the browser (articleStatusNotice). Law text is read from the database only.

export const PLANS = [
  { id: "library-only", name: "مكتبة قانونية", nameEn: "Library Only", price: "٤٩", priceEn: "49", features: ["وصول كامل للمكتبة", "تحديثات الأنظمة", "بحث متقدم"], featuresEn: ["Full library access", "Law updates", "Advanced search"], highlight: false },
  { id: "pro", name: "نظامي برو", nameEn: "Nezamy Pro", price: "١٤٩", priceEn: "149", features: ["كل مزايا المكتبة", "الصائغ بالذكاء الاصطناعي", "السكرتير القانوني", "٢٠٠ توكن/شهر"], featuresEn: ["All library features", "AI Legal Drafter", "Legal Secretary AI", "200 tokens/month"], highlight: true },
];
