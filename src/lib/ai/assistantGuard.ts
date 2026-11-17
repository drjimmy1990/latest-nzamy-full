/**
 * assistantGuard.ts — owner ١٣ / ٢٢ (MANDATORY before launch): what runCore
 * does with the anti-extraction detector (extractionGuard.ts) for a tool that
 * carries `promptGuard` in tools.ts (the library assistant first). Everything
 * here happens right after the input check: before the drafting guard, the
 * charge, the library search and the n8n call.
 *
 *   1. a user under a temporary block is refused (429 `assistant_blocked`);
 *   2. a flagged message is refused with the fixed sentence (422
 *      `extraction_refused`), logged as a structured warning (user id, rule id,
 *      a short SHA-256 of the text — NEVER the text), and counted; the
 *      ATTEMPTS_TO_BLOCK-th flagged message inside ATTEMPT_WINDOW_MS blocks the
 *      user from every guarded tool for BLOCK_MS;
 *   3. after the drafting guard, a per-user, per-tool minute limit
 *      (`checkMinuteLimit`, 429 `assistant_rate_limited`).
 * The day's limit is the tool's own `dailyLimit` (ai_start_run, in the
 * database), not repeated here. Admins are never blocked or rate limited, but
 * their messages are still checked (they test the guard).
 *
 * STORAGE, STATED PLAINLY: like src/lib/rateLimit.ts, the counters live in
 * ONE process's memory (one pm2 instance today). They reset on a restart or a
 * deploy, and with N instances the real ceilings are N times higher. This is
 * abuse friction, not a security boundary — the detector, the refusal and the
 * output filter do not depend on it. The upgrade path is a shared store behind
 * the same `PromptGuardState` interface.
 *
 * Pure apart from console.warn: relative imports only, so `node --test` runs it.
 */
import { RateLimiter, type Clock } from "../rateLimit.ts";
import { EXTRACTION_REFUSAL_TEXT, EXTRACTION_REFUSED_CODE, detectExtraction } from "./extractionGuard.ts";

/** Flagged messages that start a block, inside the window below. */
export const ATTEMPTS_TO_BLOCK = 5;
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
/** How long a blocked user waits. */
export const BLOCK_MS = 30 * 60 * 1000;
/** Questions a minute per user and tool (a chat waits for each answer; 10 is above any reader). */
export const PER_MINUTE = 10;

export const BLOCKED_CODE = "assistant_blocked";
export const RATE_LIMITED_CODE = "assistant_rate_limited";
export const BLOCKED_TEXT = "أُوقف المساعد مؤقتاً لحسابك بعد محاولات متكررة لطلب تعليماته الداخلية. حاول مرة أخرى لاحقاً.";
export const RATE_LIMITED_TEXT = "أرسلت أسئلة كثيرة في وقت قصير — انتظر دقيقة ثم أعد المحاولة.";

/** The state runCore asks; the route passes `assistantGuardState`, tests their own. */
export interface PromptGuardState {
  /** Seconds left on this user's block, or 0. */
  blockedSeconds(userId: string): number;
  /** Count one flagged message; returns the attempts in the window and the block it started (seconds, or 0). */
  recordFlagged(userId: string): { attempts: number; blockedSeconds: number };
  /** One more question for this tool by this user; false past PER_MINUTE. */
  allowQuestion(toolId: string, userId: string): { allowed: boolean; retryAfterSeconds: number };
}

const MAX_TRACKED = 20_000;

/** Drops the oldest entries (insertion order) once the map is over its cap. */
function cap<K, V>(map: Map<K, V>): void {
  if (map.size <= MAX_TRACKED) return;
  const over = map.size - MAX_TRACKED;
  let i = 0;
  for (const key of map.keys()) {
    if (i++ >= over) break;
    map.delete(key);
  }
}

export class InMemoryPromptGuardState implements PromptGuardState {
  private readonly clock: Clock;
  private readonly attempts = new Map<string, number[]>();
  private readonly blockedUntil = new Map<string, number>();
  private readonly limiter: RateLimiter;

  constructor(options: { clock?: Clock } = {}) {
    this.clock = options.clock ?? Date.now;
    this.limiter = new RateLimiter({ clock: this.clock });
  }

