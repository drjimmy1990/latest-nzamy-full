"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, CheckCircle, XCircle, Warning,
  ArrowsClockwise, FileText, Download, TrendUp
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Check items ──────────────────────────────────────────────────────────────
interface CheckItem {
  id: string;
  category: string;
  requirement: string;
  source: string;
  status: "compliant" | "violation" | "partial" | "pending";
  notes: string;
}

const INITIAL_CHECKS: CheckItem[] = [
  // ديوان المراقبة العامة
  { id:"c1", category:"ديوان المراقبة العامة", requirement:"توثيق العقود الحكومية رسمياً", source:"نظام المالية العامة", status:"pending", notes:"" },
  { id:"c2", category:"ديوان المراقبة العامة", requirement:"الالتزام بإجراءات المشتريات الحكومية", source:"نظام المنافسات والمشتريات — م.3", status:"pending", notes:"" },
  { id:"c3", category:"ديوان المراقبة العامة", requirement:"الإفصاح عن تعارض المصالح", source:"نظام مكافحة الفساد", status:"pending", notes:"" },
  // حماية البيانات
  { id:"c4", category:"حماية البيانات الشخصية (PDPL)", requirement:"تصنيف البيانات الشخصية المعالَجة", source:"نظام حماية البيانات الشخصية — م.4", status:"pending", notes:"" },
  { id:"c5", category:"حماية البيانات الشخصية (PDPL)", requirement:"تعيين مسؤول حماية بيانات", source:"نظام حماية البيانات الشخصية — م.12", status:"pending", notes:"" },
  { id:"c6", category:"حماية البيانات الشخصية (PDPL)", requirement:"إجراءات الإبلاغ عن الاختراقات", source:"نظام حماية البيانات الشخصية — م.26", status:"pending", notes:"" },
  // هيئة النزاهة
  { id:"c7", category:"هيئة النزاهة (نزاهة)", requirement:"الإفصاح عن الذمة المالية للمسؤولين", source:"نظام هيئة النزاهة — م.8", status:"pending", notes:"" },
  { id:"c8", category:"هيئة النزاهة (نزاهة)", requirement:"سياسة الهدايا والمكافآت", source:"نظام مكافحة الرشوة", status:"pending", notes:"" },
  // أمن المعلومات
  { id:"c9", category:"الأمن السيبراني (هيئة الأمن السيبراني)", requirement:"تطبيق الضوابط الأساسية للأمن السيبراني (ECC)", source:"ضوابط الأمن السيبراني للجهات الحكومية", status:"pending", notes:"" },
  { id:"c10", category:"الأمن السيبراني (هيئة الأمن السيبراني)", requirement:"خطة استمرارية الأعمال وتعافي الكوارث", source:"إطار الأمن السيبراني الوطني", status:"pending", notes:"" },
];

