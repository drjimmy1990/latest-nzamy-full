import * as PhosphorIcons from "@phosphor-icons/react";
import { BookOpen } from "@phosphor-icons/react";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
import {
  DEMO_PRINCIPLES,
  DEMO_PRECEDENTS,
  DEMO_ORDERS,
  type PrincipleSubject,
  type PrincipleSourceId,
} from "@/app/laws/demo-data";

export type Cat = string;
export type ContentType = "all" | "laws" | "orders" | "precedents" | "feqh";
export type PrecMode = "all" | "principles" | "precedents";
export type FeqhType = "all" | "sharia" | "wadi" | "comparative";
export type FeqhMadhab = "all" | "hanafi" | "maliki" | "shafi" | "hanbali" | "muqaran";

// ─── Content-type selector ──────────────────────────────────────────────────────
export const CONTENT_TYPES: { id: ContentType; label: string; labelEn: string; icon: typeof BookOpen }[] = [
  { id: "all",        label: "الكل",                  labelEn: "All",                    icon: PhosphorIcons.Books },
  { id: "laws",       label: "أنظمة ولوائح",          labelEn: "Laws & Regulations",     icon: BookOpen },
  { id: "orders",     label: "أوامر وتعاميم",         labelEn: "Orders & Circulars",     icon: PhosphorIcons.Scroll },
  { id: "precedents", label: "مبادئ وسوابق قضائية",  labelEn: "Principles & Precedents", icon: PhosphorIcons.Scales },
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
  { id: "principles", label: "مبادئ قضائية", labelEn: "Principles", icon: PhosphorIcons.Scales },
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

// ─── Laws data ──────────────────────────────────────────────────────────────────
export const FULL_LAWS_SYSTEMS = [
  {
    id: "law-companies",
    slug: "companies-law",
    free: true,
    cat: "SA-04",
    type: "laws",
    subType: "basic",
    title: "نظام الشركات (نسخة جمعية قضاء)",
    titleEn: "Companies Law",
    desc: "ينظم هذا النظام أشكال الشركات وتأسيسها وحصص الشركاء والإدارة المالية، متضمناً اللوائح التنفيذية الصادرة عن وزارة التجارة وهيئة السوق المالية.",
    descEn: "Regulates company forms, incorporation, partner shares, and financial management.",
    articlesCount: 281,
    chaptersCount: 14,
    lastUpdated: "1/9/1446هـ",
    progress: 0,
  },
];

export function matchesFeqhCategory(book: { type: string; category: string; id: string }, cat: string): boolean {
  if (cat === "all") return true;
  if (cat === "SA-01") return book.category === "criminal";
  if (cat === "SA-02") return book.category === "admin";
  if (cat === "SA-03") return book.category === "civil" || book.type === "sharia" || book.type === "comparative";
  if (cat === "SA-04") return book.category === "corporate" || book.id === "fb-5";
  return false;
}

// ─── Category content counts (حسب الداتا الموجودة) ─────────────────────────────
export const CAT_LAWS_COUNT: Record<string, number> = { "SA-04": 1 };
export const CAT_PRINCIPLES_COUNT: Record<string, number> = DEMO_PRINCIPLES.reduce<Record<string, number>>(
  (acc, p) => { acc[p.cat] = (acc[p.cat] || 0) + 1; return acc; }, {}
);
export const CAT_PRECEDENTS_COUNT: Record<string, number> = DEMO_PRECEDENTS.reduce<Record<string, number>>(
  (acc, p) => { acc[p.cat] = (acc[p.cat] || 0) + 1; return acc; }, {}
);
export const CAT_ORDERS_COUNT: Record<string, number> = DEMO_ORDERS.reduce<Record<string, number>>(
  (acc, o) => { acc[o.cat] = (acc[o.cat] || 0) + 1; return acc; }, {}
);

// We define the counts for the 10 demo feqh books dynamically using matchesFeqhCategory
const DEMO_FEQH_BOOKS_MOCK = [
  { id: "fb-1", type: "sharia", category: "sharuh" },
  { id: "fb-2", type: "sharia", category: "mutun" },
  { id: "fb-3", type: "sharia", category: "encyclopedia" },
  { id: "fb-4", type: "sharia", category: "sharuh" },
  { id: "fb-5", type: "comparative", category: "encyclopedia" },
  { id: "fb-6", type: "wadi", category: "civil" },
  { id: "fb-7", type: "wadi", category: "criminal" },
  { id: "fb-8", type: "wadi", category: "criminal" },
  { id: "fb-9", type: "wadi", category: "corporate" },
  { id: "fb-10", type: "wadi", category: "admin" }
];

export const CAT_FEQH_COUNT: Record<string, number> = ["SA-01", "SA-02", "SA-03", "SA-04"].reduce<Record<string, number>>((acc, catId) => {
  acc[catId] = DEMO_FEQH_BOOKS_MOCK.filter(b => matchesFeqhCategory(b, catId)).length;
  return acc;
}, {});

export function catTotalCount(catId: string, type: ContentType): number {
  const feqhTotal = DEMO_FEQH_BOOKS_MOCK.filter(b => matchesFeqhCategory(b, catId)).length;
  if (catId === "all") {
    const total = (FULL_LAWS_SYSTEMS.length + DEMO_PRINCIPLES.length + DEMO_PRECEDENTS.length + DEMO_ORDERS.length + DEMO_FEQH_BOOKS_MOCK.length);
    return total;
  }
  if (type === "laws")       return CAT_LAWS_COUNT[catId] || 0;
  if (type === "precedents") return (CAT_PRINCIPLES_COUNT[catId] || 0) + (CAT_PRECEDENTS_COUNT[catId] || 0);
  if (type === "orders")     return CAT_ORDERS_COUNT[catId] || 0;
  if (type === "feqh")       return CAT_FEQH_COUNT[catId] || 0;
  return (CAT_LAWS_COUNT[catId] || 0) + (CAT_PRINCIPLES_COUNT[catId] || 0) +
    (CAT_PRECEDENTS_COUNT[catId] || 0) + (CAT_ORDERS_COUNT[catId] || 0) + feqhTotal;
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
