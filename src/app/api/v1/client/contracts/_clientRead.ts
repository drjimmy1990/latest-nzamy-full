/**
 * _clientRead.ts — the CLIENT's read of the contract manager (owner file 15
 * #4, batch l9-secleak): the lawyer's internal notes and his draft contracts
 * never reach the client.
 * ─────────────────────────────────────────────────────────
 * Server-only. Used by GET /api/v1/client/contracts, …/[id],
 * …/[id]/versions/[vid]/url and the `client_contract` scope of
 * /api/v1/attachments/zip.
 *
 * WHAT THE CLIENT GETS
 *   - his contracts (client_user_id = him) that are NOT `status = 'draft'`;
 *   - a column WHITELIST: never `contracts.notes`, never `contracts.metadata`
 *     (the counterparty's phone / id number), never the `notes` of a version,
 *     an obligation or a payment. The DTO keys are absent, not empty.
 *
 * WHERE IT COMES FROM
 *   20261129_20 takes the client arm off the contract tables' RLS, so a
 *   client's own session reads none of them through PostgREST any more. He
 *   reads through three SECURITY DEFINER functions with the same whitelist and
 *   the same draft rule: client_contracts_list(), client_contract_detail(id),
 *   client_contract_versions(id).
 *   Before that SQL runs the functions are missing (PGRST202 / 42883): the
 *   same whitelist and draft filter are applied here to the old RLS read
 *   (which still has the client arm), so the answer is the same either way.
 *   Any other error fails closed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClientContract, ClientContractDetail, ClientContractVersion, ClientContractObligation, ClientContractPayment,
  ContractStatus, ContractType, VersionLabel, ObligationKind, ObligationStatus, PaymentStage, PaymentStatus,
} from "@/lib/services/contractsService";
import { PARTY_SELECT, toPartyDto, profileNames, type PartyRow } from "../../lawyer/contracts/_shared";

// ─── the whitelist (fallback selects; the SQL functions return the same) ────

export const CLIENT_CONTRACT_COLUMNS =
  "id, owner_user_id, firm_id, lawyer_client_id, client_user_id, request_id, title, contract_type, status, " +
  "counterparty_name, value_sar, currency, starts_on, ends_on, auto_renew, renewal_notice_days, signed_on, " +
  "current_version_id, created_at, updated_at";
export const CLIENT_VERSION_COLUMNS =
  "id, contract_id, version_no, label, file_name, storage_path, mime_type, size_bytes, uploaded_by, folder_owner_id, created_at";
export const CLIENT_OBLIGATION_COLUMNS =
  "id, contract_id, title, kind, due_on, responsible_party_id, status, deadline_id, created_at, updated_at";
export const CLIENT_PAYMENT_COLUMNS =
  "id, contract_id, label, stage, amount_sar, due_on, status, paid_on, position, created_at, updated_at";

/** The one status a client never sees. */
export const CLIENT_HIDDEN_STATUS = "draft";

// ─── rows ────────────────────────────────────────────────────────────────────

export interface ClientContractRow {
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
  currency: string | null;
  starts_on: string | null;
  ends_on: string | null;
  auto_renew: boolean | null;
  renewal_notice_days: number | string | null;
  signed_on: string | null;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  /** client_contracts_list() only. */
  versions_count?: number | null;
  pending_obligations?: number | null;
  next_due_on?: string | null;
}
export interface ClientVersionRow {
  id: string; contract_id: string; version_no: number; label: string; file_name: string; storage_path: string;
  mime_type: string | null; size_bytes: number | string | null; uploaded_by: string | null;
  folder_owner_id: string | null; created_at: string;
}
export interface ClientObligationRow {
  id: string; contract_id: string; title: string; kind: string; due_on: string; responsible_party_id: string | null;
  status: string; deadline_id: string | null; created_at: string; updated_at: string;
}
export interface ClientPaymentRow {
  id: string; contract_id: string; label: string; stage: string; amount_sar: number | string; due_on: string | null;
  status: string; paid_on: string | null; position: number | null; created_at: string; updated_at: string;
}

// ─── mapping: key by key, so a stray column can never ride along ────────────

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ClientContractExtras {
  ownerName?: string | null;
  clientName?: string | null;
  versionsCount?: number;
  pendingObligations?: number;
  nextDueOn?: string | null;
}

export function toClientContractDto(row: ClientContractRow, extras: ClientContractExtras = {}): ClientContract {
  const days = num(row.renewal_notice_days);
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
    renewalNoticeDays: days ?? 30,
    signedOn: row.signed_on,
    currentVersionId: row.current_version_id,
    versionsCount: extras.versionsCount ?? num(row.versions_count) ?? 0,
    pendingObligations: extras.pendingObligations ?? num(row.pending_obligations) ?? 0,
    nextDueOn: extras.nextDueOn ?? row.next_due_on ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toClientVersionDto(row: ClientVersionRow, uploadedByName: string | null = null): ClientContractVersion {
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
    createdAt: row.created_at,
  };
}

