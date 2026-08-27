/**
 * lawyerClientsService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer clients service.
 *
 * `getLawyerClients` used to end in `catch { return [] }`, so a 500 from
 * /api/v1/lawyer/clients reached the screen as «لا يوجد موكّلون بعد» — the
 * lawyer was told their address book is empty on top of a broken query. It now
 * returns `ListRead<LawyerClient>`, which a caller cannot read items out of
 * without first deciding what to do about failure.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  userType: string;
  requestCount: number;
  activeCount: number;
  lastActivity: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyerClients(): Promise<ListRead<LawyerClient>> {
  // Demo mode has no client store behind this endpoint at all — the empty list
  // is a hardcoded constant, not a read that came back empty. Left as-is per
  // the demo rule; it is genuinely all there is to say in that mode.
  if (!isSupabaseMode) {
    return listOk([]);
  }

  try {
    // The route answers a bare array (not `{ data }`), and 500s on a Supabase
    // error rather than serving an empty 200 — so a throw here really is a
    // failure and `listFromApi` has no envelope to read.
    const rows = await apiGet<LawyerClient[]>("/api/v1/lawyer/clients");
    // A non-array body is a contract violation (an error object, most likely),
    // and counting it as "no clients" is the exact defect this file is fixing.
    if (!Array.isArray(rows)) return listFailed<LawyerClient>();
    return listOk(rows);
  } catch (error) {
    console.error("[lawyerClientsService] getLawyerClients failed:", error);
    return listFailed<LawyerClient>();
  }
}
