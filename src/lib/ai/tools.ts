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
import type { RetrievalLimits } from "./retrieval.ts";
import type { FileRules } from "./aiFiles.ts";

export type AiToolClass = "fast" | "job";
export type AiModelTier = "fast" | "deep";
/** staff: live for admins only, to test a tool on production before anyone else sees it. */
export type AiToolMode = "off" | "staff" | "review" | "live";

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
  price: (input: Record<string, unknown>, ctx: { pages: number | null; turn?: number }) => number;
  /** Runs per user per Riyadh day while nothing else limits them (plan §1.2). */
  dailyLimit: number;
  /** The mode until an admin sets one in platform_settings.ai_tools. */
  defaultMode: AiToolMode;
  /** Job tools: how long until the sweeper fails and refunds the run. */
  jobDeadlineSeconds?: number;
  /**
   * A chat tool (L4): runs share a conversation_id, the earlier turns are read
   * back from ai_runs (never taken from the browser) and sent as `history`, and
   * `price` gets the 0-based `turn`. A conversation holds `maxMessages` runs.
   */
  conversation?: { maxMessages: number; historyPairs: number; field: string; replyField: string };
  /**
   * Wave 3: the tool reads the user's vault files (aiFiles.ts). The files are
   * checked, counted and signed before the charge, and `price` gets the total
   * `pages`. A tool without this refuses any fileIds.
   */
  files?: FileRules;
  /** Letter-type tools sign with the user's name (plan §2.2); every other tool gets null. */
  sendsDisplayName?: boolean;
  /**
   * Wave 2: the tool answers from library texts the app retrieves (retrieval.ts).
   * Such a tool passes the library gate and the assistant's tier rule before
   * the charge, is refunded when nothing in the library matches, and fails
   * (refunded) when its answer cites none of the texts it was given.
   */
  retrieval?: RetrievalLimits & {
    /** The input field the searches are written from. */
    from: string;
    /** The input field naming an article to send first, whatever the searches find (L5 «اشرح لي»). */
    pinFrom?: string;
    /** The input field naming the law page the user is on: searched before the whole library (L5). */
    scopeFrom?: string;
  };
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
export type CommunicateType = (typeof COMMUNICATE_TYPES)[number];
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
  return { ok: true, input: { text, must_keep: extractLegalRefs(text) } };
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

// ── wave 2: answers from the library (plan §5, «Wave 2») ────────────────────

/** n8n's search writer: a question → 2–4 short library searches (retrieval.ts). */
export const LIB_QUERIES_PATH = "nzamy-ai/lib-queries";

export const QUICK_ANSWER_QUESTION_MAX = 1000;
export const QUICK_ANSWER_MAX = 6000;

/** L3 سؤال قانوني سريع: one question → a short answer cited to library texts. */
function quickAnswerInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  const question = boundedText(raw.question, QUICK_ANSWER_QUESTION_MAX);
  if (!question || question.length < 8) return { ok: false, error: "اكتب سؤالك (من ٨ إلى ١٬٠٠٠ حرف)" };
  return { ok: true, input: { question } };
}

function quickAnswerOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const answer = boundedText(raw.answer, QUICK_ANSWER_MAX);
  return answer ? { answer } : null;
}

/**
 * Every account type: the library assistant is the library's, not the
 * lawyers' (owner ٢٠٦ / ٢٠٧ / ٢٠٩). Who may use it is the tier rule (Pro or
 * higher, or an admin), which the run route checks for every library tool.
 */
const LIBRARY_ROLES = ["individual", "lawyer", "firm", "corporate", "provider", "micro", "government", "ngo"] as const;

export const LIBRARY_MESSAGE_MAX = 4000;
export const LIBRARY_REPLY_MAX = 6000;
/** Article ids are slugs such as `labor-law__art-80` (library.articles.id). */
const ARTICLE_ID = /^[\p{L}\p{N}_.\-]{1,200}$/u;
const LAW_SLUG = /^[\p{L}\p{N}_.\-]{1,200}$/u;

