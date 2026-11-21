import readline from "node:readline";
import type { NezamyClient } from "@nezamy/client";
import { MiniMcp } from "./mini-mcp.js";

/** Newline-delimited JSON-RPC over stdio (Claude Desktop / Claude Code local servers). Logs only to stderr. */
export function runStdio(client: NezamyClient): void {
  const core = new MiniMcp();
  const rl = readline.createInterface({ input: process.stdin });
  let chain: Promise<void> = Promise.resolve();
  rl.on("line", (line) => {
    if (!line.trim()) return;
    chain = chain.then(async () => {
      let msg: unknown;
      try { msg = JSON.parse(line); } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
        return;
      }
      try {
        const out = await core.handle(msg, client);
        if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
      } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } })}\n`);
      }
    });
  });
  // finish in-flight requests before exiting on stdin EOF (piped use / tests)
  rl.on("close", () => { void chain.then(() => process.exit(0)); });
}
