/**
 * runCore.ts — the AI run pipeline (docs/plans/2026-10-26-ai-services-n8n-plan.md
 * §1, §1.2, §2). The app does every check and the charge BEFORE the webhook,
 * sends n8n one complete package, and settles the money on the answer:
 *
 *   startRunWith     the browser's POST /api/v1/ai/runs, after the route has
 *                    signed the user in and refused a frozen account:
 *                      tool → role → Art. 18 → mode → input → key → files
 *                      → pasted text (its limits, refused here when off)
 *                      → [library tool: the library gate + tier rule]
 *                      → ai_start_run (daily limit + balance + debit, one
 *                        transaction) — or, when the body asks `useCredit`
 *                        and the run qualifies, ai_start_run_with_credit
 *                        (a founder credit instead of points, P3)
 *                    A job tool answers 202 here, with the route's `defer`
 *                    running the rest after the reply (nginx cuts at 60 s, and
 *                    a consultation's searches alone can take most of that).
 *   dispatchRunWith  [library tool: searches → texts, refunded when none]
 *                      → the package → n8n
 *                    fast tool: n8n's reply is settled here, in the request;
 *                    job tool:  n8n's 202 leaves the run `running`.
 *                    Every way out of a charged run refunds it, a throw
 *                    included (dispatchSafely), and a run left `running` past
 *                    its deadline, by a restart for one, is ai_sweep_runs' to
 *                    fail and refund.
 *   settleRunWith    a result (the fast reply or the job callback) → the
 *                    output checked against the tool's shape, citations kept
 *                    only when they name a source the app sent, the run
 *                    marked succeeded; anything wrong → ai_fail_run (refund).
 *   callbackWith     POST /api/v1/ai/callback (n8n only): progress steps and
 *                    job results.
 *
 * Every write goes through the SERVICE-ROLE client: ai_runs has no session
 * write, and the money functions are granted to service_role alone.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSULTANT_BLOCKED_MESSAGE, type PracticeKind } from "../auth/practiceKind.ts";
import { resolveToolRuntime, toolAvailability, toolRoleRefusal } from "./aiToolsConfig.ts";
import type { N8nCall, N8nOutcome } from "./n8nClient.ts";
import { cleanQueries, type PackageSource, type RetrievalLimits, type RetrievalPin, type Retrieved } from "./retrieval.ts";
import type { AiFile, FileRules, FilesCheck } from "./aiFiles.ts";
import { enrichBriefCheck } from "./citationCheck.ts";
import { articleRefs, bareArticleNumbers } from "./questionRefs.ts";
import { creditKindForRun } from "../membership/founderPlan.ts";
import { FILE_TEXT_TTL_MS } from "./fileTextToken.ts";
import { textPages } from "./textExtract.ts";
import {
  STEP_LABEL_AR,
  cleanLabel,
  fileEvents,
  queryEvents,
  sourceEvents,
  toSourceRefs,
  verifyEvent,
  type ProgressEvent,
} from "./progressEvents.ts";

/**
 * Tools whose result the app completes from its own data before storing it.
 * L8, L9, L10: the library decides each cited article's status, never the model.
 */
const OUTPUT_ENRICHERS: Readonly<Record<string, (admin: SupabaseClient, output: Record<string, unknown>) => Promise<Record<string, unknown>>>> = {
  "brief-check": (admin, output) => enrichBriefCheck(admin as never, output),
  wargaming: (admin, output) => enrichBriefCheck(admin as never, output),
  "analyze-strength": (admin, output) => enrichBriefCheck(admin as never, output),
  "contract-drafter": (admin, output) => enrichBriefCheck(admin as never, output),
  // L12: the letter. The consultation needs none: it stands on the library texts it was sent.
  "legal-opinion-letter": (admin, output) => enrichBriefCheck(admin as never, output),
  "contracts-pro": (admin, output) => enrichBriefCheck(admin as never, output),
  "contract-review": (admin, output) => enrichBriefCheck(admin as never, output),
  "contract-negotiator": (admin, output) => enrichBriefCheck(admin as never, output),
  "legal-drafter": (admin, output) => enrichBriefCheck(admin as never, output),
};
import {
  DEFAULT_JOB_DEADLINE_SECONDS,
  FAST_DEADLINE_SECONDS,
  FAST_TIMEOUT_MS,
  LIB_QUERIES_PATH,
  getAiTool,
  isLibraryNoAnswer,
  type AiToolSpec,
} from "./tools.ts";

export interface RouteReply {
  status: number;
  body: Record<string, unknown>;
}

export interface RunActor {
  userId: string;
  userType: string;
  practiceKind: PracticeKind;
  displayName: string | null;
}