/** L5 مساعد المكتبة: a question inside /laws, optionally about the article the user has open. */
function libraryAssistantInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  const message = boundedText(raw.message, LIBRARY_MESSAGE_MAX);
  if (!message || message.length < 2) return { ok: false, error: "اكتب سؤالك (حتى ٤٬٠٠٠ حرف)" };
  // The law page the chat is on (owner's live test 29 Oct: two different laws
  // got the same labour-law answer because the whole library was searched).
  let law_slug: string | null = null;
  if (raw.law_slug !== undefined && raw.law_slug !== null && raw.law_slug !== "") {
    if (typeof raw.law_slug !== "string" || !LAW_SLUG.test(raw.law_slug)) return { ok: false, error: "معرّف النظام غير صالح" };
    law_slug = raw.law_slug;
  }
  if (raw.article_id === undefined || raw.article_id === null || raw.article_id === "") {
    return { ok: true, input: { message, article_id: null, law_slug } };
  }
  if (typeof raw.article_id !== "string" || !ARTICLE_ID.test(raw.article_id)) {
    return { ok: false, error: "معرّف المادة غير صالح" };
  }
  return { ok: true, input: { message, article_id: raw.article_id, law_slug } };
}

function libraryAssistantOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const reply = boundedText(raw.reply, LIBRARY_REPLY_MAX);
  return reply ? { reply } : null;
}

export const ASSISTANT_CONTEXTS = ["general", "case", "contract", "research"] as const;
export type AssistantContext = (typeof ASSISTANT_CONTEXTS)[number];
export const ASSISTANT_MESSAGE_MAX = 4000;
export const ASSISTANT_REPLY_MAX = 8000;
/** D3: one price buys a conversation of this many messages; the next starts a new one. */
export const ASSISTANT_MESSAGES_PER_CONVERSATION = 5;
export const ASSISTANT_CONVERSATION_PRICE = 100;

/** L4 المستشار الذكي: a lawyer's chat, each message answered from the library. */
function assistantInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  const context = raw.context === undefined ? "general" : raw.context;
  if (!(ASSISTANT_CONTEXTS as readonly unknown[]).includes(context)) return { ok: false, error: "اختر نوع السياق" };
  const message = boundedText(raw.message, ASSISTANT_MESSAGE_MAX);
  if (!message || message.length < 2) return { ok: false, error: "اكتب رسالتك (حتى ٤٬٠٠٠ حرف)" };
  return { ok: true, input: { context, message } };
}

function assistantOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const reply = boundedText(raw.reply, ASSISTANT_REPLY_MAX);
  return reply ? { reply } : null;
}

/** L6: the cards the lawyer selected, as the model reads them. */
export const CANVAS_CARDS_MAX = 8;
export const CANVAS_SUGGESTIONS_MAX = 3;
const CANVAS_CARD_TYPES = ["person", "doc", "law", "event", "evidence", "custom", "link", "checklist"] as const;
const CANVAS_TEXT_MAX = 2000;

/**
 * L6 بطاقة الكانفاس الذكية: the selected cards of a case board → 1–3 law cards,
 * each tied to a library text the app sent (owner ٢٩١: manual cards stay free).
 * `text` is what the searches are written from.
 */
function canvasCardInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw) || !Array.isArray(raw.cards)) return { ok: false, error: "اختر بطاقة واحدة على الأقل" };
  const cards: Array<{ type: string; title: string; desc: string }> = [];
  for (const c of raw.cards.slice(0, CANVAS_CARDS_MAX)) {
    if (!isPlainObject(c)) continue;
    const title = boundedText(c.title, 200);
    if (!title) continue;
    const type = (CANVAS_CARD_TYPES as readonly unknown[]).includes(c.type) ? String(c.type) : "custom";
    const desc = typeof c.desc === "string" ? c.desc.trim().slice(0, 400) : "";
    cards.push({ type, title, desc });
  }
  if (cards.length === 0) return { ok: false, error: "اختر بطاقة واحدة على الأقل فيها عنوان" };
  const text = cards.map((c) => [c.title, c.desc].filter(Boolean).join(": ")).join("\n").slice(0, CANVAS_TEXT_MAX);
  return { ok: true, input: { cards, text } };
}

function canvasCardOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.cards)) return null;
  const cards: Array<{ sid: string; why: string }> = [];
  for (const c of raw.cards) {
    if (!isPlainObject(c) || typeof c.sid !== "string" || !/^S\d{1,3}$/.test(c.sid)) continue;
    const why = boundedText(c.why, 300);
    if (!why || cards.some((x) => x.sid === c.sid)) continue;
    cards.push({ sid: c.sid, why });
    if (cards.length >= CANVAS_SUGGESTIONS_MAX) break;
  }
  // No pick («لا_يوجد») is a valid shape with no citation: runCore refunds it
  // as ungrounded, with the message that says nothing matched.
  return { cards };
}

// ── wave 3: documents (plan §5, «Wave 3») ───────────────────────────────────

/** L7: the owner's two tiers (٢٨٣), and the limits checked before the charge. */
export const CASE_BRIEF_SMALL_PAGES = 5;
export const CASE_BRIEF_PRICES = { small: 30, large: 150 } as const;
export const CASE_BRIEF_FILES: FileRules = { max: 5, maxPages: 30, maxBytes: 22 * 1024 * 1024 };

const BRIEF_KINDS = ["error", "warning", "info"] as const;
const BRIEF_LEVELS = ["strong", "medium", "weak"] as const;
const BRIEF_PRIORITIES = ["critical", "high", "normal"] as const;
const BRIEF_REQUEST_TYPES = ["document", "info", "witness", "financial"] as const;
const NOT_STATED = "غير مذكور";

const text = (v: unknown, max: number, fallback = ""): string => boundedText(v, max) ?? fallback;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fallback;
const listOf = <T>(v: unknown, max: number, map: (x: unknown) => T | null): T[] =>
  (Array.isArray(v) ? v : []).map(map).filter((x): x is T => x !== null).slice(0, max);

/** L7 عصارة المرفقات / الموجز القضائي: who the lawyer acts for, and whether to list what to ask the client for. */
function caseBriefInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  const roleNote = boundedText(raw.role_note, 1000);
  if (!roleNote || roleNote.length < 3) return { ok: false, error: "اكتب صفتك في القضية ومن تمثّل (حتى ١٬٠٠٠ حرف)" };
  return { ok: true, input: { role_note: roleNote, want_requests: raw.want_requests !== false } };
}

/**
 * The model's BriefResult, rebuilt field by field: every string bounded, every
 * level from its fixed list, no field the screen does not show. No link comes
 * from the model (the old mock's options[].tool.href is not part of the shape).
 */
function caseBriefOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.caseCard)) return null;
  const story = boundedText(raw.story, 4000);
  if (!story) return null;
  const c = raw.caseCard;
  return {
    caseCard: {
      type: text(c.type, 200, NOT_STATED),
      stage: text(c.stage, 200, NOT_STATED),
      position: text(c.position, 300, NOT_STATED),
      parties: text(c.parties, 600, NOT_STATED),
      court: text(c.court, 300, NOT_STATED),
      caseNo: text(c.caseNo, 120, NOT_STATED),
      claim: text(c.claim, 800, NOT_STATED),
    },
    story,
    highlights: listOf(raw.highlights, 12, (h) =>
      isPlainObject(h) && boundedText(h.text, 500) ? { kind: oneOf(h.kind, BRIEF_KINDS, "info"), text: text(h.text, 500) } : null,
    ),
    assessment: oneOf(raw.assessment, BRIEF_LEVELS, "medium"),
    assessmentReason: text(raw.assessmentReason, 1000),
    options: listOf(raw.options, 6, (o) =>
      isPlainObject(o) && boundedText(o.label, 200) ? { label: text(o.label, 200), requires: text(o.requires, 400) } : null,
    ),
    questions: listOf(raw.questions, 12, (q) => boundedText(q, 400)),
    clientRequests: listOf(raw.clientRequests, 12, (r) =>
      isPlainObject(r) && boundedText(r.request, 400)
        ? {
            request: text(r.request, 400),
            reason: text(r.reason, 500),
            priority: oneOf(r.priority, BRIEF_PRIORITIES, "normal"),
            type: oneOf(r.type, BRIEF_REQUEST_TYPES, "document"),
          }
        : null,
    ),
  };
}

