/**
 * law-metadata-map.ts
 * ──────────────────────────────────────────────────────────────────────
 * Mapping ثابت يربط slug كل وثيقة قانونية بميتاداتا البطاقة التعريفية.
 * يُدمج هذا مع بيانات الـ JSON أثناء تحميل الصفحة لتجنب تعديل 100+ ملف.
 *
 * TODO (Backend): استبدل هذا بجدول قاعدة بيانات `law_metadata` في Supabase
 * يُستدعى عبر: SELECT * FROM law_metadata WHERE slug = $1
 * ──────────────────────────────────────────────────────────────────────
 */

import type { LawDocumentType, LawStatus } from "./data";

export interface RelatedDocument {
  title: string;
  slug: string;
  type: "law" | "precedent" | "book" | "order";
}

export interface LawMetaEntry {
  document_type?: LawDocumentType;
  section_code?: string;
  section_name?: string;
  issuing_authority?: string;
  cabinet_decision?: string;
  latestAmendmentDecree?: string;
  latestAmendmentDate?: string;
  total_articles?: number;
  has_executive_reg?: boolean;
  regulation_decree?: string;
  regulation_articles?: number; // عدد مواد اللائحة
  boe_url?: string;
  law_status?: LawStatus;
  issuanceDecree?: string;      // أداة إصدار النظام
  issuanceDate?: string;
  related_systems?: RelatedDocument[];
  related_principles?: RelatedDocument[];
  executive_label_override?: string; // مسمى مخصص للتبويب الثالث (مثلاً: القواعد، الضوابط، التعليمات)
}

/**
 * استدعاء: getLawMeta(slug) → يعيد الميتاداتا أو كائن فارغ
 */
