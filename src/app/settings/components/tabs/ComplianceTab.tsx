"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, CheckCircle, WarningCircle,
  ArrowSquareOut, CalendarCheck,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { BackendReadyNotice, LocalActionStatus, SectionTitle, ToggleRow } from "./_shared";

interface ComplianceModule {
  key: string;
  title: string;
  description: string;
  status: "active" | "warning" | "inactive";
  relevantFor: string[];
}

const MODULES: ComplianceModule[] = [
  {
    key: "pdpl",
    title: "حماية البيانات الشخصية (PDPL)",
    description: "سياسة الاحتفاظ بالبيانات، طلبات صاحب البيانات، سجل المعالجة",
    status: "active",
    relevantFor: ["firm", "corporate", "government", "ngo"],
  },
  {
    key: "zatca",
    title: "الفوترة الإلكترونية (ZATCA Fatoora)",
    description: "إنشاء فواتير بصيغة XML موافقة لمرحلة الربط — UUID وختم تشفيري",
    status: "warning",
    relevantFor: ["firm", "corporate"],
  },
  {
    key: "sama",
    title: "متطلبات مؤسسة النقد (SAMA)",
    description: "امتثال متطلبات الأمن السيبراني والدفع الإلكتروني",
    status: "inactive",
    relevantFor: ["corporate"],
  },
  {
    key: "moj",
    title: "اتفاقية وزارة العدل",
    description: "الشروط والضوابط المنظّمة لممارسة المحاماة والتوثيق",
    status: "active",
    relevantFor: ["firm", "government"],
  },
  {
    key: "ngo_report",
    title: "تقارير وزارة الموارد البشرية",
    description: "تقارير دورية إلزامية للجمعيات الخيرية",
    status: "warning",
    relevantFor: ["ngo"],
  },
];

const STATUS_STYLE: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:   { label: "ممتثل",     color: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20", icon: CheckCircle },
  warning:  { label: "يحتاج مراجعة", color: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20",   icon: WarningCircle },
  inactive: { label: "غير مفعّل", color: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800",             icon: ShieldCheck },
};

export function ComplianceTab() {
  const { userType } = useUser();
  const [retentionDays, setRetentionDays] = useState("1095");
  const [approvalFlow, setApprovalFlow] = useState(true);
  const [saved, setSaved] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const visible = MODULES.filter((m) => m.relevantFor.includes(userType ?? ""));

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      {/* Module status overview */}
      <div>
        <SectionTitle>وحدات الامتثال ({visible.length})</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
          {visible.map((mod) => {
            const st = STATUS_STYLE[mod.status];
            const StIcon = st.icon;
            return (
              <div key={mod.key} className="flex items-center gap-4 px-5 py-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  mod.status === "active"
                    ? "bg-emerald-100 dark:bg-emerald-900/20"
                    : mod.status === "warning"
                      ? "bg-amber-100 dark:bg-amber-900/20"
                      : "bg-zinc-100 dark:bg-zinc-800"
                }`}>
                  <StIcon size={20} weight="fill" className={st.color.split(" ")[0]} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{mod.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
                <button
                  onClick={() => setLocalMessage(`إدارة ${mod.title} جاهزة للربط فقط؛ لا يوجد Compliance API الآن.`)}
                  className="text-xs text-royal dark:text-[#C8A762] font-medium flex items-center gap-1 hover:underline flex-shrink-0"
                >
                  إدارة <ArrowSquareOut size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data retention */}
      <div>
        <SectionTitle>سياسة الاحتفاظ بالبيانات</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              مدة الاحتفاظ بالبيانات (يوم)
            </label>
            <div className="flex gap-3">
              {["365", "1095", "2190"].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setRetentionDays(v);
                    setLocalMessage("مدة الاحتفاظ بالبيانات تغيّرت محلياً فقط.");
                  }}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    retentionDays === v
                      ? "bg-royal text-white border-transparent"
                      : "border-gray-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 hover:border-royal/30"
                  }`}
                >
                  {v === "365" ? "سنة" : v === "1095" ? "3 سنوات" : "6 سنوات"}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
              توصية PDPL: 3 سنوات للبيانات القانونية
            </p>
          </div>

          <ToggleRow
            label="مسار الموافقات الداخلية"
            description="كل قرار مؤسسي يمر عبر مراجعة ثنائية قبل التنفيذ"
            checked={approvalFlow}
            onChange={() => {
              setApprovalFlow(!approvalFlow);
              setLocalMessage("مسار الموافقات الداخلية تغيّر محلياً فقط.");
            }}
          />
        </div>
      </div>

      {/* Next review */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
        <CalendarCheck size={22} weight="fill" className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
            موعد المراجعة الدورية القادمة
          </p>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
            1447/12/01 — مراجعة ربع سنوية لامتثال PDPL وFatoora
          </p>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={() => {
          setSaved(true);
          setLocalMessage("تم حفظ إعدادات الامتثال محلياً فقط؛ تطبيق السياسة ينتظر الباك إند.");
          setTimeout(() => setSaved(false), 2500);
        }}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
      >
        {saved && <CheckCircle size={18} weight="fill" />}
        {saved ? "تم الحفظ" : "حفظ إعدادات الامتثال"}
      </motion.button>
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
    </div>
  );
}
