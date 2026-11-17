"use client";

/**
 * OfficeGraphView — «خريطة قضايا المكتب» (N3.11), mounted at
 * /dashboard/lawyer/graph and /dashboard/firm/graph.
 *
 * Rebuilt on @xyflow/react (owner 13-Nov file 07, N07-44..47): the map opens
 * fitted to everything on it (fitView), pans and zooms with the mouse, wheel
 * and touch, has a minimap and zoom controls, and lays the office out in
 * columns (officeGraphLayout.ts) instead of the old force layout that threw a
 * dozen cases 2,300px apart. Cards are RTL and wrap a long name instead of
 * cutting it. The controls sit top-left and the minimap bottom-right so the
 * floating «إضافة سريعة» button (bottom-left) never covers them.
 *
 * Read-only: a map of the caller's cases, clients, opponents, contracts,
 * consultations, upcoming hearings, open tasks and fees exactly as GET
 * /api/v1/lawyer/office-graph returns them through RLS (N07-50..52). A party
 * on several cases is one node, and one client is one node (N07-49);
 * «تشابه اسم» marks a name that is a client in one file and the other side in
 * another — a hint to check, not a conflict finding. Clicking a node opens
 * its fields and a link to the record. Nothing here writes anything.
 *
 * STAYS CURRENT (BUG-03): the read runs again when the tab comes back into
 * view, on window focus, when a case is saved in this tab
 * (`nzamy-workflow-updated`) and on «تحديث». An unchanged answer is dropped
 * and a changed one keeps every drawn (or dragged) node where it was
 * (src/lib/services/officeGraphRefresh.ts). A failed refresh keeps the last
 * good map on screen and says so.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowClockwise,
  ArrowSquareOut,
  Briefcase,
  CalendarBlank,
  ChatsCircle,
  CircleNotch,
  Coins,
  CornersOut,
  FileText,
  Gavel,
  ListChecks,
  MagnifyingGlass,
  TreeStructure,
  User,
  Warning,
  X,
} from "@phosphor-icons/react";
import { getOfficeGraph, type OfficeGraphRead } from "@/lib/services/officeGraphService";
import { autoRefetchAllowed, keepPositions, layoutPlan, officeGraphSignature, type Point } from "@/lib/services/officeGraphRefresh";
import { layeredLayout, OFFICE_NODE_W, placeNewNodes } from "@/lib/services/officeGraphLayout";
import { OFFICE_NODE_KINDS, type OfficeEdgeRelation, type OfficeGraph, type OfficeNode, type OfficeNodeKind } from "@/lib/services/officeGraph";
import { normalizePartyName } from "@/lib/services/caseParties";
import { toArabicDigits } from "@/lib/services/arabicCount";

const KIND_AR: Record<OfficeNodeKind, string> = {
  case: "قضية",
  client: "موكّل",
  opponent: "طرف آخر",
  contract: "عقد",
  consultation: "استشارة",
  hearing: "جلسة قادمة",
  task: "مهمة مفتوحة",
  fee: "أتعاب",
};
const KIND_PLURAL_AR: Record<OfficeNodeKind, string> = {
  case: "القضايا",
  client: "الموكّلون",
  opponent: "الخصوم",
  contract: "العقود",
  consultation: "الاستشارات",
  hearing: "الجلسات القادمة",
  task: "المهام",
  fee: "الأتعاب",
};
const KIND_ICON: Record<OfficeNodeKind, typeof Gavel> = {
  case: Gavel,
  client: User,
  opponent: Briefcase,
  contract: FileText,
  consultation: ChatsCircle,
  hearing: CalendarBlank,
  task: ListChecks,
  fee: Coins,
};

/** Surface, border and text of a node card, per theme (fixed hex: no gray token is remapped under .dark). */
function kindColors(kind: OfficeNodeKind, isDark: boolean) {
  const table: Record<OfficeNodeKind, [light: [string, string, string], dark: [string, string, string]]> = {
    case: [["#ecfdf5", "#059669", "#065f46"], ["#0f2a20", "#10b981", "#a7f3d0"]],
    client: [["#f0f9ff", "#0284c7", "#075985"], ["#0c2233", "#38bdf8", "#bae6fd"]],
    opponent: [["#fff1f2", "#e11d48", "#9f1239"], ["#2a1218", "#fb7185", "#fecdd3"]],
    contract: [["#f5f3ff", "#7c3aed", "#5b21b6"], ["#1e1533", "#a78bfa", "#ddd6fe"]],
    consultation: [["#f0fdfa", "#0d9488", "#115e59"], ["#0b2624", "#2dd4bf", "#99f6e4"]],
    hearing: [["#fff7ed", "#ea580c", "#9a3412"], ["#2b1a0c", "#fb923c", "#fed7aa"]],
    task: [["#eef2ff", "#4f46e5", "#3730a3"], ["#17183a", "#818cf8", "#c7d2fe"]],
    fee: [["#fefce8", "#a16207", "#713f12"], ["#2a230b", "#C8A762", "#f3e3b8"]],
  };
  const [fill, stroke, text] = table[kind][isDark ? 1 : 0];
  return { fill, stroke, text };
}

