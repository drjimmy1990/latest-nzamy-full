/**
 * graphService.ts — Universal Legal GraphRAG Service Entrypoint.
 *
 * Ready for ALL service types across Nzamy:
 *   1. Pre-webhook AI tools (`runCore.ts`)
 *   2. Multi-step / document-driven n8n job workflows (`contract-review`, `wargaming`,
 *      `contracts-pro`, `case-brief`, `brief-check`, `analyze-strength`, etc.) via
 *      `POST /api/v1/ai/graph-retrieve`
 *   3. Any future Next.js Server Action, Corporate/Gov/NGO AI endpoint, or internal service
 *
 * Pure relative `.ts` imports so `node --test` executes it natively.
 */

import type { createServiceClient } from "../supabase/server.ts";
import { embedQueryText, rerankCandidates, resolveEmbeddingModelProfile } from "./embeddingClient.ts";
import { embedQueryWithin, graphRagEnabled, QUERY_EMBED_DEADLINE_MS } from "./graphRagSwitch.ts";
import {
  retrieveLibrary,
  type PackageSource,
  type RetrievalLimits,
  type RetrievalPin,
  type Retrieved,
  type RetrieveGraphOptions,
  type SourceRef,
} from "./retrieval.ts";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface GraphRetrieveRequest {
  question?: string;
  queries?: string[];
  lawSlug?: string | null;
  articleId?: string | null;
  modelId?: string | null;
  limits: RetrievalLimits;
}

export type ParseGraphRetrieveResult =
  | { ok: true; value: GraphRetrieveRequest }
  | { ok: false; error: string };

const SAFE_SLUG_RE = /^[\p{L}\p{N}_.\-]{1,200}$/u;

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

export function parseGraphRetrieveRequest(raw: unknown): ParseGraphRetrieveResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "invalid request body" };
  }
  const rec = raw as Record<string, unknown>;
  const question = typeof rec.question === "string" ? rec.question.trim().slice(0, 6_000) : "";
  const rawQueries = Array.isArray(rec.queries) ? rec.queries : [];
  const queries = rawQueries
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 8);

  if (!question && queries.length === 0) {
    return { ok: false, error: "either question or queries[] is required" };
  }

  const rawLawSlug =
    typeof rec.law_slug === "string"
      ? rec.law_slug.trim()
      : typeof rec.lawSlug === "string"
        ? rec.lawSlug.trim()
        : "";
  const lawSlug = rawLawSlug && SAFE_SLUG_RE.test(rawLawSlug) ? rawLawSlug : null;

  const rawArticleId =
    typeof rec.article_id === "string"
      ? rec.article_id.trim()
      : typeof rec.articleId === "string"
        ? rec.articleId.trim()
        : "";
  const articleId = rawArticleId && SAFE_SLUG_RE.test(rawArticleId) ? rawArticleId : null;

  const rawModelId =
    typeof rec.model_id === "string"
      ? rec.model_id.trim()
      : typeof rec.modelId === "string"
        ? rec.modelId.trim()
        : "";
  const modelId = rawModelId && /^[a-z0-9][a-z0-9._-]{1,63}$/i.test(rawModelId) ? rawModelId : null;

  const lim = rec.limits && typeof rec.limits === "object" ? (rec.limits as Record<string, unknown>) : {};
  const limits: RetrievalLimits = {
    laws: clampInt(lim.laws, 8, 0, 25),
    principles: clampInt(lim.principles, 4, 0, 15),
    decrees: clampInt(lim.decrees, 2, 0, 10),
    feqh: clampInt(lim.feqh, 2, 0, 10),
  };

  return {
    ok: true,
    value: {
      question: question || undefined,
      queries: queries.length > 0 ? queries : question ? [question.slice(0, 300)] : [],
      lawSlug,
      articleId,
      modelId,
      limits,
    },
  };
}

export interface SearchLegalGraphDeps {
  embedQuery?: (text: string, modelId?: string | null) => Promise<string | null>;
  retrieve?: (
    admin: ServiceClient,
    queries: string[],
    limits: RetrievalLimits,
    pin: RetrievalPin,
    budgetMs?: number,
    options?: RetrieveGraphOptions,
  ) => Promise<Retrieved>;
  /** Optional custom reranker returning reordered 0-based indices (used in tests or custom hooks). */
  rerank?: (query: string, sources: readonly PackageSource[]) => Promise<number[] | null>;
  /** The graph path on/off; defaults to the NZAMY_GRAPH_RAG switch. Off = the keyword search only. */
  enabled?: boolean;
}

export async function searchLegalGraphWith(
  admin: ServiceClient,
  req: GraphRetrieveRequest,
  deps: SearchLegalGraphDeps = {},
): Promise<Retrieved> {
  const enabled = deps.enabled ?? graphRagEnabled();
  const embedFn =
    deps.embedQuery ??
    ((text: string, modelId?: string | null) =>
      embedQueryWithin(text, QUERY_EMBED_DEADLINE_MS, (q, o) =>
        embedQueryText(q, modelId ? { ...o, profile: resolveEmbeddingModelProfile(modelId) } : o),
      ).then((r) => r?.literal ?? null));
  const retrieveFn = deps.retrieve ?? retrieveLibrary;

  const semanticSeed = (req.question || req.queries?.join(" ") || "").trim();
  const queryEmbedding = enabled && semanticSeed ? await embedFn(semanticSeed, req.modelId).catch(() => null) : null;

  const retrieved = await retrieveFn(
    admin,
    req.queries ?? [],
    req.limits,
    {
      question: req.question,
      articleId: req.articleId ?? undefined,
      lawSlug: req.lawSlug ?? undefined,
    },
    undefined,
    enabled ? { queryEmbedding, modelId: req.modelId ?? null, useGraph: true } : undefined,
  );

  if (retrieved.sources.length <= 1 || !semanticSeed) {
    return retrieved;
  }

  // Optional Cross-Encoder Reranking (custom hook OR `RERANKER_PROVIDER=jina|cohere`)
  if (deps.rerank) {
    const order = await deps.rerank(semanticSeed, retrieved.sources).catch(() => null);
    if (order && order.length === retrieved.sources.length) {
      return reindexRetrieved(
        order.map((idx) => retrieved.sources[idx]).filter((s): s is PackageSource => Boolean(s)),
        retrieved.map,
      );
    }
    return retrieved;
  }

  const reranked = await rerankCandidates(semanticSeed, retrieved.sources);
  if (!reranked.reranked) return retrieved;
  return reindexRetrieved(reranked.items, retrieved.map);
}

function reindexRetrieved(
  orderedSources: readonly PackageSource[],
  oldMap: Record<string, SourceRef>,
): Retrieved {
  const sources: PackageSource[] = [];
  const map: Record<string, SourceRef> = {};
  let n = 0;
  for (const s of orderedSources) {
    const ref = oldMap[s.sid];
    if (!ref) continue;
    const sid = `S${++n}`;
    sources.push({ ...s, sid });
    map[sid] = ref;
  }
  return { sources, map };
}

export async function searchLegalGraph(
  admin: ServiceClient,
  req: GraphRetrieveRequest,
): Promise<Retrieved> {
  return searchLegalGraphWith(admin, req);
}
