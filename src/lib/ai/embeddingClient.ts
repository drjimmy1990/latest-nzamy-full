/**
 * embeddingClient.ts — Pluggable Multi-Provider Embedding & Cross-Encoder
 * Reranker Adapter for Nzamy Legal GraphRAG.
 *
 * Pure module (no `@/` path aliases) so `node --test` runs it directly.
 *
 * Key Guarantees:
 *   1. Mandatory L2 Re-Normalization (`l2Normalize`): Matryoshka shortened slices
 *      (e.g. `768d` or `1536d` from `models/gemini-embedding-2-preview` or
 *      `text-embedding-3-large`) are NOT unit-length out of the API; normalizing
 *      every document and query vector ensures accurate cosine ranking in pgvector
 *      `halfvec_cosine_ops` and clamps values safely inside IEEE-754 float16 range.
 *   2. Zero Secret Leakage in URLs: Gemini uses `x-goog-api-key` header (never
 *      `?key=` query strings that could leak into proxy or error logs).
 *   3. Multi-Provider Agnosticism: Supports `gemini`, `openai`, `voyage`,
 *      `cohere`, `jina`, `cloudflare`, and `openai-compatible` (`BAAI/bge-m3`,
 *      `Qwen3-Embedding`, Ollama, vLLM).
 */

export type EmbeddingProvider =
  | "gemini"
  | "openai"
  | "voyage"
  | "cohere"
  | "jina"
  | "cloudflare"
  | "openai-compatible";

export interface EmbeddingModelProfile {
  modelId: string;
  provider: EmbeddingProvider;
  apiModel: string;
  dimensions: number;
  taskDocument: string | null;
  taskQuery: string | null;
}

export const DEFAULT_EMBEDDING_MODEL_ID = "gemini-embedding-2-768";

export const BUILTIN_EMBEDDING_MODELS: Readonly<Record<string, EmbeddingModelProfile>> = {
  "gemini-embedding-2-768": {
    modelId: "gemini-embedding-2-768",
    provider: "gemini",
    apiModel: "models/gemini-embedding-2-preview",
    dimensions: 768,
    taskDocument: "RETRIEVAL_DOCUMENT",
    taskQuery: "RETRIEVAL_QUERY",
  },
  "gemini-embedding-2-1536": {
    modelId: "gemini-embedding-2-1536",
    provider: "gemini",
    apiModel: "models/gemini-embedding-2-preview",
    dimensions: 1536,
    taskDocument: "RETRIEVAL_DOCUMENT",
    taskQuery: "RETRIEVAL_QUERY",
  },
  "gemini-embedding-2-3072": {
    modelId: "gemini-embedding-2-3072",
    provider: "gemini",
    apiModel: "models/gemini-embedding-2-preview",
    dimensions: 3072,
    taskDocument: "RETRIEVAL_DOCUMENT",
    taskQuery: "RETRIEVAL_QUERY",
  },
  "openai-3-large-1536": {
    modelId: "openai-3-large-1536",
    provider: "openai",
    apiModel: "text-embedding-3-large",
    dimensions: 1536,
    taskDocument: null,
    taskQuery: null,
  },
  "openai-3-large-3072": {
    modelId: "openai-3-large-3072",
    provider: "openai",
    apiModel: "text-embedding-3-large",
    dimensions: 3072,
    taskDocument: null,
    taskQuery: null,
  },
  "voyage-3-large-1024": {
    modelId: "voyage-3-large-1024",
    provider: "voyage",
    apiModel: "voyage-3-large",
    dimensions: 1024,
    taskDocument: "document",
    taskQuery: "query",
  },
  "cohere-embed-v4-1024": {
    modelId: "cohere-embed-v4-1024",
    provider: "cohere",
    apiModel: "embed-v4.0",
    dimensions: 1024,
    taskDocument: "search_document",
    taskQuery: "search_query",
  },
  "jina-embeddings-v3-1024": {
    modelId: "jina-embeddings-v3-1024",
    provider: "jina",
    apiModel: "jina-embeddings-v3",
    dimensions: 1024,
    taskDocument: "retrieval.passage",
    taskQuery: "retrieval.query",
  },
  "bge-m3-1024": {
    modelId: "bge-m3-1024",
    provider: "openai-compatible",
    apiModel: "BAAI/bge-m3",
    dimensions: 1024,
    taskDocument: null,
    taskQuery: null,
  },
};

const FLOAT16_MAX = 65504;
/** Truncate overly long input documents safely within provider 8k token ceilings (~22,000 Arabic chars). */
const MAX_EMBED_INPUT_CHARS = 22_000;

