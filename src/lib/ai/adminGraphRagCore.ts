/**
 * adminGraphRagCore.ts — Pure validation & payload enrichment for
 * `/api/v1/admin/graph-rag` (no Next/Supabase imports so `node --test` runs it natively).
 */

import {
  BUILTIN_EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_MODEL_ID,
  hasEmbeddingCredentials,
  profileFromDbRow,
} from "./embeddingClient.ts";

export type AdminGraphRagAction =
  | { action: "switch_model"; modelId: string }
  | { action: "trigger_sync" }
  | { action: "set_feqh_vectors"; enabled: boolean };

export type ParseAdminGraphRagResult =
  | { ok: true; value: AdminGraphRagAction }
  | { ok: false; status: number; error: string };

const SAFE_MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

export function parseAdminGraphRagAction(body: unknown): ParseAdminGraphRagResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "بيانات الطلب غير صالحة" };
  }
  const rec = body as Record<string, unknown>;
  const action = typeof rec.action === "string" ? rec.action.trim() : "";

  if (action === "switch_model") {
    const modelId = typeof rec.modelId === "string" ? rec.modelId.trim() : "";
    if (!modelId || !SAFE_MODEL_ID_RE.test(modelId)) {
      return { ok: false, status: 400, error: "معرّف نموذج التضمين غير صالح" };
    }
    return { ok: true, value: { action: "switch_model", modelId } };
  }

  if (action === "trigger_sync") {
    return { ok: true, value: { action: "trigger_sync" } };
  }

  if (action === "set_feqh_vectors") {
    if (typeof rec.enabled !== "boolean") {
      return { ok: false, status: 400, error: "قيمة enabled يجب أن تكون منطقية (true/false)" };
    }
    return { ok: true, value: { action: "set_feqh_vectors", enabled: rec.enabled } };
  }

  return { ok: false, status: 400, error: "إجراء غير معروف" };
}

export function isMissingGraphRagSchema(
  code?: string | null,
  message?: string | null,
): boolean {
  if (
    code === "42883" ||
    code === "42P01" ||
    code === "3F000" ||
    code === "PGRST202" ||
    code === "PGRST205"
  ) {
    return true;
  }
  const msg = (message ?? "").toLowerCase();
  return msg.includes("graph_rag_status") && msg.includes("could not find");
}

export interface AdminGraphModelView {
  model_id: string;
  provider: string;
  api_model: string;
  dimensions: number;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  active_vectors: number;
  vault_vectors: number;
  credentialsConfigured: boolean;
}

export interface AdminGraphRagStatusPayload {
  schemaMissing: boolean;
  default_model_id: string;
  active_provider_ready: boolean;
  library_laws_count: number;
  vault_total_vectors: number;
  embeddable_nodes: number;
  node_counts: Record<string, number>;
  edge_counts: Record<string, number>;
  sync_state: {
    dirty: boolean;
    dirty_tables: string[];
    first_dirty_at: string | null;
    last_write_at: string | null;
    last_synced_at: string | null;
    last_sync_status: string | null;
    last_error: string | null;
    include_feqh_vectors: boolean;
    updated_at: string | null;
  } | null;
  models: AdminGraphModelView[];
  recent_runs: Array<{
    id: number;
    started_at: string;
    finished_at: string | null;
    trigger_source: string;
    model_id: string | null;
    status: string;
    nodes_upserted: number;
    nodes_deleted: number;
    edges_upserted: number;
    vault_relinked: number;
    api_embedded: number;
    error_message: string | null;
  }>;
}

