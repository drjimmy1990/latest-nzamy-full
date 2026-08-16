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
// "submit" is the real replacement for the old processing/result theatre
// (Task C4). "processing"/"result" stay in the union because ProcessingView
// / ResultView / CrossExamResultView are kept — hidden, not deleted — behind
// JSX conditionals in page.tsx that still type-check against these values;
// no live code path sets currentStep to either any more.
export type StepKey = "type" | "context" | "settings" | "processing" | "result" | "submit";
