/**
 * _explain-session.ts — l16 review: «اشرح لي» keeps its last answer per
 * article for the browser session.
 *
 *   * Re-opening the window on the same article shows the conversation it had
 *     — no new request, no new charge.
 *   * Closing the window while a question is in flight does not lose the
 *     (paid) answer: the request keeps running, writes its answer here, and
 *     the next opening shows it (or waits for it — `pending`).
 *
 * The store is a module-level Map (one page lifetime of the SPA), mirrored to
 * sessionStorage so a reload within the tab keeps it too. Storage can be
 * missing or throw (private mode, blocked site data): every access is in a
 * try/catch and the Map alone still works. Keyed by the signed-in user AND
 * the article, so another account on the same browser never sees it.
 *
 * Pure (no React, no `@/` imports): `node --test` loads it.
 */

export interface ExplainSession<M> {
  msgs: M[];
  conversationId: string | null;
  /** The question in flight, if any — resolves once its answer is in `msgs`. */
  pending: Promise<void> | null;
  /**
   * The refusal the last question got (no points, tool off, an error): never
   * kept in `msgs` or in storage, so the next opening asks again — shown only
   * to a window re-opened while that question was in flight.
   */
  refusal?: M | null;
}

const STORAGE_PREFIX = "nzamy:explain:";
const sessions = new Map<string, ExplainSession<unknown>>();

/** The store key: user + article; null for a guest (nothing is kept). */
export function explainSessionKey(userId: string | null | undefined, articleId: string | null | undefined): string | null {
  if (typeof userId !== "string" || userId === "") return null;
  if (typeof articleId !== "string" || articleId === "") return null;
  return `${userId}:${articleId}`;
}

function storage(): Storage | null {
  try {
    const s = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function loadStored<M>(key: string): ExplainSession<M> | null {
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { msgs?: unknown; conversationId?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.msgs)) return null;
    return {
      msgs: parsed.msgs as M[],
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
      pending: null,
    };
  } catch {
    return null;
  }
}

/** The session of `key` (created empty, or read back from sessionStorage). */
export function explainSession<M>(key: string): ExplainSession<M> {
  let s = sessions.get(key) as ExplainSession<M> | undefined;
  if (!s) {
    s = loadStored<M>(key) ?? { msgs: [], conversationId: null, pending: null };
    sessions.set(key, s as ExplainSession<unknown>);
  }
  return s;
}

/** Writes the messages and the conversation id through to sessionStorage (best effort). */
export function saveExplainSession<M>(key: string, session: ExplainSession<M>): void {
  sessions.set(key, session as ExplainSession<unknown>);
  try {
    storage()?.setItem(STORAGE_PREFIX + key, JSON.stringify({ msgs: session.msgs, conversationId: session.conversationId }));
  } catch {
    /* storage full or blocked: the in-memory copy still serves this page */
  }
}

/** For tests: forget every session held in memory. */
export function resetExplainSessionsForTest(): void {
  sessions.clear();
}