export interface StartRunDeps {
  /** callN8n with the base URL and key already bound. */
  n8n: (call: Pick<N8nCall, "path" | "mode" | "body" | "timeoutMs">) => Promise<N8nOutcome>;
  callbackUrl: string;
  now?: () => Date;
  /**
   * Library tools only: the library gate and the assistant's tier rule, and
   * for the library's own AI the library lock (readQuota.isLibraryAiTool),
   * before the charge. `toolId` is the registry id. A reply refuses the run;
   * null lets it go on.
   */
  libraryAccess?: (toolId: string) => Promise<RouteReply | null>;
  /**
   * Called once, right after ai_start_run CREATED the run (never for a
   * refusal or a duplicate request): the route's «نشاط المكتبة» tally
   * (libraryRunAccess.libraryRunCreated). `toolId` is the registry id.
   */
  onRunCreated?: (toolId: string) => void;
  /** Library tools only: the searches → the texts (retrieval.retrieveLibrary). */
  retrieve?: (queries: string[], limits: RetrievalLimits, pin: RetrievalPin) => Promise<Retrieved>;
  /** File tools only: the caller's vault files checked, counted and signed (aiFiles.resolveAiFiles). */
  resolveFiles?: (userId: string, fileIds: unknown, rules: FileRules) => Promise<FilesCheck>;
  /**
   * Pasted text (AiToolSpec.pasteAsFile): the signed link n8n fetches it from.
   * Absent while NZAMY_AI_TEXT_FILES is off: a paste is then refused, uncharged.
   */
  pastedFileUrl?: (runId: string, userId: string, field: string) => string;
  /** The clock for the fast tools' time budget, in ms (tests replace it). */
  clock?: () => number;
  /**
   * Runs a job tool's dispatch after the reply (`after` from next/server). With
   * no `defer`, or when it throws, the dispatch stays in the request.
   */
  defer?: (task: () => Promise<void>) => void;
  /**
   * The run's waiting screen: file names, searches, law titles (R7, never a text,
   * a token or a link). Fire-and-forget, never awaited on the money path, and a
   * throw is swallowed by `report`.
   */
  progress?: ProgressReporter;
}

export type ProgressReporter = (runId: string, userId: string, events: ProgressEvent[]) => void;

/** The source map stored on the run: short id in the prompt → the library item. */
export type SourceMap = Record<string, { kind: string; id: string; title?: string; url?: string }>;

export const AI_COPY = {
  unknownTool: "أداة غير معروفة",
  role: "هذه الأداة غير متاحة لنوع حسابك",
  off: "هذه الأداة غير متاحة حالياً",
  key: "مفتاح الطلب غير صالح — أعد المحاولة",
  noFiles: "هذه الأداة لا تقبل ملفات",
  points: "رصيدك من النقاط لا يكفي لهذه الأداة",
  daily: "بلغت الحد اليومي لهذه الأداة — حاول غداً",
  duplicate: "هذا الطلب أُرسل من قبل",
  notReady: "خدمة الذكاء الاصطناعي غير مفعّلة بعد",
  unavailable: "تعذّر بدء الأداة الآن — حاول بعد قليل",
  failed: "تعذّر إكمال الطلب، وأُعيدت نقاطك",
  timeout: "استغرق الطلب وقتاً أطول من المسموح، وأُعيدت نقاطك — حاول مرة أخرى",
  noSources: "لم أجد في مكتبة الأنظمة نصوصاً تتعلق بسؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى",
  ungrounded: "لم تُجب نصوص المكتبة التي وجدتها عن سؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى",
  conversation: "معرّف المحادثة غير صالح — ابدأ محادثة جديدة",
  conversationFull: "اكتملت هذه المحادثة — ابدأ محادثة جديدة لتكمل",
  filesRequired: "أرفق مستندات الوقائع أو اكتبها",
  noCredit: "لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة",
  creditNotEligible: "هذه الأداة لا تُدفع من رصيد باقة المؤسس",
  pasteUnavailable: "لصق النص غير متاح بعد — ارفع ملفاً",
  pasteOrFile: "اختر طريقة واحدة: ملف أو نص ملصق",
  pastedPages: (n: number) => `عدد الصفحات أكثر من ${n.toLocaleString("ar-SA")} صفحة — قسّم الملفات على طلبين`,
} as const;

/** The search writer's wait: short, so the answer keeps most of the fast budget. */
const LIB_QUERIES_TIMEOUT_MS = 15_000;
/** The least time the answer is given, whatever the searches took. */
const MIN_ANSWER_MS = 15_000;

