import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  AddResearchItemRequest, AddResearchItemResponse, ApiErrorBody, ArticleResponse, DossierRequest, DossierResponse, CheckCitationsRequest, CheckCitationsResponse, NeighborsRequest,
  NeighborsResponse, QuoteRunResponse, RunResponse, SearchLibraryRequest, SearchLibraryResponse, StandingResponse,
  StartRunRequest, StartRunResponse,
} from "./schemas.js";
import { NezamyApiError, codeFromHttp } from "./errors.js";

export interface NezamyClientOptions {
  /** e.g. https://nezamy.sa  (the client appends /api/v1/ext). */
  baseUrl: string;
  /** Personal access token (nzy_pat_…) or an OAuth access token. Sent only as a Bearer header. */
  token: string;
  fetch?: typeof fetch;
  /** Per-request timeout. Default 30 s. */
  timeoutMs?: number;
  /** Retries for idempotent calls on 429/502/503/504/network. Default 2. */
  maxRetries?: number;
  /** Only for tests against a local mock. */
  allowInsecureHttp?: boolean;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  /** Called for every request after it finishes; receives no body and no token. */
  onRequest?: (info: { method: string; path: string; status: number; ms: number; requestId?: string }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RETRY_AFTER_CAP_S = 20;

export class NezamyClient {
  private readonly base: string;
  private readonly token: string;
  /** Short hash of the token: safe to log or use as a map key. The token itself is never exposed. */
  readonly tokenId: string;
  private readonly f: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ua: string;
  private readonly onRequest: NezamyClientOptions["onRequest"];

  constructor(opts: NezamyClientOptions) {
    const url = new URL(opts.baseUrl);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(opts.allowInsecureHttp && local)) {
      throw new Error("NezamyClient: baseUrl must be https");
    }
    if (!opts.token || opts.token.length < 16) throw new Error("NezamyClient: token is required");
    this.base = `${url.origin}/api/v1/ext`;
    this.token = opts.token;
    this.tokenId = createHash("sha256").update(opts.token).digest("hex").slice(0, 16);
    this.f = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.sleep = opts.sleep ?? defaultSleep;
    this.ua = opts.userAgent ?? "nezamy-client/0.1";
    this.onRequest = opts.onRequest;
  }

  /* ----- library ----- */

  async searchLibrary(req: SearchLibraryRequest, signal?: AbortSignal): Promise<SearchLibraryResponse> {
    const r = SearchLibraryRequest.parse(req);
    const qs = new URLSearchParams({ q: r.q, limit: String(r.limit) });
    if (r.type) qs.set("type", r.type);
    if (r.law) qs.set("law", r.law);
    return this.call("GET", `/library/search?${qs}`, undefined, SearchLibraryResponse, true, signal);
  }

  /** `excerpt: true` asks for the short excerpt only (does not count against the read quota). */
  async getArticle(id: string, opts: { excerpt?: boolean } = {}, signal?: AbortSignal): Promise<ArticleResponse> {
    return this.call("GET", `/library/articles/${encodeURIComponent(id)}${opts.excerpt ? "?excerpt=1" : ""}`, undefined, ArticleResponse, true, signal);
  }

  async graphNeighbors(id: string, req: NeighborsRequest = {}, signal?: AbortSignal): Promise<NeighborsResponse> {
    const r = NeighborsRequest.parse(req);
    const qs = new URLSearchParams({ depth: String(r.depth), limit: String(r.limit) });
    if (r.edge) qs.set("edge", r.edge);
    return this.call("GET", `/library/articles/${encodeURIComponent(id)}/neighbors?${qs}`, undefined, NeighborsResponse, true, signal);
  }

  async checkCitations(req: CheckCitationsRequest, signal?: AbortSignal): Promise<CheckCitationsResponse> {
    return this.call("POST", "/citations/check", CheckCitationsRequest.parse(req), CheckCitationsResponse, true, signal);
  }

  /* ----- account ----- */

  accountStanding(signal?: AbortSignal): Promise<StandingResponse> {
    return this.call("GET", "/account/standing", undefined, StandingResponse, true, signal);
  }

  /* ----- AI runs ----- */

  /** What a run would cost, without starting it or charging anything. */
  async quoteRun(req: Omit<StartRunRequest, "idempotency_key">, signal?: AbortSignal): Promise<QuoteRunResponse> {
    const { idempotency_key: _k, ...shape } = StartRunRequest.parse({ ...req, idempotency_key: "quote-only-00000000" });
    void _k;
    return this.call("POST", "/ai/runs/quote", shape, QuoteRunResponse, true, signal);
  }

  /** Safe to retry: the same idempotency_key never charges twice. */
  async startRun(req: StartRunRequest, signal?: AbortSignal): Promise<StartRunResponse> {
    return this.call("POST", "/ai/runs", StartRunRequest.parse(req), StartRunResponse, true, signal);
  }

  getRun(runId: string, signal?: AbortSignal): Promise<RunResponse> {
    return this.call("GET", `/ai/runs/${encodeURIComponent(runId)}`, undefined, RunResponse, true, signal);
  }

  /**
   * Polls until the run is no longer `running`. Backoff 1 s → 5 s. Throws a
   * `timeout` error at `deadlineMs` (the run itself keeps going server-side and
   * is refunded by the platform's sweeper if it never finishes).
   */
  async waitForRun(
    runId: string,
    opts: { deadlineMs?: number; signal?: AbortSignal; onProgress?: (r: RunResponse) => void } = {},
  ): Promise<RunResponse> {
    const deadline = Date.now() + (opts.deadlineMs ?? 15 * 60_000);
    let delay = 1000;
    for (;;) {
      const run = await this.getRun(runId, opts.signal);
      opts.onProgress?.(run);
      if (run.status !== "running") return run;
      if (Date.now() + delay > deadline) throw new NezamyApiError("timeout", 0, { requestId: run.request_id });
      await this.sleep(delay);
      delay = Math.min(5000, Math.round(delay * 1.5));
    }
  }

  /** start + wait; throws `run_failed` (with the server's Arabic reason) when the run fails. */
  async runAndWait(
    req: StartRunRequest,
    opts: { deadlineMs?: number; signal?: AbortSignal; onProgress?: (r: RunResponse) => void } = {},
  ): Promise<RunResponse> {
    const started = await this.startRun(req, opts.signal);
    const run = started.status === "running" ? await this.waitForRun(started.run_id, opts) : await this.getRun(started.run_id, opts.signal);
    if (run.status === "failed") {
      throw new NezamyApiError("run_failed", 200, { requestId: run.request_id, serverMessage: run.error_message ?? undefined });
    }
    return run;
  }

  /* ----- case dossier + research pool (Sayegh v2) ----- */

  async getDossier(id: string, req: DossierRequest = {}, signal?: AbortSignal): Promise<DossierResponse> {
    const r = DossierRequest.parse(req);
    const qs = new URLSearchParams({ max_chars: String(r.max_chars) });
    if (r.stage) qs.set("stage", r.stage);
    if (r.kind) qs.set("kind", r.kind);
    return this.call("GET", `/dossiers/${encodeURIComponent(id)}?${qs}`, undefined, DossierResponse, true, signal);
  }

  /** Not retried automatically: a write. */
  async addResearchItem(req: AddResearchItemRequest, signal?: AbortSignal): Promise<AddResearchItemResponse> {
    return this.call("POST", "/research/items", AddResearchItemRequest.parse(req), AddResearchItemResponse, false, signal);
  }

  /* ----- transport ----- */

  private async call<S extends z.ZodTypeAny>(
    method: "GET" | "POST", path: string, body: unknown, schema: S, retriable: boolean, signal?: AbortSignal,
  ): Promise<z.infer<S>> {
    let attempt = 0;
    for (;;) {
      const t0 = Date.now();
      let res: Response;
      try {
        const timeout = AbortSignal.timeout(this.timeoutMs);
        res = await this.f(`${this.base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            "User-Agent": this.ua,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          redirect: "error",
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        if (retriable && attempt < this.maxRetries) {
          await this.sleep(backoff(attempt++));
          continue;
        }
        throw new NezamyApiError(isTimeout ? "timeout" : "network", 0);
      }

      const ms = Date.now() - t0;
      const text = await res.text();
      let json: unknown = undefined;
      try { json = text ? JSON.parse(text) : undefined; } catch { /* handled below */ }
      const requestId = (json && typeof json === "object" && "request_id" in json ? String((json as { request_id: unknown }).request_id) : undefined) ?? res.headers.get("x-request-id") ?? undefined;
      this.onRequest?.({ method, path: path.split("?")[0] ?? path, status: res.status, ms, requestId });

      if (res.ok) {
        const parsed = schema.safeParse(json);
        if (!parsed.success) throw new NezamyApiError("bad_response", res.status, { requestId });
        return parsed.data;
      }

      const eb = ApiErrorBody.safeParse(json);
      const retryHeader = Number(res.headers.get("retry-after"));
      const retryAfter = eb.success && eb.data.retry_after_seconds !== undefined ? eb.data.retry_after_seconds : Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined;
      const retryable = retriable && [429, 502, 503, 504].includes(res.status) && attempt < this.maxRetries;
      if (retryable) {
        const wait = retryAfter !== undefined ? Math.min(retryAfter, RETRY_AFTER_CAP_S) * 1000 : backoff(attempt);
        attempt++;
        await this.sleep(wait);
        continue;
      }
      throw new NezamyApiError(codeFromHttp(res.status, eb.success ? eb.data.code : undefined), res.status, {
        requestId: eb.success ? eb.data.request_id ?? requestId : requestId,
        retryAfterSeconds: retryAfter,
        serverMessage: eb.success ? eb.data.error : undefined,
      });
    }
  }
}

function backoff(attempt: number): number {
  const base = 400 * 2 ** attempt;
  return base + Math.floor(Math.random() * 200);
}
