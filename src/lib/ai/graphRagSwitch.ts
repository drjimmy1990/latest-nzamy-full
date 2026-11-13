/**
 * The GraphRAG on/off switch for the live AI search, and the query embedder
 * with a hard deadline.
 *
 * `NZAMY_GRAPH_RAG=on` in the server env turns the graph path on for AI runs
 * (`/api/v1/ai/runs`) and for `/api/v1/ai/graph-retrieve`. Anything else —
 * unset, `off`, a typo — keeps every AI search on the keyword path, exactly as
 * before GraphRAG. Read at request time, so flipping it needs only a restart
 * of the app, never a rebuild.
 */
import { embedQueryText } from "./embeddingClient.ts";

export function graphRagEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NZAMY_GRAPH_RAG ?? "").trim().toLowerCase() === "on";
}

/** The query embedding's whole budget, retries included: the AI run waits on it. */
export const QUERY_EMBED_DEADLINE_MS = 2500;

export interface QueryEmbedding {
  modelId: string;
  literal: string;
}

/**
 * The question's embedding, or null on no key, any error, or past the
 * deadline. No retries: a 429 (free-tier quota) answers null at once and the
 * run goes on with the keyword search.
 */
export async function embedQueryWithin(
  text: string,
  deadlineMs: number = QUERY_EMBED_DEADLINE_MS,
  embed: typeof embedQueryText = embedQueryText,
): Promise<QueryEmbedding | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deadlineMs);
  });
  try {
    const work = embed(text, { timeoutMs: deadlineMs, maxRetries: 0 })
      .then((r) => (r ? { modelId: r.modelId, literal: r.literal } : null))
      .catch(() => null);
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
