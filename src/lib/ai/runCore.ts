/**
 * runCore.ts — the AI run pipeline (docs/plans/2026-10-26-ai-services-n8n-plan.md
 * §1, §1.2, §2). The app does every check and the charge BEFORE the webhook,
 * sends n8n one complete package, and settles the money on the answer:
 *
 *   startRunWith     the browser's POST /api/v1/ai/runs, after the route has
 *                    signed the user in and refused a frozen account:
 *                      tool → role → Art. 18 → mode → input → key → files
 *                      → [library tool: the library gate + tier rule]
 *                      → ai_start_run (daily limit + balance + debit, one
 *                        transaction)
 *                      → [library tool: searches → texts, refunded when none]
 *                      → the package → n8n
 *                    fast tool: n8n's reply is settled here, in the request;
 *                    job tool:  n8n's 202 leaves the run `running`.
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
import { resolveToolRuntime } from "./aiToolsConfig.ts";
import type { N8nCall, N8nOutcome } from "./n8nClient.ts";
import { cleanQueries, type PackageSource, type RetrievalLimits, type RetrievalPin, type Retrieved } from "./retrieval.ts";
import type { AiFile, FileRules, FilesCheck } from "./aiFiles.ts";
import { enrichBriefCheck } from "./citationCheck.ts";

/**
 * Tools whose result the app completes from its own data before storing it.
 * L8: the library decides each cited article's status, never the model.
 */
const OUTPUT_ENRICHERS: Readonly<Record<string, (admin: SupabaseClient, output: Record<string, unknown>) => Promise<Record<string, unknown>>>> = {
  "brief-check": (admin, output) => enrichBriefCheck(admin as never, output),
};
import {
  DEFAULT_JOB_DEADLINE_SECONDS,
  FAST_DEADLINE_SECONDS,
  FAST_TIMEOUT_MS,
  LIB_QUERIES_PATH,
  getAiTool,
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
   * Library tools only: the library gate and the assistant's tier rule, before
   * the charge. A reply refuses the run; null lets it go on.
   */
  libraryAccess?: () => Promise<RouteReply | null>;
  /** Library tools only: the searches → the texts (retrieval.retrieveLibrary). */
  retrieve?: (queries: string[], limits: RetrievalLimits, pin: RetrievalPin) => Promise<Retrieved>;
  /** File tools only: the caller's vault files checked, counted and signed (aiFiles.resolveAiFiles). */
  resolveFiles?: (userId: string, fileIds: unknown, rules: FileRules) => Promise<FilesCheck>;
  /** The clock for the fast tools' time budget, in ms (tests replace it). */
  clock?: () => number;
}

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

async function readAiToolsSetting(admin: SupabaseClient): Promise<unknown> {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", "ai_tools").maybeSingle();
  // A read error leaves every tool on its registry default, which is "off"
  // until a tool is tested — closed, never accidentally live.
  if (error) {
    console.error("[ai] ai_tools setting read failed; tools keep their defaults:", error.code, error.message);
    return null;
  }
  return (data as { value?: unknown } | null)?.value ?? null;
}

async function failRun(admin: SupabaseClient, runId: string, code: string, message: string): Promise<void> {
  const { error } = await admin.rpc("ai_fail_run", { p_run: runId, p_code: code, p_message: message.slice(0, 500) });
  // The sweeper retries a run left `running` past its deadline, so a failed
  // refund here is logged, not lost.
  if (error) console.error("[ai] ai_fail_run failed for", runId, error.code, error.message);
}

// ── settle ───────────────────────────────────────────────────────────────────

export type SettleOutcome =
  | { kind: "succeeded"; status: "succeeded" | "review"; output: Record<string, unknown>; citations: unknown[] }
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

