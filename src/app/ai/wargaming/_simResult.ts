/**
 * The L9 result as the screen reads it. The server has already kept only the
 * points for the targets asked (tools.ts wargamingOutput) and replaced the
 * model's cited list with the library's verdict (citation_check). There is
 * no probability anywhere (owner ١٩٣).
 *
 * Pure: `node --test` runs it.
 */
export type SimSource = "opponent" | "court" | "critique" | "plea";

export interface SimResultPoint {
  source: SimSource;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  counter: string;
}

export interface SimResult {
  summary: string;
  points: SimResultPoint[];
  plea_script: string;
  citation_check: unknown[];
}

export const SOURCE_LABEL: Record<SimSource, string> = {
  opponent: "محاكاة الخصم",
  court: "ما ستفحصه المحكمة",
  critique: "نقض المذكرة",
  plea: "تدريب المرافعة",
};
export const SEVERITY_LABEL = { high: "خطر عالٍ", medium: "خطر متوسط", low: "تحسين" } as const;
const ORDER: SimSource[] = ["opponent", "court", "critique", "plea"];
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function asSimResult(output: Record<string, unknown> | null): SimResult | null {
  if (!output || typeof output.summary !== "string" || !Array.isArray(output.points)) return null;
  return {
    summary: output.summary,
    points: output.points as SimResultPoint[],
    plea_script: typeof output.plea_script === "string" ? output.plea_script : "",
    citation_check: Array.isArray(output.citation_check) ? output.citation_check : [],
  };
}

/** The points by target, in the wizard's order, the most serious first in each. */
export function groupPoints(points: readonly SimResultPoint[]): { source: SimSource; points: SimResultPoint[] }[] {
  return ORDER.map((source) => ({
    source,
    points: points.filter((p) => p.source === source).sort((a, b) => (RANK[a.severity] ?? 1) - (RANK[b.severity] ?? 1)),
  })).filter((g) => g.points.length > 0);
}

export function simResultText(r: SimResult): string {
  return [
    r.summary,
    "",
    ...groupPoints(r.points).flatMap((g) => [
      `${SOURCE_LABEL[g.source]}:`,
      ...g.points.map((p) => `• [${SEVERITY_LABEL[p.severity] ?? "خطر متوسط"}] ${p.title} — ${p.detail}${p.counter ? `\n  ما تفعله: ${p.counter}` : ""}`),
      "",
    ]),
    ...(r.plea_script ? ["سكريبت المرافعة:", r.plea_script] : []),
  ].join("\n").trim();
}
