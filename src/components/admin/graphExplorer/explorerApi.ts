/**
 * explorerApi.ts — typed client calls for GET /api/v1/admin/graph-explorer.
 */
import type { ExplorerEdge, ExplorerEdgeType, ExplorerNode, ExplorerNodeType, LabHit } from "@/lib/ai/graphExplorerCore";

export interface OverviewData {
  default_model_id: string | null;
  node_counts: Partial<Record<ExplorerNodeType, number>>;
  embeddable_counts: Partial<Record<ExplorerNodeType, number>>;
  embedded_counts: Partial<Record<ExplorerNodeType, number>>;
  edge_counts: Partial<Record<ExplorerEdgeType, number>>;
  origin_counts: Record<string, number>;
  repealed_nodes: number;
  top_hubs: Array<{ node_key: string; node_type: ExplorerNodeType; title: string; law_slug: string | null; degree: number }>;
  concepts: Array<{ node_key: string; title: string; degree: number }>;
  last_synced_at: string | null;
}

export type EdgeCounts = Partial<Record<ExplorerEdgeType, { out: number; in: number }>>;

export interface NeighborhoodData {
  found: boolean;
  center_key: string;
  depth: number;
  limit: number;
  total_center_edges: number;
  truncated: boolean;
  center_edge_counts: EdgeCounts;
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
}

export interface NodeDetail {
  found: boolean;
  node_key: string;
  node_type: ExplorerNodeType;
  source_id: string;
  title: string;
  law_slug: string | null;
  collection_id: string | null;
  article_number: number | null;
  doc_status: string | null;
  item_status: string | null;
  is_page_numbered: boolean;
  is_embeddable: boolean;
  url: string;
  contextual_header: string;
  display_text: string;
  text_length: number;
  updated_at: string;
  embeddings: Array<{ model_id: string; is_default: boolean; updated_at: string }>;
  edge_counts: EdgeCounts;
}

export interface SearchResult extends ExplorerNode {
  snippet: string;
}

export interface LabResult {
  question: string;
  queries: string[];
  ready: boolean;
  vector_used: boolean;
  model_id: string | null;
  embedding: "used" | "no_key" | "failed";
  elapsed_ms: number;
  hits: LabHit[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; schemaMissing?: boolean; migration?: string };

async function call<T>(params: Record<string, string>, pick: (json: Record<string, unknown>) => T): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1/admin/graph-explorer?${new URLSearchParams(params)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (json.schemaMissing === true) {
      return { ok: false, error: "مخطط المستكشف غير مطبّق بعد", schemaMissing: true, migration: String(json.migration ?? "") };
    }
    if (!res.ok) return { ok: false, error: String(json.error ?? "تعذّر تحميل بيانات الجراف") };
    return { ok: true, data: pick(json) };
  } catch {
    return { ok: false, error: "تعذّر الاتصال بالخادم" };
  }
}

export const explorerApi = {
  overview: () => call({ action: "overview" }, (j) => j.overview as OverviewData),
  search: (q: string, types: ExplorerNodeType[]) =>
    call({ action: "search", q, types: types.join(","), limit: "30" }, (j) => (j.results as SearchResult[]) ?? []),
  neighborhood: (key: string, depth: 1 | 2, limit: number) =>
    call({ action: "neighborhood", key, depth: String(depth), limit: String(limit) }, (j) => j.neighborhood as NeighborhoodData),
  node: (key: string) => call({ action: "node", key }, (j) => j.node as NodeDetail),
  retrieve: (q: string, keywords: string) => call({ action: "retrieve", q, keywords }, (j) => j.lab as LabResult),
};
