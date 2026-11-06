/**
 * BUG-LIB-04 (S1 Task 12): the examples behind the ⓘ beside every library
 * search bar. Each one is a query the engine really parses
 * (parseSearchQuery, src/utils/normalizeArabic.ts) — the test keeps the help
 * honest: a row the engine cannot read fails the build.
 */
export const SEARCH_SYNTAX_EXAMPLES: ReadonlyArray<{ query: string; explainAr: string }> = [
  { query: "\"غرامة تأخير\"", explainAr: "عبارة مطابقة بالترتيب نفسه" },
  { query: "عدم نفاذ + قرار", explainAr: "يجب أن تجتمع الكلمات كلها" },
  { query: "فسخ / إنهاء", explainAr: "إحداهما تكفي" },
  { query: "تحكيم -دولي", explainAr: "استبعاد ما فيه «دولي»" },
  { query: "اختصاص*", explainAr: "الكلمة وما يتفرع منها" },
  { query: "لايكون", explainAr: "يجد «لا يكون» و«لايكون» معاً" },
  { query: "قرار", explainAr: "يجد «القرار» و«بالقرار» و«للقرار»" },
];
