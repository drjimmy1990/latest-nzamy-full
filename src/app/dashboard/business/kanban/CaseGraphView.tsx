"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CheckCircle, CircleNotch, Crosshair, Info, LinkSimple, ArrowsOutSimple, Lock, LockOpen, Rows, Export, NotePencil, Warning, FrameCorners, TrashSimple, Palette } from "@phosphor-icons/react";
import {
  EDGE_CONFIG,
  TYPE_CONFIG,
  createCurve,
  createTempCurve,
  type EdgeType,
  type GraphEdge,
  type GraphNode,
  type NodeType,
} from "./_graph-model";
import { useCaseGraphState } from "./_use-case-graph-state";
import { SidebarLauncher, AiAnalysisPanel, OverlaysBundle } from "./CaseGraphOverlays";
import { getCaseGraph, saveCaseGraph } from "@/lib/services/caseGraphService";
import { toArabicDigits } from "@/lib/services/arabicCount";

/** Arabic labels for EDGE_CONFIG's three link styles — the legend below is the
 * only place that names them; the model itself only carries colour/dash. */
const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  support: "علاقة داعمة",
  conflict: "تعارض",
  neutral: "محايدة",
};

export default function CaseGraphView({
  isDark,
  isGlobal,
  initialNodes: seedNodes,
  initialEdges: seedEdges,
  caseId,
}: {
  isDark: boolean;
  isGlobal?: boolean;
  initialNodes?: GraphNode[];
  initialEdges?: GraphEdge[];
  /**
   * `service_requests.id` of the case this board belongs to. When given, the
   * board loads its saved graph from `case_graphs` on mount and autosaves
   * every change back to it (Phase 1, 2026-09-03) — this is what the toolbar
   * chip below used to say could never happen. Omitted on the global
   * multi-case workspace (`isGlobal`) and anywhere else with no single case
   * to key a save on; those keep the honest "not saved" chip.
   */
  caseId?: string;
}) {
  const {
    nodes, setNodes, edges, setEdges,
    drawingEdgeFrom, mousePos, contextMenu, setContextMenu, nodeMenu, setNodeMenu, pan, setPan, isPanning,
    showAiAnalysis, setShowAiAnalysis, isFullscreen, setIsFullscreen,
    edgeDropMenu, setEdgeDropMenu, selectedNodeDetail, setSelectedNodeDetail, selectedNodeId, setSelectedNodeId,
    selectedNodeIds, toggleNodeSelection,
    groups, createGroup, dissolveGroup, toggleGroupLock,
    edgeMenu, setEdgeMenu, handleEdgeContextMenu, updateEdgeStyle,
    aiDocument, setAiDocument, generateAiDocument,
    resizingNode, handleResizeStart,
    hoveredNodeId, setHoveredNodeId, scale, setScale, canvasRef,
    handleCanvasPointerDown, handlePointerDown, handlePointerMove, handlePointerUp, startDrawingEdge, handleNodePointerUp,
    handleContextMenu, handleNodeContextMenu, handleNodeTextChange, handleEdgeLabelChange,
    fitToView,
  } = useCaseGraphState({ initialNodes: seedNodes, initialEdges: seedEdges });

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  // No legend existed for the six node-type colours or the three edge-line
  // styles (EDGE_CONFIG) — a lawyer reading someone else's board had to guess
  // what a colour meant. Off by default so it does not sit on top of a small
  // board; a toolbar button opens it.
  const [showLegend, setShowLegend] = useState(false);

  // ── Persistence (Phase 1: public.case_graphs) ───────────────────────────
  // "loading"  — reading the saved graph, nothing on screen is trustworthy yet
  // "ready"    — read succeeded (found a graph, or confirmed there is none) —
  //              autosave is safe from here on
  // "readError"— the read failed. Autosave STAYS OFF: saving now could
  //              silently overwrite a real saved graph we simply could not
  //              read, with whatever empty/seed state the board opened with.
  const [loadState, setLoadState] = useState<"loading" | "ready" | "readError">(caseId ? "loading" : "ready");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "saveError">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the autosave effect from firing on the very first render after a
  // load — without this, seeding `nodes`/`edges` from the fetched graph would
  // immediately re-save the same data it just read, and a case with no saved
  // graph would autosave an empty board the instant the read confirmed that.
  const skipNextAutosave = useRef(false);
  // Whether the view still needs an automatic fit-to-view. Cleared as soon as
  // a real saved camera position (viewport.pan/scale) is applied below — an
  // autosaved board carries the lawyer's own last framing and auto-fit must
  // never override it. Stays true for a board with no saved viewport at all
  // (brand new, or saved before autosave started persisting one), so the
  // effect further down frames it once nodes exist.
  const needsAutoFit = useRef(true);
  const didAutoFit = useRef(false);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setLoadState("loading");
    getCaseGraph(caseId)
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          skipNextAutosave.current = true;
          setNodes(saved.nodes as GraphNode[]);
          setEdges(saved.edges as GraphEdge[]);
          const vp = saved.viewport as { pan?: { x: number; y: number }; scale?: number } | null;
          if (vp?.pan) setPan(vp.pan);
          if (typeof vp?.scale === "number") setScale(vp.scale);
          if (vp?.pan || typeof vp?.scale === "number") needsAutoFit.current = false;
        }
        setLoadState("ready");
      })
      .catch((err) => {
        console.error("[CaseGraphView] failed to load saved graph:", err);
        if (!cancelled) setLoadState("readError");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNodes/setEdges/setPan/setScale are stable setters from useState/useCaseGraphState
  }, [caseId]);

  // Fit-to-view, once, the first time this board actually has cards on it and
  // no saved camera position needs preserving (see `needsAutoFit` above). This
  // is what recovers a card the owner's shot 05 found clipped against the
  // canvas edge with no way back except manual panning or the fullscreen
  // toggle. `fitToView` itself, and a matching toolbar button, live in
  // ./_use-case-graph-state.ts.
  useEffect(() => {
    if (didAutoFit.current) return;
    if (caseId && loadState !== "ready") return;
    if (!needsAutoFit.current) { didAutoFit.current = true; return; }
    if (nodes.length === 0) return;
    didAutoFit.current = true;
    fitToView();
  }, [caseId, loadState, nodes.length, fitToView]);

  useEffect(() => {
    if (!caseId || loadState !== "ready") return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("saving");
      saveCaseGraph(caseId, { nodes, edges, viewport: { pan, scale } })
        .then(() => setSaveState("saved"))
        .catch((err) => {
          console.error("[CaseGraphView] autosave failed:", err);
          setSaveState("saveError");
        });
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [caseId, loadState, nodes, edges, pan, scale]);

  // `isWorkspaceEmpty` gates the LAUNCHER, and the launcher is a global-workspace
  // affordance only — keep it off the case-file mounts. Since the seed fallback
  // became empty (see ./_use-case-graph-state.ts), a case-file board also starts
  // with nothing on it, so the canvas needs its own empty hint: `isBoardEmpty`.
  const isWorkspaceEmpty = isGlobal && nodes.length === 0;
  const isBoardEmpty = nodes.length === 0;

  return (
    <div className={`flex h-full w-full relative ${isFullscreen ? "fixed inset-0 z-[120]" : ""}`}>
      {/* ── Sidebar Launcher (Only shown if global & empty) ── */}
      <SidebarLauncher
        isDark={isDark}
        isWorkspaceEmpty={isWorkspaceEmpty}
        setNodes={setNodes}
      />

      {/* ── Main Canvas Area ── */}
      <div 
        className={`flex-1 relative overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {isWorkspaceEmpty ? (
          <div className="absolute inset-0 flex items-center justify-center opacity-40">
             <div className="text-center">
               <Crosshair size={64} className={`mx-auto mb-4 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
               <p className={`text-xl font-bold font-brand ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>مساحة العمل فارغة</p>
               <p className={`text-sm mt-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>اختر من القائمة إعداد لوحة جديدة، أو اضغط بالزر الأيمن للبدء حرّاً</p>
             </div>
          </div>
        ) : (
          <>
            {/* Background Dots Pattern */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `radial-gradient(${isDark ? '#ffffff' : '#0c0f12'} 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
                backgroundPosition: `${pan.x}px ${pan.y}px`
              }}
            />

            {/* An empty board is now the honest starting point for a case file, so
                it needs to say how to fill it. pointer-events-none: the right-click
                this text asks for must reach the canvas underneath. */}
            {isBoardEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
                <div className="text-center max-w-sm">
                  <Crosshair size={44} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                  <p className={`text-[14px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لوحة فارغة</p>
                  <p className={`text-[12px] mt-1.5 leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    اضغط بالزر الأيمن على المساحة لإضافة بطاقة. المنصة لا تضيف أي بطاقات من عندها.
                  </p>
                </div>
              </div>
            )}
            
            {/* Top Toolbar */}
            <div className={`absolute top-4 start-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border p-1.5 shadow-sm max-w-[calc(100%-2rem)] ${isDark ? "bg-zinc-900/90 border-white/[0.08]" : "bg-white/90 border-zinc-200"}`}>
              {/* Was a static chip reading «غير محفوظة» always — true for
                  every mount before Phase 1 (2026-09-03: public.case_graphs).
                  Now it reflects the real save state when `caseId` is given
                  (autosaves for real), and keeps the honest amber "not saved"
                  label everywhere else — the global multi-case workspace has
                  no single case to key a save on, so nothing there is a lie
                  either. */}
              {!caseId ? (
                <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}
                  title="لا يتم حفظ هذه اللوحة على الخادم — أي تعديل يزول عند مغادرة الصفحة أو الانتقال لتبويب آخر">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> غير محفوظة
                </div>
              ) : loadState === "loading" ? (
                <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                  <CircleNotch size={12} className="animate-spin" /> جارٍ تحميل اللوحة المحفوظة...
                </div>
              ) : loadState === "readError" ? (
                <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"}`}
                  title="تعذّرت قراءة اللوحة المحفوظة — الحفظ التلقائي متوقّف مؤقتاً حتى لا يُكتَب فوق نسخة حقيقية لم نتمكّن من قراءتها">
                  <Warning size={12} weight="fill" /> تعذّرت القراءة — الحفظ متوقّف
                </div>
              ) : saveState === "saving" ? (
                <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                  <CircleNotch size={12} className="animate-spin" /> جارٍ الحفظ...
                </div>
              ) : saveState === "saveError" ? (
                <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"}`}
                  title="آخر تعديل لم يُحفَظ — سيُعاد المحاولة مع أي تعديل جديد">
                  <Warning size={12} weight="fill" /> تعذّر الحفظ
                </div>
              ) : (
                <div className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-2 ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                  <CheckCircle size={12} weight="fill" /> محفوظة
                </div>
              )}
              <div className={`w-px mx-1 my-1 self-stretch ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
              {/* Legend — what the six card colours and three link styles mean.
                  Nothing explained this before; a board built by someone else
                  was unreadable at a glance. */}
              <button onClick={() => setShowLegend(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors text-[12px] border ${showLegend ? (isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#C8A762]/50 bg-amber-50 text-amber-700") : (isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.06]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100")}`}
                title="دليل ألوان وأيقونات البطاقات والروابط">
                <Palette size={14} />
                دليل الرموز
              </button>
              {/* Was a gold «تحليل AI» primary button that spun «جاري التحليل...»
                  for two seconds and then opened this panel. Nothing analysed
                  anything — see ./_use-case-graph-state.ts. The panel itself is
                  honest (it states that the platform does not read the board), so
                  it is kept and reachable, but the button is now labelled for what
                  it opens and opens it immediately. */}
              <button onClick={() => setShowAiAnalysis(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors text-[12px] border ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.06]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`}
                title="ما الذي تفعله المنصة بهذه اللوحة؟">
                <Info size={14} />
                عن التحليل الآلي
              </button>
              {/* Text summary of the user's own cards. Labelled «تصدير مستند»
                  before, which promised a file: nothing is downloaded, the output
                  opens in a panel. */}
              <button
                onClick={() => generateAiDocument(selectedNodeIds.size > 0 ? selectedNodeIds : undefined)}
                disabled={nodes.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors text-[12px] border disabled:opacity-40 ${isDark ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10" : "border-blue-500/40 text-blue-600 hover:bg-blue-50"}`}
                title={selectedNodeIds.size > 0 ? `ملخص نصي لـ ${toArabicDigits(selectedNodeIds.size)} بطاقات مختارة` : "ملخص نصي لكامل اللوحة"}
              >
                <Export size={13} />
                {selectedNodeIds.size > 0 ? `ملخص (${toArabicDigits(selectedNodeIds.size)})` : "ملخص نصي"}
              </button>
              <div className={`w-px mx-1 my-1 self-stretch ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
              {/* Multi-select indicator + Group */}
              {selectedNodeIds.size > 0 && (() => {
                const selectedNodesList = nodes.filter(n => selectedNodeIds.has(n.id));
                const allSameGroup = selectedNodesList.every(n => n.groupId && n.groupId === selectedNodesList[0].groupId);
                const currentGroupId = allSameGroup ? selectedNodesList[0].groupId : null;
                return (
                  <>
                    {selectedNodeIds.size > 1 && (
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${isDark ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-purple-50 text-purple-600 border border-purple-200"}`}>
                        <Rows size={11} /> {toArabicDigits(selectedNodeIds.size)} محدد
                      </div>
                    )}
                    {currentGroupId ? (
                      <button onClick={() => dissolveGroup(currentGroupId)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20" : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"}`}
                        title="فك التجميع">
                        فك التجميع
                      </button>
                    ) : selectedNodeIds.size > 1 ? (
                      <button onClick={createGroup}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "bg-[#C8A762]/10 text-[#C8A762] border border-[#C8A762]/20 hover:bg-[#C8A762]/20" : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"}`}
                        title="تجميع (Ctrl+G)">
                        <LinkSimple size={11} /> تجميع
                      </button>
                    ) : null}
                  </>
                );
              })()}
              {selectedNodeId && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${isDark ? "bg-white/[0.04] text-zinc-400" : "bg-slate-50 text-slate-500"}`}
                  title="اختصارات لوحة المفاتيح متاحة على البطاقة المحددة">
                  <span>📋 نسخ</span><span className="opacity-40">·</span><span>🗑 حذف</span>
                </div>
              )}
              {/* A «مشاركة» button stood here. It opened a dialog offering a
                  snapshot-or-live choice, four permission levels, two redaction
                  toggles and a link — https://nzamy.app/graph/share/abc123... —
                  next to a «نسخ» button and an «إنشاء رابط المشاركة» button, none
                  of which had a handler. No share store exists (the case-sharing
                  route at dashboard/lawyer/cases/[id]/sharing is honestly gated as
                  «قريباً» for the same reason), and this board is not even
                  persisted, so there is nothing a link could point at. Removed
                  rather than relabelled: a lawyer could have read that URL out to a
                  client. */}
              {/* Reframes every card into view — the recovery for a card dragged
                  off-frame that fit-to-view also runs once automatically on
                  load (see the effect above). */}
              <button onClick={fitToView} disabled={nodes.length === 0}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 disabled:pointer-events-none ${isDark ? "hover:bg-white/[0.08] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`}
                title="تأطير كل البطاقات داخل الشاشة">
                <FrameCorners size={15} />
              </button>
              <button onClick={() => setIsFullscreen(f => !f)} className={`p-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.08] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`} title="ملء الشاشة">
                <Crosshair size={15} />
              </button>
              {Math.abs(scale - 1) > 0.05 && (
                <button onClick={() => setScale(1)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors ${isDark ? "bg-white/[0.04] text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:text-zinc-700"}`}
                  title="إعادة التكبير لـ 100٪">
                  {toArabicDigits(Math.round(scale * 100))}٪
                </button>
              )}
            </div>


          {/* INFINITE PAN + SCALE CONTAINER */}
          <div className="absolute inset-0 w-full h-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}>
            {/* SVG Canvas for Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
              {edges.map(edge => {
                const fromNode = nodes.find(n => n.id === edge.from);
                const toNode = nodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;
                
                const path = createCurve(fromNode.pos, toNode.pos);
                const cnf = EDGE_CONFIG[edge.type] || EDGE_CONFIG.support;
                const edgeColor = edge.color || cnf.color;
                const edgeWidth = edge.width || (isDark ? 1.5 : 2);
                
                return (
                  <g key={edge.id}>
                    {/* Invisible wide hit-area for right-click */}
                    <path 
                      d={path} fill="none" stroke="transparent" strokeWidth="12"
                      style={{ cursor: "context-menu", pointerEvents: "stroke" }}
                      onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleEdgeContextMenu(edge.id, ev.clientX, ev.clientY); }}
                    />
                    <path 
                      d={path} 
                      fill="none" 
                      stroke={edgeColor} 
                      strokeWidth={String(edgeWidth)} 
                      className={cnf.dash ? "stroke-dasharray-4" : ""}
                      strokeDasharray={cnf.dash ? "4 4" : "none"}
                      opacity={0.6}
                    />
                  </g>
                );
              })}
              
              {/* Temporary line while drawing */}
              {drawingEdgeFrom && nodes.find(n => n.id === drawingEdgeFrom) && (
                <path 
                  d={createTempCurve(nodes.find(n => n.id === drawingEdgeFrom)!.pos, mousePos)}
                  fill="none"
                  stroke={isDark ? "#ffffff" : "#0c0f12"}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
              )}
            </svg>

            {/* Editable Edge Labels overlay */}
            {edges.map(edge => {
              const fromNode = nodes.find(n => n.id === edge.from);
              const toNode = nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              
              const midX = (fromNode.pos.x + toNode.pos.x + 200) / 2;
              const midY = (fromNode.pos.y + toNode.pos.y + 80) / 2 - 10;
              const cnf = EDGE_CONFIG[edge.type] || EDGE_CONFIG.support;
              
              return (
                <input
                  key={`label_${edge.id}`}
                  style={{ position: 'absolute', left: midX - 60, top: midY - 10, color: cnf.color, zIndex: 15 }}
                  className={`w-[120px] text-center text-[11px] font-bold bg-transparent outline-none border-b border-transparent hover:border-current focus:border-current ${isDark ? "placeholder-zinc-600" : "placeholder-zinc-400"}`}
                  value={edge.label}
                  onChange={(e) => handleEdgeLabelChange(edge.id, e.target.value)}
                  placeholder="الوصف..."
                />
              );
            })}

            {nodes.map(node => {
              const cnf = TYPE_CONFIG[node.type];
              const Icon = cnf.icon;
              const isCustom = node.type === "custom";
              const nodeGroup = node.groupId ? groups.find(g => g.id === node.groupId) : null;
              const isSelected = selectedNodeIds.has(node.id);
              const isHovered = hoveredNodeId === node.id;

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => { handlePointerDown(node.id, e); }}
                  onPointerUp={(e) => handleNodePointerUp(node.id, e)}
                  onContextMenu={(e) => handleNodeContextMenu(node.id, e)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{
                    position: 'absolute',
                    left: Math.max(0, node.pos.x),
                    top: Math.max(0, node.pos.y),
                    width: node.w ? `${node.w}px` : '220px',
                    height: node.h ? `${node.h}px` : undefined,
                    minHeight: '90px',
                    overflow: 'visible',
                    touchAction: 'none',
                    zIndex: isSelected ? 20 : 10,
                    ...(nodeGroup ? {
                      outline: `2px solid ${nodeGroup.color}50`,
                      outlineOffset: nodeGroup.locked ? '3px' : '0px',
                    } : {}),
                  }}
                  className={`node-element rounded-2xl border cursor-grab active:cursor-grabbing shadow-sm transition-shadow
                    ${ isSelected
                        ? "shadow-xl ring-2 ring-[#C8A762]/80 ring-offset-1"
                        : isHovered ? "shadow-md ring-1 ring-black/5" : ""
                    }
                    ${isDark
                      ? (node.customColor || "bg-zinc-900 border-white/[0.08]")
                      : (node.customColor || "bg-white border-zinc-200")
                    }`}
                >
                  {/* ── Card inner layout ── */}
                  <div className="flex flex-col h-full">

                    {/* Header row: icon + title + group pill */}
                    <div className="flex items-start gap-2 px-3 pt-2.5">
                      {/* Icon */}
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setSelectedNodeDetail(node); }}
                        title="عرض التفاصيل"
                        className={`flex-shrink-0 mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center border transition-all hover:scale-110 cursor-pointer ${cnf.bg}`}
                      >
                        <Icon size={14} weight="duotone" className={cnf.text} />
                      </button>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        {node.meta && <span className="block text-[8px] font-bold text-[#C8A762] mb-0.5 truncate">{node.meta}</span>}
                        <input
                          type="text"
                          value={node.title}
                          onChange={e => handleNodeTextChange(node.id, "title", e.target.value)}
                          onPointerDown={e => e.stopPropagation()}
                          placeholder="عنوان..."
                          className={`w-full font-bold text-[12px] bg-transparent outline-none border-b border-transparent focus:border-[#C8A762]/60 cursor-text placeholder-zinc-400 truncate
                            ${node.customColor ? "text-white" : isDark ? "text-zinc-100" : "text-zinc-800"}`}
                        />
                      </div>

                      {/* Group pill — inside card, top-right */}
                      {nodeGroup && (
                        <div
                          className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ background: nodeGroup.color + '20', color: nodeGroup.color }}
                          title={nodeGroup.locked ? "مجموعة مقفولة — انقر لفك" : "مجموعة — انقر للقفل"}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); toggleGroupLock(nodeGroup.id); }}
                        >
                          {nodeGroup.locked ? <Lock size={8} /> : <LockOpen size={8} />}
                        </div>
                      )}
                    </div>

                    {/* Desc textarea */}
                    <div className="relative px-3 pt-1.5 pb-2 flex-1 flex flex-col gap-1.5">
                      <textarea
                        value={node.desc}
                        onChange={e => handleNodeTextChange(node.id, "desc", e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                        placeholder="اكتب التفاصيل..."
                        rows={isCustom ? 3 : 2}
                        className={`w-full text-[10px] leading-relaxed bg-transparent outline-none resize-none cursor-text placeholder-zinc-400 flex-1
                          ${node.customColor ? "text-white/80" : isDark ? "text-zinc-400" : "text-zinc-600"}`}
                      />
                      {/* Notes Field (Sticky Note Style) */}
                      {(() => {
                        const hasContent = !!(node.notes && node.notes.length > 0);
                        const isExpanded = hasContent || expandedNoteId === node.id;
                        return (
                          <div className="flex justify-start mt-1 relative">
                            {isExpanded ? (
                              <div
                                className={`flex items-start gap-1.5 p-1.5 rounded-md border shadow-sm w-full transition-all duration-200
                                  ${isDark ? "bg-[#3f3822] border-[#5c4d23]" : "bg-[#fef9c3] border-[#fde047]"}
                                `}
                                onPointerDown={e => e.stopPropagation()}
                              >
                                <div className={`flex-shrink-0 mt-px ${isDark ? "text-[#fde047]" : "text-[#ca8a04]"}`}>
                                  <NotePencil size={13} weight="duotone" />
                                </div>
                                <textarea
                                  autoFocus
                                  value={node.notes || ""}
                                  onChange={e => handleNodeTextChange(node.id, "notes" as any, e.target.value)}
                                  onBlur={() => { if (!node.notes || node.notes.length === 0) setExpandedNoteId(null); }}
                                  placeholder="ملاحظات..."
                                  rows={2}
                                  className={`flex-1 bg-transparent text-[10px] font-medium outline-none resize-none leading-relaxed
                                    ${isDark ? "text-[#fde047] placeholder-[#fde047]/50" : "text-[#854d0e] placeholder-[#a16207]/50"}`}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setExpandedNoteId(node.id); }}
                                onPointerDown={e => e.stopPropagation()}
                                className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all hover:scale-105 active:scale-95
                                  ${isDark ? "bg-[#3f3822] border-[#5c4d23] text-[#fde047] hover:brightness-110" : "bg-[#fef9c3] border-[#fde047] text-[#ca8a04] hover:brightness-95"}
                                `}
                                title="إضافة ملاحظة"
                              >
                                <NotePencil size={13} weight="duotone" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* ── Bottom action bar (only on hover/select) ── */}
                    {(isHovered || isSelected) && (
                      <div className={`flex items-center justify-between px-2.5 pb-2 gap-1`}>
                        {/* Left: color swatches for custom nodes */}
                        {isCustom ? (
                          <div className="flex items-center gap-1">
                            {[
                              { cls: "bg-[#1e3a5f]", full: "bg-[#1e3a5f] text-white border-blue-400/30" },
                              { cls: "bg-[#114b3a]", full: "bg-[#114b3a] text-white border-emerald-400/30" },
                              { cls: "bg-[#5c2424]", full: "bg-[#5c2424] text-white border-red-400/30" },
                              { cls: isDark ? "bg-zinc-800" : "bg-white", full: isDark ? "bg-zinc-800 text-white border-zinc-500/30" : "bg-white text-zinc-900 border-zinc-300" },
                            ].map(({ cls, full }) => (
                              <button
                                key={cls}
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setNodes(prev => prev.map(n => n.id === node.id ? { ...n, customColor: full } : n)); }}
                                className={`w-3 h-3 rounded-full border-2 ${cls} ${node.customColor?.startsWith(cls.replace('bg-', 'bg-[')) ? 'border-white/80 scale-125' : 'border-transparent'} transition-transform hover:scale-110`}
                                title="تغيير اللون"
                              />
                            ))}
                          </div>
                        ) : <span />}

                        {/* Right: resize handle.
                            A Microphone button («تفريغ صوتي») sat here on custom
                            nodes. It recorded nothing — it pulsed red for 2.5s and
                            then appended a hardcoded «[ملاحظة صوتية]: يرجى مراجعة
                            المادة ٧٧ بشأن الفسخ.» to the card, i.e. wrote an
                            invented statutory instruction into the lawyer's board
                            and presented it as their own dictation. Removed; see
                            ./_use-case-graph-state.ts. */}
                        <div className="flex items-center gap-1">
                          {/* Bottom-Right Resize corner (visible indicator) */}
                          {isSelected && (
                            <div
                              onPointerDown={e => handleResizeStart(node.id, 'se', e)}
                              className={`p-0.5 rounded cursor-se-resize ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-300 hover:text-zinc-500"}`}
                              title="تغيير الحجم"
                            >
                              <ArrowsOutSimple size={10} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Multi-directional Resize Handles (invisible) ── */}
                    {isSelected && (
                      <>
                        <div onPointerDown={e => handleResizeStart(node.id, 'n', e)} className="absolute top-0 left-2 right-2 h-2 cursor-n-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 's', e)} className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'e', e)} className="absolute top-2 bottom-2 -right-1 w-2 cursor-e-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'w', e)} className="absolute top-2 bottom-2 -left-1 w-2 cursor-w-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'nw', e)} className="absolute top-0 -left-1 w-3 h-3 cursor-nw-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'ne', e)} className="absolute top-0 -right-1 w-3 h-3 cursor-ne-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'sw', e)} className="absolute bottom-0 -left-1 w-3 h-3 cursor-sw-resize z-20" />
                        <div onPointerDown={e => handleResizeStart(node.id, 'se', e)} className="absolute bottom-0 -right-1 w-3 h-3 cursor-se-resize z-20" />
                      </>
                    )}
                  </div>

                  {/* ── Connection handles (on hover/select) ── */}
                  {(isHovered || isSelected) && (<>
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                    <div onPointerDown={e => startDrawingEdge(node.id, e)} className={`absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair z-30 ${isDark ? "bg-[#C8A762] border-zinc-900" : "bg-[#C8A762] border-white"}`} title="ربط" />
                  </>)}

                  {/* Visible delete affordance on hover/select — the only way
                      to remove a card used to be the right-click menu, with no
                      indicator on the card itself that deletion was possible. */}
                  {(isHovered || isSelected) && (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        setNodes(prev => prev.filter(n => n.id !== node.id));
                        setEdges(prev => prev.filter(ed => ed.from !== node.id && ed.to !== node.id));
                      }}
                      title="حذف البطاقة"
                      className={`absolute -top-2.5 -right-2.5 z-40 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${isDark ? "bg-red-500/90 border-zinc-900 text-white" : "bg-red-500 border-white text-white"}`}
                    >
                      <TrashSimple size={10} weight="bold" />
                    </button>
                  )}
                </div>
              );
            })}
          </div> {/* End Infinite Pan Container */}

          {/* Legend — no explanation of the six card colours or three link
              styles existed anywhere on this board (finding 45). */}
          {showLegend && (
            <div className={`absolute bottom-4 start-4 z-20 w-52 rounded-2xl border p-3 shadow-lg ${isDark ? "bg-zinc-900/95 border-white/[0.08]" : "bg-white/95 border-zinc-200"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أنواع البطاقات</p>
              <div className="space-y-1 mb-3">
                {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
                  const conf = TYPE_CONFIG[t];
                  const Icon = conf.icon;
                  return (
                    <div key={t} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border flex-shrink-0 ${conf.bg}`}>
                        <Icon size={11} weight="duotone" className={conf.text} />
                      </div>
                      <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{conf.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أنواع الروابط</p>
              <div className="space-y-1.5">
                {(Object.keys(EDGE_CONFIG) as EdgeType[]).map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <span
                      className="w-5 flex-shrink-0"
                      style={{
                        borderTopWidth: 2,
                        borderTopColor: EDGE_CONFIG[t].color,
                        borderTopStyle: EDGE_CONFIG[t].dash ? "dashed" : "solid",
                      }}
                    />
                    <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{EDGE_TYPE_LABELS[t]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis Result Panel */}
          <AiAnalysisPanel
            isDark={isDark}
            showAiAnalysis={showAiAnalysis}
            setShowAiAnalysis={setShowAiAnalysis}
            nodeCount={nodes.length}
            selectedNodeIds={selectedNodeIds}
            generateAiDocument={generateAiDocument}
          />
          </>
        )}

        {/* Edge Drop Menu — appears when arrow is dropped on empty canvas */}
        {edgeDropMenu && (
          <div
            style={{ position: 'absolute', left: edgeDropMenu.x, top: edgeDropMenu.y }}
            onClick={e => e.stopPropagation()}
            className={`z-50 w-60 rounded-xl border p-1 shadow-2xl ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
          >
            <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              أضف كارد وربطه تلقائياً
            </p>
            {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
              const conf = TYPE_CONFIG[t];
              const Icon = conf.icon;
              return (
                <button key={t} onClick={() => {
                  const newNodeId = `n_${Date.now()}`;
                  const newNode: GraphNode = {
                    id: newNodeId,
                    type: t,
                    title: conf.label,
                    desc: "اكتب التفاصيل هنا...",
                    pos: { x: edgeDropMenu.canvasX - 110, y: edgeDropMenu.canvasY - 60 },
                    author: { name: "انت", role: "المحامي", color: "bg-blue-600" },
                  };
                  setNodes(prev => [...prev, newNode]);
                  // connect the last edge source to the new node
                  const lastFrom = nodes[nodes.length - 1]?.id;
                  if (lastFrom) {
                    setEdges(prev => [...prev, {
                      id: `e_${Date.now()}`,
                      from: lastFrom,
                      to: newNodeId,
                      type: "support",
                      label: "صلة جديدة",
                    }]);
                  }
                  setEdgeDropMenu(null);
                }}
                  className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2.5 transition-colors ${isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-100"}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${conf.bg}`}>
                    <Icon size={12} weight="duotone" className={conf.text} />
                  </div>
                  {conf.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Canvas Right-Click Menu */}
        {contextMenu && (
          <div
            style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
            className={`z-50 w-56 rounded-xl border p-1 shadow-2xl ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
          >
            <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>إضافة عقدة جديدة</p>
            {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
              const conf = TYPE_CONFIG[t];
              const Icon = conf.icon;
              return (
                <button key={t} onClick={() => {
                  const newNode: GraphNode = {
                    id: `n_${Date.now()}`,
                    type: t,
                    title: t === "custom" ? "" : conf.label,
                    desc: "اكتب التفاصيل هنا...",
                    pos: { x: contextMenu.x - pan.x - 110, y: contextMenu.y - pan.y - 60 },
                    author: { name: "انت", role: "المحامي", color: "bg-blue-600" },
                  };
                  setNodes(prev => [...prev, newNode]);
                  setContextMenu(null);
                }} className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2.5 transition-colors ${isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-100"}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${conf.bg}`}>
                    <Icon size={12} weight="duotone" className={conf.text} />
                  </div>
                  {conf.label}
                </button>
              );
            })}
            <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
            <button onClick={() => { setPan({x:0, y:0}); setContextMenu(null); }} className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${isDark ? "text-zinc-500 hover:bg-zinc-700" : "text-zinc-500 hover:bg-zinc-100"}`}>
              <Crosshair size={13} /> إعادة تعيين المنظور
            </button>
          </div>
        )}

        {/* Node Right-Click Menu (Obsidian-style) */}
        {nodeMenu && (() => {
          const nd = nodes.find(n => n.id === nodeMenu.nodeId);
          if (!nd) return null;
          return (
            <div
              style={{ position: 'fixed', left: nodeMenu.x, top: nodeMenu.y, zIndex: 9999 }}
              onClick={e => e.stopPropagation()}
              className={`w-64 rounded-xl border p-1 shadow-2xl ${isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
            >
              {/* Node type toggle */}
              <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نوع العقدة</p>
              <div className="flex flex-wrap gap-1 px-2 pb-2">
                {(Object.keys(TYPE_CONFIG) as NodeType[]).map(t => {
                  const conf = TYPE_CONFIG[t];
                  const Icon = conf.icon;
                  return (
                    <button key={t} onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, type: t} : n)); }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${nd.type === t ? conf.bg + " " + conf.text : isDark ? "border-zinc-700 text-zinc-500 hover:border-zinc-500" : "border-zinc-100 text-zinc-400 hover:border-zinc-300"}`}>
                      <Icon size={10} />{conf.label}
                    </button>
                  );
                })}
              </div>
              <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
              {/* Colors */}
              <p className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لون الخلفية</p>
              <div className="flex gap-1.5 px-3 pb-2">
                {[
                  { label: "افتراضي", val: undefined, cls: isDark ? "bg-zinc-900 border-zinc-600" : "bg-white border-zinc-200" },
                  { label: "أزرق",   val: "bg-[#1e3a5f] text-white border-blue-400/30",    cls: "bg-[#1e3a5f]" },
                  { label: "أخضر",   val: "bg-[#114b3a] text-white border-emerald-400/30", cls: "bg-[#114b3a]" },
                  { label: "أحمر",   val: "bg-[#5c2424] text-white border-red-400/30",     cls: "bg-[#5c2424]" },
                  { label: "ذهبي",   val: "bg-[#3d2f00] text-white border-[#C8A762]/30",  cls: "bg-[#3d2f00]" },
                ].map(c => (
                  <button key={c.label} title={c.label} onClick={() => setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, customColor: c.val} : n))}
                    className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${c.cls} ${nd.customColor === c.val ? "border-white shadow-md scale-110" : "border-transparent"}`} />
                ))}
              </div>
              <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
              {/* Actions */}
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, title: "# " + n.title} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="font-black text-sm text-[#C8A762]">H</span> تحويل لعنوان رئيسي
              </button>
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, title: "## " + n.title} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="font-bold text-sm opacity-60 text-[#C8A762]">H2</span> عنوان فرعي
              </button>
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, desc: "**" + n.desc + "**"} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="font-black text-sm">B</span> تغليظ النص
              </button>
              <button onClick={() => { setNodes(prev => prev.map(n => n.id === nodeMenu.nodeId ? {...n, desc: "*" + n.desc + "*"} : n)); setNodeMenu(null); }}
                className={`w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 ${isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                <span className="italic text-sm">I</span> مائل
              </button>
              <div className={`my-1 border-t ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
              <button onClick={() => { setNodes(prev => prev.filter(n => n.id !== nodeMenu.nodeId)); setEdges(prev => prev.filter(e => e.from !== nodeMenu.nodeId && e.to !== nodeMenu.nodeId)); setNodeMenu(null); }}
                className="w-full text-start px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 text-red-500 hover:bg-red-500/10 transition-colors">
                <span>🗑</span> حذف العقدة
              </button>
            </div>
          );
        })()}

        {/* Node Detail Modal */}
        <OverlaysBundle
          isDark={isDark}
          selectedNodeDetail={selectedNodeDetail}
          setSelectedNodeDetail={setSelectedNodeDetail}
          edgeMenu={edgeMenu}
          setEdgeMenu={setEdgeMenu}
          edges={edges}
          setEdges={setEdges}
          updateEdgeStyle={updateEdgeStyle}
          groups={groups}
          toggleGroupLock={toggleGroupLock}
          dissolveGroup={dissolveGroup}
          aiDocument={aiDocument}
          setAiDocument={setAiDocument}
        />
      </div>
    </div>
  );
}
