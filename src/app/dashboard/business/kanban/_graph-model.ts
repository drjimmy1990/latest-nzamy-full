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

// ── Mock Data ──────────────────────────────────────────────────────────────────

export const MOCK_NODES: GraphNode[] = [
  { id: "n1", type: "person", title: "مؤسسة البناء الحديث", desc: "المقاول المنفذ للمشروع", pos: { x: 300, y: 150 }, author: { name: "فهد", role: "قانوني", color: "bg-blue-500" } },
  { id: "n2", type: "doc", title: "عقد المقاولة رقم (١٢٣)", desc: "يتضمن شرط جزائي للتأخير", pos: { x: 550, y: 150 }, author: { name: "فهد", role: "قانوني", color: "bg-blue-500" } },
  { id: "n3", type: "event", title: "توقف الأعمال بالموقع", desc: "توقف غير مبرر في ٥ رجب", pos: { x: 300, y: 350 }, author: { name: "حسين", role: "مستشار", color: "bg-emerald-500" } },
  { id: "n4", type: "law", title: "المادة (٧٧) من نظام...", desc: "عن فسخ العقد التعسفي", pos: { x: 750, y: 350 }, author: { name: "فهد", role: "قانوني", color: "bg-blue-500" }, meta: "مقترح من نظامي AI" },
  { id: "n5", type: "evidence", title: "تقرير المهندس الاستشاري", desc: "يثبت سوء تنفيذ الميدة", pos: { x: 550, y: 350 }, author: { name: "أحمد", role: "مهندس", color: "bg-orange-500" } },
];

export const ERP_GENERATED_NODES: GraphNode[] = [
  { id: "n1", type: "person", title: "المدعي: شركة الأفق المحدودة", desc: "يمثلها وكيل شرعي", pos: { x: 300, y: 100 }, author: { name: "نظامي", role: "AI", color: "bg-[#C8A762]" }, meta: "استخراج تلقائي: الأطراف" },
  { id: "n2", type: "person", title: "المدعى عليه: مؤسسة المقاولات", desc: "لم يحضر الجلسة الأولى", pos: { x: 600, y: 100 }, author: { name: "نظامي", role: "AI", color: "bg-[#C8A762]" }, meta: "استخراج تلقائي: الأطراف" },
  { id: "n3", type: "event", title: "موجز الوقائع الأساسية", desc: "تم تأخير تسليم المشروع ٦ أشهر متجاوزاً مدة العقد المسموحة بدون ظروف قاهرة حسب تقارير المهندس.", pos: { x: 450, y: 250 }, author: { name: "نظامي", role: "AI", color: "bg-[#C8A762]" }, meta: "صياغة تلقائية" },
  { id: "n4", type: "evidence", title: "الدفوع والهجوم (الردود)", desc: "رد المدعي بأن الظروف تخص الجائحة، واعترض المدعى عليه بأن الجائحة انتهت قبل بدء المشروع بنثبت مستند (ش-٢).", pos: { x: 450, y: 400 }, author: { name: "نظامي", role: "AI", color: "bg-[#C8A762]" } },
  { id: "n5", type: "law", title: "تسبيب المحكمة (المتوقع)", desc: "اللائحة التنفيذية توجب الغرامة...", pos: { x: 450, y: 550 }, author: { name: "نظامي", role: "AI", color: "bg-[#C8A762]" }, meta: "بناء بناءً على السوابق" },
];

export const ERP_GENERATED_EDGES: GraphEdge[] = [
  { id: "e1", from: "n1", to: "n3", type: "neutral", label: "أسس الدعوى بناءً على" },
  { id: "e2", from: "n2", to: "n3", type: "conflict", label: "يُنكر" },
  { id: "e3", from: "n3", to: "n4", type: "support", label: "تفاصيل السجال القانوني" },
  { id: "e4", from: "n4", to: "n5", type: "neutral", label: "يوجه إلى" },
];

export const MOCK_EDGES: GraphEdge[] = [
  { id: "e1", from: "n1", to: "n2", type: "support", label: "الطرف الثاني" },
  { id: "e2", from: "n1", to: "n3", type: "conflict", label: "تسبب في" },
  { id: "e3", from: "n3", to: "n5", type: "support", label: "تم إثباته بـ" },
  { id: "e4", from: "n5", to: "n4", type: "support", label: "تأسيس قانوني لـ" },
];

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
