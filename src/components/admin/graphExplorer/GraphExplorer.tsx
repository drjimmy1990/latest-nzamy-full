"use client";

/**
 * GraphExplorer.tsx — «مستكشف الجراف القانوني» (/dashboard/admin/graph-explorer).
 *
 * Aesthetic: a gilded archive observatory. Ink canvas, gold as the one accent,
 * every node an index card whose spine colour is its type, faint orbit rings
 * marking hop distance from the centre of attention.
 *
 * Interactions: click = inspect, double-click = make it the centre, «توسيع» =
 * add its neighbours without leaving the centre, legend chips hide link or node
 * types, history back/forward, depth and size controls, JSON export,
 * fullscreen, and a retrieval lab that draws what a real question would cite.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  Panel,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Graph, ArrowRight, ArrowLeft, ArrowsOut, ArrowsIn, Crosshair, DownloadSimple, ArrowsClockwise,
  CircleNotch, Warning, GearSix, Flask, X, Columns, CircleDashed,
} from "@phosphor-icons/react";
import {
  EDGE_TYPE_META,
  EXPLORER_EDGE_TYPES,
  EXPLORER_NODE_TYPES,
  NODE_TYPE_META,
  QUERY_NODE_KEY,
  buildLabGraph,
  edgeId,
  isExplorerEdgeType,
  layoutExpansion,
  layoutLanes,
  layoutRadial,
  mergeNeighborhoods,
  type ExplorerGraph,
  type ExplorerNode,
  type LaneLabel,
  type XY,
} from "@/lib/ai/graphExplorerCore";
import {
  FloatingEdge,
  LaneLabelNode,
  LegalNodeCard,
  OrbitsNode,
  QueryNode,
  LAB_MATCH_COLOR,
  type FloatingEdgeData,
} from "./canvasElements";
import ExplorerSidebar, { type SidebarTab } from "./ExplorerSidebar";
import NodeInspector, { type InspectorConnection } from "./NodeInspector";
import { explorerApi, type EdgeCounts, type LabResult, type NodeDetail, type OverviewData } from "./explorerApi";

const nodeTypes: NodeTypes = { legal: LegalNodeCard, query: QueryNode, orbits: OrbitsNode, lane: LaneLabelNode };
const edgeTypes: EdgeTypes = { floating: FloatingEdge };

const ORBITS_ID = "__orbits__";
const LIMITS = [30, 60, 120, 200] as const;

type Size = { width: number; height: number };
type LayoutMode = "lanes" | "radial";

/** Positions (card centres) and, for the lanes layout, the column headings. */
function computeLayout(mode: LayoutMode, center: string, g: ExplorerGraph): { centers: Record<string, XY>; lanes: LaneLabel[] } {
  if (mode === "radial") return { centers: Object.fromEntries(layoutRadial(center, g.nodes, g.edges)), lanes: [] };
  const { positions, lanes } = layoutLanes(center, g.nodes, g.edges);
  return { centers: Object.fromEntries(positions), lanes };
}

/** Card footprint before React Flow has measured it (centre card is wider). */
function estimatedSize(n: ExplorerNode, isCenter: boolean): Size {
  if (n.node_type === "query") return { width: 176, height: 176 };
  return isCenter ? { width: 284, height: 116 } : { width: 232, height: 80 };
}

export default function GraphExplorer() {
  return (
    <ReactFlowProvider>
      <ExplorerInner />
    </ReactFlowProvider>
  );
}

