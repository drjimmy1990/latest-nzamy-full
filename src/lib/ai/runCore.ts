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
 *                        (a founder credit instead of points, P3; a
 *                        founder's library-assistant question spends his
 *                        library points the same way with no opt-in, and
 *                        falls back to points when none are left) — or, for a
 *                        drafter section edit (owner ٤١٠), ai_start_section_edit
 *                        (the memo's free edits counted again under the lock) —
 *                        or, for one of the account's free library-assistant
 *                        questions (owner ٣٠, l7; once, no opt-in),
 *                        ai_start_free_question (recounted under the lock; a
 *                        refusal falls back to the credit or the price)
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
import { CONSULTANT_BLOCKED_MESSAGE, CONSULTANT_RESERVED_MESSAGE, type PracticeKind } from "../auth/practiceKind.ts";
import { resolveToolRuntime, toolAvailability, toolRoleRefusal } from "./aiToolsConfig.ts";
import type { N8nCall, N8nOutcome } from "./n8nClient.ts";
import {
  cleanQueries,
  type PackageSource,
  type RetrievalLimits,
  type RetrievalPin,
  type Retrieved,
  type RetrieveGraphOptions,
} from "./retrieval.ts";
import type { AiFile, FileRules, FilesCheck } from "./aiFiles.ts";
import { enrichBriefCheck } from "./citationCheck.ts";
import { articleRefs, bareArticleNumbers } from "./questionRefs.ts";
import { creditKindForRun, FOUNDER_LIBRARY_TOOL } from "../membership/founderPlan.ts";
import { contractDraftingRefusal, draftingRefusal, draftingRequestKind } from "./draftingRequest.ts";
import { checkMinuteLimit, extractionRefusal, guardMessage, logFlagged, type PromptGuardState } from "./assistantGuard.ts";
import { detectExtraction, isExtractionRefusalReply, leaksPrompt } from "./extractionGuard.ts";
import { FILE_TEXT_TTL_MS } from "./fileTextToken.ts";
import {
  SECTION_EDIT_COPY,
  countSectionEdits,
  readSectionEditsIncluded,
  sectionEditLimitText,
  type SectionEditCounts,
} from "./sectionEdits.ts";
import { FREE_QUESTION_COPY, freeQuestionFallsBack, freeQuestionToolFor } from "./freeQuestion.ts";
import { textPages } from "./textExtract.ts";
import { readDraftPrices } from "./draftKinds.ts";
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
  // l12 simpledraft: the simplified contract's articles get the same library verdict.
  "simple-contract": (admin, output) => enrichBriefCheck(admin as never, output),
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
  /**
   * Q121 (batch l12): the tool that carries this account's free questions,
   * read by the route from the setting (freeQuestion.freeQuestionToolOf).
   * Absent → freeQuestionToolFor(userType) with the default (floating since Q181,
   * for an individual, the library assistant for everyone else).
   */
  freeQuestionTool?: string;
  /** Owner ١٤٦: a consultant's paid term already running at the cut-off (consultantTerm.ts). */
  consultantPaidTerm?: boolean;
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
  /**
   * The founder's library points (owner ٨ / ١٥ / ١٨, SQL 20261124_10): true
   * when `userId` holds a 'library_question' membership credit with questions
   * left. Asked only for a non-admin, priced library-assistant run; a run it
   * says yes to starts through ai_start_run_with_credit (price 0, one
   * question spent, given back by ai_fail_run on a failure). No dep, false or
   * a throw → the ordinary 5-point charge.
   */
  founderLibraryCredit?: (userId: string) => Promise<boolean>;
  /**
   * Owner ٣٠ (batch l7): true when `userId` has free questions left
   * (freeQuestion.freeQuestionStatusWith). Asked only for a non-admin, priced
   * run of a `freeQuestions` tool; yes → ai_start_free_question. No dep,
   * false or a throw → the normal path.
   */
  freeQuestions?: (userId: string) => Promise<boolean>;
  /** Library tools only: the searches → the texts (retrieval.retrieveLibrary). */
  retrieve?: (
    queries: string[],
    limits: RetrievalLimits,
    pin: RetrievalPin,
    options?: RetrieveGraphOptions,
  ) => Promise<Retrieved>;
  /**
   * Optional semantic query embedder for Hybrid Legal GraphRAG. Runs in parallel
   * with `lib-queries` so semantic vector + 1-hop graph search adds ~0 ms of
   * serial latency and rescues colloquial Arabic questions when `lib-queries`
   * produces zero formal keyword phrases.
   */
  embedQuery?: (text: string) => Promise<{ modelId: string; literal: string } | null>;
  /**
   * T17a: a tool with `caseFrom` — the caller's OWN case as model context
   * (assistantCase.loadAssistantCase on the caller's RLS client). null = not
   * his / not there (refused, uncharged); a throw = unavailable (uncharged).
   */
  loadCase?: (userId: string, caseId: string) => Promise<Record<string, unknown> | null>;
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
  /**
   * Owner ١٣ / ٢٢: the anti-extraction counters (blocks after repeated
   * attempts, the per-minute limit) for a tool with `promptGuard`. The route
   * passes assistantGuard.assistantGuardState; without it the detector, the
   * refusal and the output filter still run, only the counters are skipped.
   */
  promptGuard?: PromptGuardState;
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
  caseNotFound: "لم نجد هذه القضية بين قضاياك — اخترها من القائمة مرة أخرى",
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
  priceChanged: "تغيّر سعر هذا الطلب — راجع السعر وأكّد من جديد",
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

/**
 * l12 simpledraft (owner ١٢٣): a tool whose price is an admin setting
 * (AiToolSpec.priceSetting). The parsed points, undefined when the row is
 * missing or malformed (the tool's default applies), or "error" when the read
 * failed: the run is then refused uncharged rather than charged a price the
 * admin may have changed.
 */
export async function readPriceSetting(
  admin: SupabaseClient,
  setting: { key: string; parse: (value: unknown) => number | null },
): Promise<number | undefined | "error"> {
  try {
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", setting.key).maybeSingle();
    if (error) {
      console.error("[ai] price setting read failed:", setting.key, error.code, error.message);
      return "error";
    }
    return setting.parse((data as { value?: unknown } | null)?.value) ?? undefined;
  } catch (err) {
    console.error("[ai] price setting read threw:", setting.key, errorName(err));
    return "error";
  }
}

/** The membership credit kind the founder's library points are stored as (20261124_10). */
const FOUNDER_LIBRARY_CREDIT_KIND = "library_question";

/** deps.founderLibraryCredit, never throwing: a failed read charges points as usual. */
async function founderLibraryCreditSafe(read: (userId: string) => Promise<boolean>, userId: string): Promise<boolean> {
  try {
    return (await read(userId)) === true;
  } catch (err) {
    console.error("[ai] founder library credit read threw:", errorName(err));
    return false;
  }
}

/** deps.freeQuestions, never throwing: a failed read goes the normal way. */
async function freeQuestionsLeftSafe(read: (userId: string) => Promise<boolean>, userId: string): Promise<boolean> {
  try {
    return (await read(userId)) === true;
  } catch (err) {
    console.error("[ai] free questions read threw:", errorName(err));
    return false;
  }
}

/** Never the thrown value's message or body: it can carry a text, a token or a link. */
const errorName = (err: unknown) => (err as { name?: unknown } | null)?.name?.toString() ?? "error";

/** settleRunWith's failure code for an answer the output filter blocked (refunded). */
const OUTPUT_BLOCKED = "output_blocked";

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

/** Owner ١٥٦ (l13): did this usage report any token? (Every run before l13 reported 0 / 0.) */
function usageHasTokens(u: Record<string, unknown> | null): boolean {
  return !!u && ((u.input_tokens as number) > 0 || (u.output_tokens as number) > 0);
}

/**
 * Owner ١٥٦ (l13): two sanitized usages added up — the library search writer's
 * call (lib-queries, stored on the run at dispatch) and the tool's own — so the
 * admin AI usage page bills the whole run. The tool's model names the run.
 */
export function mergeUsage(a: Record<string, unknown> | null, b: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!a || !usageHasTokens(a)) return b;
  if (!b || !usageHasTokens(b)) return { ...a, model: (b?.model as string | null | undefined) ?? a.model };
  const add = (k: string) => ((a[k] as number) || 0) + ((b[k] as number) || 0);
  return {
    model: (b.model as string | null) ?? (a.model as string | null) ?? null,
    input_tokens: add("input_tokens"),
    output_tokens: add("output_tokens"),
    cache_read_tokens: add("cache_read_tokens"),
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
  ctx: {
    spec: AiToolSpec;
    runId: string;
    sources: SourceMap;
    input: Record<string, unknown>;
    /** Owner ١٥٦ (l13): tokens already spent on this run (the library search writer), added to the reply's. */
    priorUsage?: unknown;
  },
  raw: unknown,
): Promise<SettleOutcome> {
  let spent: Record<string, unknown> | null = null;
  const fail = async (code: string, message: string): Promise<SettleOutcome> => {
    // Owner ١٥٦ (l13): the model was called and billed even when its answer is
    // refused here (shape, citations, canary): its tokens stay on the run for
    // the admin AI usage page. Best effort, never in the way of the refund.
    if (spent && usageHasTokens(spent)) {
      try {
        await admin.from("ai_runs").update({ usage: spent, model: (spent.model as string | null) ?? null }).eq("id", ctx.runId).eq("status", "running");
      } catch (err) {
        console.error("[ai] storing a failed run's usage threw for", ctx.runId, errorName(err));
      }
    }
    await failRun(admin, ctx.runId, code, message);
    return { kind: "failed", code };
  };

  if (!isPlainObject(raw) || raw.run_id !== ctx.runId) return fail("bad_reply", "the result does not name this run");
  spent = mergeUsage(sanitizeUsage(ctx.priorUsage), sanitizeUsage(raw.usage));
  if (raw.status === "failed") {
    const err = isPlainObject(raw.error) ? raw.error : {};
    const code = typeof err.code === "string" && N8N_ERROR_CODES.has(err.code) ? err.code : "model_error";
    return fail(code, typeof err.message === "string" ? err.message : "the tool reported a failure");
  }
  if (raw.status !== "succeeded") return fail("bad_reply", "the result has no final status");

  const checked = ctx.spec.validateOutput(raw.output, ctx.input);
  if (!checked) return fail("schema_invalid", "the output does not match the tool's shape");
  // Owner ١٣ / ٢٢: an answer that carries the prompt's canary or its own
  // wording is never stored (GET /ai/runs would hand it out) and is refunded.
  // The message names no text. The model's own refusal sentence is not an
  // answer either: refunded and shown as the refusal.
  if (ctx.spec.promptGuard) {
    const reply = checked[ctx.spec.promptGuard.replyField];
    if (leaksPrompt(reply)) return fail(OUTPUT_BLOCKED, "the answer quoted the hidden instructions");
    if (isExtractionRefusalReply(reply)) return fail(OUTPUT_BLOCKED, "the model refused an extraction attempt");
  }
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
  // Owner ٤١٠: a section edit of a section that cited nothing may cite nothing.
  if (ctx.spec.retrieval && citations.length === 0 && !ctx.spec.citationsOptional?.(ctx.input)) {
    const loose = ctx.spec.retrieval.allowUngrounded;
    if (!loose || isLibraryNoAnswer(output[loose.field])) {
      return fail("ungrounded", "the answer cites none of the sources sent");
    }
    output = { ...output, ungrounded: true };
  }
  const usage = spent;
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
  /** T17a: the caller's own case, read before the charge (tools with `caseFrom`); null otherwise. */
  caseContext?: Record<string, unknown> | null;
}

/**
 * A conversation's earlier turns, as `history` for n8n: this user's own
 * succeeded runs (the caller read them), the last `historyPairs` of them, each
 * text cut to `turnMax` when the tool sets one (owner Q458).
 *
 * `guarded` (a tool with promptGuard, owner ١٣): every stored turn goes
 * through the same extraction guard again — a question the detector flags, or
 * an answer that carries the prompt (leaksPrompt) or is the extraction
 * refusal, drops its whole pair. Stored turns passed the guard when they were
 * asked; this re-check keeps a turn stored before a rule was added out of the
 * prompt. Dropping is silent: it counts no attempt and refuses nothing.
 */
export function historyFromRuns(
  rows: ReadonlyArray<{ input: unknown; output: unknown; status: string }>,
  conversation: { historyPairs: number; field: string; replyField: string; turnMax?: number },
  guarded: boolean,
): Array<{ role: "user" | "assistant"; text: string }> {
  const { field, replyField, historyPairs, turnMax } = conversation;
  const cut = (s: string) => (turnMax && turnMax > 0 && s.length > turnMax ? s.slice(0, turnMax) : s);
  return rows
    .filter((r) => r.status === "succeeded" && isPlainObject(r.input) && isPlainObject(r.output))
    .flatMap((r) => {
      const q = (r.input as Record<string, unknown>)[field];
      const a = (r.output as Record<string, unknown>)[replyField];
      if (typeof q !== "string" || typeof a !== "string") return [];
      if (guarded && (detectExtraction(q).flagged || leaksPrompt(a) || isExtractionRefusalReply(a))) return [];
      return [[q, a] as const];
    })
    .slice(-historyPairs)
    .flatMap(([q, a]) => [
      { role: "user" as const, text: cut(q) },
      { role: "assistant" as const, text: cut(a) },
    ]);
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
    // Owner ١٤٦: a reserved tool that is not pleading names the reservation, not Art. 18.
    const message = spec.consultantPaidTerm === true ? CONSULTANT_RESERVED_MESSAGE : CONSULTANT_BLOCKED_MESSAGE;
    return { status: 403, body: { error: message, code: "consultant_blocked" } };
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
  // Owner ١٣ / ٢٢ (assistantGuard.ts): a blocked user, or a message that asks
  // for the hidden instructions, is refused here, before the charge and n8n.
  if (spec.promptGuard) {
    const message = String(checked.input[spec.promptGuard.field] ?? "");
    const guarded = await guardMessage(spec.id, actor.userId, isAdmin, message, deps.promptGuard);
    if (guarded) return guarded;
  }
  // Owner Q485: a request to draft a memo or a pleading is refused here, before
  // the charge and the model; the drafter is offered to whoever may run it.
  // Owner ٢٢: a contract likewise, with «محترف العقود» for whoever may run it.
  if (spec.draftingGuard) {
    const kind = draftingRequestKind(String(checked.input[spec.draftingGuard.field] ?? ""));
    if (kind === "contract") {
      const pro = getAiTool("contracts-pro");
      // Owner ٢٦: an individual / business gets the lawyer-drafting link instead.
      return { status: 422, body: contractDraftingRefusal(pro !== null && toolRoleRefusal(pro, actor) === null, actor.userType) };
    }
    if (kind === "pleading") {
      const drafter = getAiTool("legal-drafter");
      return { status: 422, body: draftingRefusal(drafter !== null && toolRoleRefusal(drafter, actor) === null) };
    }
  }
  if (spec.promptGuard) {
    const limited = checkMinuteLimit(spec.id, actor.userId, isAdmin, deps.promptGuard);
    if (limited) return limited;
  }
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
  let prior: Array<{ input: unknown; output: unknown; status: string; price_points?: unknown }> = [];
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
        .select("input, output, status, price_points")
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
      const rows = (Array.isArray(read.data) ? read.data : []) as Array<{ input: unknown; output: unknown; status: string; price_points?: unknown }>;
      prior = rows;
      turn = rows.length;
      if (turn >= spec.conversation.maxMessages) {
        return { status: 409, body: { error: AI_COPY.conversationFull, code: "conversation_full", conversationId } };
      }
      history = historyFromRuns(rows, spec.conversation, !!spec.promptGuard);
    }
  }
  // A tool whose turns are different steps refuses one out of order, uncharged.
  // Owner ١٦٦ (l13): a section edit is one of the memo's included revisions —
  // the admin's number (drafter_revisions_per_memo, 5) bounds the turn check,
  // the price (always 0) and the start under the lock alike.
  const sectionEditsIncluded =
    spec.sectionEdit && checked.input.phase === spec.sectionEdit.phase ? await readSectionEditsIncluded(admin) : undefined;
  if (spec.checkTurn) {
    const refusal = spec.checkTurn(checked.input, turn, prior, sectionEditsIncluded !== undefined ? { sectionEditsIncluded } : undefined);
    if (refusal) {
      // Owner ١٦٦ (l13): a section edit's refusal carries the memo's counts, so the screen's tally resyncs.
      const counts = sectionEditsIncluded !== undefined ? { details: { sectionEdits: countSectionEdits(prior) } } : {};
      return { status: 409, body: { error: refusal, code: "turn_refused", ...(conversationId ? { conversationId } : {}), ...counts } };
    }
  }
  // What the stored runs already hold is taken from them, never from the
  // browser (owner ٤١٠: the section's text and whether it cited).
  if (spec.fromPrior) {
    const rebuilt = spec.fromPrior(checked.input, prior);
    if (!rebuilt.ok) return { status: 409, body: { error: rebuilt.error, code: "turn_refused", ...(conversationId ? { conversationId } : {}) } };
    checked.input = rebuilt.input;
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
  // T17a: the named case is read here, before the charge — the caller's own
  // case only (assistantCase.ts); the id stays in the input, the summary goes
  // to n8n only.
  let caseContext: Record<string, unknown> | null = null;
  const caseId = spec.caseFrom ? checked.input[spec.caseFrom] : null;
  if (typeof caseId === "string" && caseId) {
    if (!deps.loadCase) {
      console.error("[ai] a case tool without loadCase:", spec.id);
      return { status: 503, body: { error: AI_COPY.notReady, code: "not_ready" } };
    }
    let loaded: Record<string, unknown> | null;
    try {
      loaded = await deps.loadCase(actor.userId, caseId);
    } catch (err) {
      console.error("[ai] reading the case failed for", spec.id, errorName(err));
      return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
    }
    if (!loaded) return { status: 404, body: { error: AI_COPY.caseNotFound, code: "case_not_found" } };
    caseContext = loaded;
  }
  // Owner ٤١٠: a section edit is priced from the memo's earlier edits, read
  // above from this user's own runs of this conversation (never the browser's).
  const sectionEdit = !!spec.sectionEdit && !!conversationId && checked.input.phase === spec.sectionEdit.phase;
  const priorSectionEdits: SectionEditCounts | undefined = sectionEdit ? countSectionEdits(prior) : undefined;
  // l12 (owner N6): the drafter's prices are the admin setting ai_draft_prices
  // (the code defaults when it cannot be read — never 0).
  const draftPrices = spec.id === "legal-drafter" ? await readDraftPrices(admin) : undefined;
  // l12 simpledraft: an admin-set price is read here, before the charge.
  const settingPrice = spec.priceSetting ? await readPriceSetting(admin, spec.priceSetting) : undefined;
  if (settingPrice === "error") return { status: 503, body: { error: AI_COPY.unavailable, code: "unavailable" } };
  const price = spec.price(checked.input, {
    pages,
    turn,
    ...(priorSectionEdits ? { priorSectionEdits } : {}),
    ...(draftPrices ? { draftPrices } : {}),
    ...(settingPrice !== undefined ? { settingPrice } : {}),
  });
  // The screen showed a price before the user confirmed: a different one now is
  // refused, uncharged, with the counts to show again.
  if (req.expectedPrice !== undefined && req.expectedPrice !== price) {
    return {
      status: 409,
      body: {
        error: sectionEdit ? SECTION_EDIT_COPY.priceChanged : AI_COPY.priceChanged,
        code: "price_changed",
        price,
        ...(priorSectionEdits ? { details: { sectionEdits: priorSectionEdits } } : {}),
        ...(conversationId ? { conversationId } : {}),
      },
    };
  }
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
  // A section edit (owner ٤١٠) never spends a credit: it is not a drafting work.
  const creditKind = !isAdmin && !sectionEdit && req.useCredit === true ? creditKindForRun(spec.id, checked.input, turn) : null;
  // Owner ٣٠ (18 Nov, batch l7): the account's free questions, once — first,
  // with no opt-in, while the status says some are left (freeQuestion.ts).
  // ai_start_free_question recounts under the start lock; a refusal falls back
  // below to the founder credit, else the price shown. Register 4 / 36 (l9):
  // only on the account's own free tool — quick-answer for an individual, the
  // library assistant for everyone else (freeQuestionToolFor, 20261129_60).
  // Q181 (batch l13): a free-questions-only tool (`floating`, price 0) asks too.
  const freeOnly = spec.freeQuestionsOnly === true && !!spec.freeQuestions;
  let freeQuestion =
    !!spec.freeQuestions && spec.id === (actor.freeQuestionTool ?? freeQuestionToolFor(actor.userType)) &&
    !creditKind && !isAdmin && !sectionEdit && (price > 0 || freeOnly) &&
    !!deps.freeQuestions && (await freeQuestionsLeftSafe(deps.freeQuestions, actor.userId));
  // Q181: such a tool runs only as a free question (an admin runs it free):
  // none applies → refused here, before anything is started or charged.
  const freeOnlyRefusal: RouteReply = { status: 402, body: { error: FREE_QUESTION_COPY.floatingNone, code: "free_questions_none" } };
  if (freeOnly && !isAdmin && !freeQuestion) return freeOnlyRefusal;
  // Owner ٨ / ١٥ / ١٨: a founder's library-assistant question is paid from his
  // 100 library points (20 'library_question' credits) from the first
  // question, with no opt-in; once they are gone (or before 20261124_10 runs:
  // credit_not_eligible) the same request is charged the normal points below.
  let libraryCredit =
    !creditKind && !isAdmin && !sectionEdit && !freeQuestion && price > 0 && spec.id === FOUNDER_LIBRARY_TOOL &&
    !!deps.founderLibraryCredit && (await founderLibraryCreditSafe(deps.founderLibraryCredit, actor.userId));
  // A section edit starts through ai_start_section_edit (20261108_40): it takes
  // ai_start_run's lock, counts the memo's edits again and refuses a price that
  // is no longer right, so two edits at once cannot both take the last free one.
  let startFn = freeQuestion
    ? "ai_start_free_question"
    : sectionEdit ? "ai_start_section_edit" : creditKind || libraryCredit ? "ai_start_run_with_credit" : "ai_start_run";

  const startArgs = {
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
  };
  let { data, error } = await admin.rpc(startFn, {
    ...startArgs,
    ...(creditKind ? { p_credit_kind: creditKind } : libraryCredit ? { p_credit_kind: FOUNDER_LIBRARY_CREDIT_KIND } : {}),
    ...(sectionEdit
      ? {
          // Owner ١٦٦: every edit up to N is free (price 0), edit N+1 is refused
          // (section_edit_limit) under the lock; there is no paid edit.
          p_section_index: checked.input.section_index,
          p_free_per_memo: sectionEditsIncluded,
          p_free_per_section: sectionEditsIncluded,
          p_paid_price: 0,
          p_max_per_memo: sectionEditsIncluded,
        }
      : {}),
  });
  // Owner ٣٠ (l7): the free question was refused — the last one taken
  // meanwhile, not this account's, or 20261127_40 not run yet. Nothing was
  // written, so the same request goes the normal way: the founder's library
  // credit when he holds one, else the price the screen showed.
  if (error && freeQuestion && freeQuestionFallsBack(error)) {
    // Q181: a free-questions-only tool never falls back to a paid start.
    if (freeOnly) return freeOnlyRefusal;
    freeQuestion = false;
    libraryCredit =
      !creditKind && !isAdmin && spec.id === FOUNDER_LIBRARY_TOOL &&
      !!deps.founderLibraryCredit && (await founderLibraryCreditSafe(deps.founderLibraryCredit, actor.userId));
    startFn = libraryCredit ? "ai_start_run_with_credit" : "ai_start_run";
    ({ data, error } = await admin.rpc(startFn, libraryCredit ? { ...startArgs, p_credit_kind: FOUNDER_LIBRARY_CREDIT_KIND } : startArgs));
  }
  // The library points ran out between the check and the start (another
  // question took the last one), or 20261124_10 has not run yet: the credit
  // function wrote nothing, so the same request is charged the normal points.
  if (
    error && libraryCredit &&
    (error.message === "no_credit" || error.message === "credit_not_eligible" || isMissingFunction(error.code))
  ) {
    startFn = "ai_start_run";
    ({ data, error } = await admin.rpc(startFn, startArgs));
  }
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
    if (sectionEdit) {
      const again = conversationId ? { conversationId } : {};
      if (error.message === "section_price_changed") {
        // Another edit took the free one first: the counts read before it are
        // stale, so the screen is told to read them again (its next confirm
        // gets the fresh price and counts from the check above).
        return { status: 409, body: { error: SECTION_EDIT_COPY.priceChanged, code: "price_changed", ...again } };
      }
      if (error.message === "section_edit_limit") {
        return {
          status: 409,
          body: { error: sectionEditLimitText(sectionEditsIncluded), code: "turn_refused", ...again, ...(priorSectionEdits ? { details: { sectionEdits: priorSectionEdits } } : {}) },
        };
      }
      if (error.message === "section_no_draft") {
        return { status: 409, body: { error: SECTION_EDIT_COPY.waitDraft, code: "turn_refused", ...again } };
      }
      // Before 20261108_40 is run there is no race-safe start: the edit is
      // refused, uncharged, rather than started without the lock.
      if (isMissingFunction(error.code)) {
        return { status: 503, body: { error: SECTION_EDIT_COPY.unavailable, code: "not_ready" } };
      }
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

  const ctx: DispatchContext = { spec, run, checked, files, pages, history, conversationId, isAdmin, deadline, startedAt, actor, caseContext };
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
  const caseContext = ctx.caseContext ?? null;
  const clock = deps.clock ?? (() => Date.now());
  const charged = chargedBody(run, conversationId);
  let sources: SourceMap = {};
  // Owner ١٥٦ (l13): the library search writer's tokens, billed with the run.
  let searchUsage: Record<string, unknown> | null = null;

  // Charged first, so the daily limit and the balance hold for the searches
  // too; every way out below refunds.
  let pkgSources: PackageSource[] = [];
  if (spec.retrieval && deps.retrieve) {
    const { from, pinFrom, scopeFrom, limitsFor } = spec.retrieval;
    // T14-Q485: the type chips choose the limits; no chip → the tool's own.
    const limits = limitsFor?.(checked.input) ?? { laws: spec.retrieval.laws, principles: spec.retrieval.principles };
    const pinned = pinFrom ? checked.input[pinFrom] : null;
    const scope = scopeFrom ? checked.input[scopeFrom] : null;
    const question = String(checked.input[from] ?? "");
    const pin: RetrievalPin = {
      question,
      ...(typeof pinned === "string" && pinned ? { articleId: pinned } : {}),
      ...(typeof scope === "string" && scope ? { lawSlug: scope } : {}),
    };
    const searchSeedText = [
      ...history.filter((h) => h.role === "user").slice(-1).map((h) => h.text),
      question,
    ].join("\n");
    const [asked, embedded] = await Promise.all([
      deps.n8n({
        path: LIB_QUERIES_PATH,
        mode: "sync",
        // A follow-up («وما مدته؟») is searched together with the question before it.
        body: {
          v: 1,
          run_id: run.run_id,
          tool: "lib-queries",
          input: {
            text: searchSeedText,
          },
        },
        timeoutMs: LIB_QUERIES_TIMEOUT_MS,
      }),
      deps.embedQuery ? deps.embedQuery(searchSeedText).catch(() => null) : Promise.resolve(null),
    ]);
    const reply = asked.kind === "result" && isPlainObject(asked.result) ? asked.result : null;
    const queries =
      reply && reply.run_id === run.run_id && reply.status === "succeeded" && isPlainObject(reply.output)
        ? cleanQueries(reply.output.queries)
        : [];
    // Owner ١٥٦ (l13): the search writer is a model call of this run too.
    const libUsage = reply && reply.run_id === run.run_id ? sanitizeUsage(reply.usage) : null;
    if (usageHasTokens(libUsage)) searchUsage = libUsage;
    report(deps.progress, run.run_id, actor.userId, queryEvents(queries));
    // An open article, one the question names, or a semantic GraphRAG query
    // embedding is a source path even when the keyword writer found nothing.
    const named = articleRefs(question).length > 0 || (!!pin.lawSlug && bareArticleNumbers(question).length > 0);
    const hasVector = Boolean(embedded?.literal);
    // Owner ٤١٠: a section edit of a section that cited nothing (the parties'
    // data, a preamble) is not refused for finding no library text: it goes on
    // with no sources, as its answer may cite none (citationsOptional).
    const sourcesOptional = spec.citationsOptional?.(checked.input) === true;
    let found: Retrieved = { sources: [], map: {} };
    if (queries.length === 0 && !hasVector && !pin.articleId && !named) {
      if (!sourcesOptional) {
        await failRun(admin, run.run_id, "no_queries", asked.kind === "failed" ? asked.detail : "the search writer returned no searches");
        return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
      }
    } else {
      try {
        const retrieveOpts: RetrieveGraphOptions | undefined = embedded?.literal
          ? { useGraph: true, queryEmbedding: embedded.literal, modelId: embedded.modelId }
          : deps.embedQuery
            ? { useGraph: true }
            : undefined;
        found = retrieveOpts
          ? await deps.retrieve(queries, limits, pin, retrieveOpts)
          : await deps.retrieve(queries, limits, pin);
      } catch (err) {
        console.error("[ai] retrieval threw for", run.run_id, errorName(err));
        found = { sources: [], map: {} };
      }
    }
    if (found.sources.length === 0 && !sourcesOptional) {
      await failRun(admin, run.run_id, "no_sources", `no library text matched: ${queries.join(" | ")}`);
      return { status: 422, body: { error: AI_COPY.noSources, code: "no_sources", runId: run.run_id } };
    }
    if (found.sources.length > 0) {
      sources = found.map as SourceMap;
      pkgSources = found.sources;
      const stored = await admin
        .from("ai_runs")
        .update(searchUsage ? { source_ids: sources, usage: searchUsage } : { source_ids: sources })
        .eq("id", run.run_id)
        .eq("status", "running");
      if (stored.error) {
        console.error("[ai] storing the sources failed for", run.run_id, stored.error.code, stored.error.message);
        await failRun(admin, run.run_id, "store_failed", "the sources could not be stored");
        return { status: 502, body: { error: AI_COPY.failed, code: "tool_failed", runId: run.run_id } };
      }
      report(deps.progress, run.run_id, actor.userId, sourceEvents(toSourceRefs(found.sources)));
    }
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
    case: caseContext,
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
  const settled = await settleRunWith(admin, { spec, runId: run.run_id, sources, input: checked.input, priorUsage: searchUsage }, outcome.result);
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
  if (settled.code === OUTPUT_BLOCKED && spec.promptGuard) {
    // Counted like a flagged question; the log carries the question's hash, never a text.
    const asked = String(checked.input[spec.promptGuard.field] ?? "");
    await logFlagged("output", { toolId: spec.id, userId: actor.userId, rule: OUTPUT_BLOCKED, text: asked, runId: run.run_id }, deps.promptGuard, ctx.isAdmin);
    return { status: 422, body: { ...extractionRefusal(), runId: run.run_id } };
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
    .select("id, user_id, tool, status, class, source_ids, input, usage")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    console.error("[ai/callback] run read failed:", runId, error.code, error.message);
    return { status: 503, body: { error: "unavailable" } };
  }
  const run = data as
    | { id: string; user_id: string; tool: string; status: string; class: string; source_ids: unknown; input: unknown; usage?: unknown }
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
  // Owner ١٥٦ (l13): the search writer's tokens stored at dispatch join the job's own.
  const settled = await settleRunWith(admin, { spec, runId, sources, input, priorUsage: run.usage ?? null }, body);
  if (settled.kind === "succeeded") {
    const verified = verifyEvent(settled.output);
    if (verified) report(deps.progress, runId, run.user_id, [verified]);
  }
  return { status: 200, body: { ok: true, final: settled.kind === "succeeded" ? settled.status : settled.kind } };
}