export function resolveEmbeddingModelProfile(
  modelId?: string | null,
  env: Record<string, string | undefined> = process.env,
): EmbeddingModelProfile {
  const requested = (modelId || env.GRAPH_RAG_EMBEDDING_MODEL_ID || DEFAULT_EMBEDDING_MODEL_ID).trim();
  const known = BUILTIN_EMBEDDING_MODELS[requested];
  if (known) return known;
  return BUILTIN_EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL_ID];
}

export function profileFromDbRow(row: {
  model_id: string;
  provider: string;
  api_model: string;
  dimensions: number;
  task_document?: string | null;
  task_query?: string | null;
}): EmbeddingModelProfile {
  return {
    modelId: row.model_id,
    provider: row.provider as EmbeddingProvider,
    apiModel: row.api_model,
    dimensions: Number(row.dimensions),
    taskDocument: row.task_document ?? null,
    taskQuery: row.task_query ?? null,
  };
}

function clampFloat16(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > FLOAT16_MAX) return FLOAT16_MAX;
  if (v < -FLOAT16_MAX) return -FLOAT16_MAX;
  return v;
}

/** L2-normalizes a vector to unit length and clamps within IEEE-754 float16 bounds. */
export function l2Normalize(values: readonly number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Number.isFinite(values[i]) ? values[i] : 0;
    sumSq += v * v;
  }
  if (sumSq <= 1e-24) {
    return values.map(() => 0);
  }
  const inv = 1 / Math.sqrt(sumSq);
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = Number.isFinite(values[i]) ? values[i] * inv : 0;
    // Round to 7 decimal places (exceeds halfvec's ~3.3 decimal digits of precision while keeping payloads compact)
    const rounded = Math.round(clampFloat16(v) * 1e7) / 1e7;
    out[i] = Object.is(rounded, -0) ? 0 : rounded;
  }
  return out;
}

