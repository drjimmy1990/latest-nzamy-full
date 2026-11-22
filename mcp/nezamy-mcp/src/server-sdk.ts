/**
 * Production adapter on the OFFICIAL MCP SDK (@modelcontextprotocol/sdk ^1.20).
 *
 * STATUS (2026-11-21): compiled and tested against SDK 1.32.2 (test/sdk.test.ts: in-memory
 * client<->server, a real stdio child process, real Streamable HTTP). Serves exactly the TOOLS
 * in tools.ts, so behaviour matches mini-mcp.ts.
 *
 * Remote mode is stateless (a fresh McpServer + transport per HTTP request), the
 * SDK's recommended pattern for servers that keep no session state; the lawyer's
 * token comes from the Authorization header of each request.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NezamyClient } from "@nezamy/client";
import { SERVER_INFO } from "./mini-mcp.js";
import { SERVER_INSTRUCTIONS, TOOLS } from "./tools.js";
import { Guard } from "./guards.js";

export function buildServer(client: NezamyClient, guard: Guard = new Guard()): McpServer {
  const server = new McpServer(
    { name: SERVER_INFO.name, title: SERVER_INFO.title, version: SERVER_INFO.version },
    { instructions: SERVER_INSTRUCTIONS },
  );
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.shape, annotations: t.annotations },
      async (args: Record<string, unknown>) => (await t.handler(args, { client, guard })) as CallToolResult,
    );
  }
  return server;
}

export async function runStdioSdk(client: NezamyClient): Promise<void> {
  await buildServer(client).connect(new StdioServerTransport());
}

/**
 * Call from the HTTP layer after auth + origin + rate-limit checks (see http.ts).
 *
 * Uses the SDK's web-standard transport and writes the Response ourselves. The SDK's Node wrapper
 * (StreamableHTTPServerTransport -> @hono/node-server 2.1.11) hung a real SDK client on Node 24 in
 * test/sdk.test.ts (tools/list answered 200 but the client never got the result). JSON mode (no SSE
 * stream) matches the stateless design: one request, one JSON answer.
 */
export async function handleHttpSdk(req: IncomingMessage, res: ServerResponse, body: unknown, client: NezamyClient): Promise<void> {
  // Stateless: there is no server-initiated stream. The spec lets a server answer 405 to GET (and DELETE).
  if (req.method !== "POST") { res.writeHead(405, { allow: "POST", "content-type": "application/json" }); res.end('{"error":"method_not_allowed"}'); return; }
  const server = buildServer(client);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && k !== "content-length") headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
      method: "POST", headers, body: JSON.stringify(body ?? null),
    });
    const out = await transport.handleRequest(request, { parsedBody: body });
    const buf = Buffer.from(await out.arrayBuffer());
    res.statusCode = out.status;
    out.headers.forEach((v, k) => res.setHeader(k, v));
    // Send headers first so Node frames the body as chunked (like http.ts). On the author's Windows machine a
    // loopback layer rewrote explicit Content-Length responses to "chunked" without re-framing, breaking fetch clients.
    res.flushHeaders();
    res.end(buf);
  } finally {
    void transport.close(); void server.close();
  }
}
