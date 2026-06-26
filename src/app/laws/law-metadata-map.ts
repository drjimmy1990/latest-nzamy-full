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
  let normSlug = slug;
  if (slug === "civil-transactions") normSlug = "civil-transactions-law";
  else if (slug === "civil-procedure") normSlug = "civil-procedure-law";
  else if (slug === "evidence") normSlug = "evidence-law";
  
  const existing = LAW_METADATA_MAP[normSlug];
  if (existing) return existing;

  // Fallback map for precedent collections and specific judgments
  if (normSlug === "tamyeez") {
    return {
      related_systems: [
        { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" },
        { title: "نظام المرافعات الشرعية", slug: "civil-procedure-law", type: "law" },
        { title: "نظام الإثبات", slug: "evidence-law", type: "law" }
      ]
    };
  }
  if (normSlug.startsWith("labor-principles") || normSlug === "prec-03") {
    return {
      related_systems: [
        { title: "نظام العمل", slug: "labor-law", type: "law" }
      ]
    };
  }
  if (normSlug.startsWith("zakat-tax") || normSlug === "zakat-2024" || normSlug === "tax-2024") {
    return {
      related_systems: [
        { title: "نظام ضريبة الدخل", slug: "income-tax-law", type: "law" },
        { title: "نظام ضريبة القيمة المضافة", slug: "vat-law", type: "law" }
      ]
    };
  }
  if (normSlug.startsWith("customs-")) {
    return {
      related_systems: [
        { title: "نظام الجمارك الموحد لدول مجلس التعاون", slug: "customs-law", type: "law" }
      ]
    };
  }
  if (normSlug === "banking-1443" || normSlug === "banking-1408-1427") {
    return {
      related_systems: [
        { title: "نظام مراقبة البنوك", slug: "banking-control-law", type: "law" },
        { title: "نظام الأوراق التجارية", slug: "commercial-papers-law", type: "law" }
      ]
    };
  }
  if (normSlug === "commercial-papers" || normSlug === "prec-02") {
    return {
      related_systems: [
        { title: "نظام الأوراق التجارية", slug: "commercial-papers-law", type: "law" }
      ]
    };
  }
  if (normSlug === "insurance-1438" || normSlug === "insurance-principles") {
    return {
      related_systems: [
        { title: "نظام مراقبة شركات التأمين التعاوني", slug: "cooperative-insurance-law", type: "law" }
      ]
    };
  }
  if (normSlug.startsWith("admin-supreme") || normSlug === "prec-05") {
    return {
      related_systems: [
        { title: "نظام ديوان المظالم", slug: "court-of-grievances-law", type: "law" },
        { title: "نظام المرافعات أمام ديوان المظالم", slug: "administrative-procedures-law", type: "law" }
      ]
    };
  }
  if (normSlug === "supreme-judicial-council") {
    return {
      related_systems: [
        { title: "نظام القضاء", slug: "judiciary-law", type: "law" }
      ]
    };
  }
  if (normSlug === "prec-04") {
    return {
      related_systems: [
        { title: "نظام الإجراءات الجزائية", slug: "procedures-law", type: "law" }
      ]
    };
  }
  if (normSlug === "prec-06") {
    return {
      related_systems: [
        { title: "نظام المعاملات المدنية", slug: "civil-transactions-law", type: "law" }
      ]
    };
  }

  return {};
}

