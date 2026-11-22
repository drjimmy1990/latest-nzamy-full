/**
 * Remote MCP over HTTP (what a Claude connector talks to), stateless JSON mode:
 *   POST /mcp                                      JSON-RPC (single or batch)
 *   GET  /.well-known/oauth-protected-resource     RFC 9728 metadata -> nezamy.sa is the authorization server
 *   GET  /healthz
 * The server holds NO secrets and NO user data: every request carries the lawyer's
 * own access token (OAuth 2.1 token from nezamy.sa, or a PAT), which is passed through
 * to the Lawyer API. So a leak of this server leaks nothing, and platform-side
 * scopes/quotas/points apply exactly as for any other client.
 */
import http from "node:http";
import { createHash } from "node:crypto";
import { NezamyClient } from "@nezamy/client";
import { MiniMcp } from "./mini-mcp.js";

export interface HttpOptions {
  /** Where this MCP server is reachable, e.g. https://mcp.nezamy.sa */
  publicUrl: string;
  /** The Lawyer API origin, e.g. https://nezamy.sa */
  apiBaseUrl: string;
  /** Origins allowed to call from a browser. Requests with no Origin (server-to-server) are fine. */
  allowedOrigins?: string[];
  maxBodyBytes?: number;
  /** Requests per token per minute. */
  ratePerMinute?: number;
  allowInsecureHttp?: boolean;
  port?: number;
  host?: string;
}

const DEFAULT_ORIGINS = ["https://claude.ai", "https://claude.com", "https://nezamy.sa", "https://www.nezamy.sa"];

export function createHttpServer(opts: HttpOptions): http.Server {
  const core = new MiniMcp();
  const origins = new Set(opts.allowedOrigins ?? DEFAULT_ORIGINS);
  const maxBody = opts.maxBodyBytes ?? 256 * 1024;
  const rate = opts.ratePerMinute ?? 60;
  const buckets = new Map<string, { n: number; reset: number }>();
  const metaUrl = `${opts.publicUrl.replace(/\/+$/, "")}/.well-known/oauth-protected-resource`;

  const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const origin = req.headers.origin;
      // DNS-rebinding / cross-site protection (MCP spec): a browser Origin must be allowlisted.
      if (origin && !origins.has(origin)) return json(res, 403, { error: "origin_not_allowed" });

      if (url.pathname === "/healthz") return json(res, 200, { ok: true });
      if (url.pathname === "/.well-known/oauth-protected-resource") {
        return json(res, 200, {
          resource: `${opts.publicUrl.replace(/\/+$/, "")}/mcp`,
          authorization_servers: [new URL(opts.apiBaseUrl).origin],
          bearer_methods_supported: ["header"],
          scopes_supported: ["library:read", "graph:read", "ai:run", "account:read"],
          resource_name: "Nezamy MCP",
        });
      }
      if (url.pathname !== "/mcp") return json(res, 404, { error: "not_found" });
      if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" }, { allow: "POST" });

      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!token) {
        return json(res, 401, { error: "unauthorized", error_description: "Bearer token required" }, { "www-authenticate": `Bearer resource_metadata="${metaUrl}"` });
      }

      // Per-token rate limit, keyed by a hash so the token itself is never held as a map key.
      const key = createHash("sha256").update(token).digest("hex").slice(0, 24);
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || b.reset < now) buckets.set(key, { n: 1, reset: now + 60_000 });
      else if (++b.n > rate) return json(res, 429, { error: "rate_limited" }, { "retry-after": String(Math.ceil((b.reset - now) / 1000)) });
      if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        size += (c as Buffer).length;
        if (size > maxBody) return json(res, 413, { error: "payload_too_large" });
        chunks.push(c as Buffer);
      }
      let msg: unknown;
      try { msg = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
        return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }

      let client: NezamyClient;
      try {
        client = new NezamyClient({ baseUrl: opts.apiBaseUrl, token, allowInsecureHttp: opts.allowInsecureHttp, userAgent: "nezamy-mcp/0.1" });
      } catch {
        return json(res, 401, { error: "unauthorized" }, { "www-authenticate": `Bearer resource_metadata="${metaUrl}"` });
      }
      const out = await core.handle(msg, client);
      if (out === null) { res.writeHead(202); res.end(); return; }
      return json(res, 200, out);
    } catch {
      if (!res.headersSent) json(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } });
      else res.end();
    }
  });
}
