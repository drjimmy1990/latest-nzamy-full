"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, ShieldSlash, PencilSimple, Plus,
  CaretDown, CheckCircle, XCircle, Star, Scales,
  ArrowsOut, Warning, Trash,
} from "@phosphor-icons/react";
import {
  MOCK_DEFENSES, MainDefense, SubDefense, DefenseStatus,
} from "@/components/draft/draftConstants";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DefenseStatus, { badge: string; dot: string }> = {
  confirmed: { badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", dot: "bg-emerald-500" },
  rejected:  { badge: "bg-red-500/10 text-red-500 border-red-500/20",            dot: "bg-red-500"     },
  pending:   { badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",       dot: "bg-amber-400"   },
};
const STATUS_LABELS: Record<DefenseStatus, string> = {
  confirmed: "مؤكَّد", rejected: "مرفوض", pending: "معلَّق",
};
const PRIORITY_COLORS: Record<string, string> = {
  "عالية":    "text-red-500 bg-red-500/10 border-red-500/20",
  "متوسطة":  "text-amber-500 bg-amber-500/10 border-amber-500/20",
  "منخفضة": "text-slate-400 bg-slate-100 border-slate-200",
};

// ─── Sub-Defense row ──────────────────────────────────────────────────────────

function SubDefenseRow({
  sub, isDark, onStatusChange, onDelete, onNoteChange,
}: {
  sub: SubDefense;
  isDark: boolean;
  onStatusChange: (status: DefenseStatus) => void;
  onDelete: () => void;
  onNoteChange: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [noteVal, setNoteVal] = useState(sub.note ?? "");
  const sc = STATUS_COLORS[sub.status];

  return (
    <div className={`flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border transition-all ${
      isDark ? "border-white/[0.04] bg-white/[0.015]" : "border-slate-100 bg-slate-50/70"
    }`}>
      <div className="flex items-center gap-2">
        {/* status dot */}
        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${sc.dot}`} />
        <p className={`flex-1 text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {sub.title}
        </p>
        {sub.legalBase && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
            {sub.legalBase}
          </span>
        )}
        {/* quick actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onStatusChange("confirmed")}
            title="تأكيد"
            className={`h-6 w-6 rounded-lg flex items-center justify-center transition-all ${sub.status === "confirmed" ? "bg-emerald-500 text-white" : isDark ? "bg-zinc-800 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400" : "bg-zinc-100 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600"}`}>
            <CheckCircle size={11} weight="fill" />
          </button>
          <button onClick={() => onStatusChange("rejected")}
            title="رفض"
            className={`h-6 w-6 rounded-lg flex items-center justify-center transition-all ${sub.status === "rejected" ? "bg-red-500 text-white" : isDark ? "bg-zinc-800 text-zinc-500 hover:bg-red-500/20 hover:text-red-400" : "bg-zinc-100 text-zinc-400 hover:bg-red-50 hover:text-red-500"}`}>
            <XCircle size={11} weight="fill" />
          </button>
          <button onClick={() => setEditing(v => !v)}
            title="ملاحظة"
            className={`h-6 w-6 rounded-lg flex items-center justify-center transition-all ${editing ? isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-500" : isDark ? "bg-zinc-800 text-zinc-500 hover:text-zinc-300" : "bg-zinc-100 text-zinc-400 hover:text-zinc-600"}`}>
            <PencilSimple size={10} />
          </button>
          <button onClick={onDelete}
            className={`h-6 w-6 rounded-lg flex items-center justify-center transition-all ${isDark ? "bg-zinc-800 text-zinc-700 hover:bg-red-500/10 hover:text-red-400" : "bg-zinc-100 text-zinc-300 hover:bg-red-50 hover:text-red-400"}`}>
            <Trash size={10} />
          </button>
        </div>
      </div>
      {/* note editor */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`flex gap-2 pt-1 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              <textarea
                value={noteVal}
                onChange={e => setNoteVal(e.target.value)}
                placeholder="أضف ملاحظة على هذا الدفع الفرعي..."
                rows={2}
                className={`flex-1 text-[11px] bg-transparent outline-none resize-none rounded-lg p-2 border ${isDark ? "border-white/[0.06] text-zinc-300 placeholder:text-zinc-600" : "border-slate-200 text-slate-700 placeholder:text-slate-400"}`}
              />
              <button onClick={() => { onNoteChange(noteVal); setEditing(false); }}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-[#0B3D2E] text-white font-bold self-start">
                حفظ
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Defense Card ─────────────────────────────────────────────────────────

function DefenseCard({
  def, index, isDark,
  onMainStatus, onSubStatus, onSubDelete, onSubNoteChange, onAddSub,
}: {
  def: MainDefense;
  index: number;
  isDark: boolean;
  onMainStatus: (id: string, s: DefenseStatus) => void;
  onSubStatus: (defId: string, subId: string, s: DefenseStatus) => void;
  onSubDelete: (defId: string, subId: string) => void;
  onSubNoteChange: (defId: string, subId: string, note: string) => void;
  onAddSub: (defId: string, title: string) => void;
}) {
  const [expanded,   setExpanded]   = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [newSubText, setNewSubText] = useState("");
  const sc = STATUS_COLORS[def.status];

  const confirmedCount = def.subDefenses.filter(s => s.status === "confirmed").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`rounded-2xl border overflow-hidden transition-all ${
        def.isCore
          ? isDark ? "border-amber-500/25 bg-amber-500/[0.04]" : "border-amber-200 bg-amber-50/60"
          : isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"
      } ${def.status === "rejected" ? "opacity-55" : ""}`}
    >
      {/* ── Header ── */}
      <div
        className="flex items-start gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Index badge */}
        <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-black ${
          def.isCore
            ? "bg-amber-500 text-white"
            : isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
        }`}>{index + 1}</div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{def.title}</p>
            {/* Core badge */}
            {def.isCore && (
              <span className="flex items-center gap-1 text-[9px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                <Star size={8} weight="fill" /> جوهري
              </span>
            )}
            {/* Priority */}
            <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[def.priority]}`}>
              {def.priority}
            </span>
          </div>
          {def.legalBase && (
            <p className={`text-[10px] flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              <Scales size={9} /> {def.legalBase}
            </p>
          )}
        </div>

        {/* Sub progress */}
        <span className={`text-[10px] font-bold flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {confirmedCount}/{def.subDefenses.length} دفع
        </span>

        {/* Status toggle */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onMainStatus(def.id, "confirmed")}
            title="تأكيد الدفع"
            className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all ${def.status === "confirmed" ? "bg-emerald-500 text-white" : isDark ? "bg-zinc-800 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400" : "bg-zinc-100 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600"}`}>
            <ShieldCheck size={14} weight={def.status === "confirmed" ? "fill" : "regular"} />
          </button>
          <button onClick={() => onMainStatus(def.id, "rejected")}
            title="رفض الدفع"
            className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all ${def.status === "rejected" ? "bg-red-500 text-white" : isDark ? "bg-zinc-800 text-zinc-500 hover:bg-red-500/20 hover:text-red-400" : "bg-zinc-100 text-zinc-400 hover:bg-red-50 hover:text-red-500"}`}>
            <ShieldSlash size={14} weight={def.status === "rejected" ? "fill" : "regular"} />
          </button>
        </div>

        {/* Expand caret */}
        <motion.span animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.2 }}
          className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          <CaretDown size={14} />
        </motion.span>
      </div>

      {/* ── Body: summary + sub-defenses ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 pt-1 space-y-2.5 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              {/* Summary */}
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                {def.summary}
              </p>

              {/* Sub-defenses label */}
              {def.subDefenses.length > 0 && (
                <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                  الدفوع الفرعية ({def.subDefenses.length})
                </p>
              )}

              {/* Sub-defenses list */}
              <div className="space-y-1.5">
                {def.subDefenses.map(sub => (
                  <SubDefenseRow
                    key={sub.id}
                    sub={sub}
                    isDark={isDark}
                    onStatusChange={s => onSubStatus(def.id, sub.id, s)}
                    onDelete={() => onSubDelete(def.id, sub.id)}
                    onNoteChange={note => onSubNoteChange(def.id, sub.id, note)}
                  />
                ))}
              </div>

              {/* Add sub-defense */}
              {addingNote ? (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 p-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
                  <input
                    autoFocus
                    value={newSubText}
                    onChange={e => setNewSubText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newSubText.trim()) { onAddSub(def.id, newSubText.trim()); setNewSubText(""); setAddingNote(false); } if (e.key === "Escape") setAddingNote(false); }}
                    placeholder="اكتب الدفع الفرعي الجديد..."
                    className={`flex-1 text-[11px] bg-transparent outline-none ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-slate-400"}`}
                  />
                  <button onClick={() => { if (newSubText.trim()) { onAddSub(def.id, newSubText.trim()); setNewSubText(""); } setAddingNote(false); }}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-[#0B3D2E] text-white font-bold flex-shrink-0">
                    إضافة
                  </button>
                </motion.div>
              ) : (
                <button onClick={e => { e.stopPropagation(); setAddingNote(true); }}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-xl border border-dashed transition-all ${isDark ? "border-white/[0.08] text-zinc-600 hover:text-zinc-400 hover:border-white/[0.15]" : "border-slate-200 text-slate-400 hover:text-[#0B3D2E] hover:border-[#0B3D2E]/30"}`}>
                  <Plus size={10} /> إضافة دفع فرعي
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Step Component ───────────────────────────────────────────────────────

export function StepDefenses({ isDark }: { isDark: boolean }) {
  const [defenses, setDefenses] = useState<MainDefense[]>(MOCK_DEFENSES);
  const [addingMain, setAddingMain] = useState(false);
  const [newMainText, setNewMainText] = useState("");

  // Stats
  const confirmed   = defenses.filter(d => d.status === "confirmed").length;
  const pending     = defenses.filter(d => d.status === "pending").length;
  const coreCount   = defenses.filter(d => d.isCore).length;
  const totalPct    = Math.round((confirmed / defenses.length) * 100);

  const onMainStatus = (id: string, s: DefenseStatus) =>
    setDefenses(prev => prev.map(d => d.id === id ? { ...d, status: s } : d));

  const onSubStatus = (defId: string, subId: string, s: DefenseStatus) =>
    setDefenses(prev => prev.map(d =>
      d.id === defId ? { ...d, subDefenses: d.subDefenses.map(sub => sub.id === subId ? { ...sub, status: s } : sub) } : d
    ));

  const onSubDelete = (defId: string, subId: string) =>
    setDefenses(prev => prev.map(d =>
      d.id === defId ? { ...d, subDefenses: d.subDefenses.filter(sub => sub.id !== subId) } : d
    ));

  const onSubNoteChange = (defId: string, subId: string, note: string) =>
    setDefenses(prev => prev.map(d =>
      d.id === defId ? { ...d, subDefenses: d.subDefenses.map(sub => sub.id === subId ? { ...sub, note } : sub) } : d
    ));

  const onAddSub = (defId: string, title: string) =>
    setDefenses(prev => prev.map(d =>
      d.id === defId ? { ...d, subDefenses: [...d.subDefenses, { id: `sub-${Date.now()}`, title, status: "pending" }] } : d
    ));

  const addMainDefense = () => {
    if (!newMainText.trim()) return;
    setDefenses(prev => [...prev, {
      id: `d-${Date.now()}`, title: newMainText.trim(),
      isCore: false, priority: "متوسطة", status: "pending",
      summary: "دفع مضاف يدوياً من المحامي.", subDefenses: [],
    }]);
    setNewMainText(""); setAddingMain(false);
  };

  return (
    <BetaReviewGate toolId="draft.defenses" toolName="استخراج الدفوع القانونية" reviewScope="legal-data">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

        {/* ── Summary bar ── */}
        <div className={`p-4 rounded-2xl border flex flex-wrap items-center gap-4 ${
          isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white shadow-sm"
        }`}>
          {/* Progress ring (SVG) */}
          <div className="relative flex-shrink-0">
            <svg width={52} height={52} viewBox="0 0 52 52">
              <circle cx={26} cy={26} r={20} fill="none" strokeWidth={4}
                stroke={isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"} />
              <circle cx={26} cy={26} r={20} fill="none" strokeWidth={4}
                stroke="#10b981" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - totalPct / 100)}`}
                transform="rotate(-90 26 26)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }} />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-black ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              {totalPct}%
            </span>
          </div>

          <div className="flex-1 space-y-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              الدفوع المقترحة — بالأولوية
            </p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              {confirmed} مؤكَّد · {pending} معلَّق · {coreCount} جوهري
            </p>
          </div>

          {/* Stats pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "جوهرية", count: coreCount, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
              { label: "مؤكَّدة", count: confirmed, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
              { label: "معلَّقة", count: pending,   cls: "bg-zinc-500/10 text-zinc-500 border-zinc-300/30" },
            ].map(p => (
              <span key={p.label} className={`text-[10px] font-bold border px-2 py-1 rounded-full ${p.cls}`}>
                {p.count} {p.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Warning for unconfirmed core defenses ── */}
        {defenses.filter(d => d.isCore && d.status !== "confirmed").length > 0 && (
          <div className={`flex items-center gap-2.5 p-3 rounded-xl border ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
            <Warning size={15} className="text-amber-500 flex-shrink-0" />
            <p className={`text-[11px] font-medium ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              يوجد دفوع جوهرية لم تُؤكَّد بعد — يُنصح بمراجعتها قبل المتابعة
            </p>
          </div>
        )}

        {/* ── Cards ── */}
        <div className="space-y-3">
          {defenses.map((def, i) => (
            <DefenseCard
              key={def.id} def={def} index={i} isDark={isDark}
              onMainStatus={onMainStatus}
              onSubStatus={onSubStatus}
              onSubDelete={onSubDelete}
              onSubNoteChange={onSubNoteChange}
              onAddSub={onAddSub}
            />
          ))}
        </div>

        {/* ── Add main defense ── */}
        {addingMain ? (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2 p-3 rounded-2xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
            <input
              autoFocus value={newMainText} onChange={e => setNewMainText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addMainDefense(); if (e.key === "Escape") setAddingMain(false); }}
              placeholder="عنوان الدفع الرئيسي الجديد..."
              className={`flex-1 text-[12px] bg-transparent outline-none px-2 ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-slate-400"}`}
            />
            <button onClick={addMainDefense}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white font-bold">
              إضافة
            </button>
            <button onClick={() => setAddingMain(false)}
              className={`text-[11px] px-3 py-1.5 rounded-xl border font-bold ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
              إلغاء
            </button>
          </motion.div>
        ) : (
          <button onClick={() => setAddingMain(true)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-[11px] font-bold transition-all ${isDark ? "border-white/[0.07] text-zinc-600 hover:border-white/[0.15] hover:text-zinc-400" : "border-slate-200 text-slate-400 hover:border-[#0B3D2E]/30 hover:text-[#0B3D2E]"}`}>
            <Plus size={13} /> إضافة دفع رئيسي من عندي
          </button>
        )}
      </motion.div>
    </BetaReviewGate>
  );
}