const STATUS_CONFIG = {
  compliant: { label: "ملتزم", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle },
  violation:  { label: "مخالفة", color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",     icon: XCircle },
  partial:    { label: "جزئي",   color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30", icon: Warning },
  pending:    { label: "لم يُقيَّم", color: "text-zinc-500", bg: "bg-white/[0.03] border-white/[0.07]", icon: ArrowsClockwise },
};

type FilterStatus = "all" | "compliant" | "violation" | "partial" | "pending";

export default function GovCompliancePage() {
  const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  function updateStatus(id: string, status: CheckItem["status"]) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  }
  function updateNotes(id: string, notes: string) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, notes } : c));
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    compliant: checks.filter(c => c.status === "compliant").length,
    violation:  checks.filter(c => c.status === "violation").length,
    partial:    checks.filter(c => c.status === "partial").length,
    pending:    checks.filter(c => c.status === "pending").length,
    total:      checks.length,
  };
  const score = Math.round((stats.compliant + stats.partial * 0.5) / stats.total * 100);
  const reportText = [
    "تقرير مدقق الامتثال الحكومي",
    "====================",
    `درجة الامتثال: ${score}%`,
    `ملتزم: ${stats.compliant}`,
    `مخالفة: ${stats.violation}`,
    `جزئي: ${stats.partial}`,
    `لم يُقيَّم: ${stats.pending}`,
    "",
    "تفاصيل البنود:",
    ...checks.map((item) => {
      const status = STATUS_CONFIG[item.status].label;
      return `- [${status}] ${item.category}: ${item.requirement} — ${item.source}${item.notes ? ` — ملاحظات: ${item.notes}` : ""}`;
    }),
  ].join("\n");

  // ── Group by category ──────────────────────────────────────────────────────
  const categories = [...new Set(checks.map(c => c.category))];
  const filtered = filter === "all" ? checks : checks.filter(c => c.status === filter);

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-5xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-700 to-sky-500 flex items-center justify-center shadow-lg">
          <ShieldCheck size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">مدقق الامتثال الحكومي</h1>
          <p className="text-[12px] text-zinc-500">ديوان المراقبة · PDPL · نزاهة · الأمن السيبراني</p>
        </div>
        <span className="mr-auto rounded-full bg-blue-500/10 border border-blue-500/25 px-3 py-1 text-[10px] font-bold text-blue-400">
          حكومي · مستشار
        </span>
      </div>

      {/* Score + Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {/* Score card */}
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-blue-900/40 to-slate-900/80 p-4 flex flex-col items-center justify-center gap-1">
          <div className="text-[32px] font-black text-white">{score}%</div>
          <div className="text-[10px] text-zinc-500 font-semibold">درجة الامتثال</div>
          <div className={`text-[11px] font-bold mt-1 ${score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {score >= 80 ? "جيد" : score >= 50 ? "متوسط" : "يحتاج مراجعة"}
          </div>
        </div>

        {/* Stat tiles */}
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

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        {(["all","compliant","violation","partial","pending"] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-all ${
              filter === f ? "border-blue-500/50 bg-blue-500/10 text-blue-400" : "border-white/[0.07] text-zinc-500 hover:border-white/20 hover:text-zinc-400"
            }`}
          >
            {f === "all" ? "الكل" : STATUS_CONFIG[f].label}
          </button>
        ))}
        <div className="mr-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition-all">
            <Download size={11} /> تصدير PDF
          </button>
        </div>
      </div>

      <BetaReviewGate toolId="gov.compliance-checker" toolName="تقرير الامتثال الحكومي" reviewScope="legal-data">
      <AiResultActions text={reportText} filename="gov-compliance-report" showShare className="mb-5" />

      {/* Checklist */}
      <div className="space-y-2">
        {categories.map(cat => {
          const catItems = filtered.filter(c => c.category === cat);
          if (!catItems.length) return null;
          return (
            <div key={cat} className="space-y-2">
              <div className="text-[11px] font-bold text-zinc-600 flex items-center gap-2 pt-2">
                <div className="flex-1 h-px bg-white/[0.04]" />
                {cat}
                <div className="flex-1 h-px bg-white/[0.04]" />
              </div>

              {catItems.map(item => {
                const cfg = STATUS_CONFIG[item.status];
                const IconComp = cfg.icon;
                const isExpanded = expanded === item.id;

                return (
                  <div key={item.id} className={`rounded-xl border ${cfg.bg} transition-all`}>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      className="flex items-center gap-3 w-full p-4 text-right"
                    >
                      <IconComp size={16} className={`${cfg.color} flex-shrink-0`} weight="fill" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate">{item.requirement}</div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">{item.source}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                        {cfg.label}
                      </span>
                    </button>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}
                        className="px-4 pb-4 space-y-3"
                      >
                        {/* Status selector */}
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
                        {/* Notes */}
                        <div>
                          <label className="text-[11px] text-zinc-500 mb-1 block">ملاحظات وإجراءات مطلوبة</label>
                          <textarea value={item.notes} onChange={e => updateNotes(item.id, e.target.value)} rows={2}
                            placeholder="أدخل ملاحظاتك أو الإجراءات التصحيحية المطلوبة..."
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40 resize-none"
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
      </BetaReviewGate>
    </div>
  );
}
