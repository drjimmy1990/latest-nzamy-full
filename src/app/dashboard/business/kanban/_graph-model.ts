import {
  User, FileText, Scales, CalendarBlank, MagnifyingGlass, Record, LinkSimple, ListChecks,
  type Icon,
} from "@phosphor-icons/react";

export type NodeType = "person" | "doc" | "law" | "event" | "evidence" | "custom" | "link" | "checklist";
export type EdgeType = "support" | "conflict" | "neutral";

export interface Point { x: number; y: number; }

/** One line of a «قائمة مهام» card (N3.5). */
export interface ChecklistItem { id: string; text: string; done: boolean; }

/**
 * A card imported through «استيراد من القضية» (N3.5) points at the row it came
 * from instead of copying it: `ref_id` is that row's id, `label` the text it
 * had when imported. Stored as-is in case_graphs.nodes (jsonb), so the keys are
 * snake_case like the table's other columns.
 */
export type NodeRefType = "hearing" | "document" | "party" | "stage";
export interface NodeRef { ref_type: NodeRefType; ref_id: string; label: string; }

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
  /** «مستعجل» — the card pulses (and carries a text badge) until switched off. */
  urgent?: boolean;
  /** `link` cards: an http(s) address. Re-checked on every render (safeExternalUrl). */
  url?: string;
  /** `checklist` cards. */
  checklist?: ChecklistItem[];
  /** Cards imported from the case file. */
  ref?: NodeRef;
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
  link:     { icon: LinkSimple,    bg: "bg-sky-500/10 border-sky-500/30",          text: "text-sky-500",     label: "رابط" },
  checklist:{ icon: ListChecks,    bg: "bg-teal-500/10 border-teal-500/30",        text: "text-teal-500",    label: "قائمة مهام" },
};

/** `dash` is the SVG stroke-dasharray ("" = solid). It used to hold Tailwind-looking
 * class names that no stylesheet defines (NOTE-08 item 06). */
export const EDGE_CONFIG: Record<EdgeType, { color: string; dash: string }> = {
  support:  { color: "#10b981", dash: "" },
  conflict: { color: "#ef4444", dash: "6 4" },
  neutral:  { color: "#a1a1aa", dash: "2 4" },
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

// ── Geometry ──────────────────────────────────────────────────────────────────
//
// getNodeCenter / getBestHandles / createCurve / createTempCurve lived here and
// assumed every card was 220×120 at its stored position, with control points
// pointing right whatever side the arrow left from (NOTE-08 items 04–06). The
// canvas geometry is now in ./_graph-geometry.ts (pure, unit-tested), which
// works on each card's real rectangle. The two size defaults are re-exported
// for the callers that still import them from here.

export { NODE_W, NODE_H } from "./_graph-geometry";
