/**
 * officeGraphLayout.ts — the deterministic layered layout of «خريطة قضايا
 * المكتب» (owner 13-Nov file 07, N07-44..47).
 *
 * The map used a seeded force layout: with the repulsion it needed, a dozen
 * cases flew 2,300px apart and the page opened on one lonely card. This is a
 * column layout instead, read right to left like the page:
 *
 *   clients │ contracts · consultations │ CASES │ opponents │ hearings · tasks · fees
 *
 * Cases are the backbone, stacked top to bottom. Each case's own hearings,
 * tasks and fee sit in a stack level with it, so a case's slot is as tall as
 * its stack. Clients, contracts, consultations and opponents sit at the
 * average height of what they are linked to (the "barycentre"), pushed down
 * just enough not to overlap. Two sweeps order clients and cases so a client's
 * cases are next to each other. Same graph → same picture; no physics.
 *
 * Pure (type imports only), so officeGraphLayout.test.ts runs under node --test.
 */
import type { OfficeGraph, OfficeNode } from "./officeGraph.ts";
import type { Point } from "./officeGraphRefresh.ts";

/** Card width; the view renders every node at exactly this width. */
export const OFFICE_NODE_W = 220;
const COL_GAP = 120;
const ROW_GAP = 16;
const SLOT_GAP = 34;
const LAYERS = 5;

/**
 * The card's height as the view draws it: a 20px kind line, the label wrapped
 * at ~24 characters a line (Arabic at 13px in a 196px text box), padding.
 * Over-estimates a little so stacked cards never touch.
 */
export function officeNodeHeight(n: Pick<OfficeNode, "label" | "kind" | "caseCount">): number {
  const lines = Math.max(1, Math.ceil(n.label.trim().length / 24));
  return 30 + lines * 19 + 8;
}

function layerOf(n: OfficeNode, links: ReadonlyMap<string, ReadonlySet<string>>): number {
  switch (n.kind) {
    case "client":
      return 0;
    case "contract":
    case "consultation":
      return 1;
    case "case":
      return 2;
    case "opponent":
      return 3;
    case "fee":
      // A case's fee sits with the case's stack; a client's (no case) with the contracts.
      return [...(links.get(n.id) ?? [])].some((id) => id.startsWith("case:")) ? 4 : 1;
    default:
      return 4;
  }
}

const xOf = (layer: number) => (LAYERS - 1 - layer) * (OFFICE_NODE_W + COL_GAP);

/** Places the nodes of one column at their desired centres, top to bottom, without overlap. */
function stackAt(list: Array<{ id: string; h: number; want: number; tie: number }>, x: number, top: number, out: Map<string, Point>) {
  list.sort((a, b) => a.want - b.want || a.tie - b.tie);
  let floor = top;
  for (const it of list) {
    const y = Math.max(it.want - it.h / 2, floor);
    out.set(it.id, { x, y });
    floor = y + it.h + ROW_GAP;
  }
}

