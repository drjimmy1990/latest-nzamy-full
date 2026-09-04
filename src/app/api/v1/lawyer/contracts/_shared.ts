/**
 * _shared.ts — the ONE row → DTO mapping for the contract manager's routes.
 * ─────────────────────────────────────────────────────────
 * Every /api/v1/lawyer/contracts/* and /api/v1/client/contracts/* route imports
 * its selects, mappers and error translation from here, so a column added to
 * the DTO is added in exactly one place. Server-only (imports the service
 * client for display-name hydration — used ONLY after RLS has scoped the ids).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Contract, ContractDetail, ContractVersion, ContractParty, ContractObligation, ContractPayment,
  ContractStatus, ContractType, VersionLabel, PartyRole, PartyKind, EntityType,
  ObligationKind, ObligationStatus, PaymentStage, PaymentStatus,
} from "@/lib/services/contractsService";

// ─── selects (column lists the tables actually have — 20260905_phase3) ───────

export const CONTRACT_SELECT =
  "id, owner_user_id, firm_id, lawyer_client_id, client_user_id, request_id, title, contract_type, status, " +
  "counterparty_name, value_sar, currency, starts_on, ends_on, auto_renew, renewal_notice_days, signed_on, " +
  "current_version_id, notes, created_at, updated_at";
export const VERSION_SELECT =
  "id, contract_id, version_no, label, file_name, storage_path, mime_type, size_bytes, uploaded_by, notes, created_at";
export const PARTY_SELECT =
  "id, contract_id, role, party_kind, name, entity_type, lawyer_client_id, commercial_register_no, " +
  "contact_phone, contact_email, position, created_at";
export const OBLIGATION_SELECT =
  "id, contract_id, title, kind, due_on, responsible_party_id, status, deadline_id, notes, created_at, updated_at";
export const PAYMENT_SELECT =
  "id, contract_id, label, stage, amount_sar, due_on, status, paid_on, position, notes, created_at, updated_at";

// ─── rows ────────────────────────────────────────────────────────────────────

export interface ContractRow {
  id: string;
  owner_user_id: string | null;
  firm_id: string | null;
  lawyer_client_id: string | null;
  client_user_id: string | null;
  request_id: string | null;
  title: string;
  contract_type: string;
  status: string;
  counterparty_name: string | null;
  value_sar: number | string | null;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
  auto_renew: boolean;
  renewal_notice_days: number;
  signed_on: string | null;
  current_version_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface VersionRow {
  id: string; contract_id: string; version_no: number; label: string; file_name: string; storage_path: string;
  mime_type: string | null; size_bytes: number | string | null; uploaded_by: string | null; notes: string | null; created_at: string;
}
export interface PartyRow {
  id: string; contract_id: string; role: string; party_kind: string; name: string; entity_type: string;
  lawyer_client_id: string | null; commercial_register_no: string | null; contact_phone: string | null;
  contact_email: string | null; position: number; created_at: string;
}
export interface ObligationRow {
  id: string; contract_id: string; title: string; kind: string; due_on: string; responsible_party_id: string | null;
  status: string; deadline_id: string | null; notes: string | null; created_at: string; updated_at: string;
}
export interface PaymentRow {
  id: string; contract_id: string; label: string; stage: string; amount_sar: number | string; due_on: string | null;
  status: string; paid_on: string | null; position: number; notes: string | null; created_at: string; updated_at: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ContractExtras {
  ownerName?: string | null;
  clientName?: string | null;
  versionsCount?: number;
  pendingObligations?: number;
  nextDueOn?: string | null;
}

export function toContractDto(row: ContractRow, extras: ContractExtras = {}): Contract {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName: extras.ownerName ?? null,
    firmId: row.firm_id,
    lawyerClientId: row.lawyer_client_id,
    clientUserId: row.client_user_id,
    clientName: extras.clientName ?? null,
    requestId: row.request_id,
    title: row.title,
    contractType: row.contract_type as ContractType,
    status: row.status as ContractStatus,
    counterpartyName: row.counterparty_name,
    valueSar: num(row.value_sar),
    currency: row.currency || "SAR",
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    autoRenew: !!row.auto_renew,
    renewalNoticeDays: Number.isFinite(Number(row.renewal_notice_days)) ? Number(row.renewal_notice_days) : 30,
    signedOn: row.signed_on,
    currentVersionId: row.current_version_id,
    notes: row.notes ?? "",
    versionsCount: extras.versionsCount ?? 0,
    pendingObligations: extras.pendingObligations ?? 0,
    nextDueOn: extras.nextDueOn ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toVersionDto(row: VersionRow, uploadedByName: string | null = null): ContractVersion {
  return {
    id: row.id,
    contractId: row.contract_id,
    versionNo: row.version_no,
    label: row.label as VersionLabel,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: num(row.size_bytes),
    uploadedBy: row.uploaded_by,
    uploadedByName,
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

export function toPartyDto(row: PartyRow): ContractParty {
  return {
    id: row.id,
    contractId: row.contract_id,
    role: row.role as PartyRole,
    partyKind: row.party_kind as PartyKind,
    name: row.name,
    entityType: row.entity_type as EntityType,
    lawyerClientId: row.lawyer_client_id,
    commercialRegisterNo: row.commercial_register_no,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    position: row.position ?? 0,
    createdAt: row.created_at,
  };
}

export function toObligationDto(row: ObligationRow): ContractObligation {
  return {
    id: row.id,
    contractId: row.contract_id,
    title: row.title,
    kind: row.kind as ObligationKind,
    dueOn: row.due_on,
    responsiblePartyId: row.responsible_party_id,
    status: row.status as ObligationStatus,
    deadlineId: row.deadline_id,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPaymentDto(row: PaymentRow): ContractPayment {
  return {
    id: row.id,
    contractId: row.contract_id,
    label: row.label,
    stage: row.stage as PaymentStage,
    amountSar: num(row.amount_sar) ?? 0,
    dueOn: row.due_on,
    status: row.status as PaymentStatus,
    paidOn: row.paid_on,
    position: row.position ?? 0,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS. */
