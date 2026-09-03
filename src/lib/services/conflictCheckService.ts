/**
 * conflictCheckService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for GET /api/v1/lawyer/conflict-check (Phase 2, item 193).
 *
 * The check searches ONLY what the caller may already read under RLS — their
 * own client cards and cases, plus their firm's through active membership.
 * It says «no match in your records», never «no conflict exists»: a lawyer's
 * duty is wider than this database, and the screen must say so.
 *
 * Replaces src/app/dashboard/firm/compliance/conflict/page.tsx's MOCK_DB,
 * which returned three invented hits for any query containing «الأفق» and
 * an empty list for every other name on earth.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export interface ConflictQuery {
  /** Free text — matched against client names and case titles / requester names (ILIKE). */
  q?: string;
  /** Digits — matched exactly against client phones. */
  phone?: string;
  /** Raw national ID — hashed server-side and matched exactly. Never sent anywhere else. */
  nationalId?: string;
  /** Commercial register — normalised and matched exactly. */
  commercialRegister?: string;
}

export interface ConflictMatch {
  kind: "client" | "case_party";
  matchOn: "name" | "phone" | "national_id" | "commercial_register";
  /** What matched, as stored (a client name, a case title). */
  label: string;
  /** Extra context: client type, status, the case's status… */
  detail: string | null;
  /** Where to open it, when the caller may. */
  href: string | null;
  clientId?: string;
  caseRequestId?: string;
  /** true when the row belongs to a firm colleague rather than the caller. */
  viaFirm: boolean;
}

export async function runConflictCheck(query: ConflictQuery): Promise<ListRead<ConflictMatch>> {
  if (!isSupabaseMode) return listFailed<ConflictMatch>();
  const hasTerm = Object.values(query).some((v) => typeof v === "string" && v.trim().length > 0);
  if (!hasTerm) return listOk([]);
  try {
    const body = await apiGet<{ data: ConflictMatch[]; total?: number }>("/api/v1/lawyer/conflict-check", {
      q: query.q?.trim() || undefined,
      phone: query.phone?.trim() || undefined,
      nationalId: query.nationalId?.trim() || undefined,
      commercialRegister: query.commercialRegister?.trim() || undefined,
    });
    return listFromApi(body);
  } catch (error) {
    console.error("[conflictCheckService] runConflictCheck failed:", error);
    return listFailed<ConflictMatch>();
  }
}