// ──────────────────────────────────────────────────────────────────────
// الخريطة الكاملة
// ──────────────────────────────────────────────────────────────────────
export const LAW_METADATA_MAP: Record<string, LawMetaEntry> = {

  // ━━━ القسم الإجرائي والقضائي (00) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "evidence-law": {
    document_type: "نظام",
    section_code: "00",
    section_name: "القسم الإجرائي والقضائي",
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
    section_name: "القسم الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
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
    section_name: "القسم الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "execution-law": {
    document_type: "نظام_ولائحة",
    section_code: "00",
    section_name: "القسم الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "court-costs-law": {
    document_type: "نظام_ولائحة",
    section_code: "00",
    section_name: "القسم الإجرائي والقضائي",
    issuing_authority: "وزير العدل",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "lawyering-law": {
    document_type: "نظام_ولائحة",
    section_code: "00",
    section_name: "القسم الإجرائي والقضائي",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/38) وتاريخ 1422/7/28هـ",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم الجنائي والعقوبات (01) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "procedures-law": {
    document_type: "نظام",
    section_code: "01",
    section_name: "القسم الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    issuanceDecree: "مرسوم ملكي رقم (م/39) وتاريخ 1422/7/28هـ",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "قرار-النائب-العام-بشأن-الجرائم-الكبيرة-الموجبة-للتوقيف-ومذكرته-الإيضاحية": {
    document_type: "قرار",
    section_code: "01",
    section_name: "القسم الجنائي والعقوبات",
    issuing_authority: "النائب العام",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "مكافحة-الرشوة": {
    document_type: "نظام",
    section_code: "01",
    section_name: "القسم الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "مكافحة-المخدرات-والمؤثرات-العقلية": {
    document_type: "نظام",
    section_code: "01",
    section_name: "القسم الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "الأسلحة-والذخائر": {
    document_type: "نظام",
    section_code: "01",
    section_name: "القسم الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "هيئة-الرقابة-ومكافحة-الفساد": {
    document_type: "نظام",
    section_code: "01",
    section_name: "القسم الجنائي والعقوبات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "الانضباط-الوظيفي": {
    document_type: "نظام",
    section_code: "02",
    section_name: "القسم الإداري والخدمة المدنية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم المدني والأحوال الشخصية (03) ━━━━━━━━━━━━━━━━━━━━━━━━━━
  "الهيئة-العامة-للولاية-على-أموال-القاصرين-ومن-في-حكمهم": {
    document_type: "نظام_ولائحة",
    section_code: "03",
    section_name: "القسم المدني والأحوال الشخصية",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "civil-transactions-law": {
    document_type: "نظام",
    section_code: "03",
    section_name: "القسم المدني والأحوال الشخصية",
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
    section_name: "القسم التجاري والشركات",
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
    section_name: "القسم التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: true,
    law_status: "active",
  } as LawMetaEntry,

  "competition-law": {
    document_type: "نظام",
    section_code: "04",
    section_name: "القسم التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "الامتياز-التجاري": {
    document_type: "نظام",
    section_code: "04",
    section_name: "القسم التجاري والشركات",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ القسم العمالي والتأمينات (06) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "labor-law": {
    document_type: "نظام_ولائحة",
    section_code: "06",
    section_name: "القسم العمالي والتأمينات",
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
    section_name: "القسم العقاري والبناء",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "استئجار-الدولة-للعقار": {
    document_type: "نظام",
    section_code: "07",
    section_name: "القسم العقاري والبناء",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "نزع-ملكية-العقارات-للمنفعة-العامة": {
    document_type: "نظام",
    section_code: "07",
    section_name: "القسم العقاري والبناء",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  "رسوم-الأراضي-البيضاء-والعقارات-الشاغرة": {
    document_type: "نظام",
    section_code: "07",
    section_name: "القسم العقاري والبناء",
    issuing_authority: "مجلس الوزراء",
    has_executive_reg: false,
    law_status: "active",
  } as LawMetaEntry,

  // ━━━ البيانات والتقنية (05 / 08+) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "data-protection-law": {
    document_type: "نظام",
    section_code: "05",
    section_name: "قسم حماية البيانات والتقنية",
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
    section_name: "الكتب الفقهية والقانونية",
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
    section_code: "07",
    section_name: "القسم العقاري والبناء",
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
    section_name: "القسم العقاري والبناء",
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
    section_code: "98",
    section_name: "المبادئ القضائية",
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
    section_code: "98",
    section_name: "المبادئ القضائية",
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
    section_code: "18",
    section_name: "الثقافة والرياضة والشباب",
    issuing_authority: "مجلس الوزراء",
    law_status: "active",
    related_systems: [
      { title: "نظام نادي الفروسية", slug: "equestrian-club-law", type: "law" }
    ]
  } as LawMetaEntry,

  "64bb9b3c-4c52-464a-b356-b1e9008cffc3": {
    section_code: "06",
    section_name: "العمل والتأمينات الاجتماعية",
    issuing_authority: "الملك",
    law_status: "active",
    related_systems: [
      { title: "نظام العمل", slug: "labor-law", type: "law" }
    ]
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
