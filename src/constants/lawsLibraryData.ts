import * as PhosphorIcons from "@phosphor-icons/react";
import { BookOpen } from "@phosphor-icons/react";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
// Types only: no demo record is bundled from here (N05-L13). The category
// counts that used to be summed from the DEMO_* arrays (and one fake
// FULL_LAWS_SYSTEMS law) had no reader left; /laws counts its own rows.
import type { PrincipleSubject, PrincipleSourceId } from "@/app/laws/demo-data";

export type Cat = string;
export type ContentType = "all" | "laws" | "orders" | "precedents" | "feqh";
export type PrecMode = "all" | "principles" | "precedents";
export type FeqhType = "all" | "sharia" | "wadi" | "comparative";
export type FeqhMadhab = "all" | "hanafi" | "maliki" | "shafi" | "hanbali" | "muqaran";

// أنواع الوثائق المعتمدة (v3.0)
export type DocSubType =
  | "all"
  | "نظام"
  | "لائحة تنفيذية"
  | "لائحة"
  | "ضوابط"
  | "قواعد"
  | "دليل إرشادي"
  | "دليل إرشادي / تنظيم إداري"
  | "دليل"
  | "سياسة"
  | "جداول"
  | "تعليمات"
  | "ملحق"
  | "ضوابط التنفيذ";

export type OrderDocType =
  | "all"
  | "مرسوم ملكي"
  | "أمر ملكي"
  | "قرار مجلس الوزراء"
  | "قرار وزاري"
  | "تعميم"
  | "اتفاقية";

// فلاتر أنواع الوثائق داخل «أنظمة ولوائح»
export const LAW_DOC_TYPES: { id: DocSubType; label: string; labelEn: string; anchorPrefix: string | null; isSecondary: boolean }[] = [
  { id: "all",            label: "الكل",            labelEn: "All",                   anchorPrefix: null,          isSecondary: false },
  { id: "نظام",          label: "نظام",          labelEn: "Law",                   anchorPrefix: null,          isSecondary: false },
  { id: "لائحة تنفيذية", label: "لائحة تنفيذية", labelEn: "Executive Regulation",  anchorPrefix: "REGULATION",  isSecondary: true  },
  { id: "لائحة",         label: "لائحة",         labelEn: "Regulation",            anchorPrefix: "REGULATION",  isSecondary: true  },
  { id: "ضوابط",         label: "ضوابط",         labelEn: "Controls",              anchorPrefix: "CONTROLS",    isSecondary: true  },
  { id: "قواعد",         label: "قواعد",         labelEn: "Rules",                 anchorPrefix: "RULES",       isSecondary: true  },
  { id: "دليل إرشادي",   label: "دليل إرشادي",   labelEn: "Guideline",             anchorPrefix: "GUIDELINE",   isSecondary: true  },
  // Owner ١٠٢/٢١١: the documents numbered by page, not by article.
  { id: "دليل إرشادي / تنظيم إداري", label: "دليل إرشادي / تنظيم إداري", labelEn: "Guidance / Administrative Regulation", anchorPrefix: "GUIDELINE", isSecondary: true },
  { id: "دليل",          label: "دليل",          labelEn: "Guideline",             anchorPrefix: "GUIDELINE",   isSecondary: true  },
  { id: "سياسة",         label: "سياسة",         labelEn: "Policy",                anchorPrefix: "POLICY",      isSecondary: true  },
  { id: "جداول",         label: "جداول",         labelEn: "Schedules",             anchorPrefix: "APPENDIX",    isSecondary: true  },
  { id: "تعليمات",       label: "تعليمات",       labelEn: "Instructions",          anchorPrefix: "INSTRUCTIONS",isSecondary: true  },
  { id: "ملحق",          label: "ملحق",          labelEn: "Appendix",              anchorPrefix: "APPENDIX",    isSecondary: true  },
  { id: "ضوابط التنفيذ", label: "ضوابط التنفيذ", labelEn: "Implementing Controls", anchorPrefix: "CONTROLS",    isSecondary: true  },
];

export function getDocAnchorPrefix(docType: DocSubType): string | null {
  return LAW_DOC_TYPES.find(t => t.id === docType)?.anchorPrefix ?? null;
}