/** Formats a numeric vector as a pgvector / halfvec literal (`'[0.123,-0.456,...]'`). */
export function formatHalfvecLiteral(values: readonly number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? String(v) : "0")).join(",")}]`;
}

function resolveProviderCredentials(
  profile: EmbeddingModelProfile,
  env: Record<string, string | undefined>,
): { apiKey: string; baseUrl?: string; accountId?: string } | null {
  switch (profile.provider) {
    case "gemini": {
      const apiKey = (env.GEMINI_EMBEDDING_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "").trim();
      return apiKey ? { apiKey } : null;
    }
    case "openai": {
      const apiKey = (env.OPENAI_EMBEDDING_API_KEY || env.OPENAI_API_KEY || "").trim();
      const baseUrl = (env.OPENAI_EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      return apiKey ? { apiKey, baseUrl } : null;
    }
    case "voyage": {
      const apiKey = (env.VOYAGE_API_KEY || "").trim();
      return apiKey ? { apiKey } : null;
    }
    case "cohere": {
      const apiKey = (env.COHERE_API_KEY || "").trim();
      return apiKey ? { apiKey } : null;
    }
    case "jina": {
      const apiKey = (env.JINA_API_KEY || "").trim();
      return apiKey ? { apiKey } : null;
    }
    case "cloudflare": {
      const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
      const apiKey = (env.CLOUDFLARE_API_TOKEN || "").trim();
      return accountId && apiKey ? { apiKey, accountId } : null;
    }
    case "openai-compatible": {
      // Also allow Cloudflare Workers AI seamlessly if CLOUDFLARE_ACCOUNT_ID is set and EMBEDDING_BASE_URL is omitted
      const baseUrl = (env.EMBEDDING_BASE_URL || "").trim().replace(/\/+$/, "");
      const apiKey = (env.EMBEDDING_API_KEY || "local").trim();
      if (baseUrl) return { apiKey, baseUrl };
      if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
        return {
          apiKey: env.CLOUDFLARE_API_TOKEN.trim(),
          baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID.trim()}/ai/v1`,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export function hasEmbeddingCredentials(
  profile: EmbeddingModelProfile = resolveEmbeddingModelProfile(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveProviderCredentials(profile, env) !== null;
}

function maxBatchSizeFor(provider: EmbeddingProvider): number {
  switch (provider) {
    case "gemini":
      return 100;
    case "cohere":
      return 96;
    case "cloudflare":
      return 64;
    default:
      return 128;
  }
}

function clipInputText(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return " ";
  return s.length > MAX_EMBED_INPUT_CHARS ? s.slice(0, MAX_EMBED_INPUT_CHARS) : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EmbedOptions {
  profile?: EmbeddingModelProfile;
  mode?: "document" | "query";
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { fetchImpl: typeof fetch; timeoutMs: number; maxRetries: number; retryBaseMs: number },
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await opts.fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < opts.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 15_000)
          : opts.retryBaseMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      const errBody = await res.text().catch(() => "");
      throw new Error(`Embedding HTTP ${res.status}: ${errBody.slice(0, 280)}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < opts.maxRetries && !(err instanceof Error && err.message.startsWith("Embedding HTTP 4"))) {
        await sleep(opts.retryBaseMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Embedding request failed");
}

async function embedChunk(
  chunk: string[],
  profile: EmbeddingModelProfile,
  mode: "document" | "query",
  creds: { apiKey: string; baseUrl?: string; accountId?: string },
  net: { fetchImpl: typeof fetch; timeoutMs: number; maxRetries: number; retryBaseMs: number },
): Promise<number[][]> {
  const task = mode === "query" ? profile.taskQuery : profile.taskDocument;

  if (profile.provider === "gemini") {
    const modelPath = profile.apiModel.startsWith("models/") ? profile.apiModel : `models/${profile.apiModel}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:batchEmbedContents`;
    const requests = chunk.map((text) => ({
      model: modelPath,
      content: { parts: [{ text }] },
      ...(task ? { taskType: task } : {}),
      outputDimensionality: profile.dimensions,
    }));
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": creds.apiKey,
        },
        body: JSON.stringify({ requests }),
      },
      net,
    );
    const json = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
    const list = json.embeddings ?? [];
    if (list.length !== chunk.length) {
      throw new Error(`Gemini returned ${list.length} embeddings for ${chunk.length} inputs`);
    }
    return list.map((item) => item.values ?? []);
  }

  if (profile.provider === "openai" || profile.provider === "openai-compatible") {
    const url = `${creds.baseUrl}/embeddings`;
    const payload: Record<string, unknown> = {
      model: profile.apiModel,
      input: chunk,
    };
    if (profile.provider === "openai" && profile.apiModel.startsWith("text-embedding-3")) {
      payload.dimensions = profile.dimensions;
    }
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      net,
    );
    const json = (await res.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
    const sorted = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (sorted.length !== chunk.length) {
      throw new Error(`${profile.provider} returned ${sorted.length} embeddings for ${chunk.length} inputs`);
    }
    return sorted.map((d) => d.embedding ?? []);
  }

  if (profile.provider === "voyage") {
    const res = await fetchWithRetry(
      "https://api.voyageai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: profile.apiModel,
          input: chunk,
          ...(task ? { input_type: task } : {}),
          output_dimension: profile.dimensions,
        }),
      },
      net,
    );
    const json = (await res.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
    const sorted = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((d) => d.embedding ?? []);
  }

  if (profile.provider === "cohere") {
    const res = await fetchWithRetry(
      "https://api.cohere.com/v2/embed",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: profile.apiModel,
          texts: chunk,
          input_type: task || (mode === "query" ? "search_query" : "search_document"),
          embedding_types: ["float"],
          output_dimension: profile.dimensions,
        }),
      },
      net,
    );
    const json = (await res.json()) as { embeddings?: { float?: number[][] } };
    return json.embeddings?.float ?? [];
  }

  if (profile.provider === "jina") {
    const res = await fetchWithRetry(
      "https://api.jina.ai/v1/embeddings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: profile.apiModel,
          input: chunk,
          ...(task ? { task } : {}),
          dimensions: profile.dimensions,
          normalized: true,
        }),
      },
      net,
    );
    const json = (await res.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
    const sorted = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((d) => d.embedding ?? []);
  }

  if (profile.provider === "cloudflare") {
    const res = await fetchWithRetry(
      `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/${profile.apiModel}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({ text: chunk }),
      },
      net,
    );
    const json = (await res.json()) as { result?: { data?: number[][] } };
    return json.result?.data ?? [];
  }

  throw new Error(`Unsupported embedding provider: ${profile.provider}`);
}

/**
 * Embeds a list of texts using the configured provider, automatically batching
 * requests and L2-normalizing every output vector to unit length.
 */