/** L8: one memo, the gaps report (the full revision stays a team order). */
export const BRIEF_CHECK_PRICE = 200;
export const BRIEF_CHECK_FILES: FileRules = { max: 1, maxPages: 30, maxBytes: 22 * 1024 * 1024 };
const FINDING_SEVERITIES = ["high", "medium", "low"] as const;

/** L8 مراجعة وتدقيق مذكرة: the client's capacity and the case's frame for the memo's gaps report. */
function briefCheckInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  const capacity = boundedText(raw.client_capacity, 100);
  if (!capacity) return { ok: false, error: "اختر صفة موكّلك" };
  const optional = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return {
    ok: true,
    input: { client_capacity: capacity, court: optional(raw.court, 150), case_type: optional(raw.case_type, 150), notes: optional(raw.notes, 2000) },
  };
}

/**
 * The model's report: the findings, a summary, and `cited` — what the memo
 * cites, as written. runCore's enricher (citationCheck.ts) then replaces
 * `cited` with the library's verdict on each one, so the stored result never
 * carries the model's opinion on whether an article exists.
 */
function briefCheckOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const summary = boundedText(raw.summary, 3000);
  if (!summary) return null;
  return {
    summary,
    findings: listOf(raw.findings, 25, (f) =>
      isPlainObject(f) && boundedText(f.issue, 800)
        ? {
            severity: oneOf(f.severity, FINDING_SEVERITIES, "medium"),
            location: text(f.location, 200, "عام"),
            issue: text(f.issue, 800),
            fix: text(f.fix, 800),
          }
        : null,
    ),
    cited: Array.isArray(raw.cited) ? raw.cited.slice(0, 40) : [],
  };
}

// ── wave 4: case analysis (plan §5, «Wave 4») ───────────────────────────────
// Both read the lawyer's summary, and the case files when there are any. No
// number anywhere: owner ١٩٣ bans a chance of winning on every tool, so levels
// are words and the court target describes what the court will examine, never
// how it will rule. Cited articles go through the library check (runCore).

export const WAVE4_PRICE = 250;
export const WAVE4_FILES: FileRules = { max: 6, maxPages: 30, maxBytes: 22 * 1024 * 1024, optional: true };
export const CASE_SUMMARY_MIN = 20;
export const CASE_SUMMARY_MAX = 6000;

export const WARGAMING_ROLES = ["plaintiff", "defendant", "advisor"] as const;
export const WARGAMING_TARGETS = ["opponent", "court", "critique", "plea"] as const;
export type WargamingTarget = (typeof WARGAMING_TARGETS)[number];
const SEVERITIES = ["high", "medium", "low"] as const;
const optionalText = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The case summary: CASE_SUMMARY_MIN..MAX characters, or null. */
function caseSummary(v: unknown): string | null {
  const t = boundedText(v, CASE_SUMMARY_MAX);
  return t && t.length >= CASE_SUMMARY_MIN ? t : null;
}
const SUMMARY_ERROR = `اكتب ملخص القضية (من ${CASE_SUMMARY_MIN.toLocaleString("ar-SA")} إلى ${CASE_SUMMARY_MAX.toLocaleString("ar-SA")} حرف)`;

/**
 * L9 المحاكي الشامل: the case, the targets, and for «نقض المذكرة» the memo —
 * pasted (memo_text) or among the files (memo_in_files, set by the screen
 * when the memo's own upload is sent).
 */
function wargamingInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  if (!(WARGAMING_ROLES as readonly unknown[]).includes(raw.role)) return { ok: false, error: "اختر صفة موكّلك" };
  const area = boundedText(raw.area, 150);
  if (!area) return { ok: false, error: "اختر تخصص القضية" };
  const summary = caseSummary(raw.case_summary);
  if (!summary) return { ok: false, error: SUMMARY_ERROR };
  const targets = Array.isArray(raw.targets) ? WARGAMING_TARGETS.filter((t) => (raw.targets as unknown[]).includes(t)) : [];
  if (targets.length === 0) return { ok: false, error: "اختر هدفاً واحداً على الأقل" };
  const memoText = optionalText(raw.memo_text, 15000);
  const memoInFiles = raw.memo_in_files === true;
  if (targets.includes("critique") && !memoText && !memoInFiles) {
    return { ok: false, error: "«نقض المذكرة» يحتاج نص المذكرة أو ملفها" };
  }
  return {
    ok: true,
    input: {
      role: raw.role,
      area,
      case_summary: summary,
      targets,
      memo_text: targets.includes("critique") ? memoText : null,
      memo_in_files: targets.includes("critique") && memoInFiles,
    },
  };
}