/** Error codes n8n may report; anything else is recorded as model_error. */
const N8N_ERROR_CODES: ReadonlySet<string> = new Set([
  "download_failed",
  "model_error",
  "model_refused",
  "output_truncated",
  "schema_invalid",
  "input_rejected",
]);
const PROGRESS_STEPS: ReadonlySet<string> = new Set(["reading", "drafting", "reviewing"]);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isMissingFunction = (code: string | undefined) => code === "42883" || code === "PGRST202";

export async function readAiToolsSetting(admin: SupabaseClient): Promise<unknown> {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", "ai_tools").maybeSingle();
  // A read error leaves every tool on its registry default, which is "off"
  // until a tool is tested — closed, never accidentally live.
  if (error) {
    console.error("[ai] ai_tools setting read failed; tools keep their defaults:", error.code, error.message);
    return null;
  }
  return (data as { value?: unknown } | null)?.value ?? null;
}

/** Never the thrown value's message or body: it can carry a text, a token or a link. */
const errorName = (err: unknown) => (err as { name?: unknown } | null)?.name?.toString() ?? "error";

async function failRun(admin: SupabaseClient, runId: string, code: string, message: string): Promise<void> {
  // The sweeper retries a run left `running` past its deadline, so a failed
  // refund here is logged, not lost.
  try {
    const { error } = await admin.rpc("ai_fail_run", { p_run: runId, p_code: code, p_message: message.slice(0, 500) });
    if (error) console.error("[ai] ai_fail_run failed for", runId, error.code, error.message);
  } catch (err) {
    console.error("[ai] ai_fail_run threw for", runId, errorName(err));
  }
}

function report(progress: ProgressReporter | undefined, runId: string, userId: string, events: ProgressEvent[]): void {
  if (!progress || events.length === 0) return;
  try {
    progress(runId, userId, events);
  } catch (err) {
    // The waiting screen must never fail a run that is already charged.
    console.error("[ai] reporting progress threw for", runId, errorName(err));
  }
}

// ── settle ───────────────────────────────────────────────────────────────────

export type SettleOutcome =
  | { kind: "succeeded"; status: "succeeded"; output: Record<string, unknown>; citations: unknown[] }
  | { kind: "failed"; code: string }
  | { kind: "stale" };

export function mapCitations(raw: unknown, sources: SourceMap): unknown[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const sid of raw) {
    if (typeof sid !== "string" || seen.has(sid) || !Object.prototype.hasOwnProperty.call(sources, sid)) continue;
    seen.add(sid);
    out.push({ sid, ...sources[sid] });
    if (out.length >= 50) break;
  }
  return out;
}

function sanitizeUsage(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  return {
    model: typeof raw.model === "string" ? raw.model.slice(0, 60) : null,
    input_tokens: n(raw.input_tokens),
    output_tokens: n(raw.output_tokens),
    cache_read_tokens: n(raw.cache_read_tokens),
  };
}

/**
 * A success is always stored as "succeeded" and shown. There is no way to
 * store "review" (held from the user) until Wave 3 builds the money-safe gate
 * (release / reject with a refund): before, a review run was charged and
 * never shown.
 */
