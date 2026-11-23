/**
 * aiCost.ts — owner ١٥٦ (batch l13): «التكلفة الحقيقية لكل أداة» on the admin
 * AI usage page. Each run's tokens (ai_runs.usage, as the workflow reported
 * them) × the one price table (modelPrices.ts), summed per tool over the last
 * 7 and 30 days.
 *
 * Honest by construction:
 *   - a run that reported no tokens (every run before batch l13 reported 0 / 0)
 *     is counted under «بلا عدد رموز», never as a free run: its cost is unknown;
 *   - a run whose model has no price in the table is counted under «بلا سعر»;
 *   - failed runs count too — the model was called, the provider bills it;
 *   - admin runs (owner ١٥٦: free to him, logged) are split from the users'
 *     runs, since they cost real money all the same.
 *
 * Pure: `node --test` runs it; the route (api/v1/admin/ai-cost) feeds it.
 */
import { SAR_PER_USD, hasTokens, modelPriceOf, usageCostUsd, type TokenUsage } from "./modelPrices.ts";

export interface CostRunRow {
  tool: string;
  model: string | null;
  usage: TokenUsage | null;
  status: string;
  created_at: string;
  user_id: string;
}

export interface ToolCost {
  tool: string;
  runs: number;
  failedRuns: number;
  /** Runs whose tokens and price are both known: the only ones in `costUsd`. */
  pricedRuns: number;
  /** Runs that reported no tokens: their cost is unknown. */
  noUsageRuns: number;
  /** Runs with tokens but a model missing from the price table. */
  unpricedRuns: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  costSar: number;
  adminRuns: number;
  adminCostSar: number;
  userRuns: number;
  userCostSar: number;
  /** Models seen on this tool's runs. */
  models: string[];
}

export interface CostWindow {
  days: number;
  tools: ToolCost[];
  total: Omit<ToolCost, "tool" | "models">;
}

const emptyTool = (tool: string): ToolCost => ({
  tool,
  runs: 0,
  failedRuns: 0,
  pricedRuns: 0,
  noUsageRuns: 0,
  unpricedRuns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
  costSar: 0,
  adminRuns: 0,
  adminCostSar: 0,
  userRuns: 0,
  userCostSar: 0,
  models: [],
});

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** One window: every run created in the last `days` days before `now`, grouped by tool (dearest first). */
export function costWindow(rows: readonly CostRunRow[], adminIds: ReadonlySet<string>, now: Date, days: number): CostWindow {
  const since = now.getTime() - days * 86_400_000;
  const byTool = new Map<string, ToolCost>();
  for (const r of rows) {
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at) || at < since || at > now.getTime()) continue;
    const t = byTool.get(r.tool) ?? emptyTool(r.tool);
    byTool.set(r.tool, t);
    const admin = adminIds.has(r.user_id);
    t.runs += 1;
    if (r.status === "failed") t.failedRuns += 1;
    if (admin) t.adminRuns += 1;
    else t.userRuns += 1;
    const model = typeof r.model === "string" && r.model ? r.model : null;
    if (model && !t.models.includes(model)) t.models.push(model);
    if (!hasTokens(r.usage)) {
      t.noUsageRuns += 1;
      continue;
    }
    const u = r.usage as TokenUsage;
    t.inputTokens += num(u.input_tokens);
    t.outputTokens += num(u.output_tokens);
    t.cachedTokens += num(u.cache_read_tokens);
    const price = modelPriceOf(model);
    if (!price) {
      t.unpricedRuns += 1;
      continue;
    }
    const usd = usageCostUsd(u, price);
    t.pricedRuns += 1;
    t.costUsd += usd;
    if (admin) t.adminCostSar += usd * SAR_PER_USD;
    else t.userCostSar += usd * SAR_PER_USD;
  }
  const tools = [...byTool.values()].map((t) => ({
    ...t,
    costUsd: round4(t.costUsd),
    costSar: round4(t.costUsd * SAR_PER_USD),
    adminCostSar: round4(t.adminCostSar),
    userCostSar: round4(t.userCostSar),
  }));
  tools.sort((a, b) => b.costSar - a.costSar || b.runs - a.runs || a.tool.localeCompare(b.tool));
  const total = emptyTool("");
  for (const t of tools) {
    for (const k of [
      "runs", "failedRuns", "pricedRuns", "noUsageRuns", "unpricedRuns", "inputTokens", "outputTokens", "cachedTokens",
      "costUsd", "costSar", "adminRuns", "adminCostSar", "userRuns", "userCostSar",
    ] as const) {
      total[k] += t[k];
    }
  }
  const { tool: _tool, models: _models, ...rest } = total;
  void _tool;
  void _models;
  return {
    days,
    tools,
    total: { ...rest, costUsd: round4(rest.costUsd), costSar: round4(rest.costSar), adminCostSar: round4(rest.adminCostSar), userCostSar: round4(rest.userCostSar) },
  };
}

/** The two windows the page shows. */
export const COST_WINDOWS = [7, 30] as const;

/** «٠٫٠١٢٣ ر.س» — small amounts keep four decimals, so a cheap run is not shown as 0. */
export function sarText(sar: number): string {
  const digits = sar > 0 && sar < 1 ? 4 : 2;
  return `${sar.toLocaleString("ar-SA", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ر.س`;
}
