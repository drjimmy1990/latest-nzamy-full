import { NextResponse } from "next/server";
import { getLibraryAccessForUser } from "@/lib/access-control";
import type { ExtAccess } from "@/lib/ext/extLibrary";
import { extError, extJson } from "./_extAuth";
import { extLibraryClosed } from "./_extLibraryAccess";

/**
 * The two checks every library read through a token starts with: the library's closed switch,
 * then the reader's own entitlement (full access, whitelist, free principles). A failed
 * entitlement read answers 503, never "entitled".
 */
export async function extReadGate(userId: string, rid: string): Promise<{ access: ExtAccess } | NextResponse> {
  const closed = await extLibraryClosed(userId);
  if (closed) {
    return extError(closed.status, "library_locked", String(closed.body.error ?? "المكتبة مغلقة مؤقتًا."), rid, {}, { "Retry-After": "3600" });
  }
  try {
    const a = await getLibraryAccessForUser(userId);
    return { access: { hasFullAccess: a.hasFullAccess === true, whitelistedSlugs: a.whitelistedSlugs ?? [], freeItemsByType: a.freeItemsByType ?? {} } };
  } catch (err) {
    console.error("[ext] entitlement read failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر التحقق من اشتراكك الآن — حاول بعد قليل.", rid);
  }
}

export { extJson };