export function toClientObligationDto(row: ClientObligationRow): ClientContractObligation {
  return {
    id: row.id,
    contractId: row.contract_id,
    title: row.title,
    kind: row.kind as ObligationKind,
    dueOn: row.due_on,
    responsiblePartyId: row.responsible_party_id,
    status: row.status as ObligationStatus,
    deadlineId: row.deadline_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toClientPaymentDto(row: ClientPaymentRow): ClientContractPayment {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 20261129_20 not applied yet: the function is unknown to PostgREST / Postgres. */
export function isMissingFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

let fallbackLogged = false;
function logFallbackOnce(): void {
  if (fallbackLogged) return;
  fallbackLogged = true;
  console.warn("[client/contracts] the client contract functions are missing (20261129_20 not applied): whitelisted RLS read");
}

// ─── reads ───────────────────────────────────────────────────────────────────

export type ClientRead<T> = { ok: true; data: T } | { ok: false };

/** «عقودي»: the caller's non-draft contracts, newest first, ≤ 200, with their counts. */
export async function listClientContracts(supabase: SupabaseClient, userId: string): Promise<ClientRead<ClientContract[]>> {
  let rows: ClientContractRow[];
  const rpc = await supabase.rpc("client_contracts_list");
  if (!rpc.error) {
    rows = (rpc.data ?? []) as ClientContractRow[];
  } else if (isMissingFunction(rpc.error)) {
    logFallbackOnce();
    const { data, error } = await supabase
      .from("contracts")
      .select(CLIENT_CONTRACT_COLUMNS)
      .eq("client_user_id", userId)
      .neq("status", CLIENT_HIDDEN_STATUS)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[client/contracts] list failed:", error.message, error.code);
      return { ok: false };
    }
    rows = (data ?? []) as unknown as ClientContractRow[];
    const counts = await fallbackCounts(supabase, rows.map((r) => r.id));
    rows = rows.map((r) => ({ ...r, ...counts.get(r.id) }));
  } else {
    console.error("[client/contracts] client_contracts_list failed:", rpc.error.message, rpc.error.code);
    return { ok: false };
  }

  const names = await profileNames(rows.map((r) => r.owner_user_id));
  return {
    ok: true,
    data: rows.map((r) => toClientContractDto(r, { ownerName: r.owner_user_id ? names.get(r.owner_user_id) ?? null : null })),
  };
}

async function fallbackCounts(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, Pick<ClientContractRow, "versions_count" | "pending_obligations" | "next_due_on">>> {
  const out = new Map<string, { versions_count: number; pending_obligations: number; next_due_on: string | null }>();
  for (const id of ids) out.set(id, { versions_count: 0, pending_obligations: 0, next_due_on: null });
  if (ids.length === 0) return out;
  const [versions, obligations] = await Promise.all([
    supabase.from("contract_versions").select("contract_id").in("contract_id", ids),
    supabase.from("contract_obligations").select("contract_id, due_on").eq("status", "pending").in("contract_id", ids),
  ]);
  if (versions.error) console.error("[client/contracts] versions count failed:", versions.error.message, versions.error.code);
  if (obligations.error) console.error("[client/contracts] obligations count failed:", obligations.error.message, obligations.error.code);
  for (const v of (versions.data ?? []) as { contract_id: string }[]) {
    const e = out.get(v.contract_id); if (e) e.versions_count += 1;
  }
  for (const o of (obligations.data ?? []) as { contract_id: string; due_on: string }[]) {
    const e = out.get(o.contract_id);
    if (!e) continue;
    e.pending_obligations += 1;
    if (!e.next_due_on || o.due_on < e.next_due_on) e.next_due_on = o.due_on;
  }
  return out;
}

/**
 * The files of one of the caller's non-draft contracts (download / ZIP).
 * An empty list also when the contract is not his or is a draft — the routes
 * answer the same 404 either way.
 */
export async function clientContractVersions(
  supabase: SupabaseClient,
  userId: string,
  contractId: string,
): Promise<ClientRead<ClientVersionRow[]>> {
  const rpc = await supabase.rpc("client_contract_versions", { p_contract: contractId });
  if (!rpc.error) return { ok: true, data: (rpc.data ?? []) as ClientVersionRow[] };
  if (!isMissingFunction(rpc.error)) {
    console.error("[client/contracts] client_contract_versions failed:", rpc.error.message, rpc.error.code);
    return { ok: false };
  }
  logFallbackOnce();
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id")
    .eq("id", contractId)
    .eq("client_user_id", userId)
    .neq("status", CLIENT_HIDDEN_STATUS)
    .maybeSingle();
  if (contractError) {
    console.error("[client/contracts] contract lookup failed:", contractError.message, contractError.code);
    return { ok: false };
  }
  if (!contract) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("contract_versions")
    .select(CLIENT_VERSION_COLUMNS)
    .eq("contract_id", contractId)
    .order("version_no", { ascending: false });
  if (error) {
    console.error("[client/contracts] versions read failed:", error.message, error.code);
    return { ok: false };
  }
  return { ok: true, data: (data ?? []) as unknown as ClientVersionRow[] };
}

interface DetailRows {
  contract: ClientContractRow;
  versions: ClientVersionRow[];
  parties: PartyRow[];
  obligations: ClientObligationRow[];
  payments: ClientPaymentRow[];
}

/** null when the contract is not the caller's, is a draft, or does not exist. Throws on a failed read. */
export async function loadClientContractDetail(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ClientContractDetail | null> {
  let rows: DetailRows | null;
  const rpc = await supabase.rpc("client_contract_detail", { p_contract: id });
  if (!rpc.error) {
    const d = rpc.data as Partial<DetailRows> | null;
    rows = d && d.contract
      ? {
          contract: d.contract,
          versions: d.versions ?? [],
          parties: d.parties ?? [],
          obligations: d.obligations ?? [],
          payments: d.payments ?? [],
        }
      : null;
  } else if (isMissingFunction(rpc.error)) {
    logFallbackOnce();
    rows = await fallbackDetail(supabase, userId, id);
  } else {
    console.error("[client/contracts] client_contract_detail failed:", rpc.error.message, rpc.error.code);
    throw new Error("تعذّر تحميل العقد.");
  }
  if (!rows || rows.contract.client_user_id !== userId || rows.contract.status === CLIENT_HIDDEN_STATUS) return null;

  const { contract, versions, parties, obligations, payments } = rows;
  const names = await profileNames([contract.owner_user_id, contract.client_user_id, ...versions.map((v) => v.uploaded_by)]);
  const pending = obligations.filter((o) => o.status === "pending");
  return {
    ...toClientContractDto(contract, {
      ownerName: contract.owner_user_id ? names.get(contract.owner_user_id) ?? null : null,
      clientName: contract.client_user_id ? names.get(contract.client_user_id) ?? null : null,
      versionsCount: versions.length,
      pendingObligations: pending.length,
      nextDueOn: pending.length ? pending.map((o) => o.due_on).sort()[0] : null,
    }),
    versions: versions.map((v) => toClientVersionDto(v, v.uploaded_by ? names.get(v.uploaded_by) ?? null : null)),
    parties: parties.map(toPartyDto),
    obligations: obligations.map(toClientObligationDto),
    payments: payments.map(toClientPaymentDto),
  };
}

async function fallbackDetail(supabase: SupabaseClient, userId: string, id: string): Promise<DetailRows | null> {
  const { data: row, error } = await supabase
    .from("contracts")
    .select(CLIENT_CONTRACT_COLUMNS)
    .eq("id", id)
    .eq("client_user_id", userId)
    .neq("status", CLIENT_HIDDEN_STATUS)
    .maybeSingle();
  if (error) {
    console.error("[client/contracts] contract read failed:", error.message, error.code);
    throw new Error("تعذّر تحميل العقد.");
  }
  if (!row) return null;
  const [versions, parties, obligations, payments] = await Promise.all([
    supabase.from("contract_versions").select(CLIENT_VERSION_COLUMNS).eq("contract_id", id).order("version_no", { ascending: false }),
    supabase.from("contract_parties").select(PARTY_SELECT).eq("contract_id", id).order("position").order("created_at"),
    supabase.from("contract_obligations").select(CLIENT_OBLIGATION_COLUMNS).eq("contract_id", id).order("due_on"),
    supabase.from("contract_payments").select(CLIENT_PAYMENT_COLUMNS).eq("contract_id", id).order("position").order("due_on"),
  ]);
  for (const [name, res] of [["versions", versions], ["parties", parties], ["obligations", obligations], ["payments", payments]] as const) {
    if (res.error) {
      console.error(`[client/contracts] ${name} read failed:`, res.error.message, res.error.code);
      throw new Error("تعذّر تحميل تفاصيل العقد.");
    }
  }
  return {
    contract: row as unknown as ClientContractRow,
    versions: (versions.data ?? []) as unknown as ClientVersionRow[],
    parties: (parties.data ?? []) as unknown as PartyRow[],
    obligations: (obligations.data ?? []) as unknown as ClientObligationRow[],
    payments: (payments.data ?? []) as unknown as ClientPaymentRow[],
  };
}
