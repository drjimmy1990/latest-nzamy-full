/**
 * libraryRunAccess.ts — the library half of POST /api/v1/ai/runs, pure (Wave 1
 * task 2 review M1 / M2). The route binds the I/O; libraryRunAccess.test.ts
 * runs every branch.
 *
 *   - libraryRunAccess: startRunWith's `libraryAccess` for a library tool,
 *     before the charge. The library's closed switch and the assistant's
 *     tier rule first (`gate`); then, for the library's own AI only
 *     (readQuota.isLibraryAiTool), the reader's library lock: a locked or
 *     over-limit reader gets the proxy's own reply (readQuota.quotaRefusal),
 *     uncharged. Any other library tool never reads the lock. No decision
 *     (`lockRow` null: the read failed or the function is missing) lets the
 *     run go on, as in the proxy.
 *   - libraryRunCreated: startRunWith's `onRunCreated`. «نشاط المكتبة» counts
 *     a library-AI call only when ai_start_run created the run — not a
 *     refusal, a gate denial or a duplicate request.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import type { RouteReply } from "./runCore.ts";
import { isLibraryAiTool, quotaRefusal, type QuotaRow } from "../library/readQuota.ts";

export interface LibraryRunAccessDeps {
  /** The library gate and the assistant's tier rule; a reply refuses the run. */
  gate: () => Promise<RouteReply | null>;
  /** The reader's lock and today's counts (readQuotaServer, docKey null); null = no decision. */
  lockRow: () => Promise<QuotaRow | null>;
  now: () => number;
}

export function libraryRunAccess(deps: LibraryRunAccessDeps): (toolId: string) => Promise<RouteReply | null> {
  return async (toolId) => {
    const denied = await deps.gate();
    if (denied) return denied;
    if (!isLibraryAiTool(toolId)) return null;
    const refusal = quotaRefusal(await deps.lockRow(), deps.now());
    return refusal ? { status: refusal.status, body: { ...refusal.body } } : null;
  };
}

export function libraryRunCreated(record: () => void): (toolId: string) => void {
  return (toolId) => {
    if (isLibraryAiTool(toolId)) record();
  };
}