export async function settleRunWith(
  admin: SupabaseClient,
  ctx: { spec: AiToolSpec; runId: string; sources: SourceMap; input: Record<string, unknown> },
  raw: unknown,
): Promise<SettleOutcome> {
  const fail = async (code: string, message: string): Promise<SettleOutcome> => {
    await failRun(admin, ctx.runId, code, message);
    return { kind: "failed", code };
  };

  if (!isPlainObject(raw) || raw.run_id !== ctx.runId) return fail("bad_reply", "the result does not name this run");
  if (raw.status === "failed") {
    const err = isPlainObject(raw.error) ? raw.error : {};
    const code = typeof err.code === "string" && N8N_ERROR_CODES.has(err.code) ? err.code : "model_error";
    return fail(code, typeof err.message === "string" ? err.message : "the tool reported a failure");
  }
  if (raw.status !== "succeeded") return fail("bad_reply", "the result has no final status");

  const checked = ctx.spec.validateOutput(raw.output, ctx.input);
  if (!checked) return fail("schema_invalid", "the output does not match the tool's shape");
  const enrich = OUTPUT_ENRICHERS[ctx.spec.id];
  let output = checked;
  if (enrich) {
    try {
      output = await enrich(admin, checked);
    } catch (err) {
      console.error("[ai] enriching the result failed for", ctx.runId, errorName(err));
      return fail("store_failed", "the result could not be completed");
    }
  }

  const citations = mapCitations(raw.citations, ctx.sources);
  // A library tool's answer stands on the texts it was given or not at all:
  // with no citation that resolves, it is the model's memory, not the library.
  // Owner ٤١٣ option A: quick-answer keeps such an answer, flagged and charged
  // (the page labels it); the bare «النصوص لا تجيب» sentence is still refunded.
  if (ctx.spec.retrieval && citations.length === 0) {
    const loose = ctx.spec.retrieval.allowUngrounded;
    if (!loose || isLibraryNoAnswer(output[loose.field])) {
      return fail("ungrounded", "the answer cites none of the sources sent");
    }
    output = { ...output, ungrounded: true };
  }
  const usage = sanitizeUsage(raw.usage);
  const status = "succeeded";
  const { data, error } = await admin
    .from("ai_runs")
    .update({
      status,
      output,
      citations,
      usage,
      model: (usage?.model as string | null) ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", ctx.runId)
    .eq("status", "running")
    .select("id");
  if (error) {
    console.error("[ai] storing the result failed for", ctx.runId, error.code, error.message);
    return fail("store_failed", "the result could not be stored");
  }
  // No row: the run was already final (timed out and refunded, or settled by
  // an earlier delivery of the same callback). Nothing more to do.
  if (!Array.isArray(data) || data.length === 0) return { kind: "stale" };
  return { kind: "succeeded", status, output, citations };
}

// ── start ────────────────────────────────────────────────────────────────────

interface StartedRun {
  run_id: string;
  created: boolean;
  status: string;
  charged: boolean;
  charged_points: number;
  /** ai_start_run_with_credit only: true when this call spent a founder credit. */
  credit_used?: boolean;
}

/** What a charged run needs from startRunWith to go on, in the request or after it. */
export interface DispatchContext {
  spec: AiToolSpec;
  run: StartedRun;
  checked: { input: Record<string, unknown> };
  files: AiFile[];
  pages: number | null;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  conversationId: string | null;
  isAdmin: boolean;
  deadline: Date;
  startedAt: number;
  actor: RunActor;
}

const chargedBody = (run: StartedRun, conversationId: string | null) => ({
  chargedPoints: run.charged_points,
  creditUsed: run.credit_used === true,
  ...(conversationId ? { conversationId } : {}),
});

export async function startRunWith(
  admin: SupabaseClient,
  deps: StartRunDeps,
  actor: RunActor,
  body: unknown,
): Promise<RouteReply> {
  const req = isPlainObject(body) ? body : {};
  const spec = getAiTool(req.tool);
  if (!spec) return { status: 404, body: { error: AI_COPY.unknownTool, code: "unknown_tool" } };

  const isAdmin = actor.userType === "admin";
  // The same helpers answer GET /api/v1/ai/tool-status (R5).
  const refused = toolRoleRefusal(spec, actor);
  if (refused === "role") return { status: 403, body: { error: AI_COPY.role, code: "role" } };
  if (refused === "consultant_blocked") {
    return { status: 403, body: { error: CONSULTANT_BLOCKED_MESSAGE, code: "consultant_blocked" } };
  }

  const runtime = resolveToolRuntime(spec, await readAiToolsSetting(admin));
  // "staff": only admins, so a tool can be tried on production before it opens.
  // A stored "review" arrives here as "staff" (aiToolsConfig.effectiveToolMode),
  // so it too is refused here, before ai_start_run charges anything.
  if (toolAvailability(runtime.mode, isAdmin) === "tool_off") {
    return { status: 423, body: { error: AI_COPY.off, code: "tool_off" } };
  }

  const checked = spec.validateInput(req.input);
  if (!checked.ok) return { status: 422, body: { error: checked.error, code: "invalid_input" } };
  if (typeof req.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(req.idempotencyKey)) {
    return { status: 422, body: { error: AI_COPY.key, code: "invalid_key" } };
  }
  if (!spec.files && req.fileIds !== undefined && !(Array.isArray(req.fileIds) && req.fileIds.length === 0)) {
    return { status: 422, body: { error: AI_COPY.noFiles, code: "files_not_accepted" } };
  }

  // A job tool with nowhere to call back would charge and then only time out.
  if (spec.class === "job" && !/^https:\/\//.test(deps.callbackUrl)) {
    console.error("[ai] no https callback URL (NEXT_PUBLIC_SITE_URL); job tools are refused:", spec.id);
    return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
  }

  // A library tool quotes server-only, paywalled texts: the library's own
  // gate and the assistant's tier rule apply before anything is charged, and
  // so does the library lock for the library's own AI (the route decides).
  if (spec.retrieval) {
    if (!deps.libraryAccess || !deps.retrieve) {
      console.error("[ai] a library tool without libraryAccess / retrieve:", spec.id);
      return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
    }
    const denied = await deps.libraryAccess(spec.id);
    if (denied) return denied;
  }

  // A chat tool: the conversation's earlier turns, read from ai_runs for this
  // user only, so a conversation id from another account reads as a new one.
  let conversationId: string | null = null;
  let history: Array<{ role: "user" | "assistant"; text: string }> = [];
  let prior: Array<{ input: unknown; output: unknown; status: string }> = [];
  let turn = 0;
  if (spec.conversation) {
    const cid = req.conversationId;
    if (cid !== undefined && cid !== null && (typeof cid !== "string" || !UUID.test(cid))) {
      return { status: 422, body: { error: AI_COPY.conversation, code: "invalid_conversation" } };
    }
    conversationId = typeof cid === "string" ? cid.toLowerCase() : globalThis.crypto.randomUUID();
    if (typeof cid === "string") {
      const read = await admin
        .from("ai_runs")
        .select("input, output, status")
        .eq("user_id", actor.userId)
        .eq("tool", spec.id)
        .eq("conversation_id", conversationId)
        .in("status", ["running", "review", "succeeded"])
        .order("created_at", { ascending: true })
        .limit(spec.conversation.maxMessages + 1);
      if (read.error) {
        console.error("[ai] conversation read failed:", spec.id, read.error.code, read.error.message);
        return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
      }
      const rows = (Array.isArray(read.data) ? read.data : []) as Array<{ input: unknown; output: unknown; status: string }>;
      prior = rows;
      turn = rows.length;
      if (turn >= spec.conversation.maxMessages) {
        return { status: 409, body: { error: AI_COPY.conversationFull, code: "conversation_full", conversationId } };
      }
      const { field, replyField, historyPairs } = spec.conversation;
      history = rows
        .filter((r) => r.status === "succeeded" && isPlainObject(r.input) && isPlainObject(r.output))
        .slice(-historyPairs)
        .flatMap((r) => {
          const q = (r.input as Record<string, unknown>)[field];
          const a = (r.output as Record<string, unknown>)[replyField];
          return typeof q === "string" && typeof a === "string"
            ? [{ role: "user" as const, text: q }, { role: "assistant" as const, text: a }]
            : [];
        });
    }
  }
  // A tool whose turns are different steps refuses one out of order, uncharged.
  if (spec.checkTurn) {
    const refusal = spec.checkTurn(checked.input, turn, prior);
    if (refusal) return { status: 409, body: { error: refusal, code: "turn_refused", ...(conversationId ? { conversationId } : {}) } };
  }

  // A file tool: every predictable refusal (type, size, pages, an unreadable
  // PDF, someone else's file) happens here, before the charge, and the page
  // total sets the price.
  let files: AiFile[] = [];
  let pages: number | null = null;
  const noFilesGiven = req.fileIds === undefined || req.fileIds === null || (Array.isArray(req.fileIds) && req.fileIds.length === 0);
  if (spec.files && !(spec.files.optional && noFilesGiven)) {
    if (!deps.resolveFiles) {
      console.error("[ai] a file tool without resolveFiles:", spec.id);
      return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
    }
    const got = await deps.resolveFiles(actor.userId, req.fileIds, spec.files);
    if (!got.ok) {
      return { status: got.code === "files_unavailable" ? 503 : 422, body: { error: got.error, code: got.code } };
    }
    files = got.files;
    pages = got.pages;
  }
  // A pasted text becomes one more file after the run exists (it needs the run
  // id), so its refusals and its pages are settled here, before the charge.
  const paste = spec.pasteAsFile && spec.files ? spec.pasteAsFile : null;
  const pasted = paste && typeof checked.input[paste.field] === "string" ? (checked.input[paste.field] as string) : "";
  if (paste && pasted) {
    if (!deps.pastedFileUrl) return { status: 422, body: { error: AI_COPY.pasteUnavailable, code: "paste_unavailable" } };
    if (files.length + 1 > spec.files!.max) return { status: 422, body: { error: AI_COPY.pasteOrFile, code: "too_many_files" } };
    const total = (pages ?? 0) + textPages(pasted);
    if (total > spec.files!.maxPages) {
      return { status: 422, body: { error: AI_COPY.pastedPages(spec.files!.maxPages), code: "too_many_pages" } };
    }
    pages = total;
  }
  if (spec.filesRequired?.(checked.input) && files.length === 0) {
    return { status: 422, body: { error: spec.filesRequiredCopy ?? AI_COPY.filesRequired, code: "files_required" } };
  }
  const price = spec.price(checked.input, { pages, turn });
  const now = deps.now?.() ?? new Date();
  const deadline = new Date(
    now.getTime() + 1000 * (spec.class === "fast" ? FAST_DEADLINE_SECONDS : spec.jobDeadlineSeconds ?? DEFAULT_JOB_DEADLINE_SECONDS),
  );
  const startedAt = (deps.clock ?? (() => Date.now()))();

  // A founder credit pays instead of points when the client asks and the run
  // qualifies (founderPlan.creditKindForRun). The turn is the one read above
  // from this user's own runs, never the client's: a drafter's second turn reads
  // 1 there and so goes to plain ai_start_run at price 0. An exempt caller (admin)
  // never spends a credit. Anything else that asks falls back to points.
  const creditKind = !isAdmin && req.useCredit === true ? creditKindForRun(spec.id, checked.input, turn) : null;
  const startFn = creditKind ? "ai_start_run_with_credit" : "ai_start_run";

  const { data, error } = await admin.rpc(startFn, {
    p_user: actor.userId,
    p_tool: spec.id,
    p_variant: null,
    p_class: spec.class,
    p_price: price,
    p_daily_limit: runtime.dailyLimit,
    p_idempotency_key: req.idempotencyKey,
    p_deadline: deadline.toISOString(),
    p_exempt: isAdmin,
    p_input: checked.input,
    p_file_ids: files.map((f) => f.id),
    p_pages: pages,
    p_conversation: conversationId,
    p_source_ids: {},
    ...(creditKind ? { p_credit_kind: creditKind } : {}),
  });
  if (error) {
    // A credit request never falls back to points on these: the user asked to
    // spend a credit, so he is told why it was not.
    if (error.message === "no_credit") {
      return { status: 402, body: { error: AI_COPY.noCredit, code: "no_credit" } };
    }
    if (error.message === "credit_not_eligible") {
      return { status: 400, body: { error: AI_COPY.creditNotEligible, code: "credit_not_eligible" } };
    }
    if (error.message === "insufficient_points") {
      return { status: 402, body: { error: AI_COPY.points, code: "insufficient_points", price } };
    }
    if (error.message === "daily_limit") {
      return { status: 429, body: { error: AI_COPY.daily, code: "daily_limit" } };
    }
    if (isMissingFunction(error.code)) {
      return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
    }
    console.error(`[ai] ${startFn} failed:`, spec.id, error.code, error.message);
    return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
  }
  const run = (Array.isArray(data) ? data[0] : data) as StartedRun | undefined;
  if (!run?.run_id) {
    console.error(`[ai] ${startFn} returned no run:`, spec.id);
    return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
  }
  if (!run.created) {
    return { status: 409, body: { error: AI_COPY.duplicate, code: "duplicate", runId: run.run_id, status: run.status } };
  }
  try {
    deps.onRunCreated?.(spec.id);
  } catch (err) {
    // A tally must never fail a run that is already charged.
    console.error("[ai] onRunCreated threw:", spec.id, err);
  }

  // The pasted text's file. p_file_ids above stays attachment ids only.
  if (paste && pasted) {
    try {
      const expiresAt = (deps.now?.() ?? new Date()).getTime() + FILE_TEXT_TTL_MS;
      files = [
        ...files,
        {
          id: `paste:${paste.field}`,
          name: paste.name,
          mime: "text/plain",
          bytes: new TextEncoder().encode(pasted).length,
          pages: textPages(pasted),
          url: deps.pastedFileUrl!(run.run_id, actor.userId, paste.field),
          url_expires_at: new Date(expiresAt).toISOString(),
        },
      ];
    } catch (err) {
      // Already charged: an exception would leave the refund to the sweeper.
      console.error("[ai] signing the pasted text's link failed for", run.run_id, (err as Error)?.name);
      await failRun(admin, run.run_id, "paste_link_failed", "the pasted text's link could not be signed");
      return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
    }
  }

  report(deps.progress, run.run_id, actor.userId, fileEvents(files));

  const ctx: DispatchContext = { spec, run, checked, files, pages, history, conversationId, isAdmin, deadline, startedAt, actor };
  if (spec.class === "job" && deps.defer) {
    try {
      deps.defer(async () => {
        await dispatchSafely(admin, deps, ctx);
      });
      return { status: 202, body: { runId: run.run_id, status: "running", ...chargedBody(run, conversationId) } };
    } catch (err) {
      // `after` refused to schedule it, so nothing will run later: the dispatch
      // goes on in the request below, as it did before there was a defer.
      console.error("[ai] deferring the dispatch failed for", run.run_id, errorName(err));
    }
  }
  return dispatchSafely(admin, deps, ctx);
}

/** dispatchRunWith, where a throw refunds the run like any other failure. */
async function dispatchSafely(admin: SupabaseClient, deps: StartRunDeps, ctx: DispatchContext): Promise<RouteReply> {
  try {
    return await dispatchRunWith(admin, deps, ctx);
  } catch (err) {
    const name = errorName(err);
    console.error("[ai] the dispatch threw for", ctx.run.run_id, name);
    await failRun(admin, ctx.run.run_id, "internal", `the dispatch threw: ${name}`);
    return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: ctx.run.run_id } };
  }
}

