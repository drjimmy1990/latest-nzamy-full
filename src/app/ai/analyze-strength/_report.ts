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

export interface StrengthReport {
  grounds: { level: Level; summary: string; strengths: string[]; weaknesses: string[]; recommendations: string[] };
  opponent: { kind: "attack" | "defense"; move: string; counter: string }[];
  risks: { risk: string; level: Severity; mitigation: string }[];
  devil: { label: string; text: string; severity: "critical" | "high" | "medium" }[];
  citation_check: unknown[];
}

export const LEVEL_LABEL: Record<Level, string> = { strong: "أسانيد قوية", medium: "أسانيد متوسطة", weak: "أسانيد ضعيفة" };
export const RISK_LABEL: Record<Severity, string> = { high: "مرتفع", medium: "متوسط", low: "منخفض" };

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function asStrengthReport(output: Record<string, unknown> | null): StrengthReport | null {
  const g = output?.grounds as Record<string, unknown> | undefined;
  if (!g || typeof g.summary !== "string") return null;
  return {
    grounds: {
      level: g.level === "strong" || g.level === "weak" ? g.level : "medium",
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

/** The report as plain text, for copying into a memo or a note. */
export function strengthReportText(r: StrengthReport): string {
  const lines = (title: string, items: string[]) => (items.length ? [title, ...items.map((s) => `• ${s}`), ""] : []);
  return [
    `قوة الأسانيد: ${LEVEL_LABEL[r.grounds.level]}`,
    r.grounds.summary,
    "",
    ...lines("نقاط القوة:", r.grounds.strengths),
    ...lines("نقاط الضعف:", r.grounds.weaknesses),
    ...lines("التوصيات:", r.grounds.recommendations),
    ...lines("تحركات الخصم المتوقعة:", r.opponent.map((m) => `${m.move} — الرد: ${m.counter}`)),
    ...lines("المخاطر الإجرائية:", r.risks.map((x) => `${x.risk} (${RISK_LABEL[x.level] ?? "متوسط"}) — ${x.mitigation}`)),
    ...lines("محامي الشيطان:", r.devil.map((d) => `${d.label}: ${d.text}`)),
  ].join("\n").trim();
}
