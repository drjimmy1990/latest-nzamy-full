/**
 * Shared mock cases store — used by both /cases and /tasks pages.
 * In production this would be fetched from the API.
 */
export type CaseStatus = "active" | "pending" | "suspended" | "closed" | "archived";
export type CaseType   = "commercial" | "labor" | "civil" | "criminal" | "family" | "real_estate" | "admin";
export type CourtDegree = "primary" | "appeal" | "supreme";
export type CasePriority = "critical" | "high" | "normal" | "low";

export interface SharedCase {
  id: string;
  title: string;
  client: string;
  court: string;
  type: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  nextDate?: string;
}

export const SHARED_CASES: SharedCase[] = [
  {
    id: "1", title: "نزاع تجاري — شركة الأفق", client: "شركة الأفق للتجارة",
    court: "المحكمة التجارية", type: "commercial", status: "active", priority: "critical",
    nextDate: "٢٠ أبريل",
  },
  {
    id: "2", title: "فسخ عقد إيجار — المالك وزاهد", client: "أحمد الزاهد",
    court: "المحكمة العامة", type: "civil", status: "pending", priority: "high",
    nextDate: "٢٥ أبريل",
  },
  {
    id: "3", title: "قضية عمالية — فصل تعسفي ٤٥٦٧", client: "خالد محمد القحطاني",
    court: "المحكمة العمالية", type: "labor", status: "active", priority: "high",
    nextDate: "٢٨ أبريل",
  },
  {
    id: "4", title: "استئناف العقار ٢١٣", client: "سارة الدوسري",
    court: "محكمة الاستئناف", type: "real_estate", status: "active", priority: "critical",
    nextDate: "٢ مايو",
  },
  {
    id: "5", title: "طلاق وحضانة — المطيري", client: "ريم المطيري",
    court: "المحكمة العامة", type: "family", status: "suspended", priority: "normal",
  },
  {
    id: "6", title: "مطالبة إدارية — التأمينات", client: "علي السبيعي",
    court: "المحكمة الإدارية", type: "admin", status: "closed", priority: "low",
  },
  {
    id: "7", title: "نزاع ملكية فكرية — براءة اختراع", client: "مجموعة الذهبي",
    court: "المحكمة التجارية", type: "commercial", status: "active", priority: "high",
    nextDate: "٥ مايو",
  },
];

/** Returns only cases that are not archived/closed — for linking to tasks */
export function getActiveCases(): SharedCase[] {
  return SHARED_CASES.filter(c => c.status !== "archived" && c.status !== "closed");
}

const TYPE_LABEL: Record<CaseType, string> = {
  commercial: "تجاري", labor: "عمالي", civil: "مدني",
  criminal: "جنائي", family: "أحوال شخصية", real_estate: "عقاري", admin: "إداري",
};

export function getCaseTypeLabel(type: CaseType): string {
  return TYPE_LABEL[type] ?? type;
}