export function getLawMeta(slug: string): LawMetaEntry {

  // ══════════════════════════════════════════════════════════════════════════
  // خريطة الـ slugs الشاملة — تحوّل أي slug (عربي أو إنجليزي) إلى مفتاح الـ MAP
  // مطابقة لـ SLUG_MAP في page.tsx
  // ══════════════════════════════════════════════════════════════════════════
  const SLUG_RESOLUTION: Record<string, string> = {
    // ── Arabic URL slugs → MAP keys ──────────────────────────────────────
    "نظام-الإثبات":                     "evidence-law",
    "نظام-الإجراءات-الجزائية":           "law-criminal-procedures",
    "نظام-المنافسات-والمشتريات-الحكومية": "law-procurement-scope",
    "نطاق-تطبيق-نظام-المنافسات-والمشتريات-الحكومية-ولائحته-التنفيذية": "law-procurement-scope",
    "نظام-الأحوال-الشخصية":             "law-personal-status",
    "نظام-الشركات":                      "companies-law",
    "نظام-العلامات-التجارية":            "law-trademarks",
    "نظام-العمل":                        "labor-law",
    "نظام-الوساطة-العقارية":             "law-real-estate-brokerage",
    "نظام-مراقبة-البنوك":               "law-banking-control",
    "نظام-مراقبة-البنوك-وقواعده-التنفيذية": "law-banking-control",
    "نظام-ضريبة-القيمة-المضافة":          "law-vat",
    "نظام-ضريبة-القيمة-المضافة-ولائحته-التنفيذية": "law-vat",
    "نظام-الضمان-الصحي-التعاوني":        "law-health-insurance",
    "نظام-المياه":                        "law-water",
    "نظام-حماية-البيانات-الشخصية":       "law-personal-data-protection",
    "نظام-الطيران-المدني":               "law-civil-aviation",
    "اللائحة-التنفيذية-لنظام-الكهرباء-الخاصة-بمهام-وزارة-الطاقة": "reg-electricity-energy-ministry",
    "نظام-الاعلام-المرئي-والمسموع":       "law-audiovisual-media",
    "النظام-الاساسي-للحكم":             "law-basic-governance",
    "نظام-الاعلاف":                      "law-fodder",
    "نظام-الاستثمار":                    "law-investment",
    "تنظيم-المركز-الوطني-للتعليم-الالكتروني": "reg-national-elearning-center",
    "النظام-الاساسي-لمركز-التحكيم-الرياضي-السعودي": "law-sports-arbitration",
    "نظام-نقابة-السيارات-لعام-1372هـ":   "law-car-syndicate-1372",
    "نظام-خدمة-الضباط":                  "law-officers-service",
    "نظام-مكافحة-المخدرات":               "anti-narcotics-law",
    "نظام-مكافحة-المخدرات-والمؤثرات-العقلية": "anti-narcotics-law",
    "anti-narcotics":                    "anti-narcotics-law",
    "anti-narcotics-law":                "anti-narcotics-law",
    "لائحة-اللائحة-التنفيذية-لنظام-الجمعيات-والمؤسسات-الاهلية-نهائية": "reg-civil-associations",
    "نظام-السياحة":                      "law-tourism",
    "نظام-البلديات-والقرى":             "law-municipalities",
    "نظام-الآثار-والمتاحف-والتراث-العمراني": "law-antiquities-museums",
    "نظام-التحكيم":                      "law-arbitration",
    "نظام-الجمارك-الموحد-ولائحته-التنفيذية": "law-customs",
    "نظام-المرافعات-الشرعية":            "civil-procedure-law",
    "نظام-المرافعات-الشرعية-جمعية-قضاء":  "civil-procedure-law",
    "امر-سامي-رقم-9437-وتاريخ-1439-02-26هـ-بالتاكيد-على-الجهات-الحكومية-بالتقيد-بما-استقر-عليه-قضاء-ديوان-المظالم-في-الموضوعات-المتماثلة": "order-royal-9437",
    // ── JSON file slugs (old style) → MAP keys ───────────────────────────
    "law-evidence":               "evidence-law",
    "law-companies":              "companies-law",
    "law-labor":                  "labor-law",
    // ── Short URL aliases ─────────────────────────────────────────────────
    "civil-transactions":         "civil-transactions-law",
    "civil-procedure":            "civil-procedure-law",
    "evidence":                   "evidence-law",
    "companies-law":              "companies-law",
    "labor-law":                  "labor-law",
    "companies":                  "companies-law",
    "labor":                      "labor-law",
    "product-safety-law-1446":    "product-safety-law-1446",
  };

  // 1. حاول الحل عبر خريطة الـ slugs الشاملة
  const resolved = SLUG_RESOLUTION[slug];
  if (resolved) {
    const fromMap = LAW_METADATA_MAP[resolved];
    if (fromMap) return fromMap;
  }

  // 2. مطابقة مباشرة (للمداخل التي مفتاحها = slug بالضبط)
  const directMatch = LAW_METADATA_MAP[slug];
  if (directMatch) return directMatch;

  // Fallback map for precedent collections and specific judgments
  if (slug === "tamyeez") {
    return {
      related_systems: [
        { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
        { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" },
        { title: "نظام الإثبات", slug: "evidence-law", type: "law" }
      ]
    };
  }
  if (slug.startsWith("labor-principles") || slug === "prec-03") {
    return {
      related_systems: [
        { title: "نظام العمل", slug: "labor-law", type: "law" }
      ]
    };
  }
  if (slug.startsWith("zakat-tax") || slug === "zakat-2024" || slug === "tax-2024") {
    return {
      related_systems: [
        { title: "نظام ضريبة الدخل", slug: "income-tax-law", type: "law" },
        { title: "نظام ضريبة القيمة المضافة", slug: "vat-law", type: "law" }
      ]
    };
  }
  if (slug.startsWith("customs-")) {
    return {
      related_systems: [
        { title: "نظام الجمارك الموحد لدول مجلس التعاون", slug: "customs-law", type: "law" }
      ]
    };
  }
  if (slug === "banking-1443" || slug === "banking-1408-1427") {
    return {
      related_systems: [
        { title: "نظام مراقبة البنوك", slug: "banking-control-law", type: "law" },
        { title: "نظام الأوراق التجارية", slug: "commercial-papers-law", type: "law" }
      ]
    };
  }
  if (slug === "commercial-papers" || slug === "prec-02") {
    return {
      related_systems: [
        { title: "نظام الأوراق التجارية", slug: "commercial-papers-law", type: "law" }
      ]
    };
  }
  if (slug === "insurance-1438" || slug === "insurance-principles") {
    return {
      related_systems: [
        { title: "نظام مراقبة شركات التأمين التعاوني", slug: "cooperative-insurance-law", type: "law" }
      ]
    };
  }
  if (slug.startsWith("admin-supreme") || slug === "prec-05") {
    return {
      related_systems: [
        { title: "نظام ديوان المظالم", slug: "court-of-grievances-law", type: "law" },
        { title: "نظام المرافعات أمام ديوان المظالم", slug: "administrative-procedures-law", type: "law" }
      ]
    };
  }
  if (slug === "supreme-judicial-council") {
    return {
      related_systems: [
        { title: "نظام القضاء", slug: "judiciary-law", type: "law" }
      ]
    };
  }
  if (slug === "prec-04") {
    return {
      related_systems: [
        { title: "نظام الإجراءات الجزائية", slug: "procedures-law", type: "law" }
      ]
    };
  }
  if (slug === "prec-06") {
    return {
      related_systems: [
        { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" }
      ]
    };
  }

  return {};
}

/**
 * fetchLawMetadata(slug)
 * ──────────────────────────────────────────────────────────────────────
 * Async version that queries the DB first (via /api/library/laws/[slug]),
 * mapping DB columns to LawMetaEntry fields. Falls back to the static
 * LAW_METADATA_MAP if the API returns nothing or fails.
 */
export async function fetchLawMetadata(slug: string): Promise<LawMetaEntry> {
  let normSlug = slug;
  if (slug === "civil-transactions") normSlug = "civil-transactions-law";
  else if (slug === "civil-procedure") normSlug = "civil-procedure-law";
  else if (slug === "evidence") normSlug = "evidence-law";

  try {
    const res = await fetch(`/api/library/laws/${encodeURIComponent(normSlug)}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();

    const dbMeta: LawMetaEntry = {};

    if (data.issuanceDecree) dbMeta.issuanceDecree = data.issuanceDecree;
    if (data.issuanceDate)   dbMeta.issuanceDate = data.issuanceDate;
    if (data.source)         dbMeta.boe_url = data.source;

    if (data.chapters && Array.isArray(data.chapters)) {
      let totalArticles = 0;
      let hasExecReg = false;
      for (const ch of data.chapters) {
        if (ch.articles) {
          totalArticles += ch.articles.length;
          for (const a of ch.articles) {
            if (a.regulations && a.regulations.length > 0) hasExecReg = true;
          }
        }
      }
      if (totalArticles > 0) dbMeta.total_articles = totalArticles;
      dbMeta.has_executive_reg = hasExecReg;
    }

    const staticMeta = getLawMeta(slug);
    return { ...staticMeta, ...dbMeta };
  } catch {
    return getLawMeta(slug);
  }
}

// ──────────────────────────────────────────────────────────────────────
// الخريطة الكاملة
// ──────────────────────────────────────────────────────────────────────
export const LAW_METADATA_MAP: Record<string, LawMetaEntry> = {

  // ━━━ القسم الإجرائي والقضائي (00) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "evidence-law": {
    document_type: "نظام",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/43) وتاريخ 1443/6/26هـ",
    has_executive_reg: false,
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" },
      { title: "نظام الإجراءات الجزائية", slug: "procedures-law", type: "law" }
    ],
    related_principles: [
      { title: "المبادئ القضائية في الإثبات", slug: "evidence-principles", type: "precedent" }
    ]
  } as LawMetaEntry,

  "civil-procedure-law": {
    document_type: "نظام",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    total_articles: 314,
    law_status: "active",
    related_systems: [
      { title: "نظام الإثبات", slug: "evidence-law", type: "law" },
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام التنفيذ", slug: "execution-law", type: "law" }
    ],
    related_principles: [
      { title: "مبادئ المرافعات الشرعية", slug: "civil-procedure-principles", type: "precedent" }
    ]
  } as LawMetaEntry,


  "administrative-procedures-law": {
    document_type: "نظام",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "execution-law": {
    document_type: "نظام_ولائحة",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "court-costs-law": {
    document_type: "نظام_ولائحة",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "وزير العدل",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "lawyering-law": {
    document_type: "نظام_ولائحة",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/38) وتاريخ 1422/7/28هـ",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم الجنائي والعقوبات (01) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "procedures-law": {
    document_type: "نظام",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/39) وتاريخ 1422/7/28هـ",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "قرار-النائب-العام-بشأن-الجرائم-الكبيرة-الموجبة-للتوقيف-ومذكرته-الإيضاحية": {
    document_type: "قرار",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "النائب العام",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "مكافحة-الرشوة": {
    document_type: "نظام",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "anti-narcotics-law": {
    document_type: "نظام",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "الأسلحة-والذخائر": {
    document_type: "نظام",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "هيئة-الرقابة-ومكافحة-الفساد": {
    document_type: "نظام",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "الانضباط-الوظيفي": {
    document_type: "نظام",
    section_code: "02",
    section_name: "الإداري والخدمة المدنية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم المدني والأحوال الشخصية (03) ━━━━━━━━━━━━━━━━━━━━━━━━━━
  "الهيئة-العامة-للولاية-على-أموال-القاصرين-ومن-في-حكمهم": {
    document_type: "نظام_ولائحة",
    section_code: "03",
    section_name: "المدني والأحوال الشخصية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "civil-transactions-law": {
    document_type: "نظام",
    section_code: "03",
    section_name: "المدني والأحوال الشخصية",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/191) وتاريخ 1444/11/29هـ",
    has_executive_reg: false,
    law_status: "active",
    related_systems: [
      { title: "نظام الإثبات", slug: "evidence-law", type: "law" },
      { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" },
      { title: "نظام الشركات", slug: "companies-law", type: "law" }
    ],
    related_principles: [
      { title: "مبادئ المعاملات المدنية", slug: "civil-principles", type: "precedent" }
    ]
  } as LawMetaEntry,


  // ━━━ القسم التجاري والشركات (04) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "companies-law": {
    document_type: "نظام_ولائحة",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/132) وتاريخ 1443/12/1هـ",
    issuanceDate: "1/12/1443هـ",
    cabinet_decision: "قرار مجلس الوزراء رقم (678) وتاريخ 1443/11/29هـ",
    has_executive_reg: true,
    total_articles: 242,
    regulation_decree: "قرار وزير التجارة رقم (284) وتاريخ 1444/6/23هـ",
    regulation_articles: 125,
    law_status: "active",
    related_systems: [
      { title: "نظام السجل التجاري", slug: "commercial-register-law", type: "law" },
      { title: "نظام الإفلاس", slug: "bankruptcy-law", type: "law" },
      { title: "نظام السوق المالية", slug: "capital-market-law", type: "law" },
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" }
    ],
    related_principles: [
      { title: "المبادئ القضائية للمحاكم التجارية", slug: "commercial-principles", type: "precedent" },
      { title: "قرارات المحكمة العليا التجارية", slug: "supreme-court-commercial", type: "precedent" }
    ],
  } as LawMetaEntry,

  "commercial-law": {
    document_type: "نظام_ولائحة",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "competition-law": {
    document_type: "نظام",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "الامتياز-التجاري": {
    document_type: "نظام",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم العمالي والتأمينات (06) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "labor-law": {
    document_type: "نظام_ولائحة",
    section_code: "06",
    section_name: "العمل والتأمينات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/51) وتاريخ 1426/8/23هـ",
    latestAmendmentDecree: "مرسوم ملكي (م/44) وتاريخ 1446/2/8هـ",
    latestAmendmentDate: "1446هـ",
    has_executive_reg: true,
    total_articles: 245,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم العقاري والبناء (07) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "real-estate-law": {
    document_type: "نظام",
    section_code: "07",
    section_name: "العقاري والبناء والمقاولات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "استئجار-الدولة-للعقار": {
    document_type: "نظام",
    section_code: "07",
    section_name: "العقاري والبناء والمقاولات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "نزع-ملكية-العقارات-للمنفعة-العامة": {
    document_type: "نظام",
    section_code: "07",
    section_name: "العقاري والبناء والمقاولات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "رسوم-الأراضي-البيضاء-والعقارات-الشاغرة": {
    document_type: "نظام",
    section_code: "07",
    section_name: "العقاري والبناء والمقاولات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ البيانات والتقنية (05 / 08+) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "data-protection-law": {
    document_type: "نظام",
    section_code: "12",
    section_name: "التقنية والاتصالات والفضاء",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/19) وتاريخ 1443/2/9هـ",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ الاستثمار (متعدد الأقسام) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "الاستثمار": {
    document_type: "نظام",
    section_code: "04",
    section_name: "القسم التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ المبادئ القضائية (98) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "admin-supreme-1442-part1": {
    related_systems: [
      { title: "نظام ديوان المظالم", slug: "court-of-grievances-law", type: "law" },
      { title: "نظام المرافعات أمام ديوان المظالم", slug: "administrative-procedures-law", type: "law" }
    ],
    related_principles: [
      { title: "مبادئ ديوان المظالم لعام 1443هـ - ج1", slug: "admin-supreme-1443-part1", type: "precedent" }
    ]
  } as LawMetaEntry,

  "admin-supreme-1443-part1": {
    related_systems: [
      { title: "نظام ديوان المظالم", slug: "court-of-grievances-law", type: "law" },
      { title: "نظام المرافعات أمام ديوان المظالم", slug: "administrative-procedures-law", type: "law" }
    ],
    related_principles: [
      { title: "مبادئ ديوان المظالم لعام 1442هـ - ج1", slug: "admin-supreme-1442-part1", type: "precedent" }
    ]
  } as LawMetaEntry,

  "rawd-al-murbi": {
    section_code: "99",
    section_name: "المبادئ القضائية والتطبيقات",
    issuing_authority: "الشيخ منصور البهوتي",
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام الإثبات", slug: "evidence-law", type: "law" }
    ],
    related_principles: [
      { title: "المبادئ القضائية في الإثبات", slug: "evidence-principles", type: "precedent" }
    ]
  } as LawMetaEntry,

  "ord-01": {
    document_type: "قرار",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "الديوان الملكي",
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام الإثبات", slug: "evidence-law", type: "law" }
    ],
    related_principles: [
      { title: "المبادئ القضائية في الإثبات", slug: "evidence-principles", type: "precedent" }
    ]
  } as LawMetaEntry,

  "ord-05": {
    document_type: "تعميم",
    section_code: "07",
    section_name: "العقاري والبناء والمقاولات",
    issuing_authority: "الهيئة العامة للعقار",
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام الإثبات", slug: "evidence-law", type: "law" }
    ],
    related_principles: [
      { title: "المبادئ القضائية في الإثبات", slug: "evidence-principles", type: "precedent" }
    ]
  } as LawMetaEntry,

  "prec-moj-01": {
    section_code: "99",
    section_name: "المبادئ القضائية والتطبيقات",
    issuing_authority: "المحكمة العليا",
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" }
    ],
    related_principles: [
      { title: "مبادئ المرافعات الشرعية", slug: "civil-procedure-principles", type: "precedent" }
    ]
  } as LawMetaEntry,

  "prec-01": {
    section_code: "99",
    section_name: "المبادئ القضائية والتطبيقات",
    issuing_authority: "المحكمة العليا",
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
      { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" }
    ],
    related_principles: [
      { title: "مبادئ المرافعات الشرعية", slug: "civil-procedure-principles", type: "precedent" }
    ]
  } as LawMetaEntry,

  "4dfa9563-100f-488a-bc25-ac6000addc7b": {
    section_code: "21",
    section_name: "الرياضة والشباب",
    issuing_authority: "مجلس الوزراء",
    law_status: "active",
    related_systems: [
      { title: "نظام نادي الفروسية", slug: "equestrian-club-law", type: "law" }
    ]
  } as LawMetaEntry,

  "64bb9b3c-4c52-464a-b356-b1e9008cffc3": {
    section_code: "06",
    section_name: "العمل والتأمينات",
    issuing_authority: "الملك",
    law_status: "active",
    related_systems: [
      { title: "نظام العمل", slug: "labor-law", type: "law" }
    ]
  } as LawMetaEntry,

  // ━━━ الأنظمة الغائبة — مضافة بالكامل ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "law-banking-control": {
    document_type: "نظام_ولائحة",
    section_code: "08",
    section_name: "المالي والمصرفي",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/5) وتاريخ 1386/2/22هـ",
    has_executive_reg: true,
    executive_label_override: "القواعد التنفيذية",
    total_articles: 26,
    law_status: "active",
    related_systems: [
      { title: "نظام مؤسسة النقد العربي السعودي", slug: "sama-law", type: "law" }
    ],
  } as LawMetaEntry,

  "law-vat": {
    document_type: "نظام_ولائحة",
    section_code: "09",
    section_name: "الضريبي والزكوي والجمركي",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/113) وتاريخ 1438/11/2هـ",
    has_executive_reg: true,
    total_articles: 53,
    law_status: "active",
    related_systems: [
      { title: "نظام الشركات", slug: "companies-law", type: "law" }
    ],
  } as LawMetaEntry,

  "law-trademarks": {
    document_type: "نظام_ولائحة",
    section_code: "05",
    section_name: "الملكية الفكرية",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/21) وتاريخ 1423/8/28هـ",
    has_executive_reg: true,
    total_articles: 58,
    law_status: "active",
  } as LawMetaEntry,

  "law-civil-aviation": {
    document_type: "نظام_ولائحة",
    section_code: "13",
    section_name: "النقل والخدمات اللوجستية",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/44) وتاريخ 1426/10/29هـ",
    has_executive_reg: true,
    total_articles: 180,
    law_status: "active",
    related_systems: [
      { title: "نظام الطيران المدني", slug: "law-civil-aviation", type: "law" }
    ],
  } as LawMetaEntry,

  "law-personal-data-protection": {
    document_type: "نظام_ولائحة",
    section_code: "12",
    section_name: "التقنية والاتصالات والفضاء",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/19) وتاريخ 1443/2/9هـ",
    has_executive_reg: true,
    total_articles: 53,
    law_status: "active",
  } as LawMetaEntry,

  "law-personal-status": {
    document_type: "نظام",
    section_code: "03",
    section_name: "المدني والأحوال الشخصية",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/73) وتاريخ 1443/8/6هـ",
    has_executive_reg: false,
    total_articles: 252,
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" }
    ],
  } as LawMetaEntry,

  "law-antiquities-museums": {
    document_type: "نظام_ولائحة",
    section_code: "27",
    section_name: "الثقافة والترفيه",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/26) وتاريخ 1394/6/23هـ",
    has_executive_reg: true,
    total_articles: 94,
    law_status: "active",
  } as LawMetaEntry,

  "law-arbitration": {
    document_type: "نظام_ولائحة",
    section_code: "28",
    section_name: "التحكيم وتسوية النزاعات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/34) وتاريخ 1433/6/24هـ",
    has_executive_reg: true,
    total_articles: 58,
    law_status: "active",
    related_systems: [
      { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" }
    ],
  } as LawMetaEntry,

  "law-audiovisual-media": {
    document_type: "نظام_ولائحة",
    section_code: "15",
    section_name: "الإعلام والنشر",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/40) وتاريخ 1440/3/7هـ",
    has_executive_reg: true,
    total_articles: 25,
    law_status: "active",
  } as LawMetaEntry,

  "law-basic-governance": {
    document_type: "نظام",
    section_code: "17",
    section_name: "الدستوري والسيادي",
    issuing_authority: "الملك",
    issuanceDecree: "المرسوم الملكي رقم (أ/90) وتاريخ 1412/8/27هـ",
    has_executive_reg: false,
    total_articles: 83,
    law_status: "active",
  } as LawMetaEntry,

  "law-car-syndicate-1372": {
    document_type: "نظام",
    section_code: "13",
    section_name: "النقل والخدمات اللوجستية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    total_articles: 64,
    law_status: "active",
  } as LawMetaEntry,

  "law-criminal-procedures": {
    document_type: "نظام",
    section_code: "01",
    section_name: "الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/39) وتاريخ 1422/7/28هـ",
    has_executive_reg: false,
    total_articles: 222,
    law_status: "active",
    related_systems: [
      { title: "نظام الإثبات", slug: "evidence-law", type: "law" }
    ],
  } as LawMetaEntry,

  "law-customs": {
    document_type: "نظام_ولائحة",
    section_code: "09",
    section_name: "الضريبي والزكوي والجمركي",
    issuing_authority: "مجلس التعاون الخليجي",
    issuanceDecree: "قرار المجلس الأعلى الثالث والعشرون",
    has_executive_reg: true,
    total_articles: 188,
    law_status: "active",
  } as LawMetaEntry,

  "law-fodder": {
    document_type: "نظام_ولائحة",
    section_code: "18",
    section_name: "الغذائي والزراعي والحيواني",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    total_articles: 39,
    law_status: "active",
  } as LawMetaEntry,

  "law-health-insurance": {
    document_type: "نظام_ولائحة",
    section_code: "10",
    section_name: "الصحي والدوائي",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/10) وتاريخ 1420/8/1هـ",
    has_executive_reg: true,
    total_articles: 19,
    law_status: "active",
  } as LawMetaEntry,

  "law-investment": {
    document_type: "نظام_ولائحة",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/50) وتاريخ 1445/8/1هـ",
    has_executive_reg: true,
    total_articles: 16,
    law_status: "active",
  } as LawMetaEntry,

  "law-municipalities": {
    document_type: "نظام_ولائحة",
    section_code: "02",
    section_name: "الإداري والخدمة المدنية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    total_articles: 49,
    law_status: "active",
  } as LawMetaEntry,

  "law-officers-service": {
    document_type: "نظام",
    section_code: "02",
    section_name: "الإداري والخدمة المدنية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    total_articles: 162,
    law_status: "active",
  } as LawMetaEntry,

  "law-procurement-scope": {
    document_type: "نظام_ولائحة",
    section_code: "02",
    section_name: "الإداري والخدمة المدنية",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/128) وتاريخ 1440/11/13هـ",
    has_executive_reg: true,
    total_articles: 99,
    law_status: "active",
  } as LawMetaEntry,

  "law-product-safety": {
    document_type: "نظام_ولائحة",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    total_articles: 37,
    law_status: "active",
  } as LawMetaEntry,

  "product-safety-law-1446": {
    document_type: "نظام_ولائحة",
    section_code: "04",
    section_name: "التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    total_articles: 37,
    law_status: "active",
  } as LawMetaEntry,

  "law-real-estate-brokerage": {
    document_type: "نظام_ولائحة",
    section_code: "07",
    section_name: "العقاري والبناء والمقاولات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/22) وتاريخ 1440/6/17هـ",
    has_executive_reg: true,
    total_articles: 24,
    law_status: "active",
    related_systems: [
      { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" }
    ],
  } as LawMetaEntry,

  "law-sports-arbitration": {
    document_type: "نظام",
    section_code: "18",
    section_name: "الثقافة والرياضة والشباب",
    issuing_authority: "الهيئة العامة للرياضة",
    has_executive_reg: false,
    total_articles: 47,
    law_status: "active",
  } as LawMetaEntry,

  "law-tourism": {
    document_type: "نظام_ولائحة",
    section_code: "25",
    section_name: "السياحة والضيافة",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/8) وتاريخ 1441/2/28هـ",
    has_executive_reg: true,
    total_articles: 19,
    law_status: "active",
  } as LawMetaEntry,

  "law-water": {
    document_type: "نظام_ولائحة",
    section_code: "11",
    section_name: "البيئة والمياه",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/6) وتاريخ 1441/2/28هـ",
    has_executive_reg: true,
    total_articles: 77,
    law_status: "active",
  } as LawMetaEntry,

  "order-royal-9437": {
    document_type: "أمر سامي",
    section_code: "00",
    section_name: "الإجرائي والقضائي",
    issuing_authority: "الديوان الملكي",
    issuanceDecree: "أمر سامي رقم (9437) وتاريخ 1439/2/26هـ",
    has_executive_reg: false,
    total_articles: 1,
    law_status: "active",
    related_systems: [
      { title: "نظام ديوان المظالم", slug: "administrative-procedures-law", type: "law" }
    ],
  } as LawMetaEntry,

  "reg-civil-associations": {
    document_type: "لائحة",
    section_code: "02",
    section_name: "الإداري والخدمة المدنية",
    issuing_authority: "وزارة الموارد البشرية والتنمية الاجتماعية",
    has_executive_reg: false,
    total_articles: 56,
    law_status: "active",
  } as LawMetaEntry,

  "reg-electricity-energy-ministry": {
    document_type: "لائحة",
    section_code: "14",
    section_name: "الطاقة",
    issuing_authority: "وزارة الطاقة",
    has_executive_reg: false,
    total_articles: 35,
    law_status: "active",
  } as LawMetaEntry,

  "reg-national-elearning-center": {
    document_type: "لائحة",
    section_code: "20",
    section_name: "التعليم والتدريب",
    issuing_authority: "وزارة التعليم",
    has_executive_reg: false,
    total_articles: 12,
    law_status: "active",
  } as LawMetaEntry,

} as const;


/** قائمة الأقسام القانونية الكاملة (30 قسم) — للواجهة */
export const SECTION_LABELS: Record<string, string> = {
  "00": "الإجرائي والقضائي",
  "01": "الجنائي والعقوبات",
  "02": "الإداري والخدمة المدنية",
  "03": "المدني والأحوال الشخصية",
  "04": "التجاري والشركات",
  "05": "الملكية الفكرية",
  "06": "العمل والتأمينات",
  "07": "العقاري والبناء",
  "08": "المالي والمصرفي",
  "09": "الضريبي والزكوي والجمركي",
  "98": "المبادئ القضائية",
  "99": "الكتب الفقهية والقانونية",
};

/** ألوان الأقسام للواجهة */
export const SECTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "00": { bg: "bg-blue-500/10",   text: "text-blue-600 dark:text-blue-400",   border: "border-blue-500/20" },
  "01": { bg: "bg-red-500/10",    text: "text-red-600 dark:text-red-400",     border: "border-red-500/20" },
  "02": { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" },
  "03": { bg: "bg-emerald-500/10",text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  "04": { bg: "bg-amber-500/10",  text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
  "05": { bg: "bg-pink-500/10",   text: "text-pink-600 dark:text-pink-400",   border: "border-pink-500/20" },
  "06": { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/20" },
  "07": { bg: "bg-cyan-500/10",   text: "text-cyan-600 dark:text-cyan-400",   border: "border-cyan-500/20" },
  "08": { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/20" },
  "09": { bg: "bg-teal-500/10",   text: "text-teal-600 dark:text-teal-400",   border: "border-teal-500/20" },
  "98": { bg: "bg-slate-500/10",  text: "text-slate-600 dark:text-slate-400", border: "border-slate-500/20" },
  "99": { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", border: "border-yellow-500/20" },
};