export async function settleRunWith(
  admin: SupabaseClient,
  ctx: { spec: AiToolSpec; runId: string; sources: SourceMap; review: boolean; input: Record<string, unknown> },
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
      console.error("[ai] enriching the result failed for", ctx.runId, err);
      return fail("store_failed", "the result could not be completed");
    }
  }

  const citations = mapCitations(raw.citations, ctx.sources);
  // A library tool's answer stands on the texts it was given or not at all:
  // with no citation that resolves, it is the model's memory, not the library.
  if (ctx.spec.retrieval && citations.length === 0) return fail("ungrounded", "the answer cites none of the sources sent");
  const usage = sanitizeUsage(raw.usage);
  const status = ctx.review ? "review" : "succeeded";
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
}

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
  if (!isAdmin && !spec.roles.includes(actor.userType)) {
    return { status: 403, body: { error: AI_COPY.role, code: "role" } };
  }
  if (spec.consultantBlocked && actor.practiceKind === "consultant" && !isAdmin) {
    return { status: 403, body: { error: CONSULTANT_BLOCKED_MESSAGE, code: "consultant_blocked" } };
  }

  const runtime = resolveToolRuntime(spec, await readAiToolsSetting(admin));
  // "staff": only admins, so a tool can be tried on production before it opens.
  if (runtime.mode === "off" || (runtime.mode === "staff" && !isAdmin)) {
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
  // gate and the assistant's tier rule apply before anything is charged.
  if (spec.retrieval) {
    if (!deps.libraryAccess || !deps.retrieve) {
      console.error("[ai] a library tool without libraryAccess / retrieve:", spec.id);
      return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
    }
    const denied = await deps.libraryAccess();
    if (denied) return denied;
  }

  // A chat tool: the conversation's earlier turns, read from ai_runs for this
  // user only, so a conversation id from another account reads as a new one.
  let conversationId: string | null = null;
  let history: Array<{ role: "user" | "assistant"; text: string }> = [];
  let turn = 0;
  if (spec.conversation) {
    const cid = req.conversationId;
    if (cid !== undefined && cid !== null && (typeof cid !== "string" || !UUID.test(cid))) {
      return { status: 422, body: { error: AI_COPY.conversation, code: "invalid_conversation" } };
    }
    conversationId = typeof cid === "string" ? cid.toLowerCase() : globalThis.crypto.randomUUID();
    if (typeof cid === "string") {
      const prior = await admin
        .from("ai_runs")
        .select("input, output, status")
        .eq("user_id", actor.userId)
        .eq("tool", spec.id)
        .eq("conversation_id", conversationId)
        .in("status", ["running", "review", "succeeded"])
        .order("created_at", { ascending: true })
        .limit(spec.conversation.maxMessages + 1);
      if (prior.error) {
        console.error("[ai] conversation read failed:", spec.id, prior.error.code, prior.error.message);
        return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
      }
      const rows = (Array.isArray(prior.data) ? prior.data : []) as Array<{ input: unknown; output: unknown; status: string }>;
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

  // A file tool: every predictable refusal (type, size, pages, an unreadable
  // PDF, someone else's file) happens here, before the charge, and the page
  // total sets the price.
  let files: AiFile[] = [];
  let pages: number | null = null;
  if (spec.files) {
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
  const price = spec.price(checked.input, { pages, turn });
  const now = deps.now?.() ?? new Date();
  const deadline = new Date(
    now.getTime() + 1000 * (spec.class === "fast" ? FAST_DEADLINE_SECONDS : spec.jobDeadlineSeconds ?? DEFAULT_JOB_DEADLINE_SECONDS),
  );
  const clock = deps.clock ?? (() => Date.now());
  const startedAt = clock();
  let sources: SourceMap = {};

  const { data, error } = await admin.rpc("ai_start_run", {
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
    p_source_ids: sources,
  });
  if (error) {
    if (error.message === "insufficient_points") {
      return { status: 402, body: { error: AI_COPY.points, code: "insufficient_points", price } };
    }
    if (error.message === "daily_limit") {
      return { status: 429, body: { error: AI_COPY.daily, code: "daily_limit" } };
    }
    if (isMissingFunction(error.code)) {
      return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
    }
    console.error("[ai] ai_start_run failed:", spec.id, error.code, error.message);
    return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
  }
  const run = (Array.isArray(data) ? data[0] : data) as StartedRun | undefined;
  if (!run?.run_id) {
    console.error("[ai] ai_start_run returned no run:", spec.id);
    return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
  }
  if (!run.created) {
    return { status: 409, body: { error: AI_COPY.duplicate, code: "duplicate", runId: run.run_id, status: run.status } };
  }

  const charged = { chargedPoints: run.charged_points, ...(conversationId ? { conversationId } : {}) };

  // Charged first, so the daily limit and the balance hold for the searches
  // too; every way out below refunds.
  let pkgSources: PackageSource[] = [];
  if (spec.retrieval && deps.retrieve) {
    const { from, pinFrom, laws, principles } = spec.retrieval;
    const pinned = pinFrom ? checked.input[pinFrom] : null;
    const pin: RetrievalPin = typeof pinned === "string" && pinned ? { articleId: pinned } : {};
    const asked = await deps.n8n({
      path: LIB_QUERIES_PATH,
      mode: "sync",
      // A follow-up («وما مدته؟») is searched together with the question before it.
      body: {
        v: 1,
        run_id: run.run_id,
        tool: "lib-queries",
        input: {
          text: [...history.filter((h) => h.role === "user").slice(-1).map((h) => h.text), String(checked.input[from] ?? "")].join("\n"),
        },
      },
      timeoutMs: LIB_QUERIES_TIMEOUT_MS,
    });
    const reply = asked.kind === "result" && isPlainObject(asked.result) ? asked.result : null;
    const queries =
      reply && reply.run_id === run.run_id && reply.status === "succeeded" && isPlainObject(reply.output)
        ? cleanQueries(reply.output.queries)
        : [];
    // An open article is a source even when the writer found nothing to search.
    if (queries.length === 0 && !pin.articleId) {
      await failRun(admin, run.run_id, "no_queries", asked.kind === "failed" ? asked.detail : "the search writer returned no searches");
      return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
    }
    let found: Retrieved;
    try {
      found = await deps.retrieve(queries, { laws, principles }, pin);
    } catch (err) {
      console.error("[ai] retrieval threw for", run.run_id, err);
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
  }

  const sync = spec.class === "fast";
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
    input: checked.input,
    sources: pkgSources,
    case: null,
    history,
    files,
    respond: sync ? { mode: "sync" } : { mode: "async", callback_url: deps.callbackUrl },
    deadline_at: deadline.toISOString(),
  };

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
  const settled = await settleRunWith(
    admin,
    { spec, runId: run.run_id, sources, review: runtime.mode === "review", input: checked.input },
    outcome.result,
  );
  if (settled.kind === "succeeded") {
    return {
      status: 200,
      body: {
        runId: run.run_id,
        status: settled.status,
        output: settled.status === "succeeded" ? settled.output : null,
        citations: settled.status === "succeeded" ? settled.citations : [],
        ...charged,
      },
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

export async function callbackWith(admin: SupabaseClient, body: unknown): Promise<RouteReply> {
  if (!isPlainObject(body) || typeof body.run_id !== "string" || !UUID.test(body.run_id)) {
    return { status: 400, body: { error: "invalid run_id" } };
  }
  const runId = body.run_id;
  const { data, error } = await admin
    .from("ai_runs")
    .select("id, tool, status, class, source_ids, input")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    console.error("[ai/callback] run read failed:", runId, error.code, error.message);
    return { status: 503, body: { error: "unavailable" } };
  }
  const run = data as
    | { id: string; tool: string; status: string; class: string; source_ids: unknown; input: unknown }
    | null;
  if (!run) return { status: 404, body: { error: "unknown run" } };

  if (body.status === "progress") {
    if (typeof body.step !== "string" || !PROGRESS_STEPS.has(body.step)) {
      return { status: 400, body: { error: "invalid step" } };
    }
    await admin.from("ai_runs").update({ progress_step: body.step }).eq("id", runId).eq("status", "running");
    return { status: 200, body: { ok: true } };
  }

  // Already final: answer 200 so n8n stops retrying; nothing changes.
  if (run.status !== "running") return { status: 200, body: { ok: true, final: run.status } };
  const spec = getAiTool(run.tool);
  if (!spec || run.class !== "job") {
    await failRun(admin, runId, "bad_reply", "a callback for a tool that does not call back");
    return { status: 200, body: { ok: true, final: "failed" } };
  }

  const { data: setting } = await admin.from("platform_settings").select("value").eq("key", "ai_tools").maybeSingle();
  const review = resolveToolRuntime(spec, (setting as { value?: unknown } | null)?.value ?? null).mode === "review";
  const sources = (isPlainObject(run.source_ids) ? run.source_ids : {}) as SourceMap;
  const input = (isPlainObject(run.input) ? run.input : {}) as Record<string, unknown>;
  const settled = await settleRunWith(admin, { spec, runId, sources, review, input }, body);
  return { status: 200, body: { ok: true, final: settled.kind === "succeeded" ? settled.status : settled.kind } };
}
