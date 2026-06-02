// ─── Types ─────────────────────────────────────────────────────────────────────

export type OutputType =
  | "consult"        // استشارة قانونية
  | "study"          // دراسة قانونية
  | "legal-memo"     // مذكرة رأي
  | "research"       // بحث قانوني خالص
  | "due-diligence"  // تقرير العناية الواجبة
  | "letter"         // خطاب رسمي / إنذار / مطالبة
  | "cross-exam";    // مُولّد أسئلة الاستجواب

export type SearchDepth = "quick" | "deep" | "comprehensive";
export type StepKey = "type" | "context" | "settings" | "processing" | "result";
