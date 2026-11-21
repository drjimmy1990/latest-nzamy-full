import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { freezeStateFromUser, ACCOUNT_FROZEN_AR } from "@/lib/auth/accountFreeze";
import { isSuspendedUser, ACCOUNT_SUSPENDED_AR } from "@/lib/auth/accountSuspension";
import { rateLimit } from "@/lib/rateLimit";
import { extErrorBody } from "@/lib/ext/extRuns";

/**
 * Bearer-token door of /api/v1/ext/* (the Nezamy MCP server and the Word add-in).
 *
 * The proxy guards cookie sessions only, so everything it would do is done here, in order:
 * token → scope → kill switch → frozen / suspended account → per-token rate limit.
 * Needs mcp/platform-patch/migration.sql (api_tokens + api_token_lookup) to be applied;
 * until then every call answers 401, never a half-open door.
 * Every answer carries request_id, X-Request-Id and no-store; none ever carries a secret.
 */
export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
export type Scope = "library:read" | "ai:run" | "graph:read" | "account:read";
export interface ExtCaller {
  userId: string;
  tokenId: string;
  deviceHash: string;
  scopes: string[];
  requestId: string;
}

export const newRequestId = () => `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export function extJson(status: number, body: Record<string, unknown>, requestId: string, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, "X-Request-Id": requestId, ...extra } });
}

export function extError(status: number, code: string, messageAr: string, requestId: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return extJson(status, extErrorBody(requestId, messageAr, code, extra), requestId, headers);
}

const PER_TOKEN_PER_MINUTE = 60;

/** Bearer PAT → the caller, or the Arabic error response to return as is. */
export async function requireExtCaller(req: NextRequest, scope: Scope): Promise<ExtCaller | NextResponse> {
  const rid = newRequestId();
  const m = /^Bearer (nzy_pat_[A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return extError(401, "unauthorized", "التوكن مفقود أو غير صالح.", rid, {}, { "WWW-Authenticate": 'Bearer realm="nezamy"' });

  try {
    const admin = await createServiceClient();
    const looked = await admin.rpc("api_token_lookup", { p_hash: createHash("sha256").update(m[1]!).digest("hex") });
    // A missing function (migration not applied) or an error is a closed door, not an open one.
    const row = looked.error ? null : Array.isArray(looked.data) ? looked.data[0] : null;
    if (!row) return extError(401, "unauthorized", "التوكن منتهي أو ملغي أو غير صحيح.", rid);
    if (!Array.isArray(row.scopes) || !row.scopes.includes(scope)) {
      return extError(403, "forbidden_scope", "هذا التوكن لا يملك الصلاحية المطلوبة.", rid);
    }

    // Kill switch first after the token: one setting turns the whole door off at once.
    const kill = await admin.from("platform_settings").select("value").eq("key", "ext_kill_switch").maybeSingle();
    if (!kill.error && kill.data?.value === true) {
      return extError(503, "kill_switch", "الربط الخارجي موقوف مؤقتًا من الإدارة.", rid);
    }

    const u = await admin.auth.admin.getUserById(row.user_id);
    if (!u.data?.user) return extError(401, "unauthorized", "التوكن منتهي أو ملغي أو غير صحيح.", rid);
    if (isSuspendedUser(u.data.user)) return extError(403, "frozen_account", ACCOUNT_SUSPENDED_AR, rid);
    if (freezeStateFromUser(u.data.user).frozen) return extError(403, "frozen_account", ACCOUNT_FROZEN_AR, rid);

    const limited = rateLimit(`ext:${row.id}`, { limit: PER_TOKEN_PER_MINUTE, windowMs: 60_000 });
    if (!limited.ok) {
      return extError(429, "rate_limited", "طلبات كثيرة — انتظر قليلًا ثم أعد المحاولة.", rid, { retry_after_seconds: limited.retryAfterSec }, { "Retry-After": String(limited.retryAfterSec) });
    }
    return { userId: row.user_id, tokenId: row.id, deviceHash: row.device_hash, scopes: row.scopes, requestId: rid };
  } catch (err) {
    console.error("[ext] auth failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر التحقق الآن — حاول بعد قليل.", rid);
  }
}