/**
 * A charged run, from its searches to n8n's answer. A job's caller may already
 * have had its 202, so a failure here reaches the user by polling, as the run's
 * error_code.
 */
export async function dispatchRunWith(admin: SupabaseClient, deps: StartRunDeps, ctx: DispatchContext): Promise<RouteReply> {
  const { spec, run, checked, files, history, conversationId, deadline, startedAt, actor } = ctx;
  const clock = deps.clock ?? (() => Date.now());
  const charged = chargedBody(run, conversationId);
  let sources: SourceMap = {};

  // Charged first, so the daily limit and the balance hold for the searches
  // too; every way out below refunds.
  let pkgSources: PackageSource[] = [];
  if (spec.retrieval && deps.retrieve) {
    const { from, pinFrom, scopeFrom, laws, principles } = spec.retrieval;
    const pinned = pinFrom ? checked.input[pinFrom] : null;
    const scope = scopeFrom ? checked.input[scopeFrom] : null;
    const question = String(checked.input[from] ?? "");
    const pin: RetrievalPin = {
      question,
      ...(typeof pinned === "string" && pinned ? { articleId: pinned } : {}),
      ...(typeof scope === "string" && scope ? { lawSlug: scope } : {}),
    };
    const asked = await deps.n8n({
      path: LIB_QUERIES_PATH,
      mode: "sync",
      // A follow-up («وما مدته؟») is searched together with the question before it.
      body: {
        v: 1,
        run_id: run.run_id,
        tool: "lib-queries",
        input: {
          text: [...history.filter((h) => h.role === "user").slice(-1).map((h) => h.text), question].join("\n"),
        },
      },
      timeoutMs: LIB_QUERIES_TIMEOUT_MS,
    });
    const reply = asked.kind === "result" && isPlainObject(asked.result) ? asked.result : null;
    const queries =
      reply && reply.run_id === run.run_id && reply.status === "succeeded" && isPlainObject(reply.output)
        ? cleanQueries(reply.output.queries)
        : [];
    report(deps.progress, run.run_id, actor.userId, queryEvents(queries));
    // An open article, or one the question names, is a source even when the
    // writer found nothing to search.
    const named = articleRefs(question).length > 0 || (!!pin.lawSlug && bareArticleNumbers(question).length > 0);
    if (queries.length === 0 && !pin.articleId && !named) {
      await failRun(admin, run.run_id, "no_queries", asked.kind === "failed" ? asked.detail : "the search writer returned no searches");
      return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
    }
    let found: Retrieved;
    try {
      found = await deps.retrieve(queries, { laws, principles }, pin);
    } catch (err) {
      console.error("[ai] retrieval threw for", run.run_id, errorName(err));
      found = { sources: [], map: {} };
    }
    if (found.sources.length === 0) {
      await failRun(admin, run.run_id, "no_sources", `no library text matched: ${queries.join(" | ")}`);
      return { status: 422, body: { error: AI_COPY.noSources, code: "no_sources", runId: run.run_id } };
    }
    sources = found.map as SourceMap;
    pkgSources = found.sources;
    const stored = await admin.from("ai_runs").update({ source_ids: sources }).eq("id", run.run_id).eq("status", "running");
    if (stored.error) {
      console.error("[ai] storing the sources failed for", run.run_id, stored.error.code, stored.error.message);
      await failRun(admin, run.run_id, "store_failed", "the sources could not be stored");
      return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
    }
    report(deps.progress, run.run_id, actor.userId, sourceEvents(toSourceRefs(found.sources)));
  }

  const sync = spec.class === "fast";
  // A pasted text travels once, as the file; ai_runs.input keeps it for the link.
  const paste = spec.pasteAsFile && spec.files ? spec.pasteAsFile : null;
  const pkgInput = paste ? Object.fromEntries(Object.entries(checked.input).filter(([k]) => k !== paste.field)) : checked.input;
  const pkg = {
    v: 1,
    run_id: run.run_id,
    tool: spec.id,
    variant: null,
    class: spec.class,
    model_tier: spec.tier,
    locale: "ar",
    actor: {
      role: actor.userType,
      practice_kind: actor.practiceKind,
      display_name: spec.sendsDisplayName ? actor.displayName : null,
    },
    input: pkgInput,
    sources: pkgSources,
    case: null,
    history,
    files,
    respond: sync ? { mode: "sync" } : { mode: "async", callback_url: deps.callbackUrl },
    deadline_at: deadline.toISOString(),
  };

  report(deps.progress, run.run_id, actor.userId, [{ kind: "step", label: STEP_LABEL_AR.sent }]);
  const outcome = await deps.n8n({
    path: spec.n8nPath,
    mode: sync ? "sync" : "async",
    body: pkg,
    // The searches spent part of the fast budget (nginx cuts at 60 s).
    timeoutMs: sync ? Math.max(MIN_ANSWER_MS, FAST_TIMEOUT_MS - (clock() - startedAt)) : 20_000,
  });

  if (outcome.kind === "failed") {
    await failRun(admin, run.run_id, outcome.code === "timeout" ? "timeout" : outcome.code, outcome.detail);
    const timedOut = outcome.code === "timeout";
    return {
      status: timedOut ? 504 : 502,
      body: { error: timedOut ? AI_COPY.timeout : AI_COPY.failed, code: timedOut ? "timeout" : "tool_failed", runId: run.run_id },
    };
  }
  if (outcome.kind === "accepted") {
    if (sync) {
      await failRun(admin, run.run_id, "bad_reply", "a fast tool answered 202");
      return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
    }
    return { status: 202, body: { runId: run.run_id, status: "running", ...charged } };
  }

  // A job tool must answer 202; callN8n never returns a result for async.
  // Nothing is held for review (a stored "review" runs as "staff"; Wave 3).
  const settled = await settleRunWith(admin, { spec, runId: run.run_id, sources, input: checked.input }, outcome.result);
  if (settled.kind === "succeeded") {
    const verified = verifyEvent(settled.output);
    if (verified) report(deps.progress, run.run_id, actor.userId, [verified]);
    return {
      status: 200,
      body: { runId: run.run_id, status: settled.status, output: settled.output, citations: settled.citations, ...charged },
    };
  }
  if (settled.kind === "stale") {
    return { status: 504, body: { error: AI_COPY.timeout, code: "timeout", runId: run.run_id } };
  }
  if (settled.code === "ungrounded") {
    return { status: 422, body: { error: AI_COPY.ungrounded, code: "ungrounded", runId: run.run_id } };
  }
  return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
}