function ExplorerInner() {
  const rf = useReactFlow();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusSeq = useRef(0);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [schemaMissing, setSchemaMissing] = useState<string | null>(null);
  const [graph, setGraph] = useState<ExplorerGraph>({ nodes: [], edges: [] });
  const [centerKey, setCenterKey] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ total: number; truncated: boolean; counts: EdgeCounts } | null>(null);
  const [centers, setCenters] = useState<Record<string, XY>>({});
  const [lanes, setLanes] = useState<LaneLabel[]>([]);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("lanes");
  const [measured, setMeasured] = useState<Record<string, Size>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [limit, setLimit] = useState<number>(60);
  const [hiddenEdges, setHiddenEdges] = useState<ReadonlySet<string>>(new Set());
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<SidebarTab>("start");
  const [mode, setMode] = useState<"explore" | "lab">("explore");
  const [lab, setLab] = useState<LabResult | null>(null);
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [labRanks, setLabRanks] = useState<ReadonlyMap<string, number>>(new Map());
  const [fullscreen, setFullscreen] = useState(false);

  const fitSoon = useCallback(
    (padding = 0.14) => {
      setTimeout(() => rf.fitView({ padding, duration: 650, maxZoom: 1.1, minZoom: 0.42 }), 90);
    },
    [rf],
  );

  // ── data loading ───────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (key: string) => {
    if (key === QUERY_NODE_KEY) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    const res = await explorerApi.node(key);
    setDetailLoading(false);
    if (res.ok && res.data?.found) setDetail(res.data);
    else setDetail(null);
  }, []);

  const focus = useCallback(
    async (key: string, opts: { push?: boolean; depth?: 1 | 2; limit?: number; layout?: LayoutMode } = {}) => {
      const mine = ++focusSeq.current;
      setLoading(true);
      setError(null);
      const res = await explorerApi.neighborhood(key, opts.depth ?? depth, opts.limit ?? limit);
      if (mine !== focusSeq.current) return;
      setLoading(false);
      if (!res.ok) {
        if (res.schemaMissing) setSchemaMissing(res.migration ?? "20261113_10_library_graph_explorer.sql");
        else setError(res.error);
        return;
      }
      if (!res.data.found) {
        setError("هذه العقدة غير موجودة في الجراف (ربما حُذفت في آخر مزامنة).");
        return;
      }
      const g: ExplorerGraph = { nodes: res.data.nodes, edges: res.data.edges };
      const laid = computeLayout(opts.layout ?? layoutMode, key, g);
      setGraph(g);
      setCenters(laid.centers);
      setLanes(laid.lanes);
      setCenterKey(key);
      setMeta({ total: res.data.total_center_edges, truncated: res.data.truncated, counts: res.data.center_edge_counts });
      setSelectedKey(key);
      setMode("explore");
      setLabRanks(new Map());
      setTitles((t) => ({ ...t, ...Object.fromEntries(g.nodes.map((n) => [n.node_key, n.title])) }));
      if (opts.push !== false) {
        setHistory((h) => {
          const stack = [...h.stack.slice(0, h.index + 1), key].slice(-30);
          return { stack, index: stack.length - 1 };
        });
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("key", key);
        window.history.replaceState(null, "", url.toString());
      }
      void loadDetail(key);
      fitSoon();
    },
    [depth, limit, layoutMode, loadDetail, fitSoon],
  );

  const expand = useCallback(
    async (key: string) => {
      if (key === QUERY_NODE_KEY) return;
      setLoading(true);
      const res = await explorerApi.neighborhood(key, 1, Math.min(limit, 60));
      setLoading(false);
      if (!res.ok || !res.data.found) {
        setError(res.ok ? "تعذّر توسيع هذه العقدة" : res.error);
        return;
      }
      const extra: ExplorerGraph = { nodes: res.data.nodes, edges: res.data.edges };
      setGraph((g) => mergeNeighborhoods(g, extra));
      setCenters((prev) => {
        const placed = layoutExpansion(key, extra.nodes.map((n) => n.node_key), new Map(Object.entries(prev)));
        return { ...prev, ...Object.fromEntries(placed) };
      });
      setTitles((t) => ({ ...t, ...Object.fromEntries(extra.nodes.map((n) => [n.node_key, n.title])) }));
      fitSoon(0.12);
    },
    [limit, fitSoon],
  );

  const select = useCallback(
    (key: string | null, pan = false) => {
      setSelectedKey(key);
      if (!key) return;
      void loadDetail(key);
      const c = centers[key];
      if (pan && c) rf.setCenter(c.x, c.y, { zoom: Math.max(rf.getZoom(), 0.85), duration: 500 });
    },
    [centers, loadDetail, rf],
  );

  const showLabGraph = useCallback(
    (result: LabResult) => {
      const g = buildLabGraph(result.question, result.hits);
      setGraph({ nodes: g.nodes, edges: g.edges });
      setCenters(Object.fromEntries(layoutRadial(QUERY_NODE_KEY, g.nodes, g.edges)));
      setLanes([]);
      setCenterKey(QUERY_NODE_KEY);
      setLabRanks(g.ranks);
      setMeta(null);
      setSelectedKey(null);
      setDetail(null);
      setMode("lab");
      fitSoon();
    },
    [fitSoon],
  );

  const runLab = useCallback(
    async (question: string, keywords: string) => {
      setLabLoading(true);
      setLabError(null);
      const res = await explorerApi.retrieve(question.trim(), keywords);
      setLabLoading(false);
      if (!res.ok) {
        if (res.schemaMissing) setSchemaMissing(res.migration ?? "20261113_10_library_graph_explorer.sql");
        setLabError(res.error);
        return;
      }
      setLab(res.data);
      if (res.data.hits.length > 0) showLabGraph(res.data);
    },
    [showLabGraph],
  );

  // First paint: overview, then a deep-linked node if the URL names one.
  useEffect(() => {
    let alive = true;
    explorerApi.overview().then((res) => {
      if (!alive) return;
      if (res.ok) setOverview(res.data);
      else if (res.schemaMissing) setSchemaMissing(res.migration ?? "20261113_10_library_graph_explorer.sql");
      else setError(res.error);
    });
    const key = new URLSearchParams(window.location.search).get("key");
    const t = key ? setTimeout(() => void focus(key), 0) : null;
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first paint only
  }, []);

  // Keyboard: "/" search, Esc clear selection / leave fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setTab("search");
        setTimeout(() => searchRef.current?.focus(), 30);
      } else if (e.key === "Escape") {
        if (typing) (e.target as HTMLElement).blur();
        setSelectedKey(null);
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── derived canvas state ───────────────────────────────────────────────────
  const visibleKeys = useMemo(
    () => new Set(graph.nodes.filter((n) => n.node_type === "query" || !hiddenTypes.has(n.node_type)).map((n) => n.node_key)),
    [graph.nodes, hiddenTypes],
  );
  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => !hiddenEdges.has(e.edge_type) && visibleKeys.has(e.source) && visibleKeys.has(e.target)),
    [graph.edges, hiddenEdges, visibleKeys],
  );
  const attention = hoverKey ?? (selectedKey !== centerKey ? selectedKey : null);
  const neighbours = useMemo(() => {
    if (!attention) return null;
    const s = new Set<string>([attention]);
    for (const e of visibleEdges) {
      if (e.source === attention) s.add(e.target);
      if (e.target === attention) s.add(e.source);
    }
    return s;
  }, [attention, visibleEdges]);

  const rfNodes = useMemo<Node[]>(() => {
    const list: Node[] = [];
    const ring1 = graph.nodes.filter((n) => n.hop === 1 && centers[n.node_key]);
    const ring2 = graph.nodes.filter((n) => n.hop >= 2 && centers[n.node_key]);
    const dist = (n: ExplorerNode) => Math.hypot(centers[n.node_key].x, centers[n.node_key].y);
    const radii = [ring1, ring2].filter((r) => r.length > 0).map((r) => Math.round(Math.max(...r.map(dist))));
    if (centerKey && radii.length > 0) {
      const R = Math.max(...radii) + 20;
      list.push({
        id: ORBITS_ID,
        type: "orbits",
        position: { x: -R, y: -R },
        data: { radii },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -10,
        style: { pointerEvents: "none" },
        measured: { width: R * 2, height: R * 2 },
      });
    }
    for (const n of graph.nodes) {
      if (!visibleKeys.has(n.node_key)) continue;
      const c = centers[n.node_key];
      if (!c) continue;
      const isCenter = n.node_key === centerKey;
      const size = measured[n.node_key] ?? estimatedSize(n, isCenter);
      const position = { x: c.x - size.width / 2, y: c.y - size.height / 2 };
      if (n.node_type === "query") {
        list.push({
          id: n.node_key,
          type: "query",
          position,
          data: { title: n.title, hits: n.degree },
          measured: measured[n.node_key],
        });
      } else {
        list.push({
          id: n.node_key,
          type: "legal",
          position,
          data: {
            node: n,
            isCenter,
            isSelected: n.node_key === selectedKey,
            dimmed: neighbours !== null && !neighbours.has(n.node_key),
            rank: labRanks.get(n.node_key),
            enterDelay: Math.min(n.hop, 2) * 90,
          },
          measured: measured[n.node_key],
          zIndex: isCenter || n.node_key === selectedKey ? 5 : 1,
        });
      }
    }
    return list;
  }, [graph.nodes, centers, centerKey, measured, visibleKeys, selectedKey, neighbours, labRanks]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      visibleEdges.map((e) => {
        const m = e.edge_type === "MATCH" ? null : EDGE_TYPE_META[e.edge_type];
        const color = m?.color ?? LAB_MATCH_COLOR;
        const touches = attention !== null && (e.source === attention || e.target === attention);
        const data: FloatingEdgeData = {
          color,
          label: m?.label ?? "مطابقة",
          dashed: m?.dashed ?? e.edge_type === "MATCH",
          highlighted: touches,
          faded: attention !== null && !touches,
          weight: e.edge_type === "MATCH" ? 1 : e.weight,
        };
        return {
          id: edgeId(e),
          source: e.source,
          target: e.target,
          type: "floating",
          data,
          zIndex: touches ? 4 : 0,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        };
      }),
    [visibleEdges, attention],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let dims: Record<string, Size> | null = null;
      let moved: Record<string, XY> | null = null;
      for (const ch of changes) {
        if (ch.type === "dimensions") {
          if (ch.id === ORBITS_ID || !ch.dimensions) continue;
          dims = { ...(dims ?? {}), [ch.id]: { width: ch.dimensions.width, height: ch.dimensions.height } };
        } else if (ch.type === "position") {
          if (ch.id === ORBITS_ID || !ch.position) continue;
          const n = graph.nodes.find((x) => x.node_key === ch.id);
          const size = measured[ch.id] ?? (n ? estimatedSize(n, ch.id === centerKey) : { width: 232, height: 80 });
          moved = { ...(moved ?? {}), [ch.id]: { x: ch.position.x + size.width / 2, y: ch.position.y + size.height / 2 } };
        }
      }
      if (dims) setMeasured((m) => ({ ...m, ...dims }));
      if (moved) setCenters((c) => ({ ...c, ...moved }));
    },
    [graph.nodes, measured, centerKey],
  );

  // ── inspector inputs ───────────────────────────────────────────────────────
  const nodeByKey = useMemo(() => new Map(graph.nodes.map((n) => [n.node_key, n])), [graph.nodes]);
  const selectedNode = selectedKey ? (nodeByKey.get(selectedKey) ?? null) : null;
  const connections = useMemo<InspectorConnection[]>(() => {
    if (!selectedKey) return [];
    return visibleEdges
      .filter((e) => e.source === selectedKey || e.target === selectedKey)
      .map((e) => {
        const direction = e.source === selectedKey ? "out" : "in";
        return { edge: e, direction, other: nodeByKey.get(direction === "out" ? e.target : e.source) };
      });
  }, [selectedKey, visibleEdges, nodeByKey]);
  const labHit = useMemo(() => {
    if (mode !== "lab" || !lab || !selectedKey) return null;
    const h = lab.hits.find((x) => x.node_key === selectedKey);
    return h ? { ...h, rank: labRanks.get(h.node_key) ?? 0 } : null;
  }, [mode, lab, selectedKey, labRanks]);

  // ── toolbar actions ────────────────────────────────────────────────────────
  const goHistory = (delta: number) => {
    const index = history.index + delta;
    const key = history.stack[index];
    if (!key) return;
    setHistory((h) => ({ ...h, index }));
    void focus(key, { push: false });
  };
  const relayout = () => {
    if (!centerKey) return;
    setCenters(Object.fromEntries(layoutRadial(centerKey, graph.nodes, graph.edges)));
    fitSoon();
  };
  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ center: centerKey, mode, exported_at: new Date().toISOString(), nodes: graph.nodes, edges: graph.edges }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nzamy-graph-${(centerKey ?? "lab").replace(/[^\w\u0600-\u06FF-]+/g, "_").slice(0, 60)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const toggle = (set: ReadonlySet<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const onCanvasCounts = useMemo(() => {
    const byEdge: Record<string, number> = {};
    for (const e of graph.edges) byEdge[e.edge_type] = (byEdge[e.edge_type] ?? 0) + 1;
    const byNode: Record<string, number> = {};
    for (const n of graph.nodes) byNode[n.node_type] = (byNode[n.node_type] ?? 0) + 1;
    return { byEdge, byNode };
  }, [graph]);

  const totals = useMemo(() => {
    if (!overview) return null;
    const nodes = Object.values(overview.node_counts).reduce((s, n) => s + (n ?? 0), 0);
    const edges = Object.values(overview.edge_counts).reduce((s, n) => s + (n ?? 0), 0);
    const embeddable = Object.values(overview.embeddable_counts).reduce((s, n) => s + (n ?? 0), 0);
    const embedded = Object.values(overview.embedded_counts).reduce((s, n) => s + (n ?? 0), 0);
    return { nodes, edges, coverage: embeddable > 0 ? Math.round((embedded / embeddable) * 100) : 0 };
  }, [overview]);

  const crumbs = history.stack.slice(Math.max(0, history.index - 3), history.index + 1);

  return (
    <div
      dir="rtl"
      className={
        fullscreen
          ? "fixed inset-0 z-[70] flex flex-col bg-[#060608]"
          : "flex h-[calc(100dvh-4.5rem)] min-h-[680px] flex-col bg-[#060608]"
      }
    >
      {/* ── header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#C8A762]/30 bg-[#C8A762]/10">
            <Graph size={20} weight="duotone" className="text-[#C8A762]" />
            <span aria-hidden className="absolute -inset-1 rounded-[18px] border border-[#C8A762]/10" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-[18px] font-black tracking-tight text-white">مستكشف الجراف القانوني</h1>
            <nav aria-label="مسار الاستكشاف" className="flex min-w-0 items-center gap-1 text-[11.5px] text-zinc-500">
              {mode === "lab" ? (
                <span className="text-[#C8A762]">مختبر البحث · {lab?.question.slice(0, 60)}</span>
              ) : crumbs.length === 0 ? (
                <span>العلاقات بين المواد والمبادئ والمراسيم والفقه والمفاهيم</span>
              ) : (
                crumbs.map((k, i) => (
                  <span key={`${k}-${i}`} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <span className="text-zinc-700">‹</span>}
                    <button
                      onClick={() => void focus(k)}
                      className={`max-w-[180px] truncate hover:text-zinc-200 ${k === centerKey ? "font-bold text-zinc-200" : ""}`}
                    >
                      {titles[k] ?? k}
                    </button>
                  </span>
                ))
              )}
            </nav>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {totals && (
            <>
              <Stat label="عقدة" value={totals.nodes.toLocaleString("en-US")} />
              <Stat label="رابط" value={totals.edges.toLocaleString("en-US")} />
              <Stat label="تغطية دلالية" value={`${totals.coverage}%`} gold />
            </>
          )}
          <Link href="/dashboard/admin/ai-usage" className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 font-bold text-zinc-300 hover:border-zinc-600">
            <GearSix size={13} /> المزامنة والنموذج
          </Link>
        </div>
      </header>

      {schemaMissing && (
        <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-100">
          <Warning size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            دوال المستكشف غير موجودة في قاعدة البيانات بعد. خذ نسخة احتياطية من المخطط ثم نفّذ{" "}
            <code dir="ltr" className="rounded bg-black/30 px-1.5 font-mono text-[11.5px]">supabase/migrations/{schemaMissing}</code>. الملف للقراءة فقط ولا يغيّر أي جدول.
          </div>
        </div>
      )}

      {/* ── body: sidebar | canvas | inspector ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:overflow-hidden">
        <aside className="max-h-[46vh] min-h-0 overflow-hidden border-b border-zinc-800/80 bg-[#09090c] lg:max-h-none lg:border-b-0 lg:border-l">
          <ExplorerSidebar
            tab={tab}
            onTab={setTab}
            overview={overview}
            onFocus={(k) => void focus(k)}
            searchInputRef={searchRef}
            lab={lab}
            labLoading={labLoading}
            labError={labError}
            labActive={mode === "lab"}
            onRunLab={(q, kw) => void runLab(q, kw)}
            onShowLab={() => lab && showLabGraph(lab)}
            onLabSelect={(k) => select(k, true)}
          />
        </aside>

        <section
          dir="ltr"
          aria-label="خريطة الجراف"
          className="gx-canvas relative min-h-[60vh] bg-[radial-gradient(ellipse_at_50%_42%,rgba(200,167,98,0.07),transparent_58%)]"
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => n.id !== ORBITS_ID && select(n.id)}
            onNodeDoubleClick={(_, n) => n.id !== ORBITS_ID && n.id !== QUERY_NODE_KEY && void focus(n.id)}
            onNodeMouseEnter={(_, n) => n.id !== ORBITS_ID && setHoverKey(n.id)}
            onNodeMouseLeave={() => setHoverKey(null)}
            onPaneClick={() => setSelectedKey(null)}
            nodesConnectable={false}
            edgesFocusable={false}
            zoomOnDoubleClick={false}
            minZoom={0.08}
            maxZoom={2.2}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1.1} color="#24242b" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              maskColor="rgba(6,6,8,0.75)"
              style={{ background: "#0c0c10", border: "1px solid #27272a", borderRadius: 12, width: 168, height: 112 }}
              nodeColor={(n) => {
                if (n.type === "orbits") return "transparent";
                if (n.type === "query") return "#F2E6C4";
                const t = (n.data as { node?: ExplorerNode }).node?.node_type;
                return t && t !== "query" ? NODE_TYPE_META[t].color : "#71717a";
              }}
              nodeStrokeWidth={0}
            />

            {/* toolbar */}
            <Panel position="top-center">
              <div dir="rtl" className="flex flex-wrap items-center gap-1 rounded-2xl border border-zinc-800 bg-[#0d0d11]/90 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
                <ToolButton label="السابق" disabled={history.index <= 0 || mode === "lab"} onClick={() => goHistory(-1)}>
                  <ArrowRight size={14} />
                </ToolButton>
                <ToolButton label="التالي" disabled={history.index >= history.stack.length - 1 || mode === "lab"} onClick={() => goHistory(1)}>
                  <ArrowLeft size={14} />
                </ToolButton>
                <Divider />
                {mode === "lab" ? (
                  <button
                    onClick={() => (history.stack[history.index] ? void focus(history.stack[history.index], { push: false }) : setMode("explore"))}
                    className="flex items-center gap-1.5 rounded-lg bg-[#C8A762]/12 px-2.5 py-1.5 text-[11.5px] font-bold text-[#C8A762]"
                  >
                    <Flask size={13} /> وضع المختبر <X size={11} />
                  </button>
                ) : (
                  <div className="flex rounded-lg bg-zinc-900 p-0.5 text-[11.5px] font-bold">
                    {([1, 2] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          setDepth(d);
                          if (centerKey) void focus(centerKey, { push: false, depth: d });
                        }}
                        className={`rounded-md px-2.5 py-1 ${depth === d ? "bg-[#C8A762] text-black" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        {d === 1 ? "جوار مباشر" : "حلقتان"}
                      </button>
                    ))}
                  </div>
                )}
                {mode === "explore" && (
                  <label className="flex items-center gap-1.5 px-1 text-[11px] text-zinc-400">
                    حتى
                    <select
                      value={limit}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setLimit(v);
                        if (centerKey) void focus(centerKey, { push: false, limit: v });
                      }}
                      className="rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-[11px] text-zinc-200"
                    >
                      {LIMITS.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    رابط
                  </label>
                )}
                <Divider />
                <ToolButton label="إعادة الترتيب" onClick={relayout} disabled={!centerKey}>
                  <ArrowsClockwise size={14} />
                </ToolButton>
                <ToolButton label="ملاءمة العرض" onClick={() => rf.fitView({ padding: 0.16, duration: 500 })} disabled={!centerKey}>
                  <Crosshair size={14} />
                </ToolButton>
                <ToolButton label="تصدير JSON" onClick={exportJson} disabled={graph.nodes.length === 0}>
                  <DownloadSimple size={14} />
                </ToolButton>
                <ToolButton label={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"} onClick={() => setFullscreen((v) => !v)}>
                  {fullscreen ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
                </ToolButton>
                {loading && <CircleNotch size={15} className="mx-1 animate-spin text-[#C8A762]" />}
              </div>
            </Panel>

            {(meta?.truncated || error) && (
              <Panel position="top-center" style={{ marginTop: 64 }}>
                <div dir="rtl" className={`rounded-xl border px-3 py-1.5 text-[11.5px] ${error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-zinc-700 bg-zinc-900/90 text-zinc-300"}`}>
                  {error ??
                    `يعرض ${limit} من ${meta?.total.toLocaleString("en-US")} رابطاً لهذا المركز — الأهم أولاً (استثناء، تعديل، تفسير…). زد الحد لرؤية المزيد.`}
                </div>
              </Panel>
            )}

            {/* legend */}
            {graph.nodes.length > 0 && (
              <Panel position="bottom-center">
                <div dir="rtl" className="flex max-w-[680px] flex-wrap items-center justify-center gap-1 rounded-2xl border border-zinc-800 bg-[#0d0d11]/90 p-1.5 backdrop-blur-md">
                  {EXPLORER_NODE_TYPES.filter((t) => onCanvasCounts.byNode[t]).map((t) => {
                    const off = hiddenTypes.has(t);
                    const c = NODE_TYPE_META[t].color;
                    return (
                      <button
                        key={t}
                        onClick={() => setHiddenTypes((s) => toggle(s, t))}
                        aria-pressed={!off}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${off ? "text-zinc-600 line-through" : "text-zinc-200 hover:bg-zinc-800"}`}
                      >
                        <span className="h-2 w-2 rounded-[3px]" style={{ background: off ? "#3f3f46" : c }} />
                        {NODE_TYPE_META[t].label} <span className="font-mono font-normal text-zinc-500">{onCanvasCounts.byNode[t]}</span>
                      </button>
                    );
                  })}
                  <Divider />
                  {EXPLORER_EDGE_TYPES.filter((t) => onCanvasCounts.byEdge[t]).map((t) => {
                    const off = hiddenEdges.has(t);
                    const m = EDGE_TYPE_META[t];
                    const all = meta?.counts[t];
                    return (
                      <button
                        key={t}
                        title={m.hint}
                        onClick={() => setHiddenEdges((s) => toggle(s, t))}
                        aria-pressed={!off}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${off ? "text-zinc-600 line-through" : "hover:bg-zinc-800"}`}
                        style={off ? undefined : { color: m.color }}
                      >
                        <span className="inline-block h-[2px] w-3.5 rounded" style={{ background: off ? "#3f3f46" : m.color }} />
                        {m.label}
                        <span className="font-mono font-normal text-zinc-500">
                          {onCanvasCounts.byEdge[t]}
                          {all && all.in + all.out > (onCanvasCounts.byEdge[t] ?? 0) ? `/${all.in + all.out}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            )}
          </ReactFlow>

          {graph.nodes.length === 0 && (
            <EmptyState
              overview={overview}
              loading={loading}
              onFocus={(k) => void focus(k)}
              onLab={() => setTab("lab")}
              onSearch={() => {
                setTab("search");
                setTimeout(() => searchRef.current?.focus(), 30);
              }}
            />
          )}
        </section>

        <aside className="min-h-0 border-r border-zinc-800/80 bg-[#09090c]">
          <NodeInspector
            key={selectedKey ?? "none"}
            node={selectedNode}
            detail={detail && detail.node_key === selectedKey ? detail : null}
            loading={detailLoading}
            isCenter={selectedKey === centerKey}
            connections={connections}
            labHit={labHit}
            onFocus={(k) => void focus(k)}
            onExpand={(k) => void expand(k)}
            onSelect={(k) => select(k, true)}
            onClose={() => setSelectedKey(null)}
          />
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <span className={`flex items-baseline gap-1 rounded-lg border px-2.5 py-1.5 ${gold ? "border-[#C8A762]/30 bg-[#C8A762]/[0.07]" : "border-zinc-800 bg-zinc-900/40"}`}>
      <span className={`font-mono text-[12px] font-bold ${gold ? "text-[#C8A762]" : "text-zinc-100"}`}>{value}</span>
      <span className="text-zinc-500">{label}</span>
    </span>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]/50 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-zinc-800" />;
}

function EmptyState({
  overview,
  loading,
  onFocus,
  onLab,
  onSearch,
}: {
  overview: OverviewData | null;
  loading: boolean;
  onFocus: (key: string) => void;
  onLab: () => void;
  onSearch: () => void;
}) {
  const empty = overview && Object.values(overview.node_counts).reduce((s, n) => s + (n ?? 0), 0) === 0;
  return (
    <div dir="rtl" className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto relative max-w-lg text-center">
        <svg aria-hidden width="260" height="260" className="absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 opacity-70">
          {[40, 80, 120].map((r, i) => (
            <circle key={r} cx="130" cy="130" r={r} fill="none" stroke="#C8A762" strokeOpacity={0.22 - i * 0.06} strokeDasharray="2 7" />
          ))}
          <circle cx="130" cy="130" r="5" fill="#C8A762" fillOpacity="0.8" />
        </svg>
        {loading ? (
          <CircleNotch size={28} className="mx-auto animate-spin text-[#C8A762]" />
        ) : empty ? (
          <>
            <h2 className="font-heading text-[20px] font-black text-white">الجراف لم يُبنَ بعد</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
              يبنيه مراقب المزامنة تلقائياً عند تشغيله على الخادم (<span dir="ltr" className="font-mono text-[12px]">nzamy-graph-watchdog</span>). تابع التقدم من صفحة «المزامنة والنموذج».
            </p>
          </>
        ) : (
          <>
            <h2 className="font-heading text-[22px] font-black leading-tight text-white">من أين تبدأ؟</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
              ابحث عن مادة أو مبدأ، أو ابدأ من مفهوم قانوني، أو جرّب سؤالاً حقيقياً في المختبر لترى ما ستستشهد به أدوات الذكاء الاصطناعي.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button onClick={onSearch} className="rounded-xl bg-[#C8A762] px-4 py-2 text-[12.5px] font-black text-black hover:bg-[#d4b87a]">ابحث في الجراف</button>
              <button onClick={onLab} className="rounded-xl border border-[#C8A762]/40 px-4 py-2 text-[12.5px] font-bold text-[#C8A762] hover:bg-[#C8A762]/10">جرّب سؤالاً</button>
            </div>
            {overview && overview.concepts.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-1.5">
                {overview.concepts.slice(0, 8).map((c) => (
                  <button
                    key={c.node_key}
                    onClick={() => onFocus(c.node_key)}
                    className="rounded-full border border-[#7FA8DC]/30 bg-[#7FA8DC]/[0.06] px-3 py-1 text-[11.5px] text-[#a9c4e8] hover:border-[#7FA8DC]/70"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
