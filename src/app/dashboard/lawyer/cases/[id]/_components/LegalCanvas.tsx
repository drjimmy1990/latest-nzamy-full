"use client";

import { useCallback, useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  BackgroundVariant,
  SelectionMode,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, FileText, CalendarCheck, CheckCircle, Clock,
  Scales, Warning, Briefcase, Receipt, Robot, PencilSimple,
  X, Sparkle, ListChecks, SealCheck, ArrowLeft, Users,
  Plus, Trash, ArrowsOut, ArrowsIn,
  Copy, ClipboardText, MagicWand, DotsThree,
  Tag, BookOpen, WarningCircle, Circle,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeStatus = "done" | "active" | "upcoming" | "blocked";

interface StageData {
  label: string;
  sublabel: string;
  status: NodeStatus;
  icon: React.ElementType;
  aiHint?: string;
  tasks?: string[];
  date?: string;
  [key: string]: unknown;
}

// ─── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<NodeStatus, {
  border: string; bg: string; dot: string; text: string; label: string;
}> = {
  done:     { border: "border-emerald-500/60", bg: "bg-emerald-500/10", dot: "bg-emerald-400", text: "text-emerald-400", label: "مكتملة" },
  active:   { border: "border-[#C8A762]/70",  bg: "bg-[#C8A762]/10",   dot: "bg-[#C8A762] animate-pulse", text: "text-[#C8A762]", label: "نشطة" },
  upcoming: { border: "border-zinc-600/40",   bg: "bg-zinc-800/20",     dot: "bg-zinc-600", text: "text-zinc-500", label: "قادمة" },
  blocked:  { border: "border-red-500/50",    bg: "bg-red-900/10",      dot: "bg-red-500", text: "text-red-400", label: "محجوبة" },
};

// ─── Custom Stage Node ─────────────────────────────────────────────────────────