const RELATION_KIND: Record<Exclude<OfficeEdgeRelation, "client" | "opponent" | "same_name">, OfficeNodeKind> = {
  contract: "contract",
  consultation: "consultation",
  hearing: "hearing",
  task: "task",
  fee: "fee",
};

type OfficeNodeData = {
  node: OfficeNode;
  isDark: boolean;
  dimmed: boolean;
  hit: boolean;
  chosen: boolean;
};
type OfficeFlowNode = Node<OfficeNodeData, "office">;

const HIDDEN_HANDLE = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0, background: "transparent" } as const;

const OfficeNodeCard = memo(function OfficeNodeCard({ data }: NodeProps<OfficeFlowNode>) {
  const { node, isDark, dimmed, hit, chosen } = data;
  const c = kindColors(node.kind, isDark);
  const Icon = KIND_ICON[node.kind];
  const sub = [
    KIND_AR[node.kind],
    (node.kind === "client" || node.kind === "opponent") && node.caseCount > 0 ? `${toArabicDigits(node.caseCount)} قضية` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div
      dir="rtl"
      className="rounded-xl px-3 py-2 text-start transition-opacity"
      style={{
        width: OFFICE_NODE_W,
        background: c.fill,
        color: c.text,
        border: `${chosen ? 3 : node.nameClash ? 2.5 : 1.5}px solid ${node.nameClash ? "#f59e0b" : c.stroke}`,
        boxShadow: hit ? `0 0 0 3px ${isDark ? "rgba(200,167,98,0.55)" : "rgba(200,167,98,0.65)"}` : undefined,
        opacity: dimmed ? 0.22 : 1,
      }}
    >
      <Handle id="tl" type="target" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle id="tr" type="target" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle id="sl" type="source" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle id="sr" type="source" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE} />
      <p className="flex items-center gap-1 text-[10.5px] font-semibold" style={{ opacity: 0.8 }}>
        <Icon size={12} weight="duotone" />
        <span>{sub}</span>
        {node.nameClash && <span className="ms-auto" style={{ color: "#f59e0b" }}>⚠ تشابه اسم</span>}
      </p>
      <p className="mt-0.5 whitespace-normal break-words text-[13px] font-bold leading-snug" dir="auto">{node.label}</p>
    </div>
  );
});

const nodeTypes = { office: OfficeNodeCard };

/**
 * After a read: the layered layout on first draw; after a refresh, drawn (and
 * dragged) nodes stay put and only a new node is placed (BUG-03, layoutPlan).
 */
function officeGraphLayout(graph: OfficeGraph, previous: ReadonlyMap<string, Point>): Map<string, Point> {
  const plan = layoutPlan(graph.nodes, previous);
  if (plan === "keep") return keepPositions(graph.nodes, previous);
  const fresh = layeredLayout(graph);
  return plan === "relax" ? placeNewNodes(graph, previous, fresh) : fresh;
}