/** The simulation's points, kept only for the targets asked for; the plea script only when «تدريب المرافعة» was. */
function wargamingOutput(raw: unknown, input: Record<string, unknown>): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const summary = boundedText(raw.summary, 3000);
  if (!summary) return null;
  const asked = (Array.isArray(input.targets) ? input.targets : []) as string[];
  const points = listOf(raw.points, 30, (p) =>
    isPlainObject(p) && asked.includes(String(p.source)) && boundedText(p.title, 300) && boundedText(p.detail, 1500)
      ? {
          source: p.source as WargamingTarget,
          severity: oneOf(p.severity, SEVERITIES, "medium"),
          title: text(p.title, 300),
          detail: text(p.detail, 1500),
          counter: text(p.counter, 1500),
        }
      : null,
  );
  if (points.length === 0) return null;
  return {
    summary,
    points,
    plea_script: asked.includes("plea") ? text(raw.plea_script, 6000) : "",
    cited: Array.isArray(raw.cited) ? raw.cited.slice(0, 40) : [],
  };
}

export const STRENGTH_ROLES = ["plaintiff", "defendant", "other"] as const;
const LEVELS = ["strong", "medium", "weak"] as const;
const MOVE_KINDS = ["attack", "defense"] as const;
const DEVIL_SEVERITIES = ["critical", "high", "medium"] as const;

/** L10 محلل قوة الموقف: the case, the evidence notes and what the opponent has said, if any. */
function analyzeStrengthInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  if (!(STRENGTH_ROLES as readonly unknown[]).includes(raw.role)) return { ok: false, error: "اختر صفة موكّلك" };
  const summary = caseSummary(raw.case_summary);
  if (!summary) return { ok: false, error: SUMMARY_ERROR };
  return {
    ok: true,
    input: {
      role: raw.role,
      case_summary: summary,
      evidence_notes: optionalText(raw.evidence_notes, 3000),
      opponent_points: optionalText(raw.opponent_points, 4000),
    },
  };
}

/** Four tabs of words: the grounds' level, the opponent's moves, the procedural risks, the devil's advocate. */
function analyzeStrengthOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.grounds)) return null;
  const g = raw.grounds;
  const summary = boundedText(g.summary, 2000);
  if (!summary) return null;
  const lines = (v: unknown) => listOf(v, 8, (s) => boundedText(s, 500));
  return {
    grounds: {
      level: oneOf(g.level, LEVELS, "medium"),
      summary,
      strengths: lines(g.strengths),
      weaknesses: lines(g.weaknesses),
      recommendations: lines(g.recommendations),
    },
    opponent: listOf(raw.opponent, 10, (m) =>
      isPlainObject(m) && boundedText(m.move, 600)
        ? { kind: oneOf(m.kind, MOVE_KINDS, "attack"), move: text(m.move, 600), counter: text(m.counter, 800) }
        : null,
    ),
    risks: listOf(raw.risks, 10, (r) =>
      isPlainObject(r) && boundedText(r.risk, 400)
        ? { risk: text(r.risk, 400), level: oneOf(r.level, SEVERITIES, "medium"), mitigation: text(r.mitigation, 600) }
        : null,
    ),
    devil: listOf(raw.devil, 6, (d) =>
      isPlainObject(d) && boundedText(d.text, 1000)
        ? { label: text(d.label, 150, "ملاحظة"), text: text(d.text, 1000), severity: oneOf(d.severity, DEVIL_SEVERITIES, "high") }
        : null,
    ),
    cited: Array.isArray(raw.cited) ? raw.cited.slice(0, 40) : [],
  };
}

// ── wave 5: documents the AI writes (plan §5, «Wave 5») ─────────────────────

/** L11: the six types of /ai/contract-drafter (contractTypes.ts ids). */
export const CONTRACT_TYPES = ["rent", "service", "employment", "partnership", "sale", "other"] as const;
export type ContractTypeId = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_DRAFT_PRICE = 500;
const CONTRACT_FIELDS_MAX = 15;
export const CONTRACT_FIELD_MAX = 2000;

