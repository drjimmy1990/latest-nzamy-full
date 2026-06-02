"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChartLineUp, CheckCircle, Coins, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import { FirmProfileReadinessPanel } from "@/components/dashboard/firm/FirmProfileReadinessPanel";
import { useAdminSettings } from "@/hooks/useAdminSettings";

const CHECKS = [
  { label: "الأدوار والصلاحيات", score: 82, status: "Backend-ready", icon: ShieldCheck },
  { label: "تعارض المصالح وChinese Walls", score: 64, status: "يتطلب ربط سياسات", icon: WarningCircle },
  { label: "محفظة النقاط وتوزيع الأقسام", score: 76, status: "واجهة محلية", icon: Coins },
  { label: "جاهزية الإدارات والتعاون", score: 88, status: "UI Working", icon: CheckCircle },
];

export default function FirmHealthCheckPage() {
  const { isDark } = useTheme();
  const { currentFirmFeatures } = useAdminSettings();
  const [toast, setToast] = useState("Health Check 360 Backend-ready: النتائج الحالية واجهة محلية فقط حتى ربط تحليل حقيقي وسجل تدقيق.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <SubscriptionGuard featureKey="firm-health-check">
      <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-300">
              <ChartLineUp size={13} weight="duotone" />
              Backend-ready
            </div>
            <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>Health Check 360 لشركة المحاماة</h1>
            <p className={`mt-1 text-sm ${muted}`}>فحص جاهزية تشغيل الفيرم: الأدوار، الأقسام، النقاط، الحوكمة، وتعارض المصالح. لا يوجد تحليل خادمي حقيقي الآن.</p>
          </div>
          <button
            onClick={() => setToast("تم تشغيل فحص محلي تجريبي. لا يوجد تحليل خادمي أو قراءة بيانات إنتاجية قبل ربط HealthCheck API.")}
            className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
          >
            إعادة فحص محلي
          </button>
        </div>

        <div className={`rounded-2xl border px-4 py-3 text-[12px] ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          {toast}
        </div>

        <FirmProfileReadinessPanel compact />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {CHECKS.map((check, index) => (
            <motion.div key={check.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className={`${card} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <check.icon size={21} weight="duotone" className={check.score >= 80 ? "text-emerald-500" : "text-amber-500"} />
                <span className="font-mono text-2xl font-black text-[#C8A762]">{check.score}</span>
              </div>
              <p className={`mt-3 text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{check.label}</p>
              <p className={`mt-1 text-[11px] ${muted}`}>{check.status}</p>
            </motion.div>
          ))}
        </div>

        <div className={`${card} p-5`}>
          <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>سلوك نفاد النقاط</p>
          <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
            الرصيد الحالي {currentFirmFeatures.availablePoints.toLocaleString("ar-SA")} نقطة من {currentFirmFeatures.annualPoints.toLocaleString("ar-SA")}. إذا نفد الرصيد، تتوقف أدوات الاستهلاك فقط مثل AI المتقدم والترجمة وOCR والتحليل الضخم، بينما تستمر القضايا والعملاء والفريق والمستندات الأساسية.
          </p>
        </div>
      </div>
    </SubscriptionGuard>
  );
}