export default function OfficeGraphView(props: { base: "lawyer" | "firm"; isDark: boolean }) {
  return (
    <ReactFlowProvider>
      <OfficeGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function OfficeGraphCanvas({ base, isDark }: { base: "lawyer" | "firm"; isDark: boolean }) {
  const rf = useReactFlow();
  const [read, setRead] = useState<OfficeGraphRead | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Record<OfficeNodeKind, boolean>>(
    () => Object.fromEntries(OFFICE_NODE_KINDS.map((k) => [k, true])) as Record<OfficeNodeKind, boolean>,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // Laid out when a read arrives (officeGraphLayout above), not during render;
  // a drag moves a node here too, so a refresh keeps it where it was put.
  const [positions, setPositions] = useState<Map<string, Point>>(() => new Map());
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  // BUG-03 — the read, again on demand. Refs, not state: they gate requests
  // and remember what is drawn; they are read only in callbacks and effects.
  const inFlight = useRef(false);
  const lastStartedAt = useRef(0);
  const askedAgain = useRef(false);
  const shownSignature = useRef("");
  const drawnPositions = useRef<Map<string, Point>>(new Map());
  const readNow = useRef<((mode: "initial" | "auto" | "asked") => void) | null>(null);

  useEffect(() => {
    let alive = true;
    const run = (mode: "initial" | "auto" | "asked") => {
      if (mode === "auto" && !autoRefetchAllowed(Date.now(), lastStartedAt.current, inFlight.current)) return;
      if (inFlight.current) {
        // A case saved or «تحديث» during a read: read once more after it.
        if (mode === "asked") askedAgain.current = true;
        return;
      }
      inFlight.current = true;
      lastStartedAt.current = Date.now();
      if (mode !== "initial") setRefreshing(true);
      getOfficeGraph()
        .then((r) => {
          if (!alive) return;
          const signature = officeGraphSignature(r.graph, r.truncated) + JSON.stringify(r.partial);
          if (signature !== shownSignature.current) {
            shownSignature.current = signature;
            const laidOut = officeGraphLayout(r.graph, drawnPositions.current);
            drawnPositions.current = laidOut;
            setPositions(laidOut);
            setRead(r);
            // A selected node that left the map would dim everything else.
            setSelected((s) => (s && r.graph.nodes.some((n) => n.id === s) ? s : null));
          }
          setState("ready");
          setRefreshFailed(false);
        })
        .catch(() => {
          if (!alive) return;
          // The first read failing is the error screen; a later one keeps the
          // last good map and says it could not refresh.
          setState((s) => (s === "loading" ? "error" : s));
          setRefreshFailed(true);
        })
        .finally(() => {
          inFlight.current = false;
          if (!alive) return;
          setRefreshing(false);
          if (askedAgain.current) {
            askedAgain.current = false;
            run("asked");
          }
        });
    };
    readNow.current = run;
    run("initial");
    const onVisible = () => { if (document.visibilityState === "visible") run("auto"); };
    const onFocus = () => run("auto");
    const onCaseSaved = () => run("asked");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("nzamy-workflow-updated", onCaseSaved);
    return () => {
      alive = false;
      // A read cut short by unmount must not block the next mount's read.
      inFlight.current = false;
      readNow.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("nzamy-workflow-updated", onCaseSaved);
    };
  }, []);
  const refresh = useCallback(() => readNow.current?.("asked"), []);

  const graph = read?.graph;

  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);
  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of graph?.edges ?? []) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [graph]);

  const q = normalizePartyName(query);
  const isShown = useCallback((n: OfficeNode | undefined) => !!n && shown[n.kind], [shown]);

  const rfNodes = useMemo<OfficeFlowNode[]>(() => {
    if (!graph) return [];
    const focus = selected ? new Set([selected, ...(neighbours.get(selected) ?? [])]) : null;
    return graph.nodes.map((n) => {
      const hit = !!q && normalizePartyName(n.label).includes(q);
      const dimmed = (focus !== null && !focus.has(n.id)) || (!!q && !hit);
      return {
        id: n.id,
        type: "office" as const,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { node: n, isDark, dimmed, hit, chosen: n.id === selected },
        hidden: !shown[n.kind],
        selected: n.id === selected,
        measured: measured[n.id],
        ariaLabel: `${KIND_AR[n.kind]}: ${n.label}${n.nameClash ? " — تشابه اسم" : ""}`,
        width: OFFICE_NODE_W,
      };
    });
  }, [graph, positions, measured, shown, selected, neighbours, q, isDark]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    const focus = selected ? new Set([selected, ...(neighbours.get(selected) ?? [])]) : null;
    const neutral = isDark ? "#71717a" : "#94a3b8";
    return graph.edges.map((e, i) => {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      // Edges leave the side facing the other card (columns run right to left).
      const leftward = !!a && !!b && b.x < a.x;
      const sameColumn = !!a && !!b && a.x === b.x;
      const stroke =
        e.relation === "same_name" ? "#f59e0b"
          : e.relation === "opponent" ? (isDark ? "#fb7185" : "#e11d48")
          : e.relation === "client" ? neutral
          : kindColors(RELATION_KIND[e.relation], isDark).stroke;
      const lit = !focus || (focus.has(e.from) && focus.has(e.to));
      return {
        id: `e${i}:${e.from}>${e.to}:${e.relation}`,
        source: e.from,
        target: e.to,
        sourceHandle: sameColumn ? "sl" : leftward ? "sl" : "sr",
        targetHandle: sameColumn ? "tl" : leftward ? "tr" : "tl",
        hidden: !isShown(nodeById.get(e.from)) || !isShown(nodeById.get(e.to)),
        focusable: false,
        style: {
          stroke,
          strokeWidth: e.relation === "same_name" ? 2 : 1.4,
          strokeDasharray: e.relation === "same_name" ? "6 4" : e.relation === "opponent" ? "3 3" : undefined,
          opacity: lit ? 0.85 : 0.1,
        },
      };
    });
  }, [graph, positions, selected, neighbours, isDark, isShown, nodeById]);

  const onNodesChange = useCallback((changes: NodeChange<OfficeFlowNode>[]) => {
    let dims: Record<string, { width: number; height: number }> | null = null;
    let moved: Map<string, Point> | null = null;
    for (const ch of changes) {
      // Click, or Enter on a focused card: one selected node drives the side panel.
      if (ch.type === "select") {
        if (ch.selected) setSelected(ch.id);
        else setSelected((s) => (s === ch.id ? null : s));
      } else if (ch.type === "dimensions" && ch.dimensions) {
        dims = { ...(dims ?? {}), [ch.id]: { width: ch.dimensions.width, height: ch.dimensions.height } };
      } else if (ch.type === "position" && ch.position) {
        moved = moved ?? new Map();
        moved.set(ch.id, { x: ch.position.x, y: ch.position.y });
      }
    }
    if (dims) setMeasured((m) => ({ ...m, ...dims }));
    if (moved) {
      const next = new Map(drawnPositions.current);
      for (const [id, p] of moved) next.set(id, p);
      drawnPositions.current = next;
      setPositions(next);
    }
  }, []);

  // Hiding or showing a type re-fits the view to what is left on the map.
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    void rf.fitView({ padding: 0.18, duration: 300 });
  }, [shown, rf]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = `rounded-2xl border ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`;

  if (state === "loading") {
    return <p className={`flex items-center gap-2 p-6 text-sm ${muted}`}><CircleNotch size={16} className="animate-spin" /> جارٍ قراءة قضايا المكتب وموكّليه...</p>;
  }
  if (state === "error" || !graph || !read) {
    return (
      <div className={`${card} flex items-center gap-2 p-6 text-sm ${isDark ? "text-red-400" : "text-red-700"}`}>
        <Warning size={16} /> تعذّرت قراءة خريطة القضايا. أعد تحميل الصفحة.
      </div>
    );
  }

  const sel = selected ? nodeById.get(selected) ?? null : null;
  const hrefOf = (n: OfficeNode): string | null => {
    const l = n.link;
    if (!l) return null;
    const id = l.id ? encodeURIComponent(l.id) : "";
    switch (l.kind) {
      case "case": return id ? `/dashboard/${base}/cases/${id}` : null;
      case "client": return id ? `/dashboard/${base}/clients/${id}` : null;
      case "contract": return id ? `/dashboard/${base}/contracts/${id}` : null;
      case "consultation": return id ? `/dashboard/${base}/consultations/${id}` : null;
      case "hearings": return `/dashboard/${base}/hearings`;
      case "tasks": return `/dashboard/${base}/tasks`;
      case "finance": return `/dashboard/${base}/finance`;
    }
  };
  const OPEN_AR: Record<OfficeNodeKind, string> = {
    case: "فتح ملف القضية",
    client: "فتح ملف الموكّل",
    opponent: "",
    contract: "فتح العقد",
    consultation: "فتح الاستشارة",
    hearing: "فتح جدول الجلسات",
    task: "فتح المهام",
    fee: "فتح المالية",
  };
  const caseTitle = (id: string) => nodeById.get(`case:${id}`)?.label ?? id;
  const counts = Object.fromEntries(OFFICE_NODE_KINDS.map((k) => [k, graph.nodes.filter((n) => n.kind === k).length])) as Record<OfficeNodeKind, number>;
  const visibleCount = graph.nodes.filter((n) => shown[n.kind]).length;
  const otherCuts = (["contracts", "consultations", "hearings", "tasks", "invoices"] as const).filter((k) => read.truncated[k]);
  const CUT_AR = { contracts: "العقود", consultations: "الاستشارات", hearings: "الجلسات", tasks: "المهام", invoices: "الفواتير" } as const;
  const unlinked = graph.unlinked ?? { contracts: 0, consultations: 0 };
  const selNeighbours = sel ? [...(neighbours.get(sel.id) ?? [])].map((id) => nodeById.get(id)).filter((n): n is OfficeNode => !!n) : [];
  const fitAll = () => void rf.fitView({ padding: 0.18, duration: 400 });
  const findHits = () => {
    if (!q) return;
    const ids = graph.nodes.filter((n) => shown[n.kind] && normalizePartyName(n.label).includes(q)).map((n) => ({ id: n.id }));
    if (ids.length) void rf.fitView({ nodes: ids, padding: 0.4, duration: 400, maxZoom: 1.2 });
  };
  const goTo = (id: string) => {
    setSelected(id);
    void rf.fitView({ nodes: [{ id }], padding: 0.6, duration: 400, maxZoom: 1.1 });
  };

  return (
    <div className="space-y-4">
      {refreshFailed && (
        <p role="status" className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
          تعذّر تحديث الخريطة — المعروض آخر قراءة ناجحة. اضغط «تحديث» للمحاولة مجدداً.
        </p>
      )}
      {read.partial.length > 0 && (
        <p role="status" className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
          تعذّرت قراءة {read.partial.join("، ")} — غير مرسومة على الخريطة الآن. اضغط «تحديث» للمحاولة مجدداً.
        </p>
      )}
      {(read.truncated.cases || read.truncated.clients) && (
        <p className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          الخريطة تعرض أحدث {toArabicDigits(read.caps.cases)} قضية و{toArabicDigits(read.caps.clients)} موكّلاً فقط؛ ما بعدها غير مرسوم.
        </p>
      )}
      {otherCuts.length > 0 && (
        <p className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          بلغت {otherCuts.map((k) => CUT_AR[k]).join(" و")} حدّ القراءة؛ الأقدم منها غير مرسوم.
        </p>
      )}

      <div className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 p-3`}>
        <label className={`flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border px-3 py-1.5 ${isDark ? "border-white/10 bg-zinc-800" : "border-slate-200 bg-slate-50"}`}>
          <MagnifyingGlass size={14} className={muted} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 120))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); findHits(); } }}
            placeholder="ابحث باسم قضية أو موكّل أو طرف... (Enter للانتقال)"
            aria-label="بحث في الخريطة"
            className={`w-full bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder-zinc-500" : "text-slate-700 placeholder-slate-400"}`}
          />
        </label>
        <div className="ms-auto flex items-center gap-1">
          <button type="button" onClick={fitAll} aria-label="ملاءمة العرض"
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold ${isDark ? "text-zinc-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}>
            <CornersOut size={14} /> ملاءمة
          </button>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="تحديث الخريطة"
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold disabled:opacity-60 ${isDark ? "text-zinc-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}>
            <ArrowClockwise size={14} className={refreshing ? "animate-spin" : undefined} /> تحديث
          </button>
        </div>
        <fieldset className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5">
          <legend className="sr-only">إظهار وإخفاء الأنواع</legend>
          {OFFICE_NODE_KINDS.map((k) => {
            const c = kindColors(k, isDark);
            return (
              <label key={k} className={`flex cursor-pointer items-center gap-1.5 text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"} ${counts[k] === 0 ? "opacity-50" : ""}`}>
                <input type="checkbox" checked={shown[k]} onChange={() => setShown((s) => ({ ...s, [k]: !s[k] }))} className="h-3.5 w-3.5" />
                <span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ background: c.fill, borderColor: c.stroke }} />
                {KIND_PLURAL_AR[k]} ({toArabicDigits(counts[k])})
              </label>
            );
          })}
        </fieldset>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className={`${card} relative h-[640px] overflow-hidden`}>
          {graph.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <TreeStructure size={36} className={isDark ? "text-zinc-700" : "text-slate-300"} />
              <p className={`text-sm ${muted}`}>لا قضايا ولا موكّلين في سجلاتك بعد.</p>
              <p className={`text-[12px] ${muted}`}>أضف قضية أو موكّلاً، وستظهر هنا مع عقودها وجلساتها ومهامها.</p>
            </div>
          ) : (
            <div dir="ltr" className="h-full w-full" aria-label="خريطة القضايا والموكّلين والأطراف">
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onPaneClick={() => setSelected(null)}
                nodesConnectable={false}
                edgesFocusable={false}
                multiSelectionKeyCode={null}
                selectionKeyCode={null}
                zoomOnDoubleClick={false}
                onlyRenderVisibleElements
                fitView
                fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
                minZoom={0.1}
                maxZoom={2}
                colorMode={isDark ? "dark" : "light"}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={isDark ? "#27272a" : "#cbd5e1"} />
                <Controls position="top-left" showInteractive={false} />
                <MiniMap
                  position="bottom-right"
                  pannable
                  zoomable
                  ariaLabel="خريطة مصغّرة"
                  maskColor={isDark ? "rgba(6,6,8,0.7)" : "rgba(241,245,249,0.7)"}
                  style={{ width: 168, height: 112, borderRadius: 12, border: `1px solid ${isDark ? "#27272a" : "#e2e8f0"}` }}
                  nodeColor={(n) => {
                    const k = (n.data as OfficeNodeData | undefined)?.node.kind;
                    return k ? kindColors(k, isDark).stroke : "#94a3b8";
                  }}
                  nodeStrokeWidth={0}
                />
              </ReactFlow>
              {visibleCount === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center" dir="rtl">
                  <p className={`text-sm ${muted}`}>كل الأنواع مخفية — فعّل نوعاً من الفلاتر أعلاه.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {sel && (
            <div className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold" style={{ color: kindColors(sel.kind, isDark).stroke }}>{KIND_AR[sel.kind]}</p>
                  <p className={`mt-0.5 break-words text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{sel.label}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="إغلاق التفاصيل"
                  className={`shrink-0 rounded-lg p-1 ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
                  <X size={14} />
                </button>
              </div>
              {sel.nameClash && (
                <p className={`mt-2 rounded-lg px-2 py-1 text-[11px] ${isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800"}`}>⚠ تشابه اسم — راجِع قائمة تشابه الأسماء أدناه.</p>
              )}
              {(sel.facts ?? []).length > 0 && (
                <dl className="mt-3 space-y-1.5 text-[12px]">
                  {(sel.facts ?? []).map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-3">
                      <dt className={muted}>{f.label}</dt>
                      <dd className={`text-end font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {hrefOf(sel) && OPEN_AR[sel.kind] && (
                <Link href={hrefOf(sel)!} className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#C8A762] hover:underline">
                  <ArrowSquareOut size={13} /> {OPEN_AR[sel.kind]}
                </Link>
              )}
              {selNeighbours.length > 0 && (
                <div className="mt-3">
                  <p className={`text-[11px] ${muted}`}>مرتبط بـ {toArabicDigits(selNeighbours.length)} عنصر على الخريطة</p>
                  <ul className="mt-1.5 max-h-56 space-y-1 overflow-auto">
                    {selNeighbours.map((n) => {
                      const href = hrefOf(n);
                      return (
                        <li key={n.id} className="flex items-center gap-2 text-[12px]">
                          <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: kindColors(n.kind, isDark).stroke }} />
                          <button type="button" onClick={() => goTo(n.id)} className={`min-w-0 flex-1 truncate text-start hover:underline ${isDark ? "text-zinc-200" : "text-slate-700"}`} title={n.label}>
                            {KIND_AR[n.kind]}: {n.label}
                          </button>
                          {href && (
                            <Link href={href} aria-label={`${OPEN_AR[n.kind] || "فتح"}: ${n.label}`} className="shrink-0 text-[#C8A762]">
                              <ArrowSquareOut size={12} />
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className={`${card} p-4`}>
            <p className={`flex items-center gap-1.5 text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
              <Warning size={14} className="text-amber-500" /> تشابه أسماء ({toArabicDigits(graph.clashes.length)})
            </p>
            <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
              اسم مسجّل موكّلاً في ملف وطرفاً آخر في ملف (أو الملف نفسه)، بعد توحيد الإملاء. تنبيه للتحقق، لا حكم بوجود تعارض، ويقتصر على ما في سجلاتك.
            </p>
            {graph.clashes.length === 0 ? (
              <p className={`mt-3 text-[12px] ${muted}`}>لا تشابه أسماء في سجلاتك.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {graph.clashes.map((c) => (
                  <li key={c.name} className={`rounded-xl border p-2.5 text-[12px] ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>«{c.name}» — تحقّق</p>
                    {c.clientIn.length > 0 && (
                      <p className={isDark ? "text-zinc-300" : "text-slate-700"}>موكّل في: {c.clientIn.map(caseTitle).join("، ")}</p>
                    )}
                    {c.clientIn.length === 0 && c.clientCardIds.length > 0 && (
                      <p className={isDark ? "text-zinc-300" : "text-slate-700"}>له بطاقة موكّل في سجلاتك</p>
                    )}
                    <p className={isDark ? "text-zinc-300" : "text-slate-700"}>طرف آخر في: {c.opponentIn.map(caseTitle).join("، ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className={`text-[11px] leading-relaxed ${muted}`}>
            الخريطة للقراءة فقط وتُبنى من قضاياك وقضايا مكتبك التي تملك صلاحية قراءتها. الخصوم يظهرون فقط حين يسجّلهم ملف القضية.
            تظهر الجلسات القادمة والمهام المفتوحة لكل قضية (أقربها موعداً)، والأتعاب من الفواتير التي تملك قراءتها.
            {(unlinked.contracts > 0 || unlinked.consultations > 0) && (
              <> لا تظهر {[unlinked.contracts > 0 ? `${toArabicDigits(unlinked.contracts)} عقد` : "", unlinked.consultations > 0 ? `${toArabicDigits(unlinked.consultations)} استشارة` : ""].filter(Boolean).join(" و")} غير مرتبطة بموكّل أو قضية على الخريطة.</>
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
