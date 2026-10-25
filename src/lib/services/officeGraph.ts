/**
 * officeGraph.ts — «خريطة قضايا المكتب» (N3.11): the caller's cases, clients
 * and opponents as one read-only graph.
 *
 * Input is exactly what GET /api/v1/lawyer/office-graph read through the
 * caller's own RLS client (his cases and his firm's; his client cards and his
 * firm's). Nothing is inferred beyond what the rows say:
 *   * a case links to its client card (`lawyer_client_id`) or, without one, to
 *     the client name it records;
 *   * a case links to the opponents its intake records (caseParties.ts);
 *   * a party on two or more cases is ONE node — the shared-party edges are
 *     simply its edges;
 *   * «تشابه اسم» — the same name, after spelling normalisation, recorded as a
 *     client on one case and as the other side on another (or on the same
 *     one). It is a hint to check, the same rule the conflict-check screen
 *     applies to names (exact match, no fuzzy scoring), never a finding.
 *
 * No identity numbers, phones or registers are read into the result.
 * Pure — caseParties.ts only — so officeGraph.test.ts runs under node --test.
 */
import { extractCaseParties, normalizePartyName } from "./caseParties.ts";

export interface OfficeCaseInput {
  id: string;
  title: string;
  status: string;
  lawyerClientId: string | null;
  requester: { name?: unknown } | null;
  metadata: Record<string, unknown> | null;
}

export interface OfficeClientInput {
  id: string;
  name: string;
  clientType: string;
}

export type OfficeNodeKind = "case" | "client" | "opponent";

export interface OfficeNode {
  id: string;
  kind: OfficeNodeKind;
  label: string;
  /** For a case: its id; for a client card: its id. Absent for a name-only party. */
  refId?: string;
  /** Number of cases the node is linked to (0 for a client card with none). */
  caseCount: number;
  /** True when the node's name also appears on the other side somewhere. */
  nameClash?: boolean;
}

export interface OfficeEdge {
  from: string;
  to: string;
  relation: "client" | "opponent" | "same_name";
}

export interface NameClash {
  name: string;
  /** Case ids where the name is the client. */
  clientIn: string[];
  /** Case ids where the name is the other side. */
  opponentIn: string[];
  /** The client card(s) carrying the name. */
  clientCardIds: string[];
}

export interface OfficeGraph {
  nodes: OfficeNode[];
  edges: OfficeEdge[];
  clashes: NameClash[];
}

/**
 * Which service_requests rows are CASES — the same denylist as the lawyer
 * cases page (dashboard/lawyer/cases/page.tsx, isLawyerCaseRow): tasks,
 * client stubs, invoices and hearings share the table.
 */
export function isCaseRow(type: string, metadata: Record<string, unknown> | null): boolean {
  if (type !== "service") return false;
  const m = metadata ?? {};
  if (m.task === true || m.client === true || m.invoice === true || m.hearing === true) return false;
  if ("caseName" in m && "time" in m) return false;
  return true;
}

export function buildOfficeGraph(cases: OfficeCaseInput[], clients: OfficeClientInput[]): OfficeGraph {
  const nodes = new Map<string, OfficeNode>();
  const edges: OfficeEdge[] = [];
  const edgeKeys = new Set<string>();
  // normalised name → where it appears
  const byName = new Map<string, { label: string; clientIn: Set<string>; opponentIn: Set<string>; cards: Set<string>; nodeIds: Set<string> }>();

  const nameEntry = (label: string) => {
    const norm = normalizePartyName(label);
    let e = byName.get(norm);
    if (!e) {
      e = { label, clientIn: new Set(), opponentIn: new Set(), cards: new Set(), nodeIds: new Set() };
      byName.set(norm, e);
    }
    return e;
  };
  const addEdge = (from: string, to: string, relation: OfficeEdge["relation"]) => {
    const k = `${from}|${to}|${relation}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ from, to, relation });
  };

  for (const c of clients) {
    const label = c.name.trim();
    if (!label) continue;
    const id = `client:${c.id}`;
    nodes.set(id, { id, kind: "client", label, refId: c.id, caseCount: 0 });
    const e = nameEntry(label);
    e.cards.add(c.id);
    e.nodeIds.add(id);
  }

  for (const k of cases) {
    const caseNodeId = `case:${k.id}`;
    nodes.set(caseNodeId, { id: caseNodeId, kind: "case", label: k.title.trim() || "قضية بلا عنوان", refId: k.id, caseCount: 0 });
    const parties = extractCaseParties({ requester: k.requester, metadata: k.metadata, lawyerClientId: k.lawyerClientId });
    for (const p of parties) {
      const norm = normalizePartyName(p.name);
      let partyId: string;
      if (p.role === "client" && k.lawyerClientId && p.key === `client:${k.lawyerClientId}` && nodes.has(`client:${k.lawyerClientId}`)) {
        partyId = `client:${k.lawyerClientId}`;
      } else {
        // A name with no card: one node per name and side.
        partyId = `${p.role}:${norm}`;
        if (!nodes.has(partyId)) {
          nodes.set(partyId, { id: partyId, kind: p.role === "client" ? "client" : "opponent", label: p.name, caseCount: 0 });
        }
      }
      addEdge(caseNodeId, partyId, p.role);
      const e = nameEntry(p.name);
      e.nodeIds.add(partyId);
      (p.role === "client" ? e.clientIn : e.opponentIn).add(k.id);
    }
  }

  for (const e of edges) {
    const n = nodes.get(e.to);
    if (n && e.relation !== "same_name") n.caseCount += 1;
  }

  const clashes: NameClash[] = [];
  for (const e of byName.values()) {
    const isClash = e.opponentIn.size > 0 && (e.clientIn.size > 0 || e.cards.size > 0);
    if (!isClash) continue;
    clashes.push({
      name: e.label,
      clientIn: [...e.clientIn].sort(),
      opponentIn: [...e.opponentIn].sort(),
      clientCardIds: [...e.cards].sort(),
    });
    const ids = [...e.nodeIds].sort();
    for (const id of ids) {
      const n = nodes.get(id);
      if (n) n.nameClash = true;
    }
    // The dashed «تشابه اسم» line joins the clashing nodes pairwise in a chain.
    for (let i = 1; i < ids.length; i++) addEdge(ids[i - 1], ids[i], "same_name");
  }
  clashes.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  return { nodes: [...nodes.values()], edges, clashes };
}
