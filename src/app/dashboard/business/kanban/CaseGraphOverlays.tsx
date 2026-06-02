"use client";

import { motion } from "framer-motion";
import {
  Crosshair,
  Sparkle,
  Plus,
  Robot,
  FileText,
  Lightbulb,
  Export,
  Lock,
  LockOpen,
} from "@phosphor-icons/react";
import { EDGE_CONFIG, TYPE_CONFIG, type GraphEdge, type GraphNode } from "./_graph-model";

// ─── Types ───────────────────────────────────────────────────────────────────

type NodeType = "custom" | "fact" | "law" | "evidence" | "risk" | "goal" | "doc";

interface Group {
  id: string;
  label: string;
  color: string;
  locked: boolean;
}

interface SidebarLauncherProps {
  isDark: boolean;
  isWorkspaceEmpty: boolean | undefined;
  showCaseSelector: boolean;
  setShowCaseSelector: (v: boolean) => void;
  isSimulatingErp: boolean;
  selectedCase: string | null;
  setSelectedCase: (v: string) => void;
  generateErpGraph: () => void;
  setNodes: React.Dispatch<React.SetStateAction<GraphNode[]>>;
}

export function SidebarLauncher({
  isDark,
  isWorkspaceEmpty,
  showCaseSelector,
  setShowCaseSelector,
  isSimulatingErp,
  selectedCase,
  setSelectedCase,
  generateErpGraph,
  setNodes,
}: SidebarLauncherProps) {
  if (!isWorkspaceEmpty) return null;

  return (
    <div
      className={`w-80 border-e flex flex-col p-6 z-20 shadow-xl ${
        isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-zinc-200"
      }`}
    >
      <h2
        className={`text-xl font-bold font-brand mb-6 flex items-center gap-2 ${
          isDark ? "text-white" : "text-zinc-900"
        }`}
      >
        <Crosshair size={22} className="text-[#C8A762]" />
        منصة اللوحات البصرية
      </h2>

      <div className="space-y-3 mb-8">
        <button
          onClick={() => {
            setNodes([
              {
                id: "n_start",
                type: "custom",
                title: "مساحة جديدة",
                desc: "ابدأ التفكير هنا...",
                pos: { x: 300, y: 200 },
                author: { name: "أنت", role: "", color: "bg-blue-600" },
              },
            ]);
          }}
          className={`w-full text-start flex items-center gap-3 p-4 rounded-2xl border transition-all ${
            isDark
              ? "bg-white/[0.04] border-white/10 hover:border-blue-500/50"
              : "bg-zinc-50 border-zinc-200 hover:border-blue-500"
          }`}
        >
          <div className="bg-blue-500/20 p-2.5 rounded-xl">
            <Plus size={18} className="text-blue-500" />
          </div>
          <div>
            <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              لوحة حرة فارغة
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">مساحة نقية بدون قضايا مرتبطة</p>
          </div>
        </button>

        <button
          onClick={() => setShowCaseSelector(true)}
          className={`w-full text-start flex items-center gap-3 p-4 rounded-2xl border transition-all ${
            isDark
              ? "bg-white/[0.04] border-white/10 hover:border-[#C8A762]/50"
              : "bg-zinc-50 border-zinc-200 hover:border-[#C8A762]"
          }`}
        >
          <div className="bg-[#C8A762]/20 p-2.5 rounded-xl">
            <Robot size={18} className="text-[#C8A762]" />
          </div>
          <div>
            <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              استخراج من قضية (AI)
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">يسحب البيانات والوقائع آلياً</p>
          </div>
        </button>
      </div>

      <p className={`text-xs font-bold mb-3 ps-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
        اللوحات المحفوظة مؤخراً
      </p>
      <div className="space-y-2 overflow-y-auto hidden-scrollbar">
        {["لوحة نزاع الشراكة", "أفكار تجديد الإيجار", "تحليل عقد النقل"].map((name, i) => (
          <button
            key={i}
            className={`w-full text-start px-4 py-3 rounded-xl border transition-colors ${
              isDark
                ? "border-white/[0.04] hover:bg-white/[0.06] text-zinc-300"
                : "border-zinc-100 hover:bg-zinc-50 text-zinc-700"
            }`}
          >
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-[10px] text-zinc-500 mt-1">تحديث منذ يومين</p>
          </button>
        ))}
      </div>

      {showCaseSelector && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl ${
              isDark ? "bg-zinc-900 border border-white/10" : "bg-white border border-zinc-200"
            }`}
          >
            {isSimulatingErp ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin mb-4" />
                <p className={`text-sm font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  جاري استخراج الشبكة الحرة...
                </p>
              </div>
            ) : (
              <div>
                <h3 className={`text-base font-bold mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>
                  اختر القضية النشطة
                </h3>
                <select
                  className={`w-full rounded-xl border p-3 mb-4 outline-none text-sm font-semibold ${
                    isDark ? "bg-zinc-800 border-zinc-700 text-white" : "bg-zinc-50 border-zinc-200"
                  }`}
                  onChange={(e) => setSelectedCase(e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    -- قائمة القضايا --
                  </option>
                  <option value="CASE-1200">نزاع مقاولة مع شركة البناء الحديث</option>
                  <option value="CASE-1201">صياغة لائحة العمل الداخلية المحدثة</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCaseSelector(false)}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl ${
                      isDark ? "bg-white/10 text-white" : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    تراجع
                  </button>
                  <button
                    disabled={!selectedCase}
                    onClick={generateErpGraph}
                    className={`flex-[2] py-2.5 text-xs font-bold rounded-xl text-white ${
                      selectedCase ? "bg-[#0B3D2E]" : "bg-zinc-500 opacity-50"
                    }`}
                  >
                    بدء الاستخراج
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─── AI Analysis Panel ───────────────────────────────────────────────────────

interface AiAnalysisPanelProps {
  isDark: boolean;
  showAiAnalysis: boolean;
  setShowAiAnalysis: (v: boolean) => void;
  nodeCount: number;
  selectedNodeIds: Set<string>;
  generateAiDocument: (s?: Set<string>) => void;
}

export function AiAnalysisPanel({
  isDark,
  showAiAnalysis,
  setShowAiAnalysis,
  nodeCount,
  selectedNodeIds,
  generateAiDocument,
}: AiAnalysisPanelProps) {
  if (!showAiAnalysis) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-full px-4 z-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`rounded-3xl p-5 shadow-2xl border flex flex-col gap-4 backdrop-blur-xl ${
          isDark ? "bg-zinc-900/95 border-[#C8A762]/30" : "bg-white/95 border-emerald-200"
        }`}
      >
        <div className="flex items-center justify-between border-b pb-3 border-opacity-10 border-white">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#125e47] flex items-center justify-center shadow-inner">
              <Sparkle size={18} weight="fill" className="text-white" />
            </div>
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                تحليل شامل للجراف والعصف الذهني
              </p>
              <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                نظامي AI • تحليل {nodeCount} عقدة فكرية
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAiAnalysis(false)}
            className={`text-[10px] px-3 py-1.5 rounded-lg border font-bold ${
              isDark
                ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                : "bg-zinc-100 border-zinc-200 text-zinc-600"
            }`}
          >
            إغلاق التحليل
          </button>
        </div>

        <div className={`text-xs leading-relaxed space-y-2 ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
          <p>
            استناداً للربط الذي قمت به بين <strong className="text-[#C8A762]">مؤسسة البناء</strong> و{" "}
            <strong className="text-emerald-500">توقف الأعمال</strong> عبر المادة{" "}
            <strong className="text-purple-400">(٧٧)</strong>:
          </p>
          <ul className="list-disc ps-5 space-y-1">
            <li>
              تأسيسك لمبدأ &quot;الفسخ التعسفي&quot; ممتاز ويتوافق مع سابقة قضائية (رقم ٣٤٢ لعام ١٤٤٤هـ).
            </li>
            <li>
              <strong>نقطة ضعف محتملة:</strong> لم تقم بربط أي{" "}
              <strong className="text-orange-400">إشعار أو رسالة رسمية (دليل)</strong> تثبت أنك أنذرت
              المقاول قبل الغلق. المحكمة قد تطلب هذا المستند كخطوة تسبق الفسخ.
            </li>
          </ul>
          <p>
            هل تود أن أقوم بتحويل هذه الخريطة الذهنية إلى{" "}
            <strong className="text-blue-500">مسودة لائحة دعوى</strong> جاهزة بناءً على هذه الروابط؟
          </p>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => generateAiDocument(selectedNodeIds.size > 0 ? selectedNodeIds : undefined)}
            className="flex items-center justify-center gap-1.5 flex-1 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0a3328] transition-colors shadow-lg shadow-[#0B3D2E]/20"
          >
            <FileText size={14} weight="bold" />
            توليد مسودة اللائحة الآن
          </button>
          <button className="flex items-center justify-center flex-1 gap-1.5 rounded-xl border border-[#C8A762] px-4 py-2.5 text-xs font-bold text-[#C8A762] hover:bg-[#C8A762]/10 transition-colors">
            <Lightbulb size={14} weight="bold" />
            اقتراح أفكار لدعم الموقف
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Overlays & Modals Bundle ────────────────────────────────────────────────

interface OverlaysBundleProps {
  isDark: boolean;
  selectedNodeDetail: GraphNode | null;
  setSelectedNodeDetail: (n: GraphNode | null) => void;
  edgeMenu: { edgeId: string; x: number; y: number } | null;
  setEdgeMenu: (m: { edgeId: string; x: number; y: number } | null) => void;
  edges: GraphEdge[];
  setEdges: React.Dispatch<React.SetStateAction<GraphEdge[]>>;
  updateEdgeStyle: (edgeId: string, style: Partial<GraphEdge>) => void;
  groups: Group[];
  toggleGroupLock: (groupId: string) => void;
  dissolveGroup: (groupId: string) => void;
  aiDocument: string | null;
  setAiDocument: (s: string | null) => void;
  isGeneratingDoc: boolean;
}

export function OverlaysBundle({
  isDark,
  selectedNodeDetail,
  setSelectedNodeDetail,
  edgeMenu,
  setEdgeMenu,
  edges,
  setEdges,
  updateEdgeStyle,
  groups,
  toggleGroupLock,
  dissolveGroup,
  aiDocument,
  setAiDocument,
}: OverlaysBundleProps) {
  return (
    <>
      {/* 1. Node Detail Modal */}
      {selectedNodeDetail && (() => {
        const conf = TYPE_CONFIG[selectedNodeDetail.type];
        const Icon = conf.icon;
        return (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedNodeDetail(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md mx-4 rounded-3xl p-6 shadow-2xl border ${
                isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-zinc-200"
              }`}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center border flex-shrink-0 ${conf.bg}`}
                >
                  <Icon size={20} weight="duotone" className={conf.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${conf.text}`}>
                    {conf.label}
                  </span>
                  <p
                    className={`text-[15px] font-bold leading-tight mt-0.5 ${
                      isDark ? "text-white" : "text-zinc-900"
                    }`}
                  >
                    {selectedNodeDetail.title || "بدون عنوان"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNodeDetail(null)}
                  className={`p-1.5 rounded-xl transition-colors ${
                    isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"
                  }`}
                >
                  <span className="text-sm font-bold">✕</span>
                </button>
              </div>

              {/* Content */}
              <div
                className={`p-4 rounded-2xl mb-4 ${
                  isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-zinc-50 border border-zinc-100"
                }`}
              >
                <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                  {selectedNodeDetail.desc}
                </p>
              </div>

              {/* Meta */}
              {selectedNodeDetail.meta && (
                <div
                  className={`flex items-center gap-2 mb-4 text-[11px] ${
                    isDark ? "text-[#C8A762]" : "text-amber-600"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />
                  {selectedNodeDetail.meta}
                </div>
              )}

              {/* Author */}
              <div
                className={`flex items-center gap-3 p-3 rounded-2xl ${
                  isDark ? "bg-zinc-800/50" : "bg-zinc-100/50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0 ${selectedNodeDetail.author.color}`}
                >
                  {selectedNodeDetail.author.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                    {selectedNodeDetail.author.name}
                  </span>
                  <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    {selectedNodeDetail.author.role}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setSelectedNodeDetail(null)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    isDark
                      ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  إغلاق
                </button>
                {selectedNodeDetail.type === "doc" && (
                  <button className="flex-[2] py-2.5 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                    فتح المستند
                  </button>
                )}
                {selectedNodeDetail.type === "law" && (
                  <button className="flex-[2] py-2.5 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                    عرض نص المادة
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* 2. Edge Context Menu */}
      {edgeMenu && (() => {
        const edge = edges.find((e) => e.id === edgeMenu.edgeId);
        if (!edge) return null;
        const cnf = EDGE_CONFIG[edge.type] || EDGE_CONFIG.support;
        return (
          <div
            style={{ position: "fixed", left: edgeMenu.x, top: edgeMenu.y, zIndex: 9999 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-56 rounded-xl border p-2 shadow-2xl ${
              isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"
            }`}
          >
            <p
              className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${
                isDark ? "text-zinc-600" : "text-slate-400"
              }`}
            >
              تنسيق الرابط
            </p>
            <p className={`px-2 pt-1 text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              اللون
            </p>
            <div className="flex gap-1.5 px-2 py-1.5">
              {[
                "#10b981",
                "#ef4444",
                "#a1a1aa",
                "#3b82f6",
                "#f59e0b",
                "#8b5cf6",
                "#C8A762",
              ].map((c) => (
                <button
                  key={c}
                  onClick={() => updateEdgeStyle(edge.id, { color: c })}
                  className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${
                    (edge.color || cnf.color) === c
                      ? "border-white shadow-md scale-110"
                      : "border-transparent"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <p className={`px-2 pt-1 text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              السُمك
            </p>
            <div className="flex gap-1.5 px-2 py-1.5">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  onClick={() => updateEdgeStyle(edge.id, { width: w })}
                  className={`flex items-center justify-center w-7 h-7 rounded-lg text-[10px] font-bold border transition-all ${
                    (edge.width ?? 2) === w
                      ? isDark
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-zinc-100 border-zinc-300 text-zinc-800"
                      : isDark
                      ? "border-zinc-700 text-zinc-500"
                      : "border-zinc-200 text-zinc-400"
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
            <p className={`px-2 pt-1 text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              النوع
            </p>
            <div className="flex gap-1.5 px-2 py-1.5">
              {(["support", "conflict", "neutral"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateEdgeStyle(edge.id, { type: t })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                    edge.type === t
                      ? "bg-[#C8A762]/10 border-[#C8A762]/30 text-[#C8A762]"
                      : isDark
                      ? "border-zinc-700 text-zinc-500"
                      : "border-zinc-200 text-zinc-400"
                  }`}
                >
                  {t === "support" ? "دعم" : t === "conflict" ? "تعارض" : "محايد"}
                </button>
              ))}
            </div>
            <div className={`mt-1 border-t pt-1 ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
            <button
              onClick={() => {
                setEdges((prev) => prev.filter((e) => e.id !== edge.id));
                setEdgeMenu(null);
              }}
              className="w-full text-start px-2 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-2 text-red-500 hover:bg-red-500/10"
            >
              🗑 حذف الرابط
            </button>
          </div>
        );
      })()}

      {/* 3. Groups Panel */}
      {groups.length > 0 && (
        <div
          className={`absolute bottom-4 end-4 z-10 w-52 rounded-2xl border p-3 shadow-lg ${
            isDark ? "bg-zinc-900/95 border-white/[0.08]" : "bg-white/95 border-zinc-200"
          }`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
              isDark ? "text-zinc-500" : "text-slate-400"
            }`}
          >
            المجموعات
          </p>
          <div className="space-y-1.5">
            {groups.map((g) => (
              <div
                key={g.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border ${
                  isDark ? "border-white/[0.06]" : "border-zinc-100"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: g.color }}
                />
                <span
                  className={`flex-1 text-[11px] font-semibold truncate ${
                    isDark ? "text-zinc-300" : "text-zinc-700"
                  }`}
                >
                  {g.label}
                </span>
                <button
                  onClick={() => toggleGroupLock(g.id)}
                  className={`p-1 rounded-lg transition-colors ${
                    isDark ? "hover:bg-white/[0.06]" : "hover:bg-zinc-100"
                  }`}
                  title={g.locked ? "فك القفل" : "قفل"}
                >
                  {g.locked ? (
                    <Lock size={10} className="text-[#C8A762]" />
                  ) : (
                    <LockOpen size={10} className="text-zinc-500" />
                  )}
                </button>
                <button
                  onClick={() => dissolveGroup(g.id)}
                  className="p-1 rounded-lg text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  title="حل المجموعة"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. AI Document Modal */}
      {aiDocument && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setAiDocument(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col rounded-3xl shadow-2xl border ${
              isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-zinc-200"
            }`}
          >
            <div
              className={`flex items-center gap-3 px-6 py-4 border-b flex-shrink-0 ${
                isDark ? "border-white/[0.06]" : "border-zinc-100"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-inner">
                <FileText size={16} className="text-white" />
              </div>
              <div className="flex-1">
                <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                  مستند الجراف — نظامي AI
                </p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  يمكنك التعديل ثم إرساله للمُجمِّع أو الصائغ
                </p>
              </div>
              <button
                onClick={() => setAiDocument(null)}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"
                }`}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <textarea
                value={aiDocument}
                onChange={(e) => setAiDocument(e.target.value)}
                className={`w-full min-h-[400px] text-[13px] leading-relaxed bg-transparent outline-none resize-none font-body ${
                  isDark ? "text-zinc-300 placeholder-zinc-600" : "text-zinc-700 placeholder-zinc-400"
                }`}
                dir="rtl"
              />
            </div>
            <div
              className={`flex gap-2 px-6 py-4 border-t flex-shrink-0 ${
                isDark ? "border-white/[0.06]" : "border-zinc-100"
              }`}
            >
              <button
                onClick={() => setAiDocument(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isDark
                    ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                إغلاق
              </button>
              <button className="flex-[2] py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
                <Export size={14} /> إرسال للمُجمِّع
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
