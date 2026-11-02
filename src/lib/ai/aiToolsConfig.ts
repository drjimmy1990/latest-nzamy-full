/**
 * aiToolsConfig.ts — the runtime switches of the AI tools, from
 * platform_settings.ai_tools (plan §1 rule 5, §3):
 *
 *   { "<tool>": { "mode": "off" | "staff" | "live", "daily_limit": <int ≥ 0> } }
 *
 * "staff" runs the tool for admins only (a production test before D10 and
 * before anyone else may use it).
 *
 * "review" (charge, store, hide until the team releases it) is no longer
 * offered: nothing releases or refunds a review run yet, so a user paid for a
 * result he never saw (owner package 2026-11-02, slice C §3.1-3 / R4). The
 * admin write refuses it; a value already stored still parses, and the run
 * path treats it as "staff" (effectiveToolMode). Wave 3 brings it back as a
 * money-safe gate (release / reject with a refund, admins always see output).
 *
 * A tool the setting does not name keeps its registry default (tools.ts). A
 * malformed entry is ignored field by field, never read as "live": a typo in
 * mode leaves the default, which is "off" for every tool until it is tested.
 *
 * Pure: relative imports only, so `node --test` runs it.
 */
import type { AiToolMode, AiToolSpec } from "./tools.ts";

/** What a run can actually meet: a stored "review" never reaches the run path. */
export type RunnableAiToolMode = Exclude<AiToolMode, "review">;

export interface AiToolRuntime {
  mode: RunnableAiToolMode;
  dailyLimit: number;
  /** Present only when the stored (or default) mode was "review", for the admin page. */
  legacyMode?: "review";
}

/** Every mode a stored setting may hold and still parse. */
const MODES: ReadonlySet<string> = new Set(["off", "staff", "review", "live"]);
/** The modes an admin may write now. */
const WRITABLE_MODES: ReadonlySet<string> = new Set(["off", "staff", "live"]);
export const MAX_DAILY_LIMIT = 1000;

/** The 400 for an admin write that still names "review". */
export const REVIEW_MODE_REFUSED_AR =
  'وضع "بمراجعة" (review) غير متاح حالياً — اختر: متوقفة (off)، أو للمشرفين فقط (staff)، أو مفعّلة (live)';

/**
 * The mode the run path obeys. A stored "review" runs as "staff": admins run
 * the tool and see its output, everyone else is refused before any charge,
 * exactly as on a "staff" tool. Wave 3 (the money-safe release gate) replaces
 * this mapping with a real review that releases or refunds.
 */
export function effectiveToolMode(mode: AiToolMode): RunnableAiToolMode {
  return mode === "review" ? "staff" : mode;
}

export function resolveToolRuntime(spec: AiToolSpec, setting: unknown): AiToolRuntime {
  const entry =
    typeof setting === "object" && setting !== null && !Array.isArray(setting)
      ? (setting as Record<string, unknown>)[spec.id]
      : undefined;
  const e = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
  const stored = typeof e.mode === "string" && MODES.has(e.mode) ? (e.mode as AiToolMode) : spec.defaultMode;
  const limit = e.daily_limit;
  const dailyLimit =
    typeof limit === "number" && Number.isInteger(limit) && limit >= 0 && limit <= MAX_DAILY_LIMIT
      ? limit
      : spec.dailyLimit;
  const mode = effectiveToolMode(stored);
  return stored === "review" ? { mode, dailyLimit, legacyMode: "review" } : { mode, dailyLimit };
}

/** The admin settings validator for platform_settings.ai_tools: an error string, or null. */
export function aiToolsSettingIssue(value: unknown, knownTools: readonly string[]): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return 'قيمة ai_tools يجب أن تكون كائناً بالشكل: {"<الأداة>": {"mode": "off"|"staff"|"live", "daily_limit": عدد}}';
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
    if (e.mode === "review") return `${REVIEW_MODE_REFUSED_AR} — الأداة: ${tool}`;
    if (e.mode !== undefined && !(typeof e.mode === "string" && WRITABLE_MODES.has(e.mode))) {
      return `قيمة mode للأداة ${tool} يجب أن تكون "off" أو "staff" أو "live"`;
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

/**
 * A stored run as the reader may see it. A "review" row's output is held back
 * from its owner (rows stored before review was retired: charged, hidden, and
 * nothing releases them until Wave 3), but never from an admin: the owner's
 * rule is that the admin always sees the output. `viewerIsAdmin` must fail
 * closed: an unread profile is not an admin.
 */
export function runForViewer<T extends { status?: unknown; output?: unknown; citations?: unknown }>(
  run: T,
  viewerIsAdmin: boolean,
): T {
  return run.status === "review" && !viewerIsAdmin ? { ...run, output: null, citations: [] } : run;
}
