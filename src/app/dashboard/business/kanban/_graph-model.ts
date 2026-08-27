import {
  User, FileText, Scales, CalendarBlank, MagnifyingGlass, Record,
  type Icon,
} from "@phosphor-icons/react";

export type NodeType = "person" | "doc" | "law" | "event" | "evidence" | "custom";
export type EdgeType = "support" | "conflict" | "neutral";

export interface Point { x: number; y: number; }

export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  desc: string;
  pos: Point;
  author: { name: string; color: string; role: string };
  meta?: string;
  w?: number;
  h?: number;
  customColor?: string;
  groupId?: string;
  notes?: string;
}

export interface NodeGroup {
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
  locked: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label: string;
  color?: string;
  width?: number;
}

// ── Icons & Colors Map ─────────────────────────────────────────────────────────

export const TYPE_CONFIG: Record<NodeType, { icon: Icon; bg: string; text: string; label: string }> = {
  person:   { icon: User,          bg: "bg-emerald-500/10 border-emerald-500/30",  text: "text-emerald-500", label: "شخص/طرف" },
  doc:      { icon: FileText,      bg: "bg-blue-500/10 border-blue-500/30",        text: "text-blue-500",    label: "مستند/عقد" },
  law:      { icon: Scales,        bg: "bg-[#C8A762]/10 border-[#C8A762]/30",      text: "text-[#C8A762]",   label: "مادة نظامية" },
  event:    { icon: CalendarBlank, bg: "bg-purple-500/10 border-purple-500/30",    text: "text-purple-500",  label: "حدث/جلسة" },
  evidence: { icon: MagnifyingGlass, bg: "bg-orange-500/10 border-orange-500/30",  text: "text-orange-500",  label: "دليل إثبات" },
  custom:   { icon: Record,        bg: "bg-zinc-500/10 border-zinc-500/30",        text: "text-zinc-500",    label: "ملاحظة حرة" },
};

export const EDGE_CONFIG: Record<EdgeType, { color: string; dash: string }> = {
  support:  { color: "#10b981", dash: "" },
  conflict: { color: "#ef4444", dash: "stroke-dasharray-4" },
  neutral:  { color: "#a1a1aa", dash: "stroke-dasharray-2" },
};

// ── NO SEED DATA LIVES HERE ANY MORE ───────────────────────────────
//
// This file used to export four arrays of invented case material, and
// ./_use-case-graph-state.ts handed two of them to every board that was mounted
// without a seed — which is every board a practising lawyer opens:
//
//   MOCK_NODES / MOCK_EDGES        a contractor dispute: «مؤسسة البناء الحديث»,
//                                  «عقد المقاولة رقم (١٢٣)», a stoppage dated
//                                  «٥ رجب», an expert's report, and
//                                  «المادة (٧٧) من نظام…» carrying
//                                  meta: "مقترح من نظامي AI". Five cards, three
//                                  invented colleagues, one invented statute
//                                  reference — painted under the REAL title of
//                                  whatever case file the lawyer had open.
//   ERP_GENERATED_NODES / _EDGES   a second invented case ("المدعي: شركة الأفق
//                                  المحدودة", "تسبيب المحكمة (المتوقع)"), which a
//                                  1.5s spinner labelled «استخراج من قضية (AI)»
//                                  pasted onto the board as though it had been
//                                  read out of the selected case.
//
// A lawyer can quote a statute reference off their own case file to a client or a
// court. Nothing suggested those; nobody wrote them. Sample data does not belong
// in a component that real case files mount — an unseeded board is now empty, and
// the only way material reaches it is a caller passing `initialNodes`/
// `initialEdges`, or the user typing it.

// ── Smart Edge Routing: connects from nearest handle on each node ────────────

export const NODE_W = 220;
export const NODE_H = 120;

export function getNodeCenter(p: Point) {
  return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
}

// Returns the best exit point on node1 toward node2, and entry on node2
export function getBestHandles(p1: Point, p2: Point): { src: Point; tgt: Point } {
  const c1 = getNodeCenter(p1);
  const c2 = getNodeCenter(p2);
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  // Decide axis: horizontal or vertical dominance
  const isHoriz = Math.abs(dx) > Math.abs(dy);
  let src: Point, tgt: Point;
  if (isHoriz) {
    // left / right handles
    src = dx > 0 ? { x: p1.x + NODE_W, y: p1.y + NODE_H / 2 } : { x: p1.x, y: p1.y + NODE_H / 2 };
    tgt = dx > 0 ? { x: p2.x, y: p2.y + NODE_H / 2 }           : { x: p2.x + NODE_W, y: p2.y + NODE_H / 2 };
  } else {
    // top / bottom handles
    src = dy > 0 ? { x: p1.x + NODE_W / 2, y: p1.y + NODE_H } : { x: p1.x + NODE_W / 2, y: p1.y };
    tgt = dy > 0 ? { x: p2.x + NODE_W / 2, y: p2.y }           : { x: p2.x + NODE_W / 2, y: p2.y + NODE_H };
  }
  return { src, tgt };
}

export function createCurve(p1: Point, p2: Point) {
  const { src, tgt } = getBestHandles(p1, p2);
  const dx = Math.abs(tgt.x - src.x);
  const dy = Math.abs(tgt.y - src.y);
  const ctrl = Math.max(dx, dy) * 0.45;
  const isHoriz = dx > dy;
  const cp1 = isHoriz ? { x: src.x + ctrl, y: src.y } : { x: src.x, y: src.y + ctrl };
  const cp2 = isHoriz ? { x: tgt.x - ctrl, y: tgt.y } : { x: tgt.x, y: tgt.y - ctrl };
  return `M ${src.x} ${src.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${tgt.x} ${tgt.y}`;
}

export function createTempCurve(p1: Point, p2: Point) {
  const ctr = getNodeCenter(p1);
  return `M ${ctr.x} ${ctr.y} L ${p2.x} ${p2.y}`;
}
