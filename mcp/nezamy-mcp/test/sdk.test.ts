import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NezamyClient } from "@nezamy/client";
import { startMock, GOOD_TOKEN, STAFF_TOKEN, type MockHandle } from "../../nezamy-client/test/mock-server.js";
import { buildServer, handleHttpSdk } from "../src/server-sdk.js";
import { Guard } from "../src/guards.js";
import { TOOLS } from "../src/tools.js";
import { MiniMcp } from "../src/mini-mcp.js";

let mock: MockHandle;
before(async () => { mock = await startMock({ pollsBeforeDone: 0 }); });
after(async () => { await mock.close(); });

const mk = (token: string) => new NezamyClient({ baseUrl: mock.url, token, allowInsecureHttp: true, sleep: async () => {} });
const ARGS = { kind: "appeal", client_role: "plaintiff", facts: "وقائع تجريبية طويلة بما يكفي لتجاوز الحد الأدنى للأحرف." };

async function inMemory(token: string, guard = new Guard({ staffOnly: true })) {
  const server = buildServer(mk(token), guard);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test("sdk: lists exactly the TOOLS, with the same names and annotations as the mini core", async () => {
  const { client, close } = await inMemory(GOOD_TOKEN);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS.map((t) => t.name).sort());
  assert.equal(tools.length, 11);
  const sayegh = tools.find((t) => t.name === "run_sayegh")!;
  assert.equal(sayegh.annotations?.readOnlyHint, false);
  assert.ok((sayegh.inputSchema.properties as Record<string, unknown>).stage);
  assert.ok(client.getInstructions()?.includes("Nezamy"));
  await close();
});

test("sdk: a normal lawyer's token is refused the staff tools; account_standing works", async () => {
  const { client, close } = await inMemory(GOOD_TOKEN);
  const r: any = await client.callTool({ name: "run_sayegh", arguments: ARGS });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /للمشرفين فقط/);
  const s: any = await client.callTool({ name: "account_standing", arguments: {} });
  assert.notEqual(s.isError, true);
  await close();
});

test("sdk: staff quote then confirm = one run, same result as the mini core; bad input is an error, not a crash", async () => {
  const { client, close } = await inMemory(STAFF_TOKEN);
  const q: any = await client.callTool({ name: "run_sayegh", arguments: ARGS });
  assert.match(q.content[0].text, /800 نقطة/);
  assert.equal(q.structuredContent.quoted, true);
  const before = mock.charges();
  const st: any = await client.callTool({ name: "run_sayegh", arguments: { ...ARGS, confirm_charge: true, rerun_token: "sdk-1" } });
  assert.ok(st.structuredContent.run_id);
  assert.equal(mock.charges(), before + 200);
  const g: any = await client.callTool({ name: "get_run", arguments: { run_id: st.structuredContent.run_id, wait_seconds: 0 } });
  assert.equal(g.structuredContent.status, "succeeded");

  // parity with the mini core for the same call
  const mini = await new MiniMcp(undefined, new Guard({ staffOnly: true })).handle(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_sayegh", arguments: ARGS } }, mk(STAFF_TOKEN)) as any;
  assert.equal(mini.result.content[0].text, q.content[0].text);

  // wrong type: the SDK validates against the zod shape itself and answers an error (either form is fine, never a hang)
  let bad: any;
  try { bad = await client.callTool({ name: "run_sayegh", arguments: { ...ARGS, kind: "nonsense" } }); } catch (e) { bad = { isError: true, thrown: String(e) }; }
  assert.equal(bad.isError, true);
  await close();
});

test("sdk: real stdio child process (the way Claude Desktop launches it)", async () => {
  const entry = fileURLToPath(new URL("./sdk-stdio-entry.ts", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", entry],
    env: { ...process.env as Record<string, string>, NEZAMY_BASE_URL: mock.url, NEZAMY_TOKEN: GOOD_TOKEN },
    stderr: "pipe",
  });
  const client = new Client({ name: "t", version: "0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 11);
  const s: any = await client.callTool({ name: "account_standing", arguments: {} });
  assert.match(s.content[0].text, /النقاط: 1200/);
  assert.doesNotMatch(JSON.stringify(s), new RegExp(GOOD_TOKEN));
  await client.close();
});

test("sdk: Streamable HTTP, stateless, the caller's own bearer token passes through", async () => {
  const srv = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    await handleHttpSdk(req, res, body, mk(token));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const url = new URL(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/mcp`);
  try {
    const client = new Client({ name: "t", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${GOOD_TOKEN}` } } }));
    assert.equal((await client.listTools()).tools.length, 11);
    const s: any = await client.callTool({ name: "account_standing", arguments: {} });
    assert.match(s.content[0].text, /النقاط: 1200/);
    await client.close();
  } finally { srv.closeAllConnections?.(); await new Promise((r) => srv.close(r)); }
});
