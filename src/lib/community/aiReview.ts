/**
 * aiReview.ts — the pure half of Q131a (owner answers of 20 Nov 2026, F01#131,
 * RAW[13]): «الأسئلة تُراجَع قبل النشر بوكيل ذكاء اصطناعي لا بشري»; the
 * administration keeps reports and deletion. The auto-REPLY agent is NOT built
 * (after the campaign, his date) — this is a pre-publish filter only: the model
 * answers with a verdict, never with an answer to the question.
 *
 * Flow (src/lib/community/aiReviewServer.ts): a member's new question, answer
 * or edit is stored `pending_review` by the database trigger (20261127_60).
 * After the response, while platform_settings.community_ai_review is on and
 * the n8n AI base + key are set, the ALREADY-MASKED text (piiMask.ts) goes to
 * the n8n workflow «community-review»:
 *
 *   POST {N8N_AI_BASE_URL}/nzamy-ai/community-review   (X-Nzamy-Key)
 *     body  { tool: "community-review", input: { kind, title, body } }
 *     reply 200 { decision: "approve" | "reject" | "hold", category }
 *
 * approve → published; reject → `rejected` with a fixed Arabic reason for the
 * category (never model-written text); hold, a malformed reply, a timeout or
 * any error → the row STAYS pending for the human queue (fail closed). No
 * author id, name or account data is sent.
 *
 * No imports — `node --test` loads this file directly.
 */

export const COMMUNITY_AI_SETTING_KEY = "community_ai_review";
export const COMMUNITY_REVIEW_PATH = "nzamy-ai/community-review";
export const COMMUNITY_REVIEW_TIMEOUT_MS = 12000;

/** The categories the model may name with a rejection, each with the reason the author reads. */
export const REJECT_REASON_AR = {
  spam: "محتوى دعائي أو مكرر لا يتضمن سؤالاً قانونياً.",
  advertising: "إعلان عن خدمة أو جهة، والمجتمع للأسئلة والإجابات القانونية.",
  offensive: "عبارات مسيئة أو تحريض أو تشهير بأشخاص أو جهات.",
  off_topic: "ليس سؤالاً أو إجابة قانونية.",
  unlawful: "يطلب المساعدة على مخالفة نظامية أو التحايل على الأنظمة.",
  personal_data: "يتضمن بيانات شخصية لأطراف يمكن التعرف عليهم.",
} as const;
export type RejectCategory = keyof typeof REJECT_REASON_AR;

export function isRejectCategory(v: unknown): v is RejectCategory {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REJECT_REASON_AR, v);
}

/** platform_settings.community_ai_review → on/off. Only an explicit `{enabled: true}` (or `true`) is ON. */
export function communityAiReviewOn(value: unknown): boolean {
  if (value === true) return true;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as { enabled?: unknown }).enabled === true;
  }
  return false;
}

export interface AiReviewEnv {
  N8N_AI_BASE_URL?: string;
  NZAMY_AI_KEY?: string;
}

/** The app can reach the AI workflows at all (the same two variables every AI tool uses). */
export function communityAiConfigured(env: AiReviewEnv): boolean {
  return Boolean(env.N8N_AI_BASE_URL?.trim()) && Boolean(env.NZAMY_AI_KEY?.trim());
}

const MAX_TITLE = 300;
const MAX_BODY = 6000;

/** What the model sees: the masked text only, trimmed. Null when there is nothing to review. */
export function communityReviewInput(kind: "post" | "answer", text: { title?: unknown; body?: unknown }) {
  const title = typeof text.title === "string" ? text.title.trim().slice(0, MAX_TITLE) : "";
  const body = typeof text.body === "string" ? text.body.trim().slice(0, MAX_BODY) : "";
  if (!title && !body) return null;
  return { kind, title, body };
}

export type AiVerdict =
  | { decision: "approve"; category: null }
  | { decision: "reject"; category: RejectCategory }
  | { decision: "hold"; category: string | null };

/**
 * The workflow's reply → a verdict. Accepts `{ decision, category }` at the
 * top level or under `result`. A rejection must name a known category;
 * anything else (unknown decision, missing category, other shapes) is HOLD.
 */
export function readAiVerdict(reply: unknown): AiVerdict {
  const r0 = reply && typeof reply === "object" && !Array.isArray(reply) ? (reply as Record<string, unknown>) : {};
  const r =
    r0.result && typeof r0.result === "object" && !Array.isArray(r0.result) ? (r0.result as Record<string, unknown>) : r0;
  const decision = typeof r.decision === "string" ? r.decision.trim().toLowerCase() : "";
  const category = typeof r.category === "string" ? r.category.trim().toLowerCase() : null;
  if (decision === "approve") return { decision: "approve", category: null };
  if (decision === "reject" && isRejectCategory(category)) return { decision: "reject", category };
  return { decision: "hold", category: category && category.length <= 40 ? category : null };
}

/** The review_note the author reads on a rejected row (fixed text, never the model's words). */
export function aiRejectNoteAr(category: RejectCategory): string {
  return `${REJECT_REASON_AR[category]} (مراجعة آلية قبل النشر)`;
}