export function enrichGraphRagStatusPayload(
  raw: Record<string, unknown> | null,
  env: Record<string, string | undefined> = process.env,
): AdminGraphRagStatusPayload {
  if (!raw) {
    const fallbackModels: AdminGraphModelView[] = Object.values(BUILTIN_EMBEDDING_MODELS).map((p) => ({
      model_id: p.modelId,
      provider: p.provider,
      api_model: p.apiModel,
      dimensions: p.dimensions,
      is_default: p.modelId === DEFAULT_EMBEDDING_MODEL_ID,
      is_active: true,
      notes: null,
      active_vectors: 0,
      vault_vectors: 0,
      credentialsConfigured: hasEmbeddingCredentials(p, env),
    }));
    const def = fallbackModels.find((m) => m.is_default) ?? fallbackModels[0];
    return {
      schemaMissing: true,
      default_model_id: def?.model_id ?? DEFAULT_EMBEDDING_MODEL_ID,
      active_provider_ready: def?.credentialsConfigured ?? false,
      library_laws_count: 0,
      vault_total_vectors: 0,
      embeddable_nodes: 0,
      node_counts: {},
      edge_counts: {},
      sync_state: null,
      models: fallbackModels,
      recent_runs: [],
    };
  }

  const rawModels = Array.isArray(raw.models) ? (raw.models as Array<Record<string, unknown>>) : [];
  const models: AdminGraphModelView[] = rawModels.map((m) => {
    const model_id = String(m.model_id ?? "");
    const provider = String(m.provider ?? "gemini");
    const api_model = String(m.api_model ?? "");
    const dimensions = Number(m.dimensions ?? 768);
    const profile = profileFromDbRow({
      model_id,
      provider,
      api_model,
      dimensions,
      task_document: typeof m.task_document === "string" ? m.task_document : null,
      task_query: typeof m.task_query === "string" ? m.task_query : null,
    });
    return {
      model_id,
      provider,
      api_model,
      dimensions,
      is_default: m.is_default === true,
      is_active: m.is_active !== false,
      notes: typeof m.notes === "string" ? m.notes : null,
      active_vectors: Number(m.active_vectors ?? 0),
      vault_vectors: Number(m.vault_vectors ?? 0),
      credentialsConfigured: hasEmbeddingCredentials(profile, env),
    };
  });

  const defaultModelId =
    typeof raw.default_model_id === "string" && raw.default_model_id
      ? raw.default_model_id
      : models.find((m) => m.is_default)?.model_id ?? DEFAULT_EMBEDDING_MODEL_ID;
  const activeModel = models.find((m) => m.model_id === defaultModelId);

  const rawSync =
    raw.sync_state && typeof raw.sync_state === "object"
      ? (raw.sync_state as Record<string, unknown>)
      : null;

  return {
    schemaMissing: false,
    default_model_id: defaultModelId,
    active_provider_ready: activeModel?.credentialsConfigured ?? false,
    library_laws_count: Number(raw.library_laws_count ?? 0),
    vault_total_vectors: Number(raw.vault_total_vectors ?? 0),
    embeddable_nodes: Number(raw.embeddable_nodes ?? 0),
    node_counts:
      raw.node_counts && typeof raw.node_counts === "object"
        ? (raw.node_counts as Record<string, number>)
        : {},
    edge_counts:
      raw.edge_counts && typeof raw.edge_counts === "object"
        ? (raw.edge_counts as Record<string, number>)
        : {},
    sync_state: rawSync
      ? {
          dirty: rawSync.dirty === true,
          dirty_tables: Array.isArray(rawSync.dirty_tables)
            ? rawSync.dirty_tables.map((t) => String(t))
            : [],
          first_dirty_at: typeof rawSync.first_dirty_at === "string" ? rawSync.first_dirty_at : null,
          last_write_at: typeof rawSync.last_write_at === "string" ? rawSync.last_write_at : null,
          last_synced_at: typeof rawSync.last_synced_at === "string" ? rawSync.last_synced_at : null,
          last_sync_status:
            typeof rawSync.last_sync_status === "string" ? rawSync.last_sync_status : null,
          last_error: typeof rawSync.last_error === "string" ? rawSync.last_error : null,
          include_feqh_vectors: rawSync.include_feqh_vectors === true,
          updated_at: typeof rawSync.updated_at === "string" ? rawSync.updated_at : null,
        }
      : null,
    models,
    recent_runs: Array.isArray(raw.recent_runs)
      ? (raw.recent_runs as AdminGraphRagStatusPayload["recent_runs"])
      : [],
  };
}
