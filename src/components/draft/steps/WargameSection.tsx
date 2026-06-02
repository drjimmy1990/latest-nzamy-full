"use client";

/**
 * WargameSection — محاكي الخصم والمحكمة (الإصدار النهائي)
 * ─────────────────────────────────────────────────────
 * ١. اختيار ما تريد محاكاته: الخصم / المحكمة / التحسينات (أو الكل)
 * ٢. تشغيل المحاكاة
 * ٣. عرض النتائج مرتبة حسب الأهمية — كل نقطة قابلة للتوسع
 * ٤. اختيار: إضافة / تعديل / حذف — مرتبة حسب الأهمية
 * ٥. بعد تطبيق الإضافات: يُطوى قسم المحاكاة ويظهر مكانه المذكرة المُحدَّثة بالإضافات بالأحمر
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sword, Gavel, ShieldCheck, Spinner, CheckCircle, CheckFat, Plus,
  WarningCircle, CaretDown, Lightbulb, ArrowsClockwise,
  Check, Trash, PencilSimple, X, Robot, Eye,
} from "@phosphor-icons/react";

// ─── Types ─────────────────────────────────────────────────────────────────────
export type SimTarget = "adversary" | "court" | "improvements";

interface WargamePoint {
  id: string;
  source: SimTarget;
  title: string;
  detail: string;
  severity: "critical" | "medium" | "low";
  response: string; // suggested response/fix
}

type ItemAction = "add" | "edit" | "delete" | null;

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_POINTS: WargamePoint[] = [
  {
    id: "w1", source: "adversary", severity: "critical",
    title: "الخصم سيدفع بالقبول الضمني للاستقالة",
    detail: "سيتمسك الخصم بأن عدم اعتراض الموكل خلال الفترة الأولى يُعدّ قبولاً ضمنياً للإنهاء، مستنداً إلى مبدأ الاستصحاب.",
    response: "أضف فقرة صريحة تنفي القبول الضمني مستنداً إلى مبدأ أن الصمت لا يُعدّ قبولاً في عقود العمل النظامية، مع الاستشهاد بحكم المحكمة العمالية رقم ٤٥٦/ع/١٤٤٤.",
  },
  {
    id: "w2", source: "adversary", severity: "medium",
    title: "الخصم سيطعن في شهادة الشاهد لعدم توثيقها",
    detail: "شهادة الشاهد الرئيسي غير موثقة رسمياً.",
    response: "أشر إلى أن عبء الإثبات يقع على عاتق الخصم وفق المادة (٢) من نظام الإثبات، وأن شهادة الشاهد مقبولة بموجب المادة (٣٤).",
  },
  {
    id: "w3", source: "court", severity: "critical",
    title: "القاضي قد يسأل: لماذا تأخر الموكل في رفع الدعوى؟",
    detail: "التأخر في رفع الدعوى قد يُشكّك في جدية الطلب.",
    response: "أضف فقرة تُبيّن أن التأخر ناتج عن محاولة تسوية ودية، وأن التقادم لم يكتمل وفق المادة (٢٢٢) من نظام الأحوال الشخصية.",
  },
  {
    id: "w4", source: "court", severity: "medium",
    title: "القاضي قد يطلب تفصيل قيمة التعويض المطلوبة",
    detail: "المذكرة لم تُحدد مبلغاً مقداراً للتعويض.",
    response: "أضف جدولاً مالياً تفصيلياً يتضمن: الأجر × أشهر الإنهاء + مكافأة نهاية الخدمة + الإجازات المتبقية.",
  },
  {
    id: "w5", source: "improvements", severity: "low",
    title: "تقوية الاستشهاد بأحكام قضائية سابقة مماثلة",
    detail: "المذكرة تفتقر إلى سوابق قضائية مقارنة تُعزز الموقف.",
    response: "أضف مرجعاً لحكم المحكمة العمالية بالرياض رقم ١٢٣/ع/١٤٤٤ الذي قضى بتعويض مماثل في وقائع مشابهة.",
  },
  {
    id: "w6", source: "improvements", severity: "low",
    title: "تعزيز الطلبات بطلب احتياطي",
    detail: "عدم وجود طلب احتياطي قد يُضيّق هامش المناورة أمام المحكمة.",
    response: "أضف طلباً احتياطياً من الدرجة الثانية: «احتياطياً — الحكم بالتعويض المبني على أجر شهر واحد عن كل سنة خدمة».",
  },
];

const SEV_CONFIG = {
  critical: {
    dot: "bg-red-500",
    badge: { d: "border-red-700/20 bg-red-900/10 text-red-400", l: "border-red-200 bg-red-50 text-red-600" },
    label: "حرجة",
  },
  medium: {
    dot: "bg-amber-400",
    badge: { d: "border-amber-700/20 bg-amber-900/10 text-amber-400", l: "border-amber-200 bg-amber-50 text-amber-700" },
    label: "متوسطة",
  },
  low: {
    dot: "bg-blue-400",
    badge: { d: "border-blue-700/20 bg-blue-900/10 text-blue-400", l: "border-blue-200 bg-blue-50 text-blue-700" },
    label: "تحسين",
  },
};

const SOURCE_CONFIG: Record<SimTarget, { icon: React.ElementType; label: string; color: string; bg: { d: string; l: string } }> = {
  adversary:    { icon: Sword,       label: "الخصم",        color: "text-red-400",     bg: { d: "bg-red-900/20 border-red-700/30",     l: "bg-red-50 border-red-200"     } },
  court:        { icon: Gavel,       label: "المحكمة",      color: "text-blue-400",    bg: { d: "bg-blue-900/20 border-blue-700/30",   l: "bg-blue-50 border-blue-200"   } },
  improvements: { icon: ShieldCheck, label: "تحسينات",      color: "text-emerald-400", bg: { d: "bg-emerald-900/20 border-emerald-700/30", l: "bg-emerald-50 border-emerald-200" } },
};

// ─── Memo preview with red highlights ────────────────────────────────────────
function AppliedMemoPreview({ isDark, applied }: { isDark: boolean; applied: WargamePoint[] }) {
  const MEMO_BASE = `بسم الله الرحمن الرحيم\n\nأصحاب الفضيلة / قضاة الدائرة العمالية حفظهم الله\n\nالسلام عليكم ورحمة الله وبركاته\n\n**الموضوع: صحيفة دعوى — فصل تعسفي**\n\n**أولاً: الوقائع**\nالتحق موكلنا بالعمل لدى المدعى عليها بموجب عقد عمل محدد المدة، وقد فوجئ بإنهاء خدماته دون إشعار مسبق ودون مسوّغ نظامي مشروع.\n\n**ثانياً: الأسانيد القانونية**\n\n**الدفع الأول:** بطلان الإنهاء لعدم الإشعار المسبق — استناداً إلى المادة (٧٧) من نظام العمل.\n\n**الدفع الثاني:** استحقاق مكافأة نهاية الخدمة كاملة وفقاً للمادتين (٨٤) و(٨٨) من نظام العمل.\n\n**ثالثاً: الطلبات**\nنلتمس الحكم بإلزام المدعى عليها بأجر الإشعار + مكافأة نهاية الخدمة + التعويض عن الفصل التعسفي.`;

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${isDark ? "border-white/[0.05] bg-zinc-900/60" : "border-slate-100 bg-slate-50"}`}>
        <Eye size={14} weight="duotone" className="text-[#C8A762]" />
        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
          المذكرة الختامية بعد تطبيق {applied.length} تحسين
        </p>
        <div className="flex items-center gap-1.5 mr-auto">
          <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-slate-300" /><span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نص أصلي</span></div>
          <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-red-400" /><span className="text-[9px] text-red-400">إضافة جديدة</span></div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className={`rounded-xl p-3 text-[11px] leading-[2] whitespace-pre-line ${isDark ? "bg-zinc-950/40 text-zinc-400" : "bg-slate-50 text-slate-600"}`}>
          {MEMO_BASE}
        </div>
        <div className="space-y-2">
          <p className={`text-[11px] font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>الإضافات المُطبَّقة ({applied.length})</p>
          {applied.map(p => (
            <div key={p.id}
              className={`border-r-4 border-red-500 rounded-xl px-3 py-2.5 ${isDark ? "bg-red-900/8 border-red-700/20" : "bg-red-50 border-red-200"}`}
            >
              <p className="text-[9px] font-bold text-red-500 mb-1">
                إضافة جديدة — {SOURCE_CONFIG[p.source].label}
              </p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-red-300/80" : "text-red-800"}`}>{p.response}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold">
            تنزيل Word بعد التطبيق
          </button>
          <button className={`px-4 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.07] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
            PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single result card ────────────────────────────────────────────────────────
function ResultCard({
  point, isDark, action, onAction,
}: {
  point: WargamePoint; isDark: boolean;
  action: ItemAction; onAction: (a: ItemAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_CONFIG[point.severity];
  const src = SOURCE_CONFIG[point.source];
  const SrcIcon = src.icon;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      action === "add"    ? isDark ? "border-emerald-700/30 bg-emerald-900/8"  : "border-emerald-200 bg-emerald-50/60"
      : action === "delete" ? isDark ? "border-red-700/20 bg-red-900/5 opacity-50"    : "border-red-200 bg-red-50/50 opacity-50"
      : action === "edit"   ? isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5"           : "border-amber-200 bg-amber-50/60"
      : isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm"
    }`}>
      {/* Header row */}
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-start gap-3 px-4 py-3 text-right">
        {/* Severity dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sev.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isDark ? sev.badge.d : sev.badge.l}`}>{sev.label}</span>
            <div className={`flex items-center gap-1 text-[9px] font-medium ${src.color}`}>
              <SrcIcon size={9} weight="duotone" />
              {src.label}
            </div>
          </div>
          <p className={`text-[12px] font-semibold leading-snug ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{point.title}</p>
        </div>

        {/* Action chips */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onAction(action === "add" ? null : "add")}
            title="إضافة للمذكرة"
            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${action === "add" ? "border-emerald-500 bg-emerald-500 text-white" : isDark ? "border-white/[0.08] text-zinc-500 hover:border-emerald-500/40 hover:text-emerald-400" : "border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-500"}`}>
            {action === "add" ? <Check size={10} weight="bold" /> : <Plus size={10} />}
          </button>
          <button onClick={() => onAction(action === "edit" ? null : "edit")}
            title="تعديل وإضافة"
            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${action === "edit" ? "border-[#C8A762] bg-[#C8A762]/10 text-[#C8A762]" : isDark ? "border-white/[0.08] text-zinc-500 hover:border-[#C8A762]/40 hover:text-[#C8A762]" : "border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-500"}`}>
            <PencilSimple size={10} />
          </button>
          <button onClick={() => onAction(action === "delete" ? null : "delete")}
            title="تجاهل"
            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${action === "delete" ? "border-red-500/40 bg-red-500/10 text-red-400" : isDark ? "border-white/[0.08] text-zinc-500 hover:border-red-500/30 hover:text-red-400" : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-400"}`}>
            <Trash size={10} />
          </button>
        </div>

        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <CaretDown size={10} className={isDark ? "text-zinc-600" : "text-slate-400"} />
        </motion.span>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={`border-t px-4 pb-4 pt-3 space-y-2.5 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{point.detail}</p>
              <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                <Lightbulb size={11} weight="duotone" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                <div>
                  <p className={`text-[9px] font-bold mb-0.5 text-[#C8A762]`}>الرد المقترح</p>
                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{point.response}</p>
                </div>
              </div>
              {action === "edit" && (
                <textarea rows={2}
                  placeholder="عدّل الرد المقترح هنا قبل إضافته للمذكرة..."
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-[11px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600" : "border-amber-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
                  defaultValue={point.response}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main WargameSection ───────────────────────────────────────────────────────
export function WargameSection({ isDark }: { isDark: boolean }) {
  const [open,        setOpen]        = useState(false);
  const [targets,     setTargets]     = useState<Set<SimTarget>>(new Set(["adversary", "court"]));
  const [simulating,  setSimulating]  = useState(false);
  const [simulated,   setSimulated]   = useState(false);
  const [applied,     setApplied]     = useState(false);
  const [actions,     setActions]     = useState<Record<string, ItemAction>>({});
  const [wargameOpen, setWargameOpen] = useState(true); // collapse toggle after apply

  // ── Filtered & sorted results ────────────────────────────────────────────
  const filtered = MOCK_POINTS
    .filter(p => targets.size === 0 || targets.has(p.source))
    .sort((a, b) => {
      const ord = { critical: 0, medium: 1, low: 2 };
      return ord[a.severity] - ord[b.severity];
    });

  const appliedPoints = filtered.filter(p => actions[p.id] === "add" || actions[p.id] === "edit");
  const hasAnyAction  = appliedPoints.length > 0;

  function toggleTarget(t: SimTarget) {
    setTargets(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  async function runSimulation() {
    setSimulating(true);
    await new Promise(r => setTimeout(r, 2400));
    setSimulating(false);
    setSimulated(true);
  }

  function applyToMemo() {
    setApplied(true);
    setWargameOpen(false);
  }

  // ── Collapsed trigger ─────────────────────────────────────────────────────
  if (!open) {
    return (
      <div className={`rounded-2xl border-2 border-dashed ${isDark ? "border-amber-700/30 bg-amber-900/5" : "border-amber-200 bg-amber-50/50"}`}>
        <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-900/30" : "bg-amber-100"}`}>
            <Sword size={17} weight="duotone" className="text-amber-500" />
          </div>
          <div className="flex-1 text-right">
            <div className="flex items-center gap-2">
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>محاكي الخصم والمحكمة</p>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-amber-700/30 bg-amber-900/20 text-amber-400" : "border-amber-300 bg-amber-100 text-amber-700"}`}>اختياري</span>
            </div>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>اكتشف الثغرات قبل الخصم — اعتراضات · أسئلة المحكمة · تحسينات</p>
          </div>
          <CaretDown size={14} className={isDark ? "text-amber-700" : "text-amber-400"} />
        </button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

      {/* ── Applied memo preview (shown after apply) ── */}
      {applied && appliedPoints.length > 0 && (
        <AppliedMemoPreview isDark={isDark} applied={appliedPoints} />
      )}

      {/* ── Wargame panel (collapsible after apply) ── */}
      <div className={`rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.06] bg-zinc-900/70" : "border-slate-200 bg-white shadow-sm"}`}>
        {/* Header */}
        <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-900/30" : "bg-amber-100"}`}>
            <Sword size={15} weight="duotone" className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>محاكي الخصم والمحكمة</p>
            {simulated && (
              <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {appliedPoints.length} إضافة مختارة · {filtered.filter(p => actions[p.id] === "delete").length} تجاهل
              </p>
            )}
          </div>
          {applied && (
            <button onClick={() => setWargameOpen(v => !v)}
              className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
              {wargameOpen ? <><X size={10} />إخفاء</> : <><Eye size={10} />عرض</>}
            </button>
          )}
          {!applied && (
            <button onClick={() => setOpen(false)} className={`w-6 h-6 flex items-center justify-center rounded ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              <X size={12} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {(!applied || wargameOpen) && (
            <motion.div
              initial={false}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-4">

                {/* ── Step 1: Target Selection ── */}
                {!simulated && !simulating && (
                  <div className="space-y-3">
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اختر ما تريد محاكاته:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(SOURCE_CONFIG) as SimTarget[]).map(t => {
                        const cfg = SOURCE_CONFIG[t];
                        const Icon = cfg.icon;
                        const active = targets.has(t);
                        return (
                          <button key={t} onClick={() => toggleTarget(t)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                              active
                                ? isDark ? `${cfg.bg.d} border-current` : `${cfg.bg.l} border-current`
                                : isDark ? "border-white/[0.06] bg-zinc-900/40 text-zinc-600" : "border-slate-200 text-slate-400"
                            }`}>
                            <Icon size={16} weight="duotone" className={active ? cfg.color : ""} />
                            <span className={`text-[10px] font-bold ${active ? cfg.color : ""}`}>{cfg.label}</span>
                            {active && <Check size={10} className={cfg.color} weight="bold" />}
                          </button>
                        );
                      })}
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      onClick={runSimulation}
                      disabled={targets.size === 0}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40"
                    >
                      <Sword size={14} weight="duotone" />ابدأ المحاكاة
                    </motion.button>
                  </div>
                )}

                {/* ── Simulating ── */}
                {simulating && (
                  <div className="py-8 flex flex-col items-center gap-4">
                    <div className="relative w-14 h-14">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className={`absolute inset-0 rounded-full border-2 border-dashed ${isDark ? "border-amber-700/30" : "border-amber-300"}`} />
                      <div className={`absolute inset-2 rounded-full flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-amber-50"}`}>
                        <Sword size={18} weight="duotone" className="text-amber-500" />
                      </div>
                    </div>
                    {["تحليل نقاط الضعف", "محاكاة دفوع الخصم", "استحضار أسئلة المحكمة", "ترتيب التحسينات"].map((s, i) => (
                      <motion.div key={s} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.55 }}
                        className="flex items-center gap-2">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                          <Spinner size={11} className="text-[#C8A762]" />
                        </motion.div>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s}</p>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* ── Results ── */}
                {simulated && !simulating && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    {/* Summary bar */}
                    <div className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? "border-amber-700/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                      <div className="flex items-center gap-2">
                        <WarningCircle size={14} weight="fill" className="text-amber-500" />
                        <p className={`text-[12px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                          {filtered.filter(p => p.severity === "critical").length} نقطة حرجة ·
                          {" "}{filtered.filter(p => p.severity === "medium").length} متوسطة ·
                          {" "}{filtered.filter(p => p.severity === "low").length} تحسين
                        </p>
                      </div>
                      <button onClick={() => { setSimulated(false); setActions({}); }}
                        className={`flex items-center gap-1 text-[10px] font-bold ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                        <ArrowsClockwise size={10} />إعادة
                      </button>
                    </div>

                    {/* Action legend */}
                    <div className="flex items-center gap-3 flex-wrap px-1">
                      {[
                        { icon: Plus,          label: "إضافة مباشرة",    color: "text-emerald-500" },
                        { icon: PencilSimple,  label: "تعديل وإضافة",   color: "text-[#C8A762]"   },
                        { icon: Trash,         label: "تجاهل",           color: "text-red-400"     },
                      ].map(({ icon: Icon, label, color }) => (
                        <div key={label} className={`flex items-center gap-1.5 text-[10px] font-bold ${color}`}>
                          <Icon size={10} />{label}
                        </div>
                      ))}
                    </div>

                    {/* Result cards — sorted by severity */}
                    <div className="space-y-2">
                      {filtered.map(p => (
                        <ResultCard
                          key={p.id}
                          point={p}
                          isDark={isDark}
                          action={actions[p.id] ?? null}
                          onAction={a => setActions(prev => ({ ...prev, [p.id]: a }))}
                        />
                      ))}
                    </div>

                    {/* Selected summary */}
                    {hasAnyAction && !applied && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-xl border-2 ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <CheckFat size={14} weight="fill" className="text-emerald-500" />
                          <p className={`text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                            مختار للإضافة: {appliedPoints.length} بند
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {appliedPoints.map(p => (
                            <span key={p.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-emerald-700/30 text-emerald-400 bg-emerald-900/20" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}>
                              {p.title.slice(0, 30)}...
                            </span>
                          ))}
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
                          onClick={applyToMemo}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold"
                        >
                          <CheckFat size={13} weight="fill" />طبّق على المذكرة
                        </motion.button>
                      </motion.div>
                    )}

                    {applied && (
                      <div className={`flex items-center gap-2 p-3 rounded-xl border ${isDark ? "border-emerald-700/20 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50"}`}>
                        <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                        <p className={`text-[12px] font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                          تم تطبيق التعديلات على المذكرة أعلاه
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
