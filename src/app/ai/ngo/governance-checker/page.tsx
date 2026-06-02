"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, CheckCircle, XCircle, Warning,
  Buildings, UsersThree, Money, FileText,
  ArrowLeft, ArrowRight, Download, TrendUp
} from "@phosphor-icons/react";

// ─── Governance check items ───────────────────────────────────────────────────
interface CheckItem {
  id: string;
  category: string;
  requirement: string;
  source: string;
  status: "compliant" | "violation" | "partial" | "pending";
  notes: string;
  priority: "critical" | "high" | "medium";
}

const INITIAL_CHECKS: CheckItem[] = [
  // هيكل الحوكمة
  { id:"g1", category:"هيكل الحوكمة", requirement:"وجود مجلس إدارة مشكَّل بشكل نظامي", source:"نظام الجمعيات والمؤسسات الأهلية — م.15", status:"pending", notes:"", priority:"critical" },
  { id:"g2", category:"هيكل الحوكمة", requirement:"النظام الأساسي معتمد ومودَع", source:"المركز الوطني لتنمية القطاع غير الربحي", status:"pending", notes:"", priority:"critical" },
  { id:"g3", category:"هيكل الحوكمة", requirement:"فصل بين مهام المجلس والإدارة التنفيذية", source:"معيار الحوكمة 2022 — المركز الوطني", status:"pending", notes:"", priority:"high" },
  // التسجيل والترخيص
  { id:"g4", category:"التسجيل والترخيص", requirement:"الترخيص الساري من المركز الوطني", source:"المركز الوطني — وزارة الموارد البشرية", status:"pending", notes:"", priority:"critical" },
  { id:"g5", category:"التسجيل والترخيص", requirement:"السجل التجاري / وثيقة الكيان", source:"وزارة التجارة", status:"pending", notes:"", priority:"high" },
  // المالية والشفافية
  { id:"g6", category:"المالية والشفافية", requirement:"القوائم المالية السنوية مراجعة من مراجع حسابات معتمد", source:"المركز الوطني — معيار الإفصاح المالي", status:"pending", notes:"", priority:"critical" },
  { id:"g7", category:"المالية والشفافية", requirement:"الحسابات البنكية منفصلة عن الشخصية", source:"متطلبات البنك المركزي (SAMA)", status:"pending", notes:"", priority:"high" },
  { id:"g8", category:"المالية والشفافية", requirement:"نشر التقرير السنوي للجهات المعنية", source:"نظام الجمعيات — م.22", status:"pending", notes:"", priority:"medium" },
  // مكافحة غسل الأموال
  { id:"g9", category:"مكافحة غسيل الأموال (FATF)", requirement:"سياسة اعرف عميلك (KYC) للمتبرعين", source:"نظام مكافحة غسل الأموال — م.6", status:"pending", notes:"", priority:"critical" },
  { id:"g10", category:"مكافحة غسيل الأموال (FATF)", requirement:"توثيق التبرعات الكبيرة (+50,000 ر.س)", source:"لوائح وحدة الاستخبارات المالية (فاتف)", status:"pending", notes:"", priority:"high" },
  // العمل التطوعي
  { id:"g11", category:"العمل التطوعي", requirement:"عقود التطوع موقعة ومحفوظة", source:"نظام العمل التطوعي — م.8", status:"pending", notes:"", priority:"medium" },
  { id:"g12", category:"العمل التطوعي", requirement:"التأمين الصحي للمتطوعين أثناء المهام", source:"نظام العمل التطوعي — م.14", status:"pending", notes:"", priority:"medium" },
];

const STATUS_CONFIG = {
  compliant: { label:"ملتزم",      color:"text-emerald-400", bg:"bg-emerald-500/10 border-emerald-500/30", icon:CheckCircle },
  violation:  { label:"مخالفة",    color:"text-red-400",     bg:"bg-red-500/10 border-red-500/30",         icon:XCircle },
  partial:    { label:"جزئي",      color:"text-amber-400",   bg:"bg-amber-500/10 border-amber-500/30",     icon:Warning },
  pending:    { label:"لم يُقيَّم",color:"text-zinc-500",    bg:"bg-white/[0.03] border-white/[0.07]",     icon:ShieldCheck },
};

const PRIORITY_BADGE = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  medium:   "bg-zinc-700/40 text-zinc-400 border-zinc-600/40",
};
const PRIORITY_LABELS = { critical:"حرجة", high:"عالية", medium:"متوسطة" };

type FilterStatus = "all" | "compliant" | "violation" | "partial" | "pending";