export const ORDER_DOC_TYPES: { id: OrderDocType; label: string; labelEn: string }[] = [
  { id: "all",                  label: "الكل",                  labelEn: "All" },
  { id: "مرسوم ملكي",          label: "مرسوم ملكي",          labelEn: "Royal Decree" },
  { id: "أمر ملكي",            label: "أمر ملكي",            labelEn: "Royal Order" },
  { id: "قرار مجلس الوزراء",  label: "قرار مجلس الوزراء",  labelEn: "Cabinet Resolution" },
  { id: "قرار وزاري",          label: "قرار وزاري",          labelEn: "Ministerial Decision" },
  { id: "تعميم",              label: "تعميم",              labelEn: "Circular" },
  { id: "اتفاقية",            label: "اتفاقية دولية",      labelEn: "International Agreement" },
];

// ─── Content-type selector ──────────────────────────────────────────────────────
export const CONTENT_TYPES: { id: ContentType; label: string; labelEn: string; icon: typeof BookOpen }[] = [
  { id: "all",        label: "الكل",                  labelEn: "All",                    icon: PhosphorIcons.Books },
  { id: "laws",       label: "أنظمة ولوائح",          labelEn: "Laws & Regulations",     icon: BookOpen },
  { id: "orders",     label: "أوامر وتعاميم",         labelEn: "Orders & Circulars",     icon: PhosphorIcons.Scroll },
  { id: "precedents", label: "مبادئ وسوابق قضائية",  labelEn: "Principles & Precedents", icon: PhosphorIcons.Gavel },
  { id: "feqh",       label: "فقه ومراجع",           labelEn: "Fiqh & References",       icon: PhosphorIcons.Mosque },
];

// ─── Fiqh sub-types ──────────────────────────────────────────────────────────────────
// النوع الأول: شرعي (مذاهب) | النوع الثاني: وضعي (نفس أقسام المكتبة)
export const FEQH_TYPES: { id: FeqhType; label: string; labelEn: string }[] = [
  { id: "all",         label: "الكل",             labelEn: "All" },
  { id: "sharia",      label: "شرعي (فقه إسلامي)", labelEn: "Islamic Fiqh" },
  { id: "wadi",        label: "قانوني وضعي",       labelEn: "Positive Law" },
  { id: "comparative", label: "فقه مقارن",         labelEn: "Comparative Fiqh" },
];
export const FEQH_MADHABS: { id: FeqhMadhab; label: string; labelEn: string }[] = [
  { id: "all",     label: "كل المذاهب",  labelEn: "All Schools" },
  { id: "hanafi",  label: "حنفي",          labelEn: "Hanafi" },
  { id: "maliki",  label: "مالكي",          labelEn: "Maliki" },
  { id: "shafi",   label: "شافعي",          labelEn: "Shafi'i" },
  { id: "hanbali", label: "حنبلي",          labelEn: "Hanbali" },
  { id: "muqaran", label: "مقارن",          labelEn: "Comparative" },
];

// ─── Rotating placeholders per content type ─────────────────────────────────────
export const PLACEHOLDERS: Record<ContentType, string[]> = {
  all: [
    "مثال: نظام الشركات",
    "مثال: تعريف الشركة في نظام الشركات",
    "مثال: ركن نية الاشتراك",
    "مثال: قرار مجلس الوزراء 678",
    "مثال: سابقة فسخ عقد التأسيس",
  ],
  laws: [
    "مثال: نظام المرافعات الشرعية",
    "مثال: المادة السادسة — نظام الإفلاس",
    "مثال: لائحة الوساطة العقارية",
    "مثال: ضوابط نظام حماية المستهلك",
  ],
  orders: [
    "مثال: قرار مجلس الوزراء رقم 678",
    "مثال: تعميم وزارة العدل بشأن التوثيق",
    "مثال: مرسوم ملكي م/132",
    "مثال: تعميم هيئة السوق المالية",
  ],
  precedents: [
    "مثال: مبدأ المحكمة العليا بشأن الاختصاص",
    "مثال: سابقة فسخ عقد الشراكة",
    "مثال: مبدأ ديوان المظالم في العقود الإدارية",
    "مثال: حكم المحكمة التجارية في نية الاشتراك",
  ],
  feqh: [
    "مثال: المغني لابن قدامة — باب الإجارة",
    "مثال: الوسيط في شرح قانون العقود",
    "مثال: فسخ العقد عند الشافعية والحنفية",
    "مثال: أحكام الفسخ في كشاف القناع",
  ],
};