function StageNode({ data, selected }: { data: StageData; selected: boolean }) {
  const st = STATUS_CFG[data.status];
  const Icon = data.icon as React.ElementType;
  return (
    <div
      className={`relative w-44 rounded-2xl border-2 transition-all duration-200 cursor-pointer select-none
        ${st.border} ${st.bg}
        ${selected ? "ring-2 ring-[#C8A762]/60 ring-offset-2 ring-offset-zinc-950 shadow-[0_0_20px_rgba(200,167,98,0.15)]" : "hover:shadow-lg"}`}
      dir="rtl"
    >
      {/* Status dot */}
      <span className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-zinc-950 ${st.dot}`} />

      <div className="p-3 space-y-2">
        {/* Icon + label */}
        <div className="flex items-start gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${st.bg} border ${st.border}`}>
            <Icon size={15} weight="duotone" className={st.text} />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-zinc-100 leading-tight">{data.label}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{data.sublabel}</p>
          </div>
        </div>

        {/* Date + status badge */}
        <div className="flex items-center justify-between">
          {data.date && (
            <span className="text-[9px] font-mono text-zinc-600">{data.date as string}</span>
          )}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${st.bg} ${st.text} border ${st.border} mr-auto`}>
            {st.label}
          </span>
        </div>

        {/* Task count */}
        {data.tasks && (data.tasks as string[]).length > 0 && (
          <div className="flex items-center gap-1">
            <ListChecks size={10} className="text-zinc-600" />
            <span className="text-[10px] text-zinc-600">{(data.tasks as string[]).length} إجراءات</span>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  stage: StageNode as any,
};

// ─── Initial Data ─────────────────────────────────────────────────────────────

const INIT_NODES: Node<StageData>[] = [
  {
    id: "g-torts", type: "group", position: { x: 30, y: 160 },
    data: {} as StageData,
    style: { width: 580, height: 200, background: "rgba(11,61,46,0.07)", border: "1px solid rgba(11,61,46,0.25)", borderRadius: 20 },
    className: "group-node",
  },
  {
    id: "g-appeals", type: "group", position: { x: 650, y: 160 },
    data: {} as StageData,
    style: { width: 380, height: 200, background: "rgba(200,167,98,0.05)", border: "1px solid rgba(200,167,98,0.2)", borderRadius: 20 },
  },
  {
    id: "n1", type: "stage", parentId: "g-torts", extent: "parent",
    position: { x: 30, y: 50 },
    data: {
      label: "تقديم الدعوى", sublabel: "صحيفة + مستندات",
      icon: FileText, status: "done", date: "يناير ٢٠٢٤",
      tasks: ["تحرير صحيفة الدعوى", "إرفاق المستندات", "سداد الرسوم"],
      aiHint: "الدعوى مقدَّمة بشكل سليم. الوقائع موثقة بعقد التوريد.",
    },
  },
  {
    id: "n2", type: "stage", parentId: "g-torts", extent: "parent",
    position: { x: 210, y: 50 },
    data: {
      label: "المحكمة الابتدائية", sublabel: "جلسات + مرافعة",
      icon: Gavel, status: "done", date: "مارس ٢٠٢٤",
      tasks: ["تحضير مذكرة دفاع", "حضور الجلسات", "تقديم مستجدات"],
      aiHint: "صدر حكم ابتدائي إيجابي. قوة الموقف: ٧٨٪.",
    },
  },
  {
    id: "n3", type: "stage", parentId: "g-torts", extent: "parent",
    position: { x: 390, y: 50 },
    data: {
      label: "جلسة الخبرة", sublabel: "تقرير خبير",
      icon: SealCheck, status: "done", date: "أبريل ٢٠٢٤",
      tasks: ["تعيين خبير", "مراجعة التقرير"],
      aiHint: "تقرير الخبير إيجابي لصالحك.",
    },
  },
  {
    id: "n4", type: "stage", parentId: "g-appeals", extent: "parent",
    position: { x: 30, y: 50 },
    data: {
      label: "الاستئناف", sublabel: "لائحة + رد",
      icon: Scales, status: "active", date: "مايو ٢٠٢٤",
      tasks: ["إعداد لائحة استئناف", "الرد على دفوع الخصم", "جلسة المرافعة"],
      aiHint: "الحكم الابتدائي يعزز موقفك. اعمل على توثيق الضرر الإضافي.",
    },
  },
  {
    id: "n5", type: "stage", parentId: "g-appeals", extent: "parent",
    position: { x: 210, y: 50 },
    data: {
      label: "التمييز", sublabel: "طعن اختياري",
      icon: ArrowLeft, status: "upcoming",
      tasks: ["تقييم جدوى الطعن", "صياغة عريضة التمييز"],
      aiHint: "ستُحدَّد الحاجة بعد نتيجة الاستئناف.",
    },
  },
  {
    id: "n6", type: "stage",
    position: { x: 1070, y: 210 },
    data: {
      label: "التنفيذ", sublabel: "استيفاء الحكم",
      icon: Receipt, status: "upcoming",
      tasks: ["طلب تنفيذ الحكم", "حجز أموال المحكوم عليه"],
      aiHint: "يُفضَّل إعداد مستندات التنفيذ مبكراً.",
    },
  },
];

const INIT_EDGES: Edge[] = [
  { id: "e1-2", source: "n1", target: "n2", type: "smoothstep", animated: false, style: { stroke: "#0B3D2E", strokeWidth: 2 } },
  { id: "e2-3", source: "n2", target: "n3", type: "smoothstep", animated: false, style: { stroke: "#0B3D2E", strokeWidth: 2 } },
  { id: "e3-4", source: "n3", target: "n4", type: "smoothstep", animated: true,  style: { stroke: "#C8A762", strokeWidth: 2, strokeDasharray: "5,3" } },
  { id: "e4-5", source: "n4", target: "n5", type: "smoothstep", animated: false, style: { stroke: "#C8A762", strokeWidth: 1.5, opacity: 0.5 } },
  { id: "e5-6", source: "n5", target: "n6", type: "smoothstep", animated: false, style: { stroke: "#52525b", strokeWidth: 1.5, opacity: 0.5 } },
];

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: Node<StageData>; onClose: () => void }) {
  const d = node.data;
  const st = STATUS_CFG[d.status];
  const Icon = d.icon as React.ElementType;
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="absolute top-0 left-0 h-full w-72 z-10 flex flex-col bg-zinc-900 border-r border-white/[0.06]"
      dir="rtl"
    >
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${st.border} ${st.bg}`}>
          <Icon size={16} weight="duotone" className={st.text} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-zinc-100 truncate">{d.label}</p>
          <p className="text-[11px] text-zinc-500">{d.sublabel}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={13} />
        </button>
      </div>
      {/* AI Format banner */}
      {(false) && (
        <div className="px-4 py-2 bg-[#C8A762]/10 border-b border-[#C8A762]/20 flex items-center gap-2">
          <MagicWand size={11} className="text-[#C8A762]" />
          <span className="text-[10px] text-[#C8A762] font-semibold">يُنسَّق بـ AI...</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
          <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>
          {d.date && <span className="text-[10px] font-mono text-zinc-600 mr-auto">{d.date as string}</span>}
        </div>

        {d.aiHint && (
          <div className="p-3 rounded-xl border border-[#C8A762]/20 bg-[#C8A762]/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Robot size={11} className="text-[#C8A762]" />
              <span className="text-[10px] font-bold text-[#C8A762]">تقييم AI</span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-400">{d.aiHint as string}</p>
          </div>
        )}

        {d.tasks && (d.tasks as string[]).length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-zinc-600">إجراءات المرحلة</p>
            <div className="space-y-1.5">
              {(d.tasks as string[]).map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center mt-0.5 border ${d.status === "done" ? "bg-emerald-500/10 border-emerald-500/30" : "border-white/[0.08] bg-white/[0.03]"}`}>
                    {d.status === "done" && <CheckCircle size={9} className="text-emerald-500" weight="fill" />}
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-400">{t}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {d.status === "active" && (
          <div className="space-y-2 pt-1">
            <a href="/ai/draft" className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-[12px] font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              <PencilSimple size={13} />صياغة مذكرة
            </a>
            <a href="/ai/wargaming" className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-[12px] font-medium border border-white/[0.08] text-zinc-300 hover:bg-white/[0.05] transition-colors">
              <Robot size={13} />تحليل المخاطر
            </a>
            <button className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-[12px] font-medium border border-[#C8A762]/20 text-[#C8A762] hover:bg-[#C8A762]/10 transition-colors">
              <MagicWand size={13} />نسّق بـ AI
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

const CTX_NODE_TYPES = [
  { key: "stage",    label: "مرحلة قانونية",  icon: Gavel },
  { key: "event",   label: "حدث / جلسة",     icon: CalendarCheck },
  { key: "doc",     label: "مستند",          icon: FileText },
  { key: "risk",    label: "خطر / تحذير",    icon: WarningCircle },
  { key: "note",    label: "ملاحظة",         icon: BookOpen },
];

const CTX_ACTIONS = [
  { key: "copy",   label: "نسخ الكارت",       icon: Copy },
  { key: "ai",     label: "نسّق بـ AI",       icon: MagicWand },
  { key: "delete", label: "حذف",              icon: Trash },
];

interface CtxMenu {
  x: number; y: number;
  nodeId: string;
}

function ContextMenu({ menu, isDark, onAction, onClose }: {
  menu: CtxMenu; isDark: boolean;
  onAction: (key: string, nodeId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth) el.style.left = `${menu.x - r.width}px`;
    if (r.bottom > window.innerHeight) el.style.top = `${menu.y - r.height}px`;
  }, [menu]);
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [onClose]);

  const base = isDark
    ? "bg-zinc-900 border border-white/[0.08] shadow-2xl"
    : "bg-white border border-zinc-200 shadow-xl";

  return (
    <div ref={ref}
      className={`fixed z-[9999] rounded-2xl overflow-hidden min-w-[180px] ${base}`}
      style={{ left: menu.x, top: menu.y }}
      onClick={e => e.stopPropagation()}
    >
      <div className={`px-3 py-2 border-b text-[10px] font-black uppercase tracking-widest ${
        isDark ? "border-white/[0.05] text-zinc-600" : "border-zinc-100 text-zinc-400"
      }`}>
        نوع الكارت
      </div>
      {CTX_NODE_TYPES.map(t => { const Icon = t.icon; return (
        <button key={t.key}
          onClick={() => { onAction(`type:${t.key}`, menu.nodeId); onClose(); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-right transition-colors ${
            isDark ? "hover:bg-white/[0.05] text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
          }`}>
          <Icon size={13} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          {t.label}
        </button>
      ); })}
      <div className={`my-1 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`} />
      {CTX_ACTIONS.map(a => { const Icon = a.icon; return (
        <button key={a.key}
          onClick={() => { onAction(a.key, menu.nodeId); onClose(); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-right transition-colors ${
            a.key === "delete"
              ? isDark ? "hover:bg-red-900/20 text-red-400" : "hover:bg-red-50 text-red-500"
              : isDark ? "hover:bg-white/[0.05] text-zinc-300" : "hover:bg-zinc-50 text-zinc-700"
          }`}>
          <Icon size={13} weight="duotone" className={a.key === "delete" ? "text-red-500" : isDark ? "text-zinc-500" : "text-zinc-400"} />
          {a.label}
        </button>
      ); })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface LegalCanvasProps {
  isDark: boolean;
  caseType?: string;
}

export default function LegalCanvas({ isDark }: LegalCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INIT_NODES as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INIT_EDGES);
  const [selectedNode, setSelectedNode] = useState<Node<StageData> | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<"solo" | "team">("solo");
  const [clipboard, setClipboard] = useState<Node<StageData> | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [aiFormatting, setAiFormatting] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", style: { stroke: "#C8A762", strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "group") return;
    setSelectedNode(node as Node<StageData>);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setCtxMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (node.type === "group") return;
    setSelectedNode(node as Node<StageData>);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  // Ctrl+C / Ctrl+V
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "c" && selectedNode) {
        setClipboard(selectedNode);
      }
      if (e.key === "v" && clipboard) {
        const newId = `n-copy-${Date.now()}`;
        setNodes(nds => [...nds, {
          ...clipboard,
          id: newId,
          parentId: undefined,
          extent: undefined,
          position: { x: clipboard.position.x + 30, y: clipboard.position.y + 30 },
          selected: false,
        } as any]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNode, clipboard, setNodes]);

  const handleCtxAction = useCallback((key: string, nodeId: string) => {
    if (key === "copy") {
      const n = nodes.find(x => x.id === nodeId);
      if (n) setClipboard(n as Node<StageData>);
    } else if (key === "delete") {
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
      if (selectedNode?.id === nodeId) setSelectedNode(null);
    } else if (key === "ai") {
      setAiFormatting(true);
      setTimeout(() => setAiFormatting(false), 1800);
    }
  }, [nodes, selectedNode, setNodes, setEdges]);

  const canvasContent = (
    <div className={`relative w-full h-full flex flex-col ${isDark ? "bg-zinc-950" : "bg-slate-50"}`}>
      {/* Toolbar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0 z-[5] relative
        ${isDark ? "border-white/[0.06] bg-zinc-900/80 backdrop-blur-sm" : "border-slate-200 bg-white/90 backdrop-blur-sm"}`}>
        <Sparkle size={14} weight="duotone" className="text-[#C8A762]" />
        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مسار القضية</p>

        {/* Mode toggle */}
        <div className={`flex items-center gap-1 mr-2 p-1 rounded-xl ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
          {(["solo", "team"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all
                ${mode === m ? "bg-[#0B3D2E] text-[#C8A762] shadow-sm" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
              {m === "solo" ? <><Briefcase size={10} />منفرد</> : <><Users size={10} />فريق</>}
            </button>
          ))}
        </div>

        {/* Hint */}
        <p className={`text-[10px] mr-auto ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
          Ctrl+C نسخ · Ctrl+V لصق · كليك يمين للخيارات
        </p>
        {clipboard && (
          <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg ${
            isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"
          }`}>
            <ClipboardText size={10} />
            <span className="font-mono">{clipboard.data.label}</span>
          </div>
        )}

        <button onClick={() => setFullscreen(f => !f)}
          className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300" : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"}`}>
          {fullscreen ? <ArrowsIn size={13} /> : <ArrowsOut size={13} />}
        </button>
      </div>

      {/* Canvas + Detail Panel */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence>
          {selectedNode && (
            <DetailPanel key={selectedNode.id} node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </AnimatePresence>

        <div className={`absolute inset-0 transition-all ${selectedNode ? "left-72" : ""}`}>
          {ctxMenu && (
            <ContextMenu
              menu={ctxMenu}
              isDark={isDark}
              onAction={handleCtxAction}
              onClose={() => setCtxMenu(null)}
            />
          )}
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            // Zoom: only via ctrl+scroll (panOnScroll when no ctrl)
            zoomOnScroll={false}
            zoomOnPinch={true}
            panOnScroll={true}
            panOnDrag={true}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag={true}
            multiSelectionKeyCode="Control"
            deleteKeyCode="Delete"
            minZoom={0.2}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color={isDark ? "#27272a" : "#e2e8f0"}
            />
            <Controls
              style={{
                background: isDark ? "#18181b" : "#fff",
                border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #e2e8f0",
                borderRadius: 12,
                gap: 2,
              }}
            />
            <MiniMap
              style={{
                background: isDark ? "#18181b" : "#f8fafc",
                border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #e2e8f0",
                borderRadius: 12,
              }}
              nodeColor={(n) => {
                const d = n.data as StageData;
                if (!d?.status) return "#3f3f46";
                return { done: "#10b981", active: "#C8A762", upcoming: "#52525b", blocked: "#ef4444" }[d.status] ?? "#3f3f46";
              }}
            />

            {/* Group labels */}
            <Panel position="top-left">
              <div className="pointer-events-none" />
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Group legend */}
      <div className={`px-4 py-2 border-t flex items-center gap-4 flex-shrink-0 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm border border-[#0B3D2E]/60 bg-[#0B3D2E]/10" />
          <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مرحلة المحاكم الابتدائية</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm border border-[#C8A762]/40 bg-[#C8A762]/8" />
          <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مرحلة الطعون</span>
        </div>
        <div className="mr-auto flex items-center gap-3">
          {(["done", "active", "upcoming", "blocked"] as NodeStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CFG[s].dot.replace("animate-pulse","")}`} />
              <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{STATUS_CFG[s].label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Inline view */}
      <div
        className={`rounded-2xl border overflow-hidden ${isDark ? "bg-zinc-950 border-white/[0.06]" : "bg-white border-slate-200 shadow-sm"}`}
        style={{ height: 420 }}
      >
        {canvasContent}
      </div>

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col"
            style={{ background: isDark ? "#09090b" : "#f8fafc" }}
          >
            {canvasContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
