/**
 * A small, dependency-free MCP core (JSON-RPC 2.0) for tool-only servers.
 * It exists so the server can be run and TESTED without the official SDK, and
 * as a fallback. For production prefer server-sdk.ts (official SDK) once
 * `npm install` is possible. Both serve the same TOOLS list.
 *
 * Implements: initialize (version negotiation), notifications/initialized,
 * ping, tools/list, tools/call, batches. Anything else: -32601.
 */
import { z } from "zod/v4";
import type { NezamyClient } from "@nezamy/client";
import { SERVER_INSTRUCTIONS, TOOLS, type ToolDef } from "./tools.js";
import { Guard } from "./guards.js";

export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "nezamy", title: "نظامي — المكتبة القانونية والصياغة", version: "0.2.0" };

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }
export interface RpcResponse { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } }

const toolList = (tools: ToolDef[]) =>
  tools.map((t) => {
    const schema = z.toJSONSchema(z.object(t.shape)) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, title: t.title, description: t.description, inputSchema: schema, annotations: t.annotations };
  });

export class MiniMcp {
  constructor(private readonly tools: ToolDef[] = TOOLS, readonly guard: Guard = new Guard()) {}

  /** `client` is created per request/connection by the transport, from the caller's own token. */
  async handle(msg: unknown, client: NezamyClient): Promise<RpcResponse | RpcResponse[] | null> {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map((m) => this.one(m, client)))).filter((r): r is RpcResponse => r !== null);
      return out.length ? out : null;
    }
    return this.one(msg, client);
  }

  private async one(raw: unknown, client: NezamyClient): Promise<RpcResponse | null> {
    if (!raw || typeof raw !== "object" || (raw as RpcRequest).jsonrpc !== "2.0" || typeof (raw as RpcRequest).method !== "string") {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
    }
    const req = raw as RpcRequest;
    const isNotification = req.id === undefined;
    const reply = (result: unknown): RpcResponse | null => (isNotification ? null : { jsonrpc: "2.0", id: req.id ?? null, result });
    const err = (code: number, message: string): RpcResponse | null => (isNotification ? null : { jsonrpc: "2.0", id: req.id ?? null, error: { code, message } });

    switch (req.method) {
      case "initialize": {
        const asked = typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : "";
        const version = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
        return reply({ protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: toolList(this.tools) });
      case "tools/call": {
        const name = req.params?.name;
        const tool = this.tools.find((t) => t.name === name);
        if (!tool) return err(-32602, `Unknown tool: ${String(name).slice(0, 80)}`);
        const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
        const result = await tool.handler(args, { client, guard: this.guard });
        return reply(result);
      }
      default:
        return err(-32601, "Method not found");
    }
  }
}

export type { Json };
