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

/**
 * `clientUserId` here widens to `| null` on top of `CreateLawyerClientInput`'s
 * `?: string` — the one call `createLawyerClient` never needs (a brand-new
 * card cannot un-link an account it never had) but `updateLawyerClient` does:
 * «فكّ الربط» sends `{ clientUserId: null }` to clear an existing link, and an
 * omitted key (still valid — every other patch) leaves it untouched.
 */
export type UpdateLawyerClientInput =
  Omit<Partial<CreateLawyerClientInput>, "clientUserId"> & { status?: ClientStatus; clientUserId?: string | null };

/**
 * Contracts/requests/consultations the server re-attributed to a card the
 * moment `clientUserId` was set — echoed back on the SAME response as the
 * updated `data`, so a screen can say exactly what just moved without a
 * second read. Present only when a link actually happened this call: absent
 * on every other create/update, and absent when unlinking (`clientUserId:
 * null`) since nothing moves TO the card at that point.
 */
export interface LinkedCounts {
  contracts: number;
  serviceRequests: number;
  consultations: number;
}

/**
 * What `createLawyerClient`/`updateLawyerClient` actually return: the saved
 * `LawyerClient` row, plus `linked` when this call linked a platform account.
 * A structural superset of `LawyerClient` — every existing caller that only
 * reads client fields (or assigns the result to a `LawyerClient`-typed
 * variable) keeps compiling unchanged; only a caller that wants the linked
 * counts needs to know this type exists.
 */
export type LawyerClientWithLinked = LawyerClient & { linked?: LinkedCounts };

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
export async function createLawyerClient(input: CreateLawyerClientInput): Promise<LawyerClientWithLinked> {
  if (!isSupabaseMode) throw new Error("حفظ الموكّلين غير متاح في وضع العرض التجريبي");
  // `linked` is typed `| null` (not just `?:`) because the route SENDS an
  // explicit `null` on every call that did not link an account — never an
  // omitted key. `res.linked ? … : res.data` reads null and undefined alike.
  const res = await apiMutate<{ data: LawyerClient; linked?: LinkedCounts | null }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات الموكّل المحفوظ.");
  return res.linked ? { ...res.data, linked: res.linked } : res.data;
}

export async function updateLawyerClient(id: string, patch: UpdateLawyerClientInput): Promise<LawyerClientWithLinked> {
  if (!isSupabaseMode) throw new Error("تعديل الموكّلين غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerClient; linked?: LinkedCounts | null }>(`${BASE}/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات الموكّل بعد التعديل.");
  return res.linked ? { ...res.data, linked: res.linked } : res.data;
}