export function dbErrorResponse(error: { code?: string; message?: string } | null | undefined, subject = "العقد") {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: `${subject} مسجَّل مسبقاً.` };
  if (code === "23514") return { status: 400, message: `بيانات ${subject} غير صالحة.` };
  if (code === "23503") return { status: 400, message: `${subject} يشير إلى سجلّ غير موجود.` };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: `تعذّر حفظ ${subject}.` };
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Display names for a set of user ids — through the service client, and ONLY
 * for ids that RLS already handed to the caller (the same pattern as
 * lawyer/clients). Never throws; a lookup failure just leaves names null.
 */
export async function profileNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name").in("id", unique);
    if (error) { console.error("[contracts/_shared] profile names failed:", error.message, error.code); return out; }
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) out.set(p.id, p.display_name);
    }
  } catch (err) {
    console.error("[contracts/_shared] profile names threw:", err);
  }
  return out;
}

/**
 * Per-contract counts for a list: versions, pending obligations and the
 * earliest pending date. Two RLS-scoped queries; the caller's list is capped
 * (≤ 200) so the `.in()` ceiling (~396 ids) is never reached.
 */
export async function contractListExtras(
  supabase: SupabaseClient,
  contractIds: string[],
): Promise<Map<string, Pick<ContractExtras, "versionsCount" | "pendingObligations" | "nextDueOn">>> {
  const out = new Map<string, { versionsCount: number; pendingObligations: number; nextDueOn: string | null }>();
  for (const id of contractIds) out.set(id, { versionsCount: 0, pendingObligations: 0, nextDueOn: null });
  if (contractIds.length === 0) return out;

  const [versions, obligations] = await Promise.all([
    supabase.from("contract_versions").select("contract_id").in("contract_id", contractIds),
    supabase.from("contract_obligations").select("contract_id, due_on").eq("status", "pending").in("contract_id", contractIds),
  ]);
  if (versions.error) console.error("[contracts/_shared] versions count failed:", versions.error.message, versions.error.code);
  if (obligations.error) console.error("[contracts/_shared] obligations count failed:", obligations.error.message, obligations.error.code);

  for (const v of (versions.data ?? []) as { contract_id: string }[]) {
    const e = out.get(v.contract_id); if (e) e.versionsCount += 1;
  }
  for (const o of (obligations.data ?? []) as { contract_id: string; due_on: string }[]) {
    const e = out.get(o.contract_id);
    if (!e) continue;
    e.pendingObligations += 1;
    if (!e.nextDueOn || o.due_on < e.nextDueOn) e.nextDueOn = o.due_on;
  }
  return out;
}

/**
 * The contract with all four child lists, RLS-scoped through `supabase`
 * (the caller's client: a lawyer, a firm colleague or the client account).
 * null when RLS hides it or it does not exist — the route answers 404.
 */
export async function loadContractDetail(supabase: SupabaseClient, id: string): Promise<ContractDetail | null> {
  const { data: row, error } = await supabase.from("contracts").select(CONTRACT_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("[contracts/_shared] contract read failed:", error.message, error.code);
    throw new Error("تعذّر تحميل العقد.");
  }
  if (!row) return null;
  const contract = row as unknown as ContractRow;

  const [versions, parties, obligations, payments] = await Promise.all([
    supabase.from("contract_versions").select(VERSION_SELECT).eq("contract_id", id).order("version_no", { ascending: false }),
    supabase.from("contract_parties").select(PARTY_SELECT).eq("contract_id", id).order("position").order("created_at"),
    supabase.from("contract_obligations").select(OBLIGATION_SELECT).eq("contract_id", id).order("due_on"),
    supabase.from("contract_payments").select(PAYMENT_SELECT).eq("contract_id", id).order("position").order("due_on"),
  ]);
  for (const [name, res] of [["versions", versions], ["parties", parties], ["obligations", obligations], ["payments", payments]] as const) {
    if (res.error) {
      console.error(`[contracts/_shared] ${name} read failed:`, res.error.message, res.error.code);
      throw new Error("تعذّر تحميل تفاصيل العقد.");
    }
  }

  const versionRows = (versions.data ?? []) as unknown as VersionRow[];
  const obligationRows = (obligations.data ?? []) as unknown as ObligationRow[];
  const names = await profileNames([contract.owner_user_id, contract.client_user_id, ...versionRows.map((v) => v.uploaded_by)]);
  const pending = obligationRows.filter((o) => o.status === "pending");

  return {
    ...toContractDto(contract, {
      ownerName: contract.owner_user_id ? names.get(contract.owner_user_id) ?? null : null,
      clientName: contract.client_user_id ? names.get(contract.client_user_id) ?? null : null,
      versionsCount: versionRows.length,
      pendingObligations: pending.length,
      nextDueOn: pending.length ? pending.map((o) => o.due_on).sort()[0] : null,
    }),
    versions: versionRows.map((v) => toVersionDto(v, v.uploaded_by ? names.get(v.uploaded_by) ?? null : null)),
    parties: ((parties.data ?? []) as unknown as PartyRow[]).map(toPartyDto),
    obligations: obligationRows.map(toObligationDto),
    payments: ((payments.data ?? []) as unknown as PaymentRow[]).map(toPaymentDto),
  };
}
