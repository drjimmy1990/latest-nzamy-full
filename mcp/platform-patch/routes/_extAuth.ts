// DRAFT — src/app/api/v1/ext/_extAuth.ts. Not compiled here (needs the platform repo). Verify every import path.
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { freezeStateFromUser, ACCOUNT_FROZEN_AR } from "@/lib/auth/accountFreeze"; // check exact exports

export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
export type Scope = "library:read" | "ai:run" | "graph:read" | "account:read";
export interface ExtCaller { userId: string; tokenId: string; deviceHash: string; scopes: string[]; requestId: string }

export const requestId = () => `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export function extError(status: number, code: string, message_ar: string, rid: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message: message_ar, request_id: rid } }, { status, headers: { ...NO_STORE, "X-Request-Id": rid, ...extra } });
}

/** Bearer PAT -> caller, or the Arabic error response to return as-is. */
export async function requireExtCaller(req: NextRequest, scope: Scope): Promise<ExtCaller | NextResponse> {
  const rid = requestId();
  const m = /^Bearer (nzy_pat_[A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return extError(401, "unauthorized", "التوكن مفقود أو غير صالح.", rid, { "WWW-Authenticate": 'Bearer realm="nezamy"' });
  const hash = createHash("sha256").update(m[1]).digest("hex");
  const admin = createServiceClient();
  const { data } = await admin.rpc("api_token_lookup", { p_hash: hash });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return extError(401, "unauthorized", "التوكن منتهي أو ملغي أو غير صحيح.", rid);
  if (!row.scopes.includes(scope)) return extError(403, "insufficient_scope", "هذا التوكن لا يملك الصلاحية المطلوبة.", rid);
  // The proxy only guards cookie sessions: re-apply the freeze check here (same source as requireApiUser).
  const { data: u } = await admin.auth.admin.getUserById(row.user_id);
  if (!u?.user || freezeStateFromUser(u.user)) return extError(403, "account_frozen", ACCOUNT_FROZEN_AR, rid);
  // TODO per-token rate limit: reuse src/lib/rateLimitRoutes.ts with key `ext:${row.id}` (e.g. 60/min).
  return { userId: row.user_id, tokenId: row.id, deviceHash: row.device_hash, scopes: row.scopes, requestId: rid };
}

export const USAGE_NOTICE_AR = "نص المكتبة مرجع للاستئناس ولا يغني عن التحقق من المصدر الرسمي ومراجعة المحامي.";
