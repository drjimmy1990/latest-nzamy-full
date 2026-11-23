/**
 * The L10 result as the screen reads it. The server has already rebuilt it
 * field by field (tools.ts analyzeStrengthOutput) and replaced the model's
 * cited list with the library's verdict (citation_check). Levels are words;
 * there is no score anywhere (owner ١٩٣).
 *
 * Pure: `node --test` runs it.
 */
export type Level = "strong" | "medium" | "weak";
export type Severity = "high" | "medium" | "low";

/**
 * Owner ١٧٤ / ١١٥ (batch l13): a level or severity the analysis did not give is
 * null and reads «لم يُحدَّد» — never a made-up «متوسط».
 */
export interface StrengthReport {
  grounds: { level: Level | null; summary: string; strengths: string[]; weaknesses: string[]; recommendations: string[] };
  opponent: { kind: "attack" | "defense"; move: string; counter: string }[];
  risks: { risk: string; level: Severity | null; mitigation: string }[];
  devil: { label: string; text: string; severity: "critical" | "high" | "medium" | null }[];
  citation_check: unknown[];
}

/** Owner ٤١٤ (7 Nov 2026): the position, never a verdict on the grounds' worth. */
export const LEVEL_LABEL: Record<Level, string> = { strong: "موقف قوي", medium: "موقف متوسط", weak: "يحتاج تدعيماً" };
/** Owner ١٧٤: the words for a rating the analysis did not give. */
export const UNRATED_LABEL = "لم يُحدَّد";
/** The position's words, or «لم يُحدَّد» when the analysis gave none. */
export function levelLabel(level: Level | null | undefined): string {
  return level ? LEVEL_LABEL[level] : `${UNRATED_LABEL} في التحليل`;
}

/** Owner ٤١٤: his wording, under the level on the screen and at the end of the exported text. */
export const STRENGTH_DISCLAIMER =
  "تقدير آلي استرشادي مبني على المعطيات المدخلة للمساعدة والتحليل فقط، ولا يُعد ضماناً لنتيجة قضائية أو رأياً نهائياً؛ إذ يخضع الفصل النهائي لسلطة المحكمة التقديرية.";
export const RISK_LABEL: Record<Severity, string> = { high: "مرتفع", medium: "متوسط", low: "منخفض" };

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function asStrengthReport(output: Record<string, unknown> | null): StrengthReport | null {
  const g = output?.grounds as Record<string, unknown> | undefined;
  if (!g || typeof g.summary !== "string") return null;
  return {
    grounds: {
      level: g.level === "strong" || g.level === "weak" || g.level === "medium" ? g.level : null,
      summary: g.summary,
      strengths: list<string>(g.strengths),
      weaknesses: list<string>(g.weaknesses),
      recommendations: list<string>(g.recommendations),
    },
    opponent: list(output!.opponent),
    risks: list(output!.risks),
    devil: list(output!.devil),
    citation_check: list(output!.citation_check),
  };
}

/** The report as plain text, for copying into a memo or a note (and the PDF / Word export), the disclaimer last. */
export function strengthReportText(r: StrengthReport): string {
  const lines = (title: string, items: string[]) => (items.length ? [title, ...items.map((s) => `• ${s}`), ""] : []);
  return [
    `تقدير الموقف: ${levelLabel(r.grounds.level)}`,
    r.grounds.summary,
    "",
    ...lines("نقاط القوة:", r.grounds.strengths),
    ...lines("نقاط الضعف:", r.grounds.weaknesses),
    ...lines("التوصيات:", r.grounds.recommendations),
    ...lines("تحركات الخصم المتوقعة:", r.opponent.map((m) => `${m.move} — الرد: ${m.counter}`)),
    ...lines("المخاطر الإجرائية:", r.risks.map((x) => `${x.risk} (${(x.level && RISK_LABEL[x.level]) || UNRATED_LABEL}) — ${x.mitigation}`)),
    ...lines("محامي الشيطان:", r.devil.map((d) => `${d.label}: ${d.text}`)),
  ].join("\n").trim() + `\n\n${STRENGTH_DISCLAIMER}`;
}
