/**
 * legalQuestion.ts — owner Q181 (ب, batch l13): an individual's free legal
 * questions answered in «مساعد نظامي», the floating help window.
 *
 * The window's deterministic answerer (answer.ts) still answers everything
 * about the platform and still refuses legal advice to everyone else. For a
 * message it reads as a legal question («legal_advice»), the window asks the
 * server how many free questions this account has on the floating tool
 * (GET /api/v1/ai/free-question?tool=floating — the database's count, NONE
 * for a guest, an unverified e-mail, a lawyer or any account whose free
 * questions are on another tool):
 *   - some left → it OFFERS to answer from them (nothing is spent until the
 *     visitor presses the button), then POST /api/v1/ai/runs {tool:
 *     "floating"} answers from the library's texts, at no charge ever
 *     (runCore `freeQuestionsOnly`), followed by «بقي لك X من ٥ أسئلة مجانية»;
 *   - all used → an honest line and the paid ways (the quick answer for
 *     points, a lawyer's service);
 *   - otherwise → today's refusal, unchanged.
 * A message it did not recognise («fallback») may also be sent as a legal
 * question by the visitor's own press, while some are left.
 *
 * Pure (relative imports only), so `node --test` runs it.
 */
import { FREE_QUESTION_COPY } from "../ai/freeQuestion.ts";

export const FLOATING_TOOL = "floating";
export const FREE_STATUS_URL = `/api/v1/ai/free-question?tool=${FLOATING_TOOL}`;
/** quick-answer's lower bound (tools.ts quickAnswerInput). */
export const LEGAL_QUESTION_MIN = 8;
export const ANSWER_SOURCES_MAX = 5;

export interface FreeStatus {
  available: boolean;
  left: number;
  total: number;
}

export interface WindowLink {
  label: string;
  href: string;
}

/** The paid ways shown once the free questions are used up. */
export const FLOATING_PAID_LINKS: readonly WindowLink[] = Object.freeze([
  { label: "المجيب القانوني السريع", href: "/ai/quick-answer" },
  { label: "اطلب خدمة من محامٍ", href: "/services" },
]);

export const LEGAL_COPY = {
  sendAsLegal: "أرسله سؤالاً قانونياً (مجاني)",
  tooShort: "اكتب سؤالك القانوني بتفصيل أكثر (ثمانية أحرف على الأقل).",
  answering: "يبحث في المكتبة القانونية ويكتب الإجابة…",
  ungrounded: "إجابة عامة بلا سند مرجعي — تحقق منها",
  notCounted: "تعذّر إكمال الإجابة الآن، ولم يُحسب عليك السؤال — حاول بعد قليل.",
  noSources: "لم أجد في المكتبة القانونية نصاً يجيب عن سؤالك، ولم يُحسب عليك السؤال — أعد صياغته بكلمات أوضح.",
  sources: "المصادر:",
  guidance: "الإجابة إرشادية من نصوص المكتبة القانونية، وليست استشارة قانونية.",
  welcome: "ولأنك فرد مسجّل، لديك أسئلة قانونية مجانية: اكتب سؤالك القانوني وسأعرض عليك الإجابة عنه.",
  subtitleFree: (left: number, total: number) => `أسئلة عن المنصة، وأسئلتك القانونية المجانية (${FREE_QUESTION_COPY.floatingLeft(left, total)}).`,
} as const;

const count = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** The status route's JSON → a status, or null when malformed / none at all. */
export function parseFreeStatus(raw: unknown): FreeStatus | null {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const left = count(r?.left);
  const total = count(r?.total);
  if (!r || left === null || total === null || total === 0 || left > total) return null;
  return { available: r.available === true && left > 0, left, total };
}

/**
 * What the window does with the answerer's reply:
 *   "offer" — a legal question and some left: offer one of them;
 *   "used"  — a legal question and all used: the honest line + paid ways;
 *   "keep"  — anything else: the answerer's own reply.
 */
export function legalDecision(intent: unknown, free: FreeStatus | null): "offer" | "used" | "keep" {
  if (intent !== "legal_advice" || !free) return "keep";
  if (free.available) return "offer";
  return free.left === 0 ? "used" : "keep";
}

/** A message the answerer did not recognise may be sent as a legal question while some are left. */
export function canSendAsLegal(intent: unknown, free: FreeStatus | null, message: string): boolean {
  return intent === "fallback" && !!free?.available && message.trim().length >= LEGAL_QUESTION_MIN;
}

/**
 * A refused or failed floating run in the window's words. A failed run is
 * refunded by the server (ai_fail_run), and a failed run is not counted
 * among the used free questions, so it says the question was not counted.
 * null → the caller shows the server's own message.
 */
export function floatingRefusalText(code: string | null | undefined): string | null {
  if (code === "free_questions_none") return FREE_QUESTION_COPY.floatingNone;
  if (code === "no_sources" || code === "ungrounded") return LEGAL_COPY.noSources;
  if (code === "tool_failed" || code === "timeout" || code === "unavailable") return LEGAL_COPY.notCounted;
  return null;
}

const isSameSite = (href: unknown): href is string => typeof href === "string" && /^\/(?![/\\])[^\s<>"']*$/.test(href);

/** The run's citations → at most five same-site source links (title, url). */
export function answerSources(citations: unknown): WindowLink[] {
  if (!Array.isArray(citations)) return [];
  const seen = new Set<string>();
  const out: WindowLink[] = [];
  for (const c of citations) {
    const title = (c as { title?: unknown } | null)?.title;
    const url = (c as { url?: unknown } | null)?.url;
    if (typeof title !== "string" || !title.trim() || !isSameSite(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ label: title.trim().slice(0, 80), href: url });
    if (out.length >= ANSWER_SOURCES_MAX) break;
  }
  return out;
}
