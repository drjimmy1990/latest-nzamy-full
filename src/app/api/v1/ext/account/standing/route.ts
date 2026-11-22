import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getLibraryAccessForUser, isPlatformAdmin } from "@/lib/access-control";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { extError, extJson, requireExtCaller } from "../../_extAuth";

/**
 * GET /api/v1/ext/account/standing — plan, points, library entitlement and read quota, token scopes.
 * Read-only: the quota call is made without a document key, so it spends none.
 * `is_staff` is what the MCP server uses to open its staff-only tools; every route still decides
 * by its own scope and the platform's own rules.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCOPES = new Set(["library:read", "ai:run", "graph:read", "account:read", "dossier:read", "research:write", "cases:sync"]);

export async function GET(request: NextRequest) {
  const caller = await requireExtCaller(request, "account:read");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const admin = await createServiceClient();
    const [access, bal, quota, token, staff] = await Promise.all([
      getLibraryAccessForUser(caller.userId),
      admin.rpc("points_balance", { p_user: caller.userId }),
      libraryReadQuotaHit(caller.userId, null),
      admin.from("api_tokens").select("expires_at").eq("id", caller.tokenId).eq("user_id", caller.userId).maybeSingle(),
      isPlatformAdmin(caller.userId),
    ]);
    if (bal.error || !Number.isSafeInteger(bal.data)) return extError(503, "unavailable", "تعذّر قراءة رصيدك الآن — حاول بعد قليل.", rid);
    return extJson(
      200,
      {
        request_id: rid,
        plan: access.tier && access.tier !== "free" ? String(access.tier) : null,
        points: { balance: bal.data as number },
        library: {
          entitled: access.hasFullAccess === true,
          read_quota: {
            daily_limit: quota && Number.isInteger(quota.dayLimit) ? quota.dayLimit : null,
            used_today: quota && Number.isInteger(quota.usedToday) ? quota.usedToday : 0,
            locked: quota?.status === "locked",
          },
        },
        token: {
          scopes: caller.scopes.filter((s) => SCOPES.has(s)),
          expires_at: typeof token.data?.expires_at === "string" ? token.data.expires_at : null,
        },
        is_staff: staff,
      },
      rid,
    );
  } catch (err) {
    console.error("[ext/account/standing] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر تحميل حالة الحساب الآن — حاول بعد قليل.", rid);
  }
}
