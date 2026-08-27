"use client";

import { motion } from "framer-motion";
import {
  Crosshair,
  Info,
  Plus,
  FileText,
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

/**
 * WHAT THIS LAUNCHER USED TO OFFER, AND WHY TWO OF THE THREE ARE GONE.
 *
 * It is the entry panel for an EMPTY GLOBAL board (dashboard/business/kanban).
 * It offered three things; two of them were fiction:
 *
 *  1. «لوحة حرة فارغة» — real, and kept. It seeds one blank card the user then
 *     types into.
 *  2. «استخراج من قضية (AI)» / «يسحب البيانات والوقائع آلياً» — a case picker
 *     listing two hardcoded cases, then a 1.5s «جاري استخراج الشبكة الحرة...»
 *     spinner, then a board of five invented cards (a named plaintiff, a
 *     «موجز الوقائع الأساسية», a «تسبيب المحكمة (المتوقع)») presented as having
 *     been extracted from whichever case was picked. Nothing was read: the
 *     selection was never even passed anywhere. There is no extraction service to
 *     wire this to, so the promise is removed rather than relabelled.
 *  3. «اللوحات المحفوظة مؤخراً» — three invented board names («لوحة نزاع
 *     الشراكة», «أفكار تجديد الإيجار», «تحليل عقد النقل») each stamped
 *     «تحديث منذ يومين», rendered as buttons with no handler. No board is saved
 *     anywhere (this canvas has no persistence at all), so there is no list to
 *     show — and an empty «اللوحات المحفوظة» section would still promise that
 *     saving exists. The whole section is gone.
 */
interface SidebarLauncherProps {
  isDark: boolean;
  isWorkspaceEmpty: boolean | undefined;
  setNodes: React.Dispatch<React.SetStateAction<GraphNode[]>>;
}

export function SidebarLauncher({
  isDark,
  isWorkspaceEmpty,
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

      <p className={`text-[11px] leading-relaxed mt-6 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        اللوحات لا تُحفظ حالياً: ما ترسمه هنا يبقى في هذه الصفحة فقط ويزول عند مغادرتها.
      </p>
    </div>
  );
}

// ─── AI Analysis Panel ───────────────────────────────────────────────────────

/**
 * WHAT THIS PANEL USED TO DO, AND WHY IT NO LONGER DOES IT.
 *
 * It rendered a fixed paragraph as if it were a reading of the board in front
 * of the user: it named two nodes and an article number from the demo graph,
 * praised the user's «تأسيس لمبدأ الفسخ التعسفي», flagged a missing notice as
 * a weakness — and cited «سابقة قضائية (رقم ٣٤٢ لعام ١٤٤٤هـ)», a Saudi
 * judgment that does not exist. None of it was computed from anything. The
 * same words appeared over ANY board, including a lawyer's real case, because
 * the text was hardcoded. Handing a lawyer an invented precedent to rely on is
 * the worst thing a screen in this product can do, and it is not fixable by
 * making the fabrication vaguer.
 *
 * There is no analysis engine behind this canvas — no request, no model, no
 * rule set. (Until this pass, `runAiAnalysis` in ./_use-case-graph-state.ts was a
 * 2-second setTimeout that flipped this panel open; it is gone, and the toolbar
 * button opens the panel directly.) So the panel says exactly that, and nothing
 * that could be mistaken for a legal reading:
 *  - no substitute "insight" derived from node/edge counts. A count dressed up
 *    as a finding is the same defect wearing different clothes.
 *  - no «قيد الإعداد» / «قريباً». Nothing in this repo is building it, and a
 *    promise is another statement that isn't true.
 *
 * THE TWO CLAIMS THIS FILE COULD NOT REACH HAVE SINCE BEEN FIXED in the files
 * that owned them, and are recorded here so the history reads straight:
 *  1. ./CaseGraphView.tsx's toolbar button read «تحليل AI» and spun
 *     «جاري التحليل...» for two seconds before opening this panel. It is now an
 *     «عن التحليل الآلي» info button that opens the panel immediately.
 *  2. The export in ./_use-case-graph-state.ts (generateAiDocument) headed its
 *     output «تحليل آلي بواسطة نظامي AI» and appended three generic
 *     «التوصيات». The header and the recommendations are gone; the output is
 *     now described as what it is — a text copy of the user's own cards.
 *
 * `nodeCount`, `selectedNodeIds` and `generateAiDocument` stay on the props
 * interface although nothing here reads them any more: ./CaseGraphView.tsx
 * passes all three, and dropping them from the interface would turn that JSX
 * into an excess-property error for no gain.
 */
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
}: AiAnalysisPanelProps) {
  if (!showAiAnalysis) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-full px-4 z-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`rounded-3xl p-5 shadow-2xl border flex flex-col gap-4 backdrop-blur-xl ${
          isDark ? "bg-zinc-900/95 border-white/[0.08]" : "bg-white/95 border-zinc-200"
        }`}
      >
        <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-white/[0.08]" : "border-zinc-200"}`}>
          <div className="flex items-center gap-3">
            <div
              className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${
                isDark ? "bg-white/[0.06]" : "bg-zinc-100"
              }`}
            >
              <Info size={18} weight="fill" className={isDark ? "text-zinc-300" : "text-zinc-600"} />
            </div>
            <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              لا يوجد تحليل آلي لهذه اللوحة
            </p>
          </div>
          <button
            onClick={() => setShowAiAnalysis(false)}
            className={`text-[10px] px-3 py-1.5 rounded-lg border font-bold ${
              isDark
                ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                : "bg-zinc-100 border-zinc-200 text-zinc-600"
            }`}
          >
            إغلاق
          </button>
        </div>

        <div className={`text-xs leading-relaxed space-y-2 ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
          {/* One paragraph, and it only states what the platform does not do.
              A second paragraph used to send the reader to «لوحة قيادة المنشأة»
              to file a request with «فريق نظامي القانوني» — copy written for the
              corporate board. This canvas is also mounted on the LAWYER case file
              (dashboard/lawyer/cases/[id]), where six practising lawyers see it:
              they have no such dashboard, and telling a lawyer to order a legal
              opinion on their own case from a route that does not exist for them
              is a second false statement inside the panel that exists to stop
              making them. */}
          <p>
            المنصة لا تقرأ محتوى هذه اللوحة ولا تُصدر أي قراءة قانونية له. البطاقات والروابط
            التي تراها من إنشائك أنت وفريقك وحدكم، ولا تُضيف إليها المنصة أي مواد نظامية أو
            أحكام أو سوابق قضائية.
          </p>
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

              {/* Actions.
                  Two primary buttons used to sit next to «إغلاق»: «فتح المستند»
                  on a doc card and «عرض نص المادة» on a law card. Neither had an
                  onClick, and neither could have one — a graph card is free text
                  the user typed, not a link to a stored document or to a statute in
                  any library. «عرض نص المادة» was the worse of the two: it implied
                  the platform could produce the text of whatever article the card
                  named. */}
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
              {/* Header read «مستند الجراف — نظامي AI» over «يمكنك التعديل ثم
                  إرساله للمُجمِّع أو الصائغ». The platform contributed nothing to
                  this text, and there is nobody to send it to — the «إرسال
                  للمُجمِّع» button below it had no handler. Both corrected. */}
              <div className="flex-1">
                <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                  ملخص اللوحة البصرية
                </p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  نص بطاقاتك وروابطها — انسخه من هنا لاستخدامه في مستندك
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
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
