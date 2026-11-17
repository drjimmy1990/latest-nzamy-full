/**
 * libraryHistory — the library assistant's conversations, kept in the cloud
 * (owner L3: readable from a second device). No new table: every question is
 * already a row of public.ai_runs (input.message / input.law_slug, output.reply,
 * citations, conversation_id, created_at). ai_runs.input is column-locked from
 * the session roles on purpose (20261027_10), so the list is read by the
 * server with the service role, ALWAYS filtered on the caller's own user_id
 * (GET /api/v1/ai/library-history). ai_runs_retention clears input / output
 * after 90 days, so a conversation older than that is no longer listed.
 */

import { citedStatus } from "./citationStatus.ts";

export const LIBRARY_HISTORY_TOOL = "library-assistant";
/** Conversations listed per law. */
export const LIBRARY_HISTORY_CONVERSATIONS = 10;
/** Rows read per request (newest first): enough for ten conversations of a few turns. */
export const LIBRARY_HISTORY_ROWS = 150;
/** The same shape the assistant's input accepts (tools.ts LAW_SLUG). */
export const LIBRARY_HISTORY_SLUG = /^[\p{L}\p{N}_.\-]{1,200}$/u;

export interface LibraryHistoryTurn {
  question: string;
  answer: string;
  citations: unknown[];
  createdAt: string;
}

export interface LibraryConversation {
  /** null for a question asked before conversations existed (one turn each). */
  conversationId: string | null;
  turns: LibraryHistoryTurn[];
  /** The newest turn's time. */
  updatedAt: string;
}

/** The columns the list reads; never source_ids / usage / model. */
export const LIBRARY_HISTORY_COLUMNS = "id, conversation_id, input, output, citations, created_at";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One link of a citation: only sid / kind / id / title / url, and a pill status, leave (CitedAnswer.asCitations reads them). */
function cleanCitations(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => isObj(c) && typeof c.sid === "string" && typeof c.url === "string" && typeof c.title === "string")
    .slice(0, 50)
    .map((c) => {
      const o = c as Record<string, unknown>;
      const status = citedStatus(o.status);
      return { sid: o.sid, kind: str(o.kind), id: str(o.id), title: o.title, url: o.url, ...(status ? { status } : {}) };
    });
}

/**
 * Rows (newest first, as read) → conversations, newest first, each with its
 * turns oldest first. A row with no question or no answer is skipped.
 */
export function groupLibraryConversations(
  rows: ReadonlyArray<Record<string, unknown>>,
  limit: number = LIBRARY_HISTORY_CONVERSATIONS,
): LibraryConversation[] {
  const out: LibraryConversation[] = [];
  const byId = new Map<string, LibraryConversation>();
  for (const row of rows) {
    const question = isObj(row.input) ? str(row.input.message) : "";
    const answer = isObj(row.output) ? str(row.output.reply) : "";
    if (!question.trim() || !answer.trim()) continue;
    const createdAt = str(row.created_at);
    const turn: LibraryHistoryTurn = { question, answer, citations: cleanCitations(row.citations), createdAt };
    const cid = str(row.conversation_id) || null;
    const existing = cid ? byId.get(cid) : undefined;
    if (existing) {
      existing.turns.unshift(turn);
      continue;
    }
    if (out.length >= limit) continue;
    const conv: LibraryConversation = { conversationId: cid, turns: [turn], updatedAt: createdAt };
    out.push(conv);
    if (cid) byId.set(cid, conv);
  }
  return out;
}
