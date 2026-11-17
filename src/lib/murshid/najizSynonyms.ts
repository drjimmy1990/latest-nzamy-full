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
 * Left out on purpose: «وقف/أوقاف» (bare «وقف» is also «وقف تنفيذ»،
 * «وقف الأعمال الجديدة»).
 */
import type { NajizSynonymGroup } from "./najizSearch.ts";

export const NAJIZ_SYNONYMS: readonly NajizSynonymGroup[] = [
  { words: ["طلاق", "خلع", "فرقة", "فسخ عقد الزواج", "فسخ نكاح"] },
  { words: ["إيجار", "تأجير", "إجارة", "استئجار"] },
  // «عمل» and «عمالة» open the labour group but are not searched for it:
  // bare «عمل» is also in «يعمل»، «الأعمال التجارية», and «عمالة» (ة = ه)
  // matches inside «أعمالهم» — both would pull in commercial contracts.
  { words: ["عمالية", "عمالي", "صاحب العمل"], triggers: ["عمل", "عمالة"] },
  { words: ["تركة", "ورثة", "ميراث", "مواريث"] },
  { words: ["مقاولة", "مقاولات", "مقاول"] },
  { words: ["وصية", "وصايا"] },
  { words: ["ولاية", "ولايات"] },
  { words: ["شركة", "شركات"] },
];
