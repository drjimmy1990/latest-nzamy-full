/**
 * contractsService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for Phase 3's contract manager (مدير العقود):
 *   lawyer/firm side — /api/v1/lawyer/contracts …
 *     GET/POST            /                          list · create
 *     GET/PATCH           /[id]                      detail (with children) · update
 *     GET/POST            /[id]/versions             list · register an uploaded file
 *     GET                 /[id]/versions/[vid]/url   signed download link (5 min)
 *     DELETE              /[id]/versions/[vid]
 *     POST/PATCH/DELETE   /[id]/parties[/[pid]]
 *     POST/PATCH/DELETE   /[id]/obligations[/[oid]]  (an obligation's date becomes a radar deadline)
 *     POST/PATCH/DELETE   /[id]/payments[/[pid]]
 *   client side — /api/v1/client/contracts[/[id]] (read-only: the contract, its
 *     versions to download, its payment schedule).
 *
 * ONE DTO per concept, imported by the lawyer, firm and client screens. The
 * file bytes go straight from the browser to the `documents` bucket under the
 * uploader's own folder (uploadContractVersionFile); the row is registered
 * through the API so RLS, version numbering and the audit trail stay on the
 * server.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import { contractVersionStorageKey } from "@/lib/services/storageKey";
import type {
  ContractStatus, ContractType, VersionLabel, PartyRole, PartyKind, EntityType,
  ObligationKind, ObligationStatus, PaymentStage, PaymentStatus,
} from "@/lib/services/contractVocabulary";

export type {
  ContractStatus, ContractType, VersionLabel, PartyRole, PartyKind, EntityType,
  ObligationKind, ObligationStatus, PaymentStage, PaymentStatus,
};

/** Mirrors public.contracts (+ counts the list needs). */
export interface Contract {
  id: string;
  ownerUserId: string | null;
  ownerName: string | null;
  firmId: string | null;
  lawyerClientId: string | null;
  /** The platform account of the client, when the contract is shared with one. */
  clientUserId: string | null;
  clientName: string | null;
  requestId: string | null;
  title: string;
  contractType: ContractType;
  status: ContractStatus;
  counterpartyName: string | null;
  valueSar: number | null;
  currency: string;
  startsOn: string | null;
  endsOn: string | null;
  autoRenew: boolean;
  renewalNoticeDays: number;
  signedOn: string | null;
  currentVersionId: string | null;
  notes: string;
  versionsCount: number;
  pendingObligations: number;
  /** Earliest pending obligation date, for the list. */
  nextDueOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractVersion {
  id: string;
  contractId: string;
  versionNo: number;
  label: VersionLabel;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  notes: string;
  createdAt: string;
}

export interface ContractParty {
  id: string;
  contractId: string;
  role: PartyRole;
  partyKind: PartyKind;
  name: string;
  entityType: EntityType;
  lawyerClientId: string | null;
  commercialRegisterNo: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  position: number;
  createdAt: string;
}

export interface ContractObligation {
  id: string;
  contractId: string;
  title: string;
  kind: ObligationKind;
  dueOn: string;
  responsiblePartyId: string | null;
  status: ObligationStatus;
  /** The radar deadline this obligation created, when one exists. */
  deadlineId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractPayment {
  id: string;
  contractId: string;
  label: string;
  stage: PaymentStage;
  amountSar: number;
  dueOn: string | null;
  status: PaymentStatus;
  paidOn: string | null;
  position: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDetail extends Contract {
  versions: ContractVersion[];
  parties: ContractParty[];
  obligations: ContractObligation[];
  payments: ContractPayment[];
}

export interface CreateContractInput {
  title: string;
  contractType: ContractType;
  status?: ContractStatus;
  counterpartyName?: string | null;
  lawyerClientId?: string | null;
  /** Share with the client's platform account (they then see it under «عقودي»). */
  clientUserId?: string | null;
  valueSar?: number | null;
  currency?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  autoRenew?: boolean;
  /** Days before `endsOn` the renewal notice is due (0–365). A renewal obligation + radar deadline are created when `endsOn` is set. */
  renewalNoticeDays?: number;
  signedOn?: string | null;
  notes?: string;
  parties?: Omit<ContractParty, "id" | "contractId" | "createdAt" | "position">[];
}

export type UpdateContractInput = Partial<Omit<CreateContractInput, "parties">>;

export interface VersionInput {
  fileName: string;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  label?: VersionLabel;
  notes?: string;
  /** Make this the contract's current version (default true). */
  makeCurrent?: boolean;
}

export type PartyInput = Omit<ContractParty, "id" | "contractId" | "createdAt">;
export type ObligationInput = Omit<ContractObligation, "id" | "contractId" | "createdAt" | "updatedAt" | "deadlineId"> & {
  /** Also put it on رادار المهل (default true). */
  createDeadline?: boolean;
};
export type PaymentInput = Omit<ContractPayment, "id" | "contractId" | "createdAt" | "updatedAt">;

const BASE = "/api/v1/lawyer/contracts";
const CLIENT_BASE = "/api/v1/client/contracts";
const path = (id: string, ...rest: string[]) => [BASE, encodeURIComponent(id), ...rest.map(encodeURIComponent)].join("/");
const DEMO = "مدير العقود غير متاح في وضع العرض التجريبي";

// ─── lawyer / firm ───────────────────────────────────────────────────────────

export async function getContracts(opts?: { status?: ContractStatus | "all"; limit?: number }): Promise<ListRead<Contract>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: Contract[]; total?: number }>(BASE, { status: opts?.status, limit: opts?.limit });
    return listFromApi(body);
  } catch (error) {
    console.error("[contractsService] getContracts failed:", error);
    return listFailed<Contract>();
  }
}

