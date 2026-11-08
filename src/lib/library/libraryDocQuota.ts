/**
 * libraryDocQuota.ts — spends one library document from the reader's quota,
 * in the DOCUMENT ROUTE, after its device check (final review of batch
 * 2026-11-08, item 3).
 *
 * Until this file the proxy counted the document (applyLibraryReadQuota) before
 * the route ran, and the route refused a third device afterwards
 * (enforceLibraryDevice, owner ٤٢٧). So a refused device still spent the
 * account owner's quota: enough refused tries filled his hourly cap, and the
 * refused attempts past the cap counted toward the library lock (423) — a
 * stranger's browser could lock the subscriber out from his own devices.
 *
 * Why the route and not the proxy: the device decision needs the viewer's
 * entitlement (only an entitled full-text read is device-checked) and
 * library_device_check REGISTERS a free device as it answers, so the proxy can
 * neither ask it early nor guess its answer from the cookie (a refused browser
 * is handed a well-formed, unregistered cookie on its first try). The route
 * already knows both, so each of the four document routes calls this right
 * after `if (deviceRefusal) return deviceRefusal;`. The proxy still tallies the
 * activity and still checks the lock for search.
 *
 * Same key, same numbers, same refusal as the proxy used: libraryQuotaTarget()
 * on the request's own path (so a document opened today before this change is
 * not counted twice), libraryReadQuotaHit() with its 60-second memo, and
 * quotaRefusal()'s 423 / 429 with `Cache-Control: private, no-store`.
 *
 * FAILS OPEN, like everything it calls: a guest, a demo deploy, a missing
 * function, a timeout or a throw → null, and the read goes on.
 */
import { NextResponse } from "next/server";
import { isSupabaseMode } from "@/lib/runtimeMode";
import { libraryQuotaTarget, quotaRefusal } from "./readQuota";
import { libraryReadQuotaHit } from "./readQuotaServer";

/** null = go on; a NextResponse = the 423 / 429 to return as it is. */
export async function spendLibraryDocument(request: Request, userId: string | null): Promise<NextResponse | null> {
  if (!userId || !isSupabaseMode) return null;
  try {
    const target = libraryQuotaTarget(request.method, new URL(request.url).pathname);
    if (!target || target.kind !== "doc") return null;
    const refusal = quotaRefusal(await libraryReadQuotaHit(userId, target.docKey), Date.now());
    if (!refusal) return null;
    const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
    if (refusal.retryAfterSeconds !== null) headers["Retry-After"] = String(refusal.retryAfterSeconds);
    return NextResponse.json(refusal.body, { status: refusal.status, headers });
  } catch {
    return null;
  }
}
