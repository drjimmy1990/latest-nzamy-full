/**
 * End-to-end smoke test: starts the real stdio server as a child process (exactly how Claude Desktop does)
 * against the fake platform and drives it with the official MCP client. No real token, no network beyond 127.0.0.1.
 *   npm run smoke            (starts its own fake platform on a free port)
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startMock, STAFF_TOKEN } from "../../nezamy-client/test/mock-server.js";

const mock = await startMock({ pollsBeforeDone: 0 });
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({
  command: process.execPath, args: ["--import", "tsx", entry, "stdio"],
  env: { ...process.env as Record<string, string>, NEZAMY_BASE_URL: mock.url, NEZAMY_ALLOW_INSECURE_LOCALHOST: "1", NEZAMY_TOKEN: STAFF_TOKEN },
}));
const show = (r: any) => (r.content?.[0]?.text ?? "").split("\n").slice(0, 6).join("\n");
try {
  const { tools } = await client.listTools();
  console.log(`1) tools/list: ${tools.length} tools -> ${tools.map((t) => t.name).join(", ")}`);
  console.log("2) account_standing:\n" + show(await client.callTool({ name: "account_standing", arguments: {} })));
  const args = { kind: "appeal", client_role: "plaintiff", facts: "وقائع تجريبية طويلة بما يكفي لتجاوز الحد الأدنى للأحرف." };
  console.log("3) run_sayegh (quote, nothing charged):\n" + show(await client.callTool({ name: "run_sayegh", arguments: args })));
  const started: any = await client.callTool({ name: "run_sayegh", arguments: { ...args, confirm_charge: true } });
  console.log("4) run_sayegh (confirmed):\n" + show(started));
  const run: any = await client.callTool({ name: "get_run", arguments: { run_id: started.structuredContent.run_id, wait_seconds: 0 } });
  console.log("5) get_run:\n" + (run.content?.[0]?.text ?? "").slice(0, 1400));
  console.log("\nSMOKE OK");
} finally { await client.close(); await mock.close(); }
process.exit(0);