/** Throws with Arabic screen copy (404 → «العقد غير موجود»). */
export async function getContract(id: string): Promise<ContractDetail> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiGet<{ data: ContractDetail }>(path(id));
  if (!res?.data) throw new Error("العقد غير موجود");
  return res.data;
}

export async function createContract(input: CreateContractInput): Promise<Contract> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: Contract }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم العقد المحفوظ.");
  return res.data;
}

export async function updateContract(id: string, patch: UpdateContractInput): Promise<Contract> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: Contract }>(path(id), "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم العقد بعد التعديل.");
  return res.data;
}

// ─── versions ────────────────────────────────────────────────────────────────

export async function getContractVersions(id: string): Promise<ListRead<ContractVersion>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: ContractVersion[]; total?: number }>(path(id, "versions"));
    return listFromApi(body);
  } catch (error) {
    console.error("[contractsService] getContractVersions failed:", error);
    return listFailed<ContractVersion>();
  }
}

/** Registers a file that is ALREADY in the bucket (see uploadContractVersionFile). */
export async function addContractVersion(id: string, input: VersionInput): Promise<ContractVersion> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractVersion }>(path(id, "versions"), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم النسخة المحفوظة.");
  return res.data;
}

/**
 * Upload the bytes from the browser to the `documents` bucket under the
 * uploader's own folder, then register the version through the API. If the
 * registration fails the object is removed again (best effort) so no orphan
 * file sits in the bucket unreferenced.
 */
export async function uploadContractVersionFile(
  contractId: string,
  file: File,
  opts: { label?: VersionLabel; notes?: string; makeCurrent?: boolean } = {},
): Promise<ContractVersion> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const supabase = createBrowserClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) throw new Error("انتهت الجلسة — سجّل الدخول ثم أعد المحاولة.");

  const storagePath = contractVersionStorageKey(auth.user.id, contractId, file.name, Date.now());
  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw new Error(`تعذّر رفع الملف: ${uploadError.message}`);

  try {
    return await addContractVersion(contractId, {
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
      label: opts.label,
      notes: opts.notes,
      makeCurrent: opts.makeCurrent,
    });
  } catch (err) {
    await supabase.storage.from("documents").remove([storagePath]).catch(() => undefined);
    throw err;
  }
}

