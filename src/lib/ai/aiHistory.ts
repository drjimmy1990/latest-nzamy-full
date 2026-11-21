/**
 * aiHistory.ts — L11-log «سجلّي» (owner file 03 ل11 and his file-13 row «ل12»,
 * batch l12): the signed-in user's own AI runs, one list for every tool.
 *
 * His rules:
 *   - the log is the USER'S ALONE (client facts are professional secrets):
 *     GET /api/v1/ai/history reads with the service role because
 *     ai_runs.input is column-locked from the session roles (20261027_10), so
 *     its `.eq("user_id", <the session's user>)` IS the access rule — pinned by
 *     aiHistory.test.ts — and the route takes no user id from the request;
 *   - staff never read the question or the answer except of a test account
 *     (runVisibility.staffMaySeeRunOutput);
 *   - a manual delete per run: user_hidden_at is stamped and the question,
 *     the answer and the sources are cleared at once; the money facts stay
 *     (a refund or an invoice still needs them) and the row leaves every list
 *     the user sees;
 *   - a retention the admin sets, 12 months by default
 *     (platform_settings.ai_runs_retention, read by public.ai_runs_retention(),
 *     20261202_40).
 *
 * Each row: the date, the tool, the question, the answer (an excerpt and the
 * link to the full run), the points charged, and «أعد الطرح».
 *
 * Pure, relative imports only — `node --test` loads it.
 */
import { AI_TOOL_LABELS_AR, AI_TOOL_PAGES, aiToolLabelAr } from "./toolLabels.ts";
import { stripCitationMarkers } from "./citationMarkers.ts";

/** Columns the history reads. Never source_ids / usage / model / error_message. */
export const AI_HISTORY_COLUMNS = "id, tool, status, charged, charged_points, refunded_at, input, output, created_at";
/** Rows per page of «سجلّي». */
export const AI_HISTORY_PAGE = 30;
/** The last runs a tool page shows (his «في صفحة كل أداة آخر 5 معاملات»). */
export const AI_HISTORY_RECENT = 5;
export const AI_HISTORY_QUESTION_MAX = 300;
export const AI_HISTORY_ANSWER_MAX = 400;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRunId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Tools a person can pick in the filter: every labelled tool except the test echo tools. */
export const AI_HISTORY_TOOLS: ReadonlyArray<{ id: string; label: string }> = Object.keys(AI_TOOL_LABELS_AR)
  .filter((id) => !id.startsWith("echo-"))
  .map((id) => ({ id, label: AI_TOOL_LABELS_AR[id] }));

/** A `?tool=` value the list accepts: a labelled tool id, nothing else. */
export function historyToolFilter(v: string | null | undefined): string | null {
  return v && Object.prototype.hasOwnProperty.call(AI_TOOL_LABELS_AR, v) && !v.startsWith("echo-") ? v : null;
}

