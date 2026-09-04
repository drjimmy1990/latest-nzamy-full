/**
 * firmMemberWorkloadService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/firm/members/workload — the real per-member
 * counts behind the `team/[id]` and `team/workload` rebuild (see that
 * route's header, and `@/lib/services/firmMemberWorkload` for the
 * aggregation rules and the documented `assignedRequests` gap).
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { FirmMemberWorkloadCounts } from "@/lib/services/firmMemberWorkload";

export type { FirmMemberWorkloadCounts };

const BASE = "/api/v1/firm/members/workload";

export async function getFirmMemberWorkload(): Promise<ListRead<FirmMemberWorkloadCounts>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: FirmMemberWorkloadCounts[]; total?: number }>(BASE);
    return listFromApi(body);
  } catch (error) {
    console.error("[firmMemberWorkloadService] getFirmMemberWorkload failed:", error);
    return listFailed<FirmMemberWorkloadCounts>();
  }
}
