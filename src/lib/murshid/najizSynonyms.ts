/**
 * najizSynonyms — the small synonyms list behind the «دليل ناجز» search on
 * /ai/procedures (owner package 13 Nov, N06-6..10: «البحث الفوري المرادف»).
 *
 * DATA ONLY. Each group is a set of words a person may type for the same thing;
 * typing any one finds rows holding any other. Keep it to common, obviously
 * correct pairs — a word with another meaning in the tree stays out (bare
 * «فسخ» also means «فسخ ولاية»، «أجرة» is also «أجرة الرضاع»). A unit test
 * checks every group still finds at least one of the 243 najiz types.
 *
 * Words are written without the article («إيجار» not «الإيجار»): the search
 * matches them with or without it. A multi-word entry is matched as a phrase.
 */
export const NAJIZ_SYNONYMS: readonly (readonly string[])[] = [
  ["طلاق", "خلع", "فرقة", "فسخ عقد الزواج", "فسخ نكاح"],
  ["إيجار", "تأجير", "إجارة", "استئجار"],
  ["عمالية", "عمالي", "عمالة", "عمل"],
  ["تركة", "ورثة", "ميراث", "مواريث"],
  ["مقاولة", "مقاولات", "مقاول"],
  ["وصية", "وصايا"],
  ["وقف", "أوقاف"],
  ["ولاية", "ولايات"],
  ["شركة", "شركات"],
];