/** `?before=` (an ISO time, the oldest row of the previous page) or null. */
export function historyCursor(v: string | null | undefined): string | null {
  if (!v || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function clip(text: string, max: number): string {
  const clean = stripCitationMarkers(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(max * 0.6)) cut = cut.slice(0, space);
  return `${cut.replace(/[\s،,.؛:]+$/u, "")}…`;
}

const QUESTION_KEYS = ["message", "question", "query", "facts", "text", "notes", "subject", "title", "claim", "description", "story"] as const;
const ANSWER_KEYS = ["reply", "answer", "summary", "text", "body", "result", "opinion", "story", "content"] as const;

function firstText(obj: unknown, keys: readonly string[]): string {
  if (typeof obj === "string") return obj;
  if (!isObj(obj)) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  // One level down (a tool that nests its case under one key), then any string field.
  for (const v of Object.values(obj)) {
    if (isObj(v)) {
      for (const k of keys) {
        const inner = v[k];
        if (typeof inner === "string" && inner.trim()) return inner;
      }
    }
  }
  for (const v of Object.values(obj)) if (typeof v === "string" && v.trim().length >= 4) return v;
  return "";
}

/** What the user asked, as one line (≤ 300 characters), or "" when the run kept none. */
export function runQuestion(input: unknown): string {
  return clip(firstText(input, QUESTION_KEYS), AI_HISTORY_QUESTION_MAX);
}

/** The start of the answer (≤ 400 characters), or "" (the full run is behind its link). */
export function runAnswer(output: unknown): string {
  return clip(firstText(output, ANSWER_KEYS), AI_HISTORY_ANSWER_MAX);
}

export interface AiHistoryItem {
  id: string;
  tool: string;
  toolLabel: string;
  createdAt: string;
  status: string;
  question: string;
  answer: string;
  /** Points charged and not refunded (0 for a free or refunded run). */
  points: number;
  refunded: boolean;
  /** The run's own page (/ai/runs/<id>): the full answer. */
  href: string;
  /** The tool's page for «أعد الطرح», or null when the tool has none (the library assistant opens the library). */
  toolHref: string | null;
}

export function historyItem(row: Record<string, unknown>): AiHistoryItem | null {
  if (!isRunId(row.id) || typeof row.tool !== "string" || typeof row.created_at !== "string") return null;
  const status = typeof row.status === "string" ? row.status : "";
  const charged = row.charged === true && typeof row.charged_points === "number" ? row.charged_points : 0;
  const refunded = typeof row.refunded_at === "string" && row.refunded_at !== "";
  const tool = row.tool;
  const page = Object.prototype.hasOwnProperty.call(AI_TOOL_PAGES, tool) ? AI_TOOL_PAGES[tool] : null;
  return {
    id: row.id,
    tool,
    toolLabel: aiToolLabelAr(tool),
    createdAt: row.created_at,
    status,
    question: runQuestion(row.input),
    // A held "review" row's answer is not its owner's yet (runVisibility.runForViewer).
    answer: status === "succeeded" ? runAnswer(row.output) : "",
    points: refunded ? 0 : charged,
    refunded,
    href: `/ai/runs/${row.id}`,
    toolHref: page ?? (tool === "library-assistant" ? "/laws" : null),
  };
}

// ─── retention (his «مدة احتفاظ تُحدَّد … 12 شهراً تُضبط من لوحة الإدارة») ─────

export const AI_RETENTION_SETTING = "ai_runs_retention";
export const AI_RETENTION_DEFAULT_MONTHS = 12;
export const AI_RETENTION_RANGE = Object.freeze({ min: 1, max: 60 });

/** {"months": N} → N; anything else → 12. The SQL function applies the same rule. */
export function parseRetentionMonths(value: unknown): number {
  const m = isObj(value) ? value.months : undefined;
  return typeof m === "number" && Number.isInteger(m) && m >= AI_RETENTION_RANGE.min && m <= AI_RETENTION_RANGE.max
    ? m
    : AI_RETENTION_DEFAULT_MONTHS;
}

/** PATCH /api/v1/admin/settings validator. */
export function retentionSettingIssue(value: unknown): string | null {
  if (!isObj(value) || Object.keys(value).some((k) => k !== "months")) {
    return 'قيمة ai_runs_retention يجب أن تكون بالشكل {"months": 12}';
  }
  const m = value.months;
  return typeof m === "number" && Number.isInteger(m) && m >= AI_RETENTION_RANGE.min && m <= AI_RETENTION_RANGE.max
    ? null
    : `months عدد صحيح من ${AI_RETENTION_RANGE.min} إلى ${AI_RETENTION_RANGE.max}`;
}

/** The columns a user's delete clears; the money facts and dates stay. */
export const AI_RUN_HIDE_CLEARS = Object.freeze({
  input: null,
  output: null,
  citations: null,
  source_ids: null,
  error_message: null,
});

/** Missing column (the SQL of 20261202_40 not run yet): the list works without the delete. */
export function isMissingHiddenColumn(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return (err.code === "42703" || err.code === "PGRST204") && /user_hidden_at/.test(err.message ?? "user_hidden_at");
}