// ── the job callback ─────────────────────────────────────────────────────────

export async function callbackWith(
  admin: SupabaseClient,
  body: unknown,
  deps: { progress?: ProgressReporter } = {},
): Promise<RouteReply> {
  if (!isPlainObject(body) || typeof body.run_id !== "string" || !UUID.test(body.run_id)) {
    return { status: 400, body: { error: "invalid run_id" } };
  }
  const runId = body.run_id;
  const { data, error } = await admin
    .from("ai_runs")
    .select("id, user_id, tool, status, class, source_ids, input")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    console.error("[ai/callback] run read failed:", runId, error.code, error.message);
    return { status: 503, body: { error: "unavailable" } };
  }
  const run = data as
    | { id: string; user_id: string; tool: string; status: string; class: string; source_ids: unknown; input: unknown }
    | null;
  if (!run) return { status: 404, body: { error: "unknown run" } };

  if (body.status === "progress") {
    if (typeof body.step !== "string" || !PROGRESS_STEPS.has(body.step)) {
      return { status: 400, body: { error: "invalid step" } };
    }
    await admin.from("ai_runs").update({ progress_step: body.step }).eq("id", runId).eq("status", "running");
    // n8n may add a line of its own (E6); a post that arrives after the run ended
    // adds nothing to a finished run's screen. Either side may be the older one: an
    // old n8n sends neither field, and an old app ignores both.
    if (run.status === "running") {
      const label = cleanLabel(body.detail) ?? STEP_LABEL_AR[body.step as keyof typeof STEP_LABEL_AR];
      report(deps.progress, runId, run.user_id, [{ kind: body.kind === "note" ? "note" : "step", label }]);
    }
    return { status: 200, body: { ok: true } };
  }

  // Already final: answer 200 so n8n stops retrying; nothing changes.
  if (run.status !== "running") return { status: 200, body: { ok: true, final: run.status } };
  const spec = getAiTool(run.tool);
  if (!spec || run.class !== "job") {
    await failRun(admin, runId, "bad_reply", "a callback for a tool that does not call back");
    return { status: 200, body: { ok: true, final: "failed" } };
  }

  // No run is held for review until Wave 3's money-safe gate: a job started
  // while its tool was stored as "review" settles as succeeded and is shown.
  const sources = (isPlainObject(run.source_ids) ? run.source_ids : {}) as SourceMap;
  const input = (isPlainObject(run.input) ? run.input : {}) as Record<string, unknown>;
  const settled = await settleRunWith(admin, { spec, runId, sources, input }, body);
  if (settled.kind === "succeeded") {
    const verified = verifyEvent(settled.output);
    if (verified) report(deps.progress, runId, run.user_id, [verified]);
  }
  return { status: 200, body: { ok: true, final: settled.kind === "succeeded" ? settled.status : settled.kind } };
}
