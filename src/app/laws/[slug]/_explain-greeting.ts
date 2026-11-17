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

export function explainGreeting(input: {
  num: string;
  articleTitle?: string | null;
  lawName?: string | null;
  isRTL: boolean;
}): string {
  const num = clean(input.num);
  const title = clean(input.articleTitle);
  const law = clean(input.lawName);

  if (input.isRTL) {
    const subject = title ? ` المتضمنة لـ «${title}»` : law ? ` من «${law}»` : "";
    return `أهلاً بك. هل تريدني أن أشرح لك ${num}${subject} أم لديك استفسار محدد حولها؟ أجيب من نصوص المكتبة وحدها، وأذكر مصدر كل جملة.`;
  }
  const subject = title ? ` (${title})` : law ? ` of ${law}` : "";
  return `Welcome. Would you like an explanation of ${num}${subject}, or do you have a specific question about it? I answer from the library's texts only and cite each one.`;
}