export function layeredLayout(graph: Pick<OfficeGraph, "nodes" | "edges">): Map<string, Point> {
  const out = new Map<string, Point>();
  if (graph.nodes.length === 0) return out;

  const order = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const links = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.relation === "same_name" || !byId.has(e.from) || !byId.has(e.to)) continue;
    if (!links.has(e.from)) links.set(e.from, new Set());
    if (!links.has(e.to)) links.set(e.to, new Set());
    links.get(e.from)!.add(e.to);
    links.get(e.to)!.add(e.from);
  }
  const neighbours = (id: string) => [...(links.get(id) ?? [])];
  const height = new Map(graph.nodes.map((n) => [n.id, officeNodeHeight(n)]));
  const h = (id: string) => height.get(id) ?? 60;
  const layers: OfficeNode[][] = Array.from({ length: LAYERS }, () => []);
  for (const n of graph.nodes) layers[layerOf(n, links)].push(n);

  // ── order clients and cases (two barycentre sweeps) ─────────────────────
  let clients = [...layers[0]].sort(
    (a, b) => b.caseCount - a.caseCount || a.label.localeCompare(b.label, "ar") || a.id.localeCompare(b.id),
  );
  let cases = [...layers[2]];
  const bary = (id: string, index: ReadonlyMap<string, number>) => {
    const ix = neighbours(id).map((x) => index.get(x)).filter((v): v is number => v !== undefined);
    return ix.length ? ix.reduce((s, v) => s + v, 0) / ix.length : Infinity;
  };
  const sortBy = (list: OfficeNode[], index: ReadonlyMap<string, number>) =>
    list
      .map((n) => ({ n, b: bary(n.id, index) }))
      .sort((a, b) => a.b - b.b || order.get(a.n.id)! - order.get(b.n.id)!)
      .map((x) => x.n);
  for (let sweep = 0; sweep < 2; sweep++) {
    cases = sortBy(cases, new Map(clients.map((n, i) => [n.id, i])));
    clients = sortBy(clients, new Map(cases.map((n, i) => [n.id, i])));
  }
  cases = sortBy(cases, new Map(clients.map((n, i) => [n.id, i])));

  // ── cases, each level with its own stack of hearings / tasks / fee ──────
  const stackRank = (id: string) => (id.startsWith("fee:") ? 0 : id.startsWith("hearing:") ? 1 : 2);
  const placedSatellites = new Set<string>();
  let top = 0;
  for (const c of cases) {
    const stack = neighbours(c.id)
      .filter((id) => layerOf(byId.get(id)!, links) === 4 && !placedSatellites.has(id))
      .sort((a, b) => stackRank(a) - stackRank(b) || order.get(a)! - order.get(b)!);
    const stackH = stack.reduce((s, id) => s + h(id) + ROW_GAP, 0) - (stack.length ? ROW_GAP : 0);
    const slot = Math.max(h(c.id), stackH);
    out.set(c.id, { x: xOf(2), y: top + (slot - h(c.id)) / 2 });
    let y = top + (slot - stackH) / 2;
    for (const id of stack) {
      out.set(id, { x: xOf(4), y });
      placedSatellites.add(id);
      y += h(id) + ROW_GAP;
    }
    top += slot + SLOT_GAP;
  }

  const centre = (id: string) => {
    const p = out.get(id);
    return p ? p.y + h(id) / 2 : undefined;
  };
  const want = (id: string, fallback: number) => {
    const ys = neighbours(id).map(centre).filter((v): v is number => v !== undefined);
    return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : fallback;
  };

  // ── the columns that follow what they link to ───────────────────────────
  const bottom = () => Math.max(0, ...[...out.entries()].map(([id, p]) => p.y + h(id))) + SLOT_GAP;
  const column = (layer: number, list: OfficeNode[]) => {
    const end = bottom();
    stackAt(list.map((n, i) => ({ id: n.id, h: h(n.id), want: want(n.id, end + i), tie: i })), xOf(layer), 0, out);
  };
  column(3, layers[3]);
  column(0, clients);
  column(1, layers[1]);
  // Anything left (a satellite whose case is not drawn): the foot of its column.
  const rest = graph.nodes.filter((n) => !out.has(n.id));
  if (rest.length) {
    let y = bottom();
    for (const n of rest) {
      out.set(n.id, { x: xOf(layerOf(n, links)), y });
      y += h(n.id) + ROW_GAP;
    }
  }
  return out;
}

/**
 * After a refresh that brought new nodes (layoutPlan "relax"): every node
 * already drawn stays where it is — the lawyer may have dragged it — and a new
 * node takes its place in the fresh layout relative to a drawn node it is
 * linked to (or, linked to nothing drawn, relative to the drawing as a whole).
 */
export function placeNewNodes(
  graph: Pick<OfficeGraph, "nodes" | "edges">,
  previous: ReadonlyMap<string, Point>,
  fresh: ReadonlyMap<string, Point>,
): Map<string, Point> {
  const out = new Map<string, Point>();
  const known = graph.nodes.filter((n) => previous.has(n.id) && fresh.has(n.id));
  const shiftOf = (id: string) => {
    const a = previous.get(id)!;
    const b = fresh.get(id)!;
    return { dx: a.x - b.x, dy: a.y - b.y };
  };
  const global = known.length ? shiftOf(known[0].id) : { dx: 0, dy: 0 };
  for (const n of graph.nodes) {
    const was = previous.get(n.id);
    if (was) {
      out.set(n.id, was);
      continue;
    }
    const p = fresh.get(n.id);
    if (!p) continue;
    const anchor = graph.edges.find(
      (e) => (e.from === n.id && previous.has(e.to) && fresh.has(e.to)) || (e.to === n.id && previous.has(e.from) && fresh.has(e.from)),
    );
    const s = anchor ? shiftOf(anchor.from === n.id ? anchor.to : anchor.from) : global;
    out.set(n.id, { x: p.x + s.dx, y: p.y + s.dy });
  }
  return out;
}
