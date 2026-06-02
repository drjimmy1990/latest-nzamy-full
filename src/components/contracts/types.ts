// ─── Types for Contracts Pro ──────────────────────────────────────────────────

export const STEPS_DRAFT = [
  { key: "parties",    label: "الأطراف",           num: 1 },
  { key: "domain",     label: "المجال والنوع",      num: 2 },
  { key: "context",    label: "الفكرة والسياق",    num: 3 },
  { key: "clauses",    label: "البنود",            num: 4 },
  { key: "bestprac",   label: "صياغة وفق أفضل الممارسات",    num: 5 },
  { key: "drafting",   label: "الصياغة",           num: 6 },
  { key: "review",     label: "المراجعة الذكية",   num: 7 },
  { key: "approval",   label: "الاعتماد والمشاركة", num: 8 },
] as const;

export const STEPS_REVIEW = [
  { key: "r_identity",  label: "الهوية",            num: 1 },
  { key: "r_upload",    label: "الأنواع والرفع",    num: 2 },
  { key: "r_analysis",  label: "تحليل AI",          num: 3 },
  { key: "r_decisions", label: "القرارات",          num: 4 },
  { key: "r_report",    label: "التقرير والاعتماد", num: 5 },
] as const;

export const STEPS_DRAFT_SIMPLE = [
  { key: "parties",  label: "الأطراف",           num: 1 },
  { key: "context",  label: "الفكرة والسياق",    num: 2 },
  { key: "drafting", label: "الصياغة",           num: 3 },
  { key: "approval", label: "الاعتماد والمشاركة", num: 4 },
] as const;

export type StepKey = (typeof STEPS_DRAFT)[number]["key"] | (typeof STEPS_DRAFT_SIMPLE)[number]["key"] | (typeof STEPS_REVIEW)[number]["key"];
export type ContractMode = "draft" | "review" | null;

export type PartyType = "company" | "individual" | "government";
export type PartyData = {
  type: PartyType;
  // company
  companyName: string; commercialReg: string; unifiedNum: string;
  representative: string; representativeRole: string; address: string;
  // individual
  fullName: string; idNumber: string; nationality: string;
  // government
  entityName: string; unifiedNumGov: string; contactPerson: string;
};

export const EMPTY_PARTY: PartyData = {
  type: "individual",
  companyName: "", commercialReg: "", unifiedNum: "",
  representative: "", representativeRole: "", address: "",
  fullName: "", idNumber: "", nationality: "",
  entityName: "", unifiedNumGov: "", contactPerson: "",
};
