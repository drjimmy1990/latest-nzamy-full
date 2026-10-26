/**
 * tools.ts — the registry of AI tools (docs/plans/2026-10-26-ai-services-n8n-plan.md
 * §1, §5). One entry per tool: who may use it, what it costs, how long it may
 * take, which n8n webhook runs it, and the shape of its input and output.
 * Everything the run pipeline (runCore.ts) checks BEFORE the webhook comes
 * from here, so a tool is only ever as open as its entry says.
 *
 * Runtime overrides (mode, daily limit) live in platform_settings.ai_tools
 * (aiToolsConfig.ts) and are editable from admin without a deploy.
 *
 * Pure: no imports outside src/lib/ai, so `node --test` runs it.
 */

export type AiToolClass = "fast" | "job";
export type AiModelTier = "fast" | "deep";
export type AiToolMode = "off" | "review" | "live";

export type InputCheck =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; error: string };

export interface AiToolSpec {
  id: string;
  /** n8n webhook path under N8N_AI_BASE_URL. */
  n8nPath: string;
  class: AiToolClass;
  tier: AiModelTier;
  /** profiles.user_type values that may run the tool; admins always may. */
  roles: readonly string[];
  /** Art. 18: a consultant (practice_kind) may not run it. */
  consultantBlocked: boolean;
  /** The price in points, from the validated input (metered tools read `pages`). */
  price: (input: Record<string, unknown>, ctx: { pages: number | null }) => number;
  /** Runs per user per Riyadh day while nothing else limits them (plan §1.2). */
  dailyLimit: number;
  /** The mode until an admin sets one in platform_settings.ai_tools. */
  defaultMode: AiToolMode;
  /** Job tools: how long until the sweeper fails and refunds the run. */
  jobDeadlineSeconds?: number;
  validateInput: (raw: unknown) => InputCheck;
  /** The output that may be stored and shown, or null when it breaks the tool's shape. */
  validateOutput: (raw: unknown) => Record<string, unknown> | null;
}

/** The fast tools' wait for n8n's «Respond to Webhook» (nginx in front of the app cuts at 60 s). */
export const FAST_TIMEOUT_MS = 50_000;
/** A fast run's deadline for the sweeper: past the wait, in case the server died mid-call. */
export const FAST_DEADLINE_SECONDS = 90;
export const DEFAULT_JOB_DEADLINE_SECONDS = 15 * 60;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Trimmed text of 1..max characters, or null. */
export function boundedText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

// ── wave 0: the two round-trip tests (plan §5, «Wave 0», N0) ────────────────
// Off by default. An admin turns one on, runs it, and turns it off again. They
// cost 1 point so the charge and the refund show in the ledger.
function echoInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  const text = boundedText(raw.text, 500);
  if (!text) return { ok: false, error: "النص مطلوب (حتى ٥٠٠ حرف)" };
  return { ok: true, input: { text, use_model: raw.use_model === true } };
}

function echoOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const echo = boundedText(raw.echo, 2000);
  return echo ? { echo } : null;
}

const ECHO_ROLES = ["lawyer", "firm"] as const;

export const AI_TOOLS: Readonly<Record<string, AiToolSpec>> = {
  "echo-fast": {
    id: "echo-fast",
    n8nPath: "nzamy-ai/echo-fast",
    class: "fast",
    tier: "fast",
    roles: ECHO_ROLES,
    consultantBlocked: false,
    price: () => 1,
    dailyLimit: 30,
    defaultMode: "off",
    validateInput: echoInput,
    validateOutput: echoOutput,
  },
  "echo-job": {
    id: "echo-job",
    n8nPath: "nzamy-ai/echo-job",
    class: "job",
    tier: "fast",
    roles: ECHO_ROLES,
    consultantBlocked: false,
    price: () => 1,
    dailyLimit: 5,
    defaultMode: "off",
    jobDeadlineSeconds: 5 * 60,
    validateInput: echoInput,
    validateOutput: echoOutput,
  },
};

export function getAiTool(id: unknown): AiToolSpec | null {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(AI_TOOLS, id)) return null;
  return AI_TOOLS[id];
}
