/**
 * extRuns.ts — the pure half of /api/v1/ext/ai/runs (the Nezamy MCP server's door).
 *
 * The routes are thin adapters over startRunWith (runCore.ts), the same path the website
 * uses. This file holds only what can be tested without a database: the request check, the
 * idempotency-key namespace, and the mapping of runCore's replies and ai_runs rows to the
 * contract in mcp/nezamy-client/src/schemas.ts (flat `{request_id, error, code}` errors,
 * snake_case, no `{run:{…}}` envelope).
 *
 * Pure: node:crypto and relative imports only, so `node --test` runs it.
 */
import { createHash } from "node:crypto";
import { runFailureMessage } from "../ai/runErrors.ts";

/**
 * Tools this door starts today. `brief-check` needs files (v1.1) and `sayegh-v2` has no
 * registry entry yet (owner decision pending), so both answer 422 here, never a silent run.
 */
export const EXT_RUN_TOOLS: ReadonlySet<string> = new Set(["legal-drafter", "contract-drafter"]);
/** Tool ids the client contract names, for the message that tells them apart. */
const KNOWN_ELSEWHERE: ReadonlySet<string> = new Set(["brief-check", "sayegh-v2"]);

export interface ExtRunRequest {
  tool: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  conversationId?: string;
}

export interface ExtFailure {
  status: number;
  code: string;
  error: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KEY_CHARS = /^[A-Za-z0-9_-]{8,100}$/;

export function parseExtRunRequest(body: unknown, opts: { needKey: boolean }): { ok: true; value: ExtRunRequest } | ({ ok: false } & ExtFailure) {
  const bad = (error: string, status = 422): { ok: false } & ExtFailure => ({ ok: false, status, code: "validation", error });
  if (!isObject(body)) return bad("طلب غير صالح", 400);
  const tool = typeof body.tool === "string" ? body.tool : "";
  if (!EXT_RUN_TOOLS.has(tool)) {
    return bad(KNOWN_ELSEWHERE.has(tool) ? "هذه الأداة غير متاحة عبر هذا الاتصال بعد" : "أداة غير مدعومة عبر هذا الاتصال");
  }
  if (!isObject(body.input)) return bad("مدخلات الأداة مفقودة");
  const key = body.idempotency_key;
  if (opts.needKey && !(typeof key === "string" && KEY_CHARS.test(key))) return bad("مفتاح التكرار مطلوب (٨ إلى ١٠٠ حرف من الأحرف والأرقام و- و_)");
  const cid = body.conversation_id;
  if (cid !== undefined && cid !== null && typeof cid !== "string") return bad("معرّف المحادثة غير صالح");
  return {
    ok: true,
    value: {
      tool,
      input: body.input,
      idempotencyKey: typeof key === "string" ? key : "",
      ...(typeof cid === "string" && cid ? { conversationId: cid } : {}),
    },
  };
}

/**
 * The key runCore stores. The token is part of it, so two clients can never collide on the
 * same string. Only [A-Za-z0-9_-]{8,100} is accepted by runCore: no ':' and no raw key.
 */
export function namespacedKey(tokenId: string, key: string): string {
  const t = tokenId.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
  return `ext_${t}_${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
}

/** runCore's `code` → the client's list (schemas.ts). Unknown codes keep their HTTP meaning. */
const CODE_MAP: Record<string, string> = {
  role: "role_refused",
  consultant_blocked: "consultant_blocked",
  tool_off: "tool_off",
  daily_limit: "quota_exceeded",
  insufficient_points: "insufficient_points",
  no_credit: "insufficient_points",
  library_closed: "library_locked",
  library_tier: "library_tier",
  device_limit: "device_limit",
  unknown_tool: "validation",
  invalid_input: "validation",
  invalid_key: "validation",
  invalid_conversation: "validation",
  files_not_accepted: "validation",
  files_required: "validation",
  turn_refused: "validation",
  conversation_full: "validation",
  price_changed: "validation",
};

export const extErrorBody = (requestId: string, error: string, code: string, extra: Record<string, unknown> = {}) => ({
  request_id: requestId,
  error,
  code,
  ...extra,
});

/** A run's status in the contract's three: anything not finished is "running" except a failure. */
export function extRunStatus(status: unknown): "running" | "succeeded" | "failed" {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "refunded" || status === "error" || status === "expired") return "failed";
  return "running";
}

export interface ExtReply {
  status: number;
  body: Record<string, unknown>;
}

/** runCore's reply for a start → the contract's StartRunResponse, or its flat error. */
export function toExtStartReply(reply: { status: number; body: Record<string, unknown> }, requestId: string): ExtReply {
  const b = reply.body;
  if (reply.status === 409 && b.code === "duplicate" && typeof b.runId === "string") {
    // Same key again: the same run, and no second charge or second dispatch.
    return { status: 200, body: { request_id: requestId, run_id: b.runId, conversation_id: null, status: extRunStatus(b.status), charged_points: 0 } };
  }
  if ((reply.status === 200 || reply.status === 202) && typeof b.runId === "string") {
    return {
      status: reply.status === 202 ? 202 : 200,
      body: {
        request_id: requestId,
        run_id: b.runId,
        conversation_id: typeof b.conversationId === "string" ? b.conversationId : null,
        status: reply.status === 202 ? "running" : extRunStatus(b.status ?? "succeeded"),
        charged_points: typeof b.chargedPoints === "number" ? b.chargedPoints : 0,
      },
    };
  }
  const rawCode = typeof b.code === "string" ? b.code : "";
  const status = reply.status >= 400 && reply.status < 600 ? reply.status : 502;
  const error = typeof b.error === "string" && b.error ? b.error : "تعذّر تنفيذ الطلب الآن — حاول بعد قليل";
  return { status, body: extErrorBody(requestId, error, CODE_MAP[rawCode] ?? (status === 404 ? "not_found" : rawCode || "unavailable")) };
}

const LEGAL_STATUS = new Set(["in_force", "amended", "repealed", "unknown"]);

/** Stored citations → the contract's RunCitation: only what is public, status from the library or "unknown". */
export function toExtCitations(raw: unknown): Array<Record<string, string>> {
  if (!Array.isArray(raw)) return [];
  const out: Array<Record<string, string>> = [];
  for (const c of raw) {
    if (!isObject(c) || typeof c.title !== "string" || !c.title) continue;
    const item: Record<string, string> = {
      title: c.title.slice(0, 300),
      status: typeof c.status === "string" && LEGAL_STATUS.has(c.status) ? c.status : "unknown",
    };
    if (typeof c.sid === "string") item.sid = c.sid;
    if (typeof c.id === "string" && (c.kind === "article" || c.kind === "principle")) item.library_id = c.id;
    if (typeof c.url === "string" && c.url.startsWith("/")) item.url = c.url;
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

export interface ExtRunRow {
  id: string;
  tool: string;
  status: string;
  conversation_id?: string | null;
  output?: unknown;
  citations?: unknown;
  error_code?: string | null;
  progress_step?: string | null;
  charged_points?: number | null;
  refunded_at?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  credit_used?: boolean | null;
}

/**
 * An ai_runs row → the contract's RunResponse. Whitelisted field by field: nothing internal
 * (input, n8n execution, callback, usage, source ids) can leak by being added to the table.
 */
export function toExtRunResponse(row: ExtRunRow, requestId: string): Record<string, unknown> {
  const status = extRunStatus(row.status);
  const refunded = typeof row.refunded_at === "string" && row.refunded_at.length > 0;
  const step = typeof row.progress_step === "string" && /^[a-z_]{1,40}$/.test(row.progress_step) ? row.progress_step : null;
  const at = row.finished_at ?? row.created_at ?? new Date(0).toISOString();
  return {
    request_id: requestId,
    run_id: row.id,
    tool: row.tool,
    status,
    conversation_id: row.conversation_id ?? null,
    ...(step ? { progress: [{ step, at }] } : {}),
    output: status === "succeeded" && isObject(row.output) ? row.output : null,
    citations: status === "succeeded" ? toExtCitations(row.citations) : [],
    error_code: status === "failed" ? row.error_code ?? "failed" : null,
    error_message: status === "failed" ? runFailureMessage(row.error_code ?? null, refunded, row.credit_used === true) : null,
    charged_points: typeof row.charged_points === "number" ? Math.max(0, Math.trunc(row.charged_points)) : 0,
    refunded,
  };
}