  blockedSeconds(userId: string): number {
    const until = this.blockedUntil.get(userId);
    if (until === undefined) return 0;
    const left = until - this.clock();
    if (left <= 0) {
      this.blockedUntil.delete(userId);
      return 0;
    }
    return Math.ceil(left / 1000);
  }

  recordFlagged(userId: string): { attempts: number; blockedSeconds: number } {
    const now = this.clock();
    const recent = (this.attempts.get(userId) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
    recent.push(now);
    this.attempts.delete(userId); // re-insert: the map's order is the age order the cap uses
    this.attempts.set(userId, recent);
    cap(this.attempts);
    if (recent.length >= ATTEMPTS_TO_BLOCK) {
      this.blockedUntil.delete(userId);
      this.blockedUntil.set(userId, now + BLOCK_MS);
      cap(this.blockedUntil);
      this.attempts.delete(userId);
      return { attempts: recent.length, blockedSeconds: Math.ceil(BLOCK_MS / 1000) };
    }
    return { attempts: recent.length, blockedSeconds: 0 };
  }

  allowQuestion(toolId: string, userId: string): { allowed: boolean; retryAfterSeconds: number } {
    const d = this.limiter.check(`ai-guard:${toolId}`, userId, { windowMs: 60 * 1000, max: PER_MINUTE });
    return { allowed: d.allowed, retryAfterSeconds: d.retryAfterSeconds };
  }
}

/** The one state the app's process uses (POST /api/v1/ai/runs passes it to runCore). */
export const assistantGuardState: PromptGuardState = new InMemoryPromptGuardState();

/** The first 16 hex characters of the text's SHA-256: lets two logs be matched, never read. */
export async function textFingerprint(text: string): Promise<string> {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text ?? "")));
    return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unhashed";
  }
}

export interface GuardReply {
  status: number;
  body: Record<string, unknown>;
}

/** The body of the refusal for a flagged message (or an answer the output filter blocked). */
export function extractionRefusal(): { error: string; code: typeof EXTRACTION_REFUSED_CODE } {
  return { error: EXTRACTION_REFUSAL_TEXT, code: EXTRACTION_REFUSED_CODE };
}

/** Logs one flagged event; the text never leaves this function. */
export async function logFlagged(
  event: "input" | "output",
  info: { toolId: string; userId: string; rule: string; text: string; runId?: string },
  state: PromptGuardState | undefined,
  isAdmin: boolean,
): Promise<void> {
  const counted = state && !isAdmin ? state.recordFlagged(info.userId) : null;
  console.warn(
    "[ai-guard] extraction attempt",
    JSON.stringify({
      event,
      tool: info.toolId,
      user: info.userId,
      rule: info.rule,
      text_sha256_16: await textFingerprint(info.text),
      ...(info.runId ? { run: info.runId } : {}),
      ...(counted ? { attempts_in_window: counted.attempts, blocked_seconds: counted.blockedSeconds } : {}),
    }),
  );
}

/**
 * Steps 1 and 2 of the header for one message. A reply refuses the run
 * (nothing charged, nothing sent); null lets it go on.
 */
export async function guardMessage(
  toolId: string,
  userId: string,
  isAdmin: boolean,
  message: string,
  state: PromptGuardState | undefined,
): Promise<GuardReply | null> {
  if (state && !isAdmin) {
    const left = state.blockedSeconds(userId);
    if (left > 0) return { status: 429, body: { error: BLOCKED_TEXT, code: BLOCKED_CODE, retryAfterSeconds: left } };
  }
  const verdict = detectExtraction(message);
  if (!verdict.flagged) return null;
  await logFlagged("input", { toolId, userId, rule: verdict.rule ?? "unknown", text: message }, state, isAdmin);
  return { status: 422, body: extractionRefusal() };
}

/** Step 3: the per-user minute limit, after the drafting guard and before the charge. */
export function checkMinuteLimit(toolId: string, userId: string, isAdmin: boolean, state: PromptGuardState | undefined): GuardReply | null {
  if (!state || isAdmin) return null;
  const d = state.allowQuestion(toolId, userId);
  if (d.allowed) return null;
  return { status: 429, body: { error: RATE_LIMITED_TEXT, code: RATE_LIMITED_CODE, retryAfterSeconds: d.retryAfterSeconds } };
}