export async function embedTexts(texts: readonly string[], options: EmbedOptions = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const env = options.env ?? process.env;
  const profile = options.profile ?? resolveEmbeddingModelProfile(undefined, env);
  const creds = resolveProviderCredentials(profile, env);
  if (!creds) {
    throw new Error(`Missing API credentials for embedding model ${profile.modelId} (${profile.provider})`);
  }

  const mode = options.mode ?? "document";
  const net = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? 20_000,
    maxRetries: options.maxRetries ?? 3,
    retryBaseMs: options.retryBaseMs ?? 500,
  };

  const batchSize = maxBatchSizeFor(profile.provider);
  const cleaned = texts.map(clipInputText);
  const results: number[][] = [];

  for (let offset = 0; offset < cleaned.length; offset += batchSize) {
    const slice = cleaned.slice(offset, offset + batchSize);
    const rawVectors = await embedChunk(slice, profile, mode, creds, net);
    for (const raw of rawVectors) {
      if (raw.length !== profile.dimensions) {
        throw new Error(
          `Dimension mismatch for ${profile.modelId}: expected ${profile.dimensions}, received ${raw.length}`,
        );
      }
      results.push(l2Normalize(raw));
    }
  }

  return results;
}

/**
 * Embeds a single user search query with fast runtime timeout (default 2,500ms)
 * and returns `{ modelId, dimensions, vector, literal }` or `null` when
 * credentials are absent.
 */
export async function embedQueryText(
  query: string,
  options: Omit<EmbedOptions, "mode"> = {},
): Promise<{ modelId: string; dimensions: number; vector: number[]; literal: string } | null> {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return null;
  const env = options.env ?? process.env;
  const profile = options.profile ?? resolveEmbeddingModelProfile(undefined, env);
  if (!hasEmbeddingCredentials(profile, env)) return null;

  const [vector] = await embedTexts([trimmed], {
    ...options,
    profile,
    env,
    mode: "query",
    timeoutMs: options.timeoutMs ?? 2_800,
    maxRetries: options.maxRetries ?? 1,
    retryBaseMs: options.retryBaseMs ?? 200,
  });

  if (!vector) return null;
  return {
    modelId: profile.modelId,
    dimensions: profile.dimensions,
    vector,
    literal: formatHalfvecLiteral(vector),
  };
}

/**
 * Optional Cross-Encoder Reranker (`jina-reranker-v2-base-multilingual` or
 * `cohere` `rerank-v3.5`). Activated ONLY when `RERANKER_PROVIDER` (`jina` or
 * `cohere`) and its API key are present in `env`; safely falls back to original
 * RRF + Graph order on any error or timeout.
 */
export async function rerankCandidates<T extends { text: string; title?: string }>(
  query: string,
  items: readonly T[],
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<{ items: T[]; reranked: boolean }> {
  const env = options.env ?? process.env;
  const provider = (env.RERANKER_PROVIDER || "").trim().toLowerCase();
  if (!provider || items.length <= 1 || !query.trim()) {
    return { items: [...items], reranked: false };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 1_800;
  const docs = items.map((it) => `${it.title ? `${it.title}\n` : ""}${it.text}`.slice(0, 2_400));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider === "jina" && env.JINA_API_KEY) {
      const res = await fetchImpl("https://api.jina.ai/v1/rerank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.JINA_API_KEY.trim()}`,
        },
        body: JSON.stringify({
          model: env.RERANKER_MODEL || "jina-reranker-v2-base-multilingual",
          query: query.slice(0, 1_200),
          documents: docs,
          top_n: items.length,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return { items: [...items], reranked: false };
      const json = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> };
      if (!json.results?.length) return { items: [...items], reranked: false };
      const ordered = [...json.results]
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .map((r) => items[r.index])
        .filter((x): x is T => Boolean(x));
      return ordered.length === items.length
        ? { items: ordered, reranked: true }
        : { items: [...items], reranked: false };
    }

    if (provider === "cohere" && env.COHERE_API_KEY) {
      const res = await fetchImpl("https://api.cohere.com/v2/rerank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.COHERE_API_KEY.trim()}`,
        },
        body: JSON.stringify({
          model: env.RERANKER_MODEL || "rerank-v3.5",
          query: query.slice(0, 1_200),
          documents: docs,
          top_n: items.length,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return { items: [...items], reranked: false };
      const json = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> };
      if (!json.results?.length) return { items: [...items], reranked: false };
      const ordered = [...json.results]
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .map((r) => items[r.index])
        .filter((x): x is T => Boolean(x));
      return ordered.length === items.length
        ? { items: ordered, reranked: true }
        : { items: [...items], reranked: false };
    }

    clearTimeout(timer);
    return { items: [...items], reranked: false };
  } catch {
    clearTimeout(timer);
    return { items: [...items], reranked: false };
  }
}
