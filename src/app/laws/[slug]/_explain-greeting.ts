/**
 * The opening line of «اشرح لي» (ArticleExplainModal in ./_ai-components.tsx).
 *
 * N02-5 (owner, 13-Nov package): most articles have no title of their own, and
 * the greeting printed «…المادة الثمانون المتضمنة لـ "" أم…» — two empty
 * quotes. It now names the article's title when there is one, else the law it
 * belongs to, else just the article number.
 *
 * Pure, no imports: `node --test` loads it (_explain-greeting.test.ts).
 */

const clean = (value: string | null | undefined): string => (typeof value === "string" ? value.trim() : "");

/** The line under «اشرح لي — المادة …»: the article's title, else the law's name, else "". */
export function explainSubtitle(articleTitle: string | null | undefined, lawName: string | null | undefined): string {
  return clean(articleTitle) || clean(lawName);
}

/**
 * W1 #54 (batch l16, B-17): an article whose label is a bare ordinal or number
 * («الأولى», «٥») reads «المادة الأولى» in a sentence. A label that already
 * names its unit («المادة …», «البند …», «الفقرة …»), a bracketed position
 * («(3)») or a topical heading of an unnumbered document («التعريفات») is kept
 * as written — never «المادة التعريفات».
 */
const ORDINAL_OR_NUMBER =
  /^(?:[0-9٠-٩]+|(?:ال)?(?:أولى|أول|ثاني[ةه]?|ثالث[ةه]?|رابع[ةه]?|خامس[ةه]?|سادس[ةه]?|سابع[ةه]?|ثامن[ةه]?|تاسع[ةه]?|عاشر[ةه]?|حادي[ةه]?|عشرون|ثلاثون|أربعون|خمسون|ستون|سبعون|ثمانون|تسعون|مائة|مئة|مائتان|مئتان))(?:\s|$)/u;

export function spokenArticle(num: string | null | undefined): string {
  const n = clean(num);
  if (!n) return "المادة";
  return ORDINAL_OR_NUMBER.test(n) ? `المادة ${n}` : n;
}

/**
 * Owner package 25-Nov §2.7 (batch l16, B-16 / E-20): «اشرح لي» sends this
 * request by itself as soon as the window opens (the article itself goes with
 * it as the first source), in place of a greeting that waited for a question.
 */
export function explainRequest(input: { num: string; articleTitle?: string | null; lawName?: string | null; isRTL: boolean }): string {
  const title = clean(input.articleTitle);
  const law = clean(input.lawName);
  if (input.isRTL) {
    const subject = title ? ` المتضمنة لـ «${title}»` : "";
    const from = law ? ` من «${law}»` : "";
    return `اشرح لي ${spokenArticle(input.num)}${subject}${from} بلغة واضحة، مع بيان ما يترتب عليها.`;
  }
  const num = clean(input.num) || "this article";
  return `Explain ${num}${title ? ` (${title})` : ""}${law ? ` of ${law}` : ""} in plain language, with what follows from it.`;
}

export function explainGreeting(input: {
  num: string;
  articleTitle?: string | null;
  lawName?: string | null;
  isRTL: boolean;
}): string {
  const num = input.isRTL ? spokenArticle(input.num) : clean(input.num);
  const title = clean(input.articleTitle);
  const law = clean(input.lawName);

  if (input.isRTL) {
    const subject = title ? ` المتضمنة لـ «${title}»` : law ? ` من «${law}»` : "";
    return `أهلاً بك. هل تريدني أن أشرح لك ${num}${subject} أم لديك استفسار محدد حولها؟ أجيب من نصوص المكتبة وحدها، وأذكر مصدر كل جملة.`;
  }
  const subject = title ? ` (${title})` : law ? ` of ${law}` : "";
  return `Welcome. Would you like an explanation of ${num}${subject}, or do you have a specific question about it? I answer from the library's texts only and cite each one.`;
}
