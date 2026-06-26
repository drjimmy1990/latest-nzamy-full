// ─── Demo Data — يُستبدل بالباك اند لاحقاً ────────────────────────────────────
// هذه بيانات موك اب للعرض فقط — هيكلها مطابق لما سيُرسله الباك-اند

import { FeqhBookSystem } from "./data";

export type PrincipleSubject =
  | "all" | "criminal" | "civil" | "commercial"
  | "admin" | "labor" | "personal" | "realEstate" | "financial";

/**
 * الهرم القضائي السعودي الفعلي — مصادر المبادئ
 */
export type PrincipleSourceId =
  | "all"
  // مسار القضاء العادي
  | "supreme" | "supreme-general" | "permanent-cmte" | "sjc-general"
  | "higher-judicial" | "tamyeez" | "appeal-courts" | "specialized" | "sjc"
  // مسار ديوان المظالم
  | "admin-supreme" | "admin-appeal" | "admin-first"
  // جهات شبه قضائية
  | "sama-cmte" | "cma-cmte" | "zatca-cmte" | "commercial-paper"
  | "labor-board" | "prosecution";

/**
 * اختصارات الجهات القضائية — مطابقة لما يرد في مجموعات المبادئ الرسمية
 */
export type PrincipleSourceAbbr =
  | "(ك ع)"    // المحكمة العليا
  | "(ك ع ع)"  // المحكمة العليا بهيئتها العامة
  | "(م ق د)"  // مجلس القضاء الأعلى بهيئته الدائمة
  | "(م ق ع)"  // مجلس القضاء الأعلى بهيئته العامة
  | "(هـ ق ع)" // الهيئة القضائية العليا
  | string;    // جهات أخرى

export interface DemoPrinciple {
  id: string;
  source: string;
  sourceId: PrincipleSourceId;
  srcAbbr?: PrincipleSourceAbbr;
  principleNum?: string;
  reportNum?: string;
  caseNum?: string;
  ref: string;
  page?: string;
  text: string;
  subject: PrincipleSubject;
  cat: string;
  year: string;
}

export interface DemoPrecedent {
  id: string;
  court: string;
  caseNum: string;
  year: string;
  date?: string;
  summary: string;
  relevance: string;
  subject: PrincipleSubject;
  cat: string;
  summary_brief?: string;
  preamble?: string;
  facts?: string;
  reasons?: string;
  ruling?: string;
  isRedacted?: boolean;
  hashtags?: string[];
}

export interface DemoOrder {
  id: string;
  title: string;
  type: "royal" | "cabinet" | "circular";
  issuer: string;
  ref: string;
  date: string;
  summary: string;
  cat: string;
  summary_brief?: string;
  preamble?: string;
  articles?: string[];
  hashtags?: string[];
  official_url?: string;
}

export interface FeqhBookDemo {
  id: string;
  slug: string;
  title: string;
  author: string;
  type: "sharia" | "wadi" | "comparative";
  category: string;
  categoryLabel: string;
  desc: string;
  free: boolean;
  progress: number;
  volCount: number;
  lastUpdated: string;
}

export interface PrecedentCollectionDemo {
  id: string;
  slug: string;
  title: string;
  court: string;
  track: "ordinary" | "admin" | "semi";
  year: string;
  part?: string;
  desc: string;
  free: boolean;
  progress: number;
  rulingCount: number;
}

// ─── Direct constants ───
export const PRINCIPLE_SUBJECTS: { id: PrincipleSubject; label: string }[] = [
  { id: "all",        label: "الكل" },
  { id: "criminal",   label: "جزائية" },
  { id: "civil",      label: "مدنية" },
  { id: "commercial", label: "تجارية وشركات" },
  { id: "admin",      label: "إدارية ووظيفية" },
  { id: "labor",      label: "عمالية" },
  { id: "personal",   label: "أحوال شخصية" },
  { id: "realEstate", label: "عقارية" },
  { id: "financial",  label: "مالية ومصرفية" }
];

export const PRINCIPLE_SOURCES: {
  id: PrincipleSourceId;
  label: string;
  group: "القضاء العادي" | "ديوان المظالم" | "شبه قضائية";
}[] = [
  { id: "supreme",         label: "المحكمة العليا", group: "القضاء العادي" },
  { id: "supreme-general", label: "المحكمة العليا (الهيئة العامة)", group: "القضاء العادي" },
  { id: "permanent-cmte",  label: "مجلس القضاء الأعلى (الهيئة الدائمة)", group: "القضاء العادي" },
  { id: "sjc-general",     label: "مجلس القضاء الأعلى (الهيئة العامة)", group: "القضاء العادي" },
  { id: "higher-judicial", label: "الهيئة القضائية العليا (تاريخية)", group: "القضاء العادي" },
  { id: "tamyeez",         label: "محكمة التمييز (تاريخية)", group: "القضاء العادي" },
  { id: "appeal-courts",   label: "محاكم الاستئناف", group: "القضاء العادي" },
  { id: "specialized",     label: "المحكمة الجزائية المتخصصة", group: "القضاء العادي" },
  { id: "sjc",             label: "المجلس الأعلى للقضاء (تعاميم)", group: "القضاء العادي" },

  { id: "admin-supreme",   label: "المحكمة الإدارية العليا", group: "ديوان المظالم" },
  { id: "admin-appeal",    label: "محاكم الاستئناف الإدارية", group: "ديوان المظالم" },
  { id: "admin-first",     label: "المحاكم الإدارية", group: "ديوان المظالم" },

  { id: "sama-cmte",        label: "لجنة الاستئناف المصرفية (ساما)", group: "شبه قضائية" },
  { id: "cma-cmte",         label: "لجنة الاستئناف للأوراق المالية (cma)", group: "شبه قضائية" },
  { id: "zatca-cmte",       label: "اللجنة الاستئنافية للمنازعات الضريبية", group: "شبه قضائية" },
  { id: "commercial-paper", label: "اللجنة الاستئنافية للأوراق التجارية", group: "شبه قضائية" },
  { id: "labor-board",      label: "الهيئة العليا لتسوية الخلافات العمالية", group: "شبه قضائية" },
  { id: "prosecution",      label: "النيابة العامة", group: "شبه قضائية" }
];

export const PRINCIPLE_SOURCE_GROUPS: { id: string; label: string }[] = [
  { id: "ordinary", label: "القضاء العادي" },
  { id: "admin",    label: "ديوان المظالم" },
  { id: "semi",     label: "لجان شبه قضائية" }
];

// ─── Re-exports from sub-files ───
export { DEMO_PRINCIPLES } from "./demo-data-principles";
export { DEMO_PRECEDENTS, DEMO_PRECEDENTS_COLLECTIONS } from "./demo-data-precedents";
export { DEMO_FEQH_BOOKS, DEMO_RAWD } from "./demo-data-books";
export { DEMO_ORDERS, ORDER_ISSUERS, ORDER_TYPE_LABELS_EN } from "./demo-data-orders";
