#!/usr/bin/env node
/**
 * nezamy-mcp stdio                local server for Claude Desktop / Claude Code (token from NEZAMY_TOKEN)
 * nezamy-mcp http                 remote server for Claude connectors (each caller brings their own token)
 *
 * env: NEZAMY_BASE_URL (default https://nezamy.sa), NEZAMY_TOKEN (stdio only),
 *      MCP_PUBLIC_URL, PORT, HOST  (http only)
 */
import { NezamyClient } from "@nezamy/client";
import { runStdio } from "./stdio.js";
import { createHttpServer } from "./http.js";

const mode = process.argv[2];
const baseUrl = process.env.NEZAMY_BASE_URL ?? "https://nezamy.sa";
/** Development only: lets the client talk plain http to localhost (the client still refuses any other host). */
const allowInsecureHttp = process.env.NEZAMY_ALLOW_INSECURE_LOCALHOST === "1";

if (mode === "stdio") {
  const token = process.env.NEZAMY_TOKEN ?? "";
  if (!token) { console.error("NEZAMY_TOKEN is required (create a token in your Nezamy account)."); process.exit(1); }
  let client: NezamyClient;
  try { client = new NezamyClient({ baseUrl, token, allowInsecureHttp, userAgent: "nezamy-mcp-stdio/0.1" }); }
  catch (e) {
    // Clear one-line message instead of a stack trace (the token itself is never printed).
    console.error(`nezamy-mcp: ${e instanceof Error ? e.message : "bad configuration"}. Check NEZAMY_TOKEN (a full nzy_pat_… token) and NEZAMY_BASE_URL (https).`);
    process.exit(1);
  }
  runStdio(client);
} else if (mode === "http") {
  const port = Number(process.env.PORT ?? 8787);
  const server = createHttpServer({ publicUrl: process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}`, apiBaseUrl: baseUrl, allowInsecureHttp, host: process.env.HOST });
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => console.error(`nezamy-mcp http listening on :${port}`));
} else {
  console.error("usage: nezamy-mcp stdio | http");
  process.exit(2);
}