/**
 * L11 محترف العقود المختصر: the type and the form's fields, each as its Arabic
 * label and the value typed, so the model reads what the user read.
 */
function contractDraftInput(raw: unknown): InputCheck {
  if (!isPlainObject(raw)) return { ok: false, error: "المدخلات غير صالحة" };
  if (!(CONTRACT_TYPES as readonly unknown[]).includes(raw.type)) return { ok: false, error: "اختر نوع العقد" };
  if (!Array.isArray(raw.fields)) return { ok: false, error: "أكمل بيانات العقد" };
  if (raw.fields.length > CONTRACT_FIELDS_MAX) return { ok: false, error: "بيانات العقد أكثر من المسموح" };
  // A blank field is left out; a field too long is refused, never cut or dropped.
  const fields: Array<{ label: string; value: string }> = [];
  for (const f of raw.fields) {
    if (!isPlainObject(f) || typeof f.value !== "string" || !f.value.trim()) continue;
    const label = boundedText(f.label, 80);
    if (!label) return { ok: false, error: "بيانات العقد غير صالحة" };
    const value = boundedText(f.value, CONTRACT_FIELD_MAX);
    if (!value) return { ok: false, error: `«${label}» أطول من ${CONTRACT_FIELD_MAX.toLocaleString("ar-SA")} حرف` };
    fields.push({ label, value });
  }
  if (fields.length < 2) return { ok: false, error: "أكمل بيانات العقد (طرفان على الأقل وموضوعه)" };
  return { ok: true, input: { type: raw.type, fields } };
}

/**
 * The draft: a title, the preamble, numbered sections; `cited` becomes the
 * library's verdict (runCore). All or nothing: one bad or over-long section
 * refuses the whole draft (refunded) rather than handing over a contract with
 * a clause silently missing.
 */