/** A 5-minute signed link, minted server-side after the RLS check; null when the runtime cannot sign. */
export async function getContractVersionUrl(contractId: string, versionId: string): Promise<string | null> {
  if (!isSupabaseMode) return null;
  try {
    const res = await apiGet<{ url: string | null }>(path(contractId, "versions", versionId, "url"));
    return res?.url ?? null;
  } catch (error) {
    console.error("[contractsService] getContractVersionUrl failed:", error);
    return null;
  }
}

export async function deleteContractVersion(contractId: string, versionId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(DEMO);
  await apiMutate<{ ok: true }>(path(contractId, "versions", versionId), "DELETE", {});
}

// ─── parties · obligations · payments ────────────────────────────────────────

export async function addContractParty(contractId: string, input: PartyInput): Promise<ContractParty> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractParty }>(path(contractId, "parties"), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الطرف المحفوظ.");
  return res.data;
}
export async function updateContractParty(contractId: string, partyId: string, patch: Partial<PartyInput>): Promise<ContractParty> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractParty }>(path(contractId, "parties", partyId), "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الطرف بعد التعديل.");
  return res.data;
}
export async function deleteContractParty(contractId: string, partyId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(DEMO);
  await apiMutate<{ ok: true }>(path(contractId, "parties", partyId), "DELETE", {});
}

export async function addContractObligation(contractId: string, input: ObligationInput): Promise<ContractObligation> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractObligation }>(path(contractId, "obligations"), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الالتزام المحفوظ.");
  return res.data;
}
export async function updateContractObligation(contractId: string, obligationId: string, patch: Partial<ObligationInput>): Promise<ContractObligation> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractObligation }>(path(contractId, "obligations", obligationId), "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الالتزام بعد التعديل.");
  return res.data;
}
export async function deleteContractObligation(contractId: string, obligationId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(DEMO);
  await apiMutate<{ ok: true }>(path(contractId, "obligations", obligationId), "DELETE", {});
}

export async function addContractPayment(contractId: string, input: PaymentInput): Promise<ContractPayment> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractPayment }>(path(contractId, "payments"), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الدفعة المحفوظة.");
  return res.data;
}
export async function updateContractPayment(contractId: string, paymentId: string, patch: Partial<PaymentInput>): Promise<ContractPayment> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: ContractPayment }>(path(contractId, "payments", paymentId), "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الدفعة بعد التعديل.");
  return res.data;
}
export async function deleteContractPayment(contractId: string, paymentId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(DEMO);
  await apiMutate<{ ok: true }>(path(contractId, "payments", paymentId), "DELETE", {});
}

// ─── client side (read-only) ─────────────────────────────────────────────────

export async function getClientContracts(): Promise<ListRead<Contract>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: Contract[]; total?: number }>(CLIENT_BASE);
    return listFromApi(body);
  } catch (error) {
    console.error("[contractsService] getClientContracts failed:", error);
    return listFailed<Contract>();
  }
}

export async function getClientContract(id: string): Promise<ContractDetail> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiGet<{ data: ContractDetail }>(`${CLIENT_BASE}/${encodeURIComponent(id)}`);
  if (!res?.data) throw new Error("العقد غير موجود");
  return res.data;
}

export async function getClientContractVersionUrl(contractId: string, versionId: string): Promise<string | null> {
  if (!isSupabaseMode) return null;
  try {
    const res = await apiGet<{ url: string | null }>(`${CLIENT_BASE}/${encodeURIComponent(contractId)}/versions/${encodeURIComponent(versionId)}/url`);
    return res?.url ?? null;
  } catch (error) {
    console.error("[contractsService] getClientContractVersionUrl failed:", error);
    return null;
  }
}