export const PLACEHOLDERS_EN: Record<ContentType, string[]> = {
  all: [
    "Example: Companies Law",
    "Example: definition of a company",
    "Example: intent to participate",
    "Example: Cabinet Resolution 678",
    "Example: precedent on dissolving a partnership deed",
  ],
  laws: [
    "Example: Civil Procedure Law",
    "Example: Article 6 - Bankruptcy Law",
    "Example: Real Estate Brokerage Regulations",
    "Example: consumer protection controls",
  ],
  orders: [
    "Example: Cabinet Resolution No. 678",
    "Example: Ministry of Justice notarization circular",
    "Example: Royal Decree M/132",
    "Example: Capital Market Authority circular",
  ],
  precedents: [
    "Example: Supreme Court principle on jurisdiction",
    "Example: precedent on dissolving a partnership",
    "Example: Board of Grievances principle on administrative contracts",
    "Example: Commercial Court ruling on intent to participate",
  ],
  feqh: [
    "Example: Al-Mughni by Ibn Qudama — Lease chapter",
    "Example: Al-Waseet on contract law",
    "Example: contract rescission under Shafi'i and Hanafi schools",
    "Example: Al-Rawd al-Murbi' on rescission provisions",
  ],
};

export const PREC_MODES: { id: PrecMode; label: string; labelEn: string; icon: typeof BookOpen }[] = [
  { id: "all", label: "الكل", labelEn: "All", icon: PhosphorIcons.Books },
  { id: "principles", label: "مبادئ قضائية", labelEn: "Principles", icon: PhosphorIcons.Gavel },
  { id: "precedents", label: "سوابق قضائية", labelEn: "Precedents", icon: PhosphorIcons.Gavel },
];

export const PRINCIPLE_SUBJECT_LABELS_EN: Record<PrincipleSubject, string> = {
  all: "All",
  criminal: "Criminal",
  civil: "Civil",
  commercial: "Commercial & Companies",
  admin: "Administrative & Employment",
  labor: "Labor",
  personal: "Personal Status",
  realEstate: "Real Estate",
  financial: "Financial & Banking",
};

export const PRINCIPLE_SOURCE_LABELS_EN: Record<PrincipleSourceId, string> = {
  all: "All",
  supreme: "Supreme Court",
  "supreme-general": "Supreme Court - General Panel",
  "permanent-cmte": "Supreme Judicial Council - Permanent Panel",
  "sjc-general": "Supreme Judicial Council - General Panel",
  "higher-judicial": "Higher Judicial Authority",
  tamyeez: "Court of Cassation",
  "appeal-courts": "Courts of Appeal",
  specialized: "Specialized Criminal Court",
  sjc: "Supreme Judicial Council Circulars",
  "admin-supreme": "Supreme Administrative Court",
  "admin-appeal": "Administrative Courts of Appeal",
  "admin-first": "Administrative Trial Courts",
  "sama-cmte": "Banking and Financing Dispute Committees",
  "cma-cmte": "Capital Market Authority Committees",
  "zatca-cmte": "ZATCA Appeal Committee",
  "commercial-paper": "Commercial Paper Disputes Committee",
  "labor-board": "Higher Labor Dispute Settlement Authority",
  prosecution: "Public Prosecution",
};

export function matchesFeqhCategory(book: { type: string; category: string; id: string }, cat: string): boolean {
  if (cat === "all") return true;
  if (cat === "SA-01") return book.category === "criminal";
  if (cat === "SA-02") return book.category === "admin";
  if (cat === "SA-03") return book.category === "civil" || book.type === "sharia" || book.type === "comparative";
  if (cat === "SA-04") return book.category === "corporate" || book.id === "fb-5";
  return false;
}

// ─── Category Tab section ───────────────────────────────────────────────────────
export const MAIN_CATEGORIES = [
  { id: "all" as Cat,   label: "الكل",      labelEn: "All",   icon: BookOpen },
  ...LEGAL_TAXONOMY.slice(0, 5).map(cat => ({
    id: cat.id as Cat, label: cat.label, labelEn: cat.labelEn,
    icon: (PhosphorIcons as Record<string, unknown>)[cat.iconName || "BookOpen"] as typeof BookOpen || BookOpen,
  })),
];

export const OTHER_CATEGORIES = LEGAL_TAXONOMY.slice(5).map(cat => ({
  id: cat.id as Cat, label: cat.label, labelEn: cat.labelEn,
  icon: (PhosphorIcons as Record<string, unknown>)[cat.iconName || "BookOpen"] as typeof BookOpen || BookOpen,
}));
