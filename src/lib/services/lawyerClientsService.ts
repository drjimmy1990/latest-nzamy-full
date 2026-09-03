/**
 * lawyerClientsService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/clients (Phase 2, public.lawyer_clients).
 *
 * ONE DTO for every screen (directory card, drawer, client file, modal
 * echo). Until Phase 2 each screen re-typed its own copy of the API row
 * (`LawyerClientApiRow` in ClientDrawer.tsx, `Client` in the detail page…)
 * and the fee/rating fields were reconstructed three different ways.
 *
 * `source`:
 *   "card"    — a public.lawyer_clients row (typed in, or created for a
 *               platform account). Editable. Has an `id` from that table.
 *   "profile" — a platform account that has service requests with this
 *               lawyer but NO card yet. `id` is the account's user id;
 *               `clientUserId` equals it. Not editable until a card is made
 *               (POST with `clientUserId` creates one).
 *
 * `hasNationalId` is the ONLY thing the API says about a national ID — the
 * number is hashed server-side and never returned.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { ClientFlag, ClientStatus, ClientType } from "@/lib/services/clientIdentityRules";

export type { ClientFlag, ClientStatus, ClientType };

export interface LawyerClient {
  id: string;
  source: "card" | "profile";
  clientUserId: string | null;
  firmId: string | null;
  clientType: ClientType | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  hasNationalId: boolean;
  powerOfAttorneyNo: string | null;
  commercialRegisterNo: string | null;
  taxNumber: string | null;
  unifiedNumber700: string | null;
  flags: ClientFlag[];
  rating: number | null;
  /** NULL = no fee agreement on record, which is not 0. */
  feeTotalSar: number | null;
  feePaidSar: number | null;
  firstEngagementOn: string | null;
  status: ClientStatus;
  /** service_requests linked to this client (by lawyer_client_id, or by requester for a profile) */
  requestCount: number;
  activeCount: number;
  closedCount: number;
  lastActivity: string | null;
  createdAt: string | null;
}

export interface CreateLawyerClientInput {
  name: string;
  clientType: ClientType;
  phone?: string;
  email?: string;
  city?: string;
  /** Raw ID as typed; hashed by the route. Never stored. */
  nationalId?: string;
  powerOfAttorneyNo?: string;
  commercialRegisterNo?: string;
  taxNumber?: string;
  unifiedNumber700?: string;
  flags?: ClientFlag[];
  rating?: number;
  feeTotalSar?: number;
  feePaidSar?: number;
  /** YYYY-MM-DD */
  firstEngagementOn?: string;
  /** Link the card to a platform account (turns a "profile" row into a "card"). */
  clientUserId?: string;
}

export type UpdateLawyerClientInput = Partial<CreateLawyerClientInput> & { status?: ClientStatus };

const BASE = "/api/v1/lawyer/clients";

/** `{ data, total }` from the route. Failure is unmissable — never an empty directory over a broken read. */
export async function getLawyerClients(): Promise<ListRead<LawyerClient>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: LawyerClient[]; total?: number }>(BASE);
    return listFromApi(body);
  } catch (error) {
    console.error("[lawyerClientsService] getLawyerClients failed:", error);
    return listFailed<LawyerClient>();
  }
}

/** `null` means 404 only; every other failure throws (same contract as getServiceRequestDetail). */
export async function getLawyerClient(id: string): Promise<LawyerClient | null> {
  if (!isSupabaseMode) return null;
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("تعذّر تحميل بيانات الموكّل.");
  const body = await res.json().catch(() => null);
  if (!body?.data) throw new Error("تعذّر تحميل بيانات الموكّل.");
  return body.data as LawyerClient;
}

/** Throws on failure — a save button must be able to say it failed. The message is screen copy from the route. */
export async function createLawyerClient(input: CreateLawyerClientInput): Promise<LawyerClient> {
  if (!isSupabaseMode) throw new Error("حفظ الموكّلين غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerClient }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات الموكّل المحفوظ.");
  return res.data;
}

export async function updateLawyerClient(id: string, patch: UpdateLawyerClientInput): Promise<LawyerClient> {
  if (!isSupabaseMode) throw new Error("تعديل الموكّلين غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerClient }>(`${BASE}/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات الموكّل بعد التعديل.");
  return res.data;
}
