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
import { extractLegalRefs, missingLegalRefs } from "./legalRefs.ts";

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
  /** Letter-type tools sign with the user's name (plan §2.2); every other tool gets null. */
  sendsDisplayName?: boolean;
  validateInput: (raw: unknown) => InputCheck;
  /**
   * The output that may be stored and shown, or null when it breaks the tool's
   * shape. `input` is the validated input the run was started with, for tools
   * whose output must keep something of it (منقح ناجز keeps every reference).
   */
  validateOutput: (raw: unknown, input: Record<string, unknown>) => Record<string, unknown> | null;
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

// ── wave 1: text only, fast, no retrieval (plan §5, «Wave 1») ───────────────
// Both start off: D10 (personal data sent to a provider outside the Kingdom)
// must be disclosed before a tool goes live. An admin switches them on.

export const COMMUNICATE_TYPES = ["letter", "email", "wa", "notice", "reply"] as const;
export const COMMUNICATE_TONES = ["رسمي جداً", "رسمي", "دبلوماسي", "حازم", "تسوية ودية"] as const;
export const COMMUNICATE_BODY_MAX = 3000;
export const COMMUNICATE_TEXT_MAX = 6000;

/** L1 المتحدث الذكي: what to say → the message, in the chosen channel and tone. */
function communicateInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  if (!(COMMUNICATE_TYPES as readonly unknown[]).includes(raw.type)) return { ok: false, error: "اختر نوع الرسالة" };
  if (!(COMMUNICATE_TONES as readonly unknown[]).includes(raw.tone)) return { ok: false, error: "اختر الأسلوب" };
  const body = boundedText(raw.body, COMMUNICATE_BODY_MAX);
  if (!body) return { ok: false, error: "اكتب ما تريد قوله (حتى ٣٬٠٠٠ حرف)" };
  const optional = (v: unknown, max: number): string | null | false => {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return null;
    return boundedText(v, max) ?? false;
  };
  const recipient = optional(raw.recipient, 150);
  if (recipient === false) return { ok: false, error: "اسم المستلم طويل (حتى ١٥٠ حرفاً)" };
  const subject = optional(raw.subject, 200);
  if (subject === false) return { ok: false, error: "الموضوع طويل (حتى ٢٠٠ حرف)" };
  return { ok: true, input: { type: raw.type, tone: raw.tone, recipient, subject, body } };
}

function communicateOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const text = boundedText(raw.text, COMMUNICATE_TEXT_MAX);
  return text ? { text } : null;
}

/** Najiz's memo field: the hard limit, and the length R5 shortens to. */
export const NAJIZ_MAX_CHARS = 10_000;
export const NAJIZ_TARGET_CHARS = 9_000;
/** The longest cleaned memo R5 accepts. */
export const NAJIZ_INPUT_MAX = 40_000;

/**
 * L2 منقح ناجز R5: a memo still over the limit after the free R1–R4 rules (run
 * in the browser) → the same memo in ≤ 9,000 characters. A memo already within
 * 9,000 is refused, so nobody pays for nothing. The references are extracted
 * here, sent to the model as `must_keep`, and checked again on the output.
 */
function najizInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw) || typeof raw.text !== "string") return { ok: false, error: "المدخلات غير صالحة" };
  const text = raw.text.trim();
  if (text.length <= NAJIZ_TARGET_CHARS) {
    return { ok: false, error: "النص ضمن الحد بعد التنقيح؛ لا يحتاج إلى اختصار" };
  }
  if (text.length > NAJIZ_INPUT_MAX) return { ok: false, error: "النص أطول من ٤٠٬٠٠٠ حرف؛ قسّمه إلى مذكرتين" };
  return { ok: true, input: { text, must_keep: extractLegalRefs(text).slice(0, 300) } };
}

function najizOutput(raw: unknown, input: Record<string, unknown>): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const text = boundedText(raw.text, NAJIZ_TARGET_CHARS);
  if (!text) return null;
  // Recomputed from the input text, not read from the stored list: the proof
  // that nothing was dropped never rests on data that passed through n8n.
  // No input to check against (never for a fast run) means nothing is proven.
  if (typeof input.text !== "string") return null;
  const required = extractLegalRefs(input.text);
  if (missingLegalRefs(required, text).length > 0) return null;
  return { text, kept_refs: required };
}

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
  communicate: {
    id: "communicate",
    n8nPath: "nzamy-ai/communicate",
    class: "fast",
    tier: "fast",
    roles: ["lawyer", "firm"],
    consultantBlocked: false,
    price: () => 5,
    dailyLimit: 40,
    defaultMode: "off",
    sendsDisplayName: true,
    validateInput: communicateInput,
    validateOutput: communicateOutput,
  },
  "najiz-optimizer": {
    id: "najiz-optimizer",
    n8nPath: "nzamy-ai/najiz-optimizer",
    class: "fast",
    tier: "fast",
    roles: ["lawyer", "firm"],
    // CONSULTANT_BLOCKED_PREFIXES has /ai/najiz-optimizer (Art. 18).
    consultantBlocked: true,
    // The pricing table's «منقح ناجز» row (owner ٢١٦: ٥–٨); the plan's 15 is older.
    price: () => 5,
    dailyLimit: 20,
    defaultMode: "off",
    validateInput: najizInput,
    validateOutput: najizOutput,
  },
};

export function getAiTool(id: unknown): AiToolSpec | null {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(AI_TOOLS, id)) return null;
  return AI_TOOLS[id];
}
