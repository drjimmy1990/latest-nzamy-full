// ─── Shared Client-Cases-Tasks bridge data ────────────────────────────────────
// Single source of truth — used by ClientsPage, CasesPage, TasksPage

export interface ClientCase {
  id: string;
  title: string;
  status: "active" | "pending" | "suspended" | "closed" | "archived";
  type: string;
  court: string;
  nextDate?: string;
  priority: "critical" | "high" | "normal" | "low";
}

export interface ClientTask {
  id: string;
  title: string;
  dueDate: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "inprogress" | "done";
}

// Keyed by client name (matches Case.client field)
export const CLIENT_CASES: Record<string, ClientCase[]> = {
  "شركة الأفق للتجارة": [
    { id: "1", title: "نزاع تجاري — شركة الأفق", status: "active",  type: "تجاري",    court: "المحكمة التجارية",  nextDate: "٢٠ أبريل", priority: "critical" },
  ],
  "أحمد الزاهد": [
    { id: "2", title: "فسخ عقد إيجار — المالك وزاهد", status: "pending", type: "مدني", court: "المحكمة العامة", nextDate: "٢٥ أبريل", priority: "high" },
  ],
  "خالد محمد القحطاني": [
    { id: "3", title: "قضية عمالية — فصل تعسفي ٤٥٦٧", status: "active", type: "عمالي", court: "المحكمة العمالية", nextDate: "٢٨ أبريل", priority: "high" },
  ],
  "سارة الدوسري": [
    { id: "4", title: "استئناف العقار ٢١٣", status: "active", type: "عقاري", court: "محكمة الاستئناف", nextDate: "٢ مايو", priority: "critical" },
  ],
  "ريم المطيري": [
    { id: "5", title: "طلاق وحضانة — المطيري", status: "suspended", type: "شخصية", court: "المحكمة العامة", priority: "normal" },
  ],
  "علي السبيعي": [
    { id: "6", title: "مطالبة إدارية — التأمينات", status: "closed", type: "إداري", court: "المحكمة الإدارية", priority: "low" },
  ],
  "مجموعة الرياض العقارية": [],
};

// Tasks per client
export const CLIENT_TASKS: Record<string, ClientTask[]> = {
  "شركة الأفق للتجارة": [
    { id: "t1", title: "صياغة مذكرة ردّ على الخصم", dueDate: "اليوم",     priority: "high",   status: "todo" },
    { id: "t2", title: "التواصل مع إدارة الأفق لتحديث الوضع", dueDate: "غداً", priority: "medium", status: "todo" },
  ],
  "خالد محمد القحطاني": [
    { id: "t3", title: "مراسلة القحطاني بشأن الأتعاب المتأخرة", dueDate: "الأسبوع القادم", priority: "high", status: "todo" },
  ],
  "سارة الدوسري": [
    { id: "t4", title: "إعداد صحيفة الاستئناف", dueDate: "١٥ أبريل", priority: "high", status: "inprogress" },
  ],
  "ريم المطيري": [
    { id: "t5", title: "محاولة التواصل — آخر محاولة قبل إغلاق الملف", dueDate: "متأخر", priority: "low", status: "todo" },
  ],
};