function contractDraftOutput(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.sections)) return null;
  const title = boundedText(raw.title, 200);
  if (!title || raw.sections.length < 2 || raw.sections.length > 40) return null;
  const sections: Array<{ heading: string; body: string }> = [];
  for (const s of raw.sections) {
    const heading = isPlainObject(s) ? boundedText(s.heading, 200) : null;
    const body = isPlainObject(s) ? boundedText(s.body, 12000) : null;
    if (!heading || !body) return null;
    sections.push({ heading, body });
  }
  const preamble = raw.preamble == null || raw.preamble === "" ? "" : boundedText(raw.preamble, 4000);
  if (preamble === null) return null;
  return {
    title,
    preamble,
    sections,
    cited: Array.isArray(raw.cited) ? raw.cited.slice(0, 40) : [],
  };
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
  "quick-answer": {
    id: "quick-answer",
    n8nPath: "nzamy-ai/quick-answer",
    class: "fast",
    tier: "fast",
    roles: ["lawyer", "firm"],
    consultantBlocked: false,
    price: () => 20,
    dailyLimit: 30,
    defaultMode: "off",
    retrieval: { from: "question", laws: 8, principles: 4 },
    validateInput: quickAnswerInput,
    validateOutput: quickAnswerOutput,
  },
  "library-assistant": {
    id: "library-assistant",
    n8nPath: "nzamy-ai/library-assistant",
    class: "fast",
    tier: "fast",
    roles: LIBRARY_ROLES,
    consultantBlocked: false,
    // Owner ٢٥٧: 5 points flat, the chat and «اشرح لي» alike.
    price: () => 5,
    dailyLimit: 60,
    defaultMode: "off",
    retrieval: { from: "message", pinFrom: "article_id", scopeFrom: "law_slug", laws: 6, principles: 3 },
    validateInput: libraryAssistantInput,
    validateOutput: libraryAssistantOutput,
  },
  assistant: {
    id: "assistant",
    n8nPath: "nzamy-ai/assistant",
    class: "fast",
    tier: "deep",
    roles: ["lawyer", "firm"],
    consultantBlocked: false,
    // D3: the conversation's first message pays for up to five.
    price: (_input, ctx) => ((ctx.turn ?? 0) === 0 ? ASSISTANT_CONVERSATION_PRICE : 0),
    dailyLimit: 60,
    defaultMode: "off",
    retrieval: { from: "message", laws: 8, principles: 4 },
    conversation: { maxMessages: ASSISTANT_MESSAGES_PER_CONVERSATION, historyPairs: 3, field: "message", replyField: "reply" },
    validateInput: assistantInput,
    validateOutput: assistantOutput,
  },
  "canvas-card": {
    id: "canvas-card",
    n8nPath: "nzamy-ai/canvas-card",
    class: "fast",
    tier: "fast",
    // The case board's «استيراد من القضية» is the lawyer and firm case files'.
    roles: ["lawyer", "firm"],
    consultantBlocked: false,
    price: () => 10,
    dailyLimit: 40,
    defaultMode: "off",
    retrieval: { from: "text", laws: 6, principles: 0 },
    validateInput: canvasCardInput,
    validateOutput: canvasCardOutput,
  },
  "case-brief": {
    id: "case-brief",
    n8nPath: "nzamy-ai/case-brief",
    class: "job",
    tier: "deep",
    roles: ["lawyer", "firm"],
    consultantBlocked: false,
    // Owner ٢٨٣: 30 points for 1–5 pages, 150 for 6–30 (scanned pages included).
    price: (_input, ctx) => ((ctx.pages ?? 0) <= CASE_BRIEF_SMALL_PAGES ? CASE_BRIEF_PRICES.small : CASE_BRIEF_PRICES.large),
    dailyLimit: 5,
    defaultMode: "off",
    jobDeadlineSeconds: 15 * 60,
    files: CASE_BRIEF_FILES,
    validateInput: caseBriefInput,
    validateOutput: caseBriefOutput,
  },
  "brief-check": {
    id: "brief-check",
    n8nPath: "nzamy-ai/brief-check",
    class: "job",
    tier: "deep",
    roles: ["lawyer", "firm"],
    // CONSULTANT_BLOCKED_PREFIXES has /ai/brief-check (Art. 18).
    consultantBlocked: true,
    price: () => BRIEF_CHECK_PRICE,
    dailyLimit: 5,
    defaultMode: "off",
    jobDeadlineSeconds: 15 * 60,
    files: BRIEF_CHECK_FILES,
    validateInput: briefCheckInput,
    validateOutput: briefCheckOutput,
  },
  wargaming: {
    id: "wargaming",
    n8nPath: "nzamy-ai/wargaming",
    class: "job",
    tier: "deep",
    roles: ["lawyer", "firm"],
    // CONSULTANT_BLOCKED_PREFIXES has /ai/wargaming (Art. 18).
    consultantBlocked: true,
    price: () => WAVE4_PRICE,
    dailyLimit: 5,
    defaultMode: "off",
    jobDeadlineSeconds: 15 * 60,
    files: WAVE4_FILES,
    validateInput: wargamingInput,
    validateOutput: wargamingOutput,
  },
  "analyze-strength": {
    id: "analyze-strength",
    n8nPath: "nzamy-ai/analyze-strength",
    class: "job",
    tier: "deep",
    roles: ["lawyer", "firm"],
    consultantBlocked: false,
    price: () => WAVE4_PRICE,
    dailyLimit: 5,
    defaultMode: "off",
    jobDeadlineSeconds: 15 * 60,
    files: WAVE4_FILES,
    validateInput: analyzeStrengthInput,
    validateOutput: analyzeStrengthOutput,
  },
  "contract-drafter": {
    id: "contract-drafter",
    n8nPath: "nzamy-ai/contract-drafter",
    class: "job",
    tier: "deep",
    // The page serves lawyers and individuals alike (plan: individual F «عقد مبسّط ذكي» is the same engine).
    roles: ["lawyer", "firm", "individual", "corporate", "micro"],
    consultantBlocked: false,
    price: () => CONTRACT_DRAFT_PRICE,
    dailyLimit: 5,
    defaultMode: "off",
    jobDeadlineSeconds: 15 * 60,
    validateInput: contractDraftInput,
    validateOutput: contractDraftOutput,
  },
};

export function getAiTool(id: unknown): AiToolSpec | null {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(AI_TOOLS, id)) return null;
  return AI_TOOLS[id];
}
