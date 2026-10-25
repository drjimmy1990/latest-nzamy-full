/**
 * _graph-sanitize.ts — what the case canvas trusts and what it re-checks (N3.5).
 *
 * `case_graphs.nodes` / `.edges` are jsonb written by PUT
 * /api/v1/lawyer/case-graph/[caseId], which stores whatever arrays it is sent:
 * any firm colleague with a REST client can put anything in them. So a saved
 * board is normalised on LOAD, not only when the canvas itself edits it:
 *   * an unknown `type` falls back to `custom` (TYPE_CONFIG[type].icon would
 *     otherwise throw and blank the whole case page);
 *   * a link card's `url` survives only as an http(s) address — a
 *     `javascript:` link opened from a case file is the attack this stops;
 *   * malformed checklist lines and refs are dropped.
 * A well-formed card from before N3.5 passes through untouched (same object
 * shape, no new keys), which is what keeps old boards byte-compatible.
 */
import type { ChecklistItem, EdgeType, GraphEdge, GraphNode, NodeRef, NodeType } from "./_graph-model";

const NODE_TYPES: readonly NodeType[] = ["person", "doc", "law", "event", "evidence", "custom", "link", "checklist"];
const EDGE_TYPES: readonly EdgeType[] = ["support", "conflict", "neutral"];
const REF_TYPES: readonly NodeRef["ref_type"][] = ["hearing", "document", "party", "stage"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** An http(s) URL, normalised, or null. A bare host ("moj.gov.sa") is read as https. */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.startsWith("//")) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
  try {
    const u = new URL(hasScheme ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** The host shown on a link card, without "www.". */
export function linkHost(raw: unknown): string | null {
  const safe = safeExternalUrl(raw);
  if (!safe) return null;
  return new URL(safe).hostname.replace(/^www\./, "");
}

function normalizeChecklist(raw: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(isRecord)
    .filter((i) => typeof i.id === "string" && typeof i.text === "string")
    .map((i) => ({ id: i.id as string, text: i.text as string, done: i.done === true }));
}

function normalizeRef(raw: unknown): NodeRef | undefined {
  if (!isRecord(raw)) return undefined;
  if (!REF_TYPES.includes(raw.ref_type as NodeRef["ref_type"])) return undefined;
  if (typeof raw.ref_id !== "string" || !raw.ref_id) return undefined;
  return {
    ref_type: raw.ref_type as NodeRef["ref_type"],
    ref_id: raw.ref_id,
    label: typeof raw.label === "string" ? raw.label : "",
  };
}

export function normalizeLoadedNodes(raw: unknown): GraphNode[] {
  if (!Array.isArray(raw)) return [];
  const out: GraphNode[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
    const n = { ...item } as Record<string, unknown>;
    if (!NODE_TYPES.includes(n.type as NodeType)) n.type = "custom";
    if (typeof n.title !== "string") n.title = "";
    if (typeof n.desc !== "string") n.desc = "";
    const pos = isRecord(n.pos) ? n.pos : {};
    if (!isRecord(n.pos) || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      n.pos = { x: num(pos.x), y: num(pos.y) };
    }
    if (!isRecord(n.author)) n.author = { name: "", color: "", role: "" };
    if ("urgent" in n && typeof n.urgent !== "boolean") delete n.urgent;
    if ("url" in n) {
      const safe = safeExternalUrl(n.url);
      if (safe) n.url = safe; else delete n.url;
    }
    if ("checklist" in n) {
      const list = normalizeChecklist(n.checklist);
      if (list) n.checklist = list; else delete n.checklist;
    }
    if ("ref" in n) {
      const ref = normalizeRef(n.ref);
      if (ref) n.ref = ref; else delete n.ref;
    }
    for (const k of ["w", "h"] as const) {
      if (k in n && !(typeof n[k] === "number" && Number.isFinite(n[k]))) delete n[k];
    }
    out.push(n as unknown as GraphNode);
  }
  return out;
}

export function normalizeLoadedEdges(raw: unknown): GraphEdge[] {
  if (!Array.isArray(raw)) return [];
  const out: GraphEdge[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.from !== "string" || typeof item.to !== "string") continue;
    const e = { ...item } as Record<string, unknown>;
    if (!EDGE_TYPES.includes(e.type as EdgeType)) e.type = "neutral";
    if (typeof e.label !== "string") e.label = "";
    out.push(e as unknown as GraphEdge);
  }
  return out;
}

export function toggleChecklistItem(list: ChecklistItem[], id: string): ChecklistItem[] {
  return list.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

export function addChecklistItem(list: ChecklistItem[], text: string, id: string): ChecklistItem[] {
  const t = text.trim();
  if (!t) return list;
  return [...list, { id, text: t, done: false }];
}

export function removeChecklistItem(list: ChecklistItem[], id: string): ChecklistItem[] {
  return list.filter((i) => i.id !== id);
}

/** «٢ من ٥» — a count, never a percentage (owner ١٩٣). */
export function checklistCount(list: ChecklistItem[] | undefined): { done: number; total: number } {
  const items = list ?? [];
  return { done: items.filter((i) => i.done).length, total: items.length };
}
