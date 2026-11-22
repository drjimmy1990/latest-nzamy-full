import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { startMock, GOOD_TOKEN, type MockHandle } from "../../nezamy-client/test/mock-server.js";
import { createHttpServer } from "../src/http.js";

let mock: MockHandle;
before(async () => { mock = await startMock({ pollsBeforeDone: 0 }); });
after(async () => { await mock.close(); });

test("stdio: full session through a real child process", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", "stdio"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, NEZAMY_BASE_URL: mock.url, NEZAMY_TOKEN: GOOD_TOKEN, NEZAMY_ALLOW_INSECURE_LOCALHOST: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const lines: any[] = [];
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) lines.push(JSON.parse(l)); }
  });
  const send = (m: unknown) => child.stdin.write(`${JSON.stringify(m)}\n`);
  const waitFor = async (id: number) => { for (let i = 0; i < 300; i++) { const r = lines.find((l) => l.id === id); if (r) return r; await new Promise((r) => setTimeout(r, 20)); } throw new Error(`no reply ${id}; stderr=${stderr}`); };

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assert.equal((await waitFor(1)).result.serverInfo.name, "nezamy");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal((await waitFor(2)).result.tools.length, 11);
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "check_citations", arguments: { citations: [{ law: "نظام تجريبي", article: 5 }] } } });
  assert.match((await waitFor(3)).result.content[0].text, /موجودة وسارية/);
  child.stdin.write("not json\n");
  for (let i = 0; i < 100 && !lines.find((l) => l.error?.code === -32700); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(lines.find((l) => l.error?.code === -32700), "parse error reply");
  assert.ok(!stderr.includes(GOOD_TOKEN), "token must never be logged");
  child.kill();
});

test("stdio refuses to start without a token", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", "stdio"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, NEZAMY_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const code: number = await new Promise((r) => child.on("close", r));
  assert.equal(code, 1);
  assert.match(err, /NEZAMY_TOKEN is required/);
});

async function withHttp(opts: Partial<Parameters<typeof createHttpServer>[0]>, fn: (base: string) => Promise<void>) {
  const server = createHttpServer({ publicUrl: "https://mcp.example.test", apiBaseUrl: mock.url, allowInsecureHttp: true, ...opts });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { await fn(base); } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
const post = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("http: no token -> 401 with OAuth discovery pointer", async () => {
  await withHttp({}, async (base) => {
    const r = await post(base, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("www-authenticate"), 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource"');
  });
});

test("http: protected-resource metadata points at nezamy as the authorization server", async () => {
  await withHttp({}, async (base) => {
    const m = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json() as any;
    assert.equal(m.resource, "https://mcp.example.test/mcp");
    assert.deepEqual(m.authorization_servers, [new URL(mock.url).origin]);
    assert.ok(m.scopes_supported.includes("ai:run"));
  });
});

test("http: tools/list and tools/call with the caller's own token (pass-through)", async () => {
  await withHttp({}, async (base) => {
    const h = { authorization: `Bearer ${GOOD_TOKEN}` };
    const l = await (await post(base, { jsonrpc: "2.0", id: 1, method: "tools/list" }, h)).json() as any;
    assert.equal(l.result.tools.length, 11);
    const before = mock.log.length;
    const c = await (await post(base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "account_standing", arguments: {} } }, h)).json() as any;
    assert.match(c.result.content[0].text, /النقاط: 1200/);
    assert.equal(mock.log.at(-1)!.auth, `Bearer ${GOOD_TOKEN}`);
    assert.ok(mock.log.length > before);
  });
});

test("http: a different caller's bad token is rejected by the platform, not trusted by the MCP server", async () => {
  await withHttp({}, async (base) => {
    const c = await (await post(base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "account_standing", arguments: {} } }, { authorization: "Bearer nzy_pat_wrong_token_000000000" })).json() as any;
    assert.equal(c.result.isError, true);
    assert.ok(!JSON.stringify(c).includes("wrong_token"));
  });
});

test("http: notifications get 202, batches work, bad JSON is -32700", async () => {
  await withHttp({}, async (base) => {
    const h = { authorization: `Bearer ${GOOD_TOKEN}` };
    assert.equal((await post(base, { jsonrpc: "2.0", method: "notifications/initialized" }, h)).status, 202);
    const b = await (await post(base, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }], h)).json() as any[];
    assert.equal(b.length, 2);
    const bad = await post(base, "{oops", h);
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as any).error.code, -32700);
  });
});

test("http: browser origins must be allowlisted; server-to-server (no Origin) is fine", async () => {
  await withHttp({}, async (base) => {
    const h = { authorization: `Bearer ${GOOD_TOKEN}` };
    assert.equal((await post(base, { jsonrpc: "2.0", id: 1, method: "ping" }, { ...h, origin: "https://evil.example" })).status, 403);
    assert.equal((await post(base, { jsonrpc: "2.0", id: 1, method: "ping" }, { ...h, origin: "https://claude.ai" })).status, 200);
    assert.equal((await post(base, { jsonrpc: "2.0", id: 1, method: "ping" }, h)).status, 200);
  });
});

test("http: per-token rate limit and body size limit", async () => {
  await withHttp({ ratePerMinute: 3, maxBodyBytes: 2000 }, async (base) => {
    const h = { authorization: `Bearer ${GOOD_TOKEN}` };
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await post(base, { jsonrpc: "2.0", id: i, method: "ping" }, h)).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    const other = await post(base, { jsonrpc: "2.0", id: 1, method: "ping" }, { authorization: "Bearer nzy_pat_other_token_00000000" });
    assert.equal(other.status, 200, "another token has its own bucket");
  });
  await withHttp({ maxBodyBytes: 2000 }, async (base) => {
    const r = await post(base, { jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(5000) } }, { authorization: `Bearer ${GOOD_TOKEN}` });
    assert.equal(r.status, 413);
  });
});

test("http: only POST /mcp; GET is 405", async () => {
  await withHttp({}, async (base) => {
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
    assert.equal((await fetch(`${base}/other`)).status, 404);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  });
});
