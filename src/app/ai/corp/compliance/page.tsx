"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  ShieldCheck, CheckCircle, Warning, X, Sparkle,
  Buildings, ArrowSquareOut, Bell, Clock,
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";

const COMPLIANCE_AREAS = [
  { id: "vat", label: "ضريبة القيمة المضافة", status: "ok", last: "منذ ٣ أيام" },
  { id: "labor", label: "نظام العمل والعمال", status: "warning", last: "تحديث لائحة العمل عن بُعد" },
  { id: "pdpl", label: "حماية البيانات الشخصية", status: "error", last: "مطلوب: تحديث سياسة الخصوصية" },
  { id: "cr", label: "السجل التجاري والتراخيص", status: "ok", last: "سارٍ حتى ٢٠٢٦/٣" },
  { id: "antiCorrupt", label: "نظام مكافحة الفساد", status: "ok", last: "لا توجد تنبيهات" },
  { id: "cyber", label: "نظام الأمن السيبراني", status: "warning", last: "مطلوب: تقييم سنوي" },
];

const STATUS_CONFIG = {
  ok:      { icon: CheckCircle, color: "text-emerald-500", bg: (isDark: boolean) => isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50",      label: "ملتزم" },
  warning: { icon: Warning,     color: "text-amber-500",   bg: (isDark: boolean) => isDark ? "border-amber-700/20 bg-amber-900/10"   : "border-amber-200 bg-amber-50",           label: "يحتاج مراجعة" },
  error:   { icon: X,           color: "text-red-500",     bg: (isDark: boolean) => isDark ? "border-red-700/20 bg-red-900/10"       : "border-red-200 bg-red-50",               label: "منتهك" },
};

function formatCorpComplianceReport() {
  return COMPLIANCE_AREAS.map((area) => {
    const cfg = STATUS_CONFIG[area.status as keyof typeof STATUS_CONFIG];
    return `${area.label}: ${cfg.label} - ${area.last}`;
  }).join("\n");
}

export default function CorpCompliancePage() {
  const { isDark } = useTheme();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  async function analyze() {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2500));
    setAnalyzing(false); setAnalyzed(true);
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  const okCount      = COMPLIANCE_AREAS.filter(a => a.status === "ok").length;
  const warningCount = COMPLIANCE_AREAS.filter(a => a.status === "warning").length;
  const errorCount   = COMPLIANCE_AREAS.filter(a => a.status === "error").length;

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مراقب الامتثال</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            تحليل مستمر لامتثال شركتك مع الأنظمة السعودية — تنبيهات فورية عند الإخلال
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-900/20" : "bg-emerald-50"}`}>
          <ShieldCheck size={22} weight="duotone" className="text-emerald-500" />
        </div>
      </div>

      {/* Score dashboard */}
      {analyzed && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3">
          {[
            { label: "ملتزم", value: okCount, color: "text-emerald-500", bg: isDark ? "bg-emerald-500/5 border-emerald-700/20" : "bg-emerald-50 border-emerald-200" },
            { label: "يحتاج مراجعة", value: warningCount, color: "text-amber-500", bg: isDark ? "bg-amber-500/5 border-amber-700/20" : "bg-amber-50 border-amber-200" },
            { label: "منتهك", value: errorCount, color: "text-red-500", bg: isDark ? "bg-red-500/5 border-red-700/20" : "bg-red-50 border-red-200" },
          ].map((s, i) => (
            <div key={i} className={`rounded-xl border p-4 text-center ${s.bg}`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{s.label}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Action button */}
      {!analyzed && (
        <div className={`${card} p-8 text-center shadow-sm`}>
          <ShieldCheck size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-600" : "text-zinc-300"}`} />
          <h3 className={`text-[15px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>فحص مستوى الامتثال</h3>
          <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>حلّل مدى التزام شركتك بالأنظمة السعودية الحالية</p>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            onClick={analyze} disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
            {analyzing ? (
              <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />جارٍ الفحص...</>
            ) : (
              <><Sparkle size={15} weight="fill" /> ابدأ الفحص</>
            )}
          </motion.button>
        </div>
      )}

      {/* Results */}
      {analyzed && (
        <BetaReviewGate toolId="corp.compliance" toolName="تفاصيل امتثال الشركة" reviewScope="legal-data">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <AiResultActions
            text={formatCorpComplianceReport()}
            filename="corp-compliance-report"
            showShare
          />
          <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>تفاصيل الامتثال</p>
          {COMPLIANCE_AREAS.map((area, i) => {
            const cfg = STATUS_CONFIG[area.status as keyof typeof STATUS_CONFIG];
            const Icon = cfg.icon;
            return (
              <motion.div key={area.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                className={`rounded-xl border p-4 ${cfg.bg(isDark)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon size={18} className={cfg.color} weight="duotone" />
                    <div>
                      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{area.label}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{area.last}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                      area.status === "ok" ? "bg-emerald-500/15 text-emerald-500" :
                      area.status === "warning" ? "bg-amber-500/15 text-amber-500" :
                      "bg-red-500/15 text-red-500"
                    }`}>{cfg.label}</span>
                    {area.status !== "ok" && (
                      <button className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                        <ArrowSquareOut size={12} /> إصلاح
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        </BetaReviewGate>
      )}
    </div>
  );
}