export default function NGOGovernanceCheckerPage() {
  const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  function updateStatus(id: string, status: CheckItem["status"]) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  }
  function updateNotes(id: string, notes: string) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, notes } : c));
  }

  const stats = {
    compliant: checks.filter(c => c.status === "compliant").length,
    violation:  checks.filter(c => c.status === "violation").length,
    partial:    checks.filter(c => c.status === "partial").length,
    pending:    checks.filter(c => c.status === "pending").length,
    total:      checks.length,
  };
  const score = Math.round((stats.compliant + stats.partial * 0.5) / stats.total * 100);
  const criticalViolations = checks.filter(c => c.status === "violation" && c.priority === "critical").length;

  const categories = [...new Set(checks.map(c => c.category))];
  const filtered = filter === "all" ? checks : checks.filter(c => c.status === filter);

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-5xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-500 flex items-center justify-center shadow-lg">
          <Buildings size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">مدقق حوكمة الجمعية</h1>
          <p className="text-[12px] text-zinc-500">المركز الوطني · FATF · نظام الجمعيات · العمل التطوعي</p>
        </div>
        <span className="mr-auto rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 text-[10px] font-bold text-emerald-400">
          جمعية خيرية
        </span>
      </div>

      {/* Alert if critical violations */}
      {criticalViolations > 0 && (
        <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
          className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3"
        >
          <Warning size={16} className="text-red-400 flex-shrink-0 mt-0.5" weight="fill" />
          <div>
            <div className="text-[12px] font-bold text-red-400">تحذير: {criticalViolations} مخالفة حرجة</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              المخالفات الحرجة قد تعرض الجمعية لتعليق الترخيص أو الغرامات النظامية. يجب معالجتها فورياً.
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-emerald-900/40 to-slate-900/80 p-4 flex flex-col items-center justify-center gap-1">
          <div className="text-[32px] font-black text-white">{score}%</div>
          <div className="text-[10px] text-zinc-500 font-semibold">درجة الامتثال</div>
          <div className={`text-[11px] font-bold mt-1 ${score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {score >= 80 ? "جيد" : score >= 50 ? "يحتاج تحسين" : "خطر"}
          </div>
        </div>
        {(["compliant","violation","partial","pending"] as const).map(k => {
          const cfg = STATUS_CONFIG[k];
          const IconComp = cfg.icon;
          return (
            <button key={k} onClick={() => setFilter(filter === k ? "all" : k)}
              className={`rounded-2xl border p-4 text-right transition-all ${
                filter === k ? cfg.bg : "border-white/[0.07] bg-white/[0.03] hover:border-white/15"
              }`}
            >
              <IconComp size={16} className={`${cfg.color} mb-2`} />
              <div className={`text-[24px] font-black ${cfg.color}`}>{stats[k]}</div>
              <div className="text-[10px] text-zinc-500">{cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filter + Export */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(["all","compliant","violation","partial","pending"] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-all ${
              filter === f ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-white/[0.07] text-zinc-500 hover:border-white/20 hover:text-zinc-400"
            }`}
          >{f === "all" ? "الكل" : STATUS_CONFIG[f].label}</button>
        ))}
        <button className="mr-auto flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition-all">
          <Download size={11} /> تقرير الامتثال PDF
        </button>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {categories.map(cat => {
          const catItems = filtered.filter(c => c.category === cat);
          if (!catItems.length) return null;
          return (
            <div key={cat}>
              <div className="text-[11px] font-bold text-zinc-600 flex items-center gap-2 pt-3 pb-2">
                <div className="flex-1 h-px bg-white/[0.04]" />
                {cat}
                <div className="flex-1 h-px bg-white/[0.04]" />
              </div>
              {catItems.map(item => {
                const cfg = STATUS_CONFIG[item.status];
                const IconComp = cfg.icon;
                const isOpen = expanded === item.id;

                return (
                  <div key={item.id} className={`rounded-xl border ${cfg.bg} transition-all mb-2`}>
                    <button onClick={() => setExpanded(isOpen ? null : item.id)}
                      className="flex items-center gap-3 w-full p-4 text-right"
                    >
                      <IconComp size={15} className={`${cfg.color} flex-shrink-0`} weight="fill" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate">{item.requirement}</div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">{item.source}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGE[item.priority]}`}>
                          {PRIORITY_LABELS[item.priority]}
                        </span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }}
                        className="px-4 pb-4 space-y-3"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-zinc-500">الحالة:</span>
                          {(["compliant","partial","violation","pending"] as const).map(s => (
                            <button key={s} onClick={() => updateStatus(item.id, s)}
                              className={`rounded-lg border px-3 py-1 text-[10px] font-bold transition-all ${
                                item.status === s
                                  ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color}`
                                  : "border-white/[0.07] text-zinc-600 hover:border-white/20"
                              }`}
                            >{STATUS_CONFIG[s].label}</button>
                          ))}
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-500 mb-1 block">ملاحظات وإجراءات مطلوبة</label>
                          <textarea value={item.notes} onChange={e => updateNotes(item.id, e.target.value)} rows={2}
                            placeholder="أدخل ملاحظاتك أو الإجراءات التصحيحية..."
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 resize-none"
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-600">
          <TrendUp size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-[13px]">لا توجد بنود بهذا الفلتر</p>
        </div>
      )}
    </div>
  );
}
