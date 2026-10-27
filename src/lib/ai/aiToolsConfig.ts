/**
 * aiToolsConfig.ts — the runtime switches of the AI tools, from
 * platform_settings.ai_tools (plan §1 rule 5, §3):
 *
 *   { "<tool>": { "mode": "off" | "staff" | "review" | "live", "daily_limit": <int ≥ 0> } }
 *
 * "staff" runs the tool for admins only (a production test before D10 and
 * before anyone else may use it).
 *
 * A tool the setting does not name keeps its registry default (tools.ts). A
 * malformed entry is ignored field by field, never read as "live": a typo in
 * mode leaves the default, which is "off" for every tool until it is tested.
 *
 * Pure: relative imports only, so `node --test` runs it.
 */
import type { AiToolMode, AiToolSpec } from "./tools.ts";

export interface AiToolRuntime {
  mode: AiToolMode;
  dailyLimit: number;
}

const MODES: ReadonlySet<string> = new Set(["off", "staff", "review", "live"]);
export const MAX_DAILY_LIMIT = 1000;

export function resolveToolRuntime(spec: AiToolSpec, setting: unknown): AiToolRuntime {
  const entry =
    typeof setting === "object" && setting !== null && !Array.isArray(setting)
      ? (setting as Record<string, unknown>)[spec.id]
      : undefined;
  const e = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
  const mode = typeof e.mode === "string" && MODES.has(e.mode) ? (e.mode as AiToolMode) : spec.defaultMode;
  const limit = e.daily_limit;
  const dailyLimit =
    typeof limit === "number" && Number.isInteger(limit) && limit >= 0 && limit <= MAX_DAILY_LIMIT
      ? limit
      : spec.dailyLimit;
  return { mode, dailyLimit };
}

/** The admin settings validator for platform_settings.ai_tools: an error string, or null. */
export function aiToolsSettingIssue(value: unknown, knownTools: readonly string[]): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return 'قيمة ai_tools يجب أن تكون كائناً بالشكل: {"<الأداة>": {"mode": "off"|"staff"|"review"|"live", "daily_limit": عدد}}';
  }
  for (const [tool, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!knownTools.includes(tool)) return `أداة غير معروفة في ai_tools: ${tool}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return `إعداد الأداة ${tool} يجب أن يكون كائناً`;
    }
    const e = entry as Record<string, unknown>;
    for (const k of Object.keys(e)) {
      if (k !== "mode" && k !== "daily_limit") return `حقل غير معروف في إعداد ${tool}: ${k}`;
    }
    if (e.mode !== undefined && !(typeof e.mode === "string" && MODES.has(e.mode))) {
      return `قيمة mode للأداة ${tool} يجب أن تكون "off" أو "staff" أو "review" أو "live"`;
    }
    if (
      e.daily_limit !== undefined &&
      !(typeof e.daily_limit === "number" && Number.isInteger(e.daily_limit) && e.daily_limit >= 0 && e.daily_limit <= MAX_DAILY_LIMIT)
    ) {
      return `قيمة daily_limit للأداة ${tool} يجب أن تكون عدداً صحيحاً من 0 إلى ${MAX_DAILY_LIMIT}`;
    }
  }
  return null;
}
