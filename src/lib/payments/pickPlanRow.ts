/**
 * pickPlanRow.ts — which subscription_plans row a (tier, audience) grant
 * points at, when more than one row matches.
 *
 * Why: 20261022_10 added the plans sold online (ind-ai, ind-preventive,
 * ind-litigation, lawyer-pro, consultant-independent, firm-basic,
 * firm-enterprise) next to the 2026-06 catalog rows. (ai, individual),
 * (pro, individual), (pro, provider) and (corp, firm) now match two rows, and
 * `.limit(1).maybeSingle()` with no order returned whichever the planner
 * found first. The rule here is deterministic:
 *   1. among the candidates (sorted by id, ascending), the first whose id is a
 *      plan sold today (a key of PAYABLE_ITEMS);
 *   2. otherwise the lowest id;
 *   3. no candidate → null (the caller keeps its own fallback).
 *
 * Callers: grantEntitlement (src/lib/entitlements.ts) and
 * POST /api/v1/admin/subscriptions.
 *
 * Pure: relative imports only, so `node --test` loads it directly.
 */

import { PAYABLE_ITEMS } from "./catalog.ts";

export function pickPlanRow(
  rows: ReadonlyArray<{ id: string | null | undefined }> | null | undefined,
): string | null {
  const ids = (rows ?? [])
    .map((r) => r?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ids.length === 0) return null;
  const sold = ids.find((id) => Object.prototype.hasOwnProperty.call(PAYABLE_ITEMS, id));
  return sold ?? ids[0];
}
