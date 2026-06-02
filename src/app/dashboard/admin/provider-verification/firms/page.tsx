"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Buildings,
  ChartBar,
  Coins,
  CreditCard,
  FloppyDisk,
  LockKey,
  SealCheck,
  ShieldCheck,
  ToggleRight,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import {
  FIRM_PLAN_CONTRACTS,
  FIRM_PRACTICE_MODEL_LABEL,
  FIRM_SIZE_LABEL,
  FIRM_STRUCTURE_LABEL,
  resolveFirmScenario,
} from "@/constants/firmProfileReadiness";
import { useAdminSettings, type FirmFeatures, MOCK_CURRENT_FIRM_ID } from "@/hooks/useAdminSettings";
import type { FirmPlanId, FirmPracticeModel, FirmSize, FirmStructure } from "@/types/firmBackendReady";

type BooleanFirmFeatureKey = {
  [Key in keyof FirmFeatures]: FirmFeatures[Key] extends boolean ? Key : never;
}[keyof FirmFeatures];

const FIRM_NAMES: Record<string, string> = {
  "F-001": "شركة السند للمحاماة والاستشارات",
  "F-002": "مكتب الرؤية القانونية",
  "F-003": "العمران وشركاؤه للمحاماة",
};

const FEATURE_FLAGS: Array<{ key: BooleanFirmFeatureKey; label: string; group: string }> = [
  { key: "hasDepartments", label: "أقسام ممارسة قانونية", group: "التشغيل" },
  { key: "hasBranches", label: "فروع متعددة", group: "التشغيل" },
  { key: "hasFinance", label: "مالية وفوترة", group: "التشغيل" },
  { key: "hasHr", label: "HR وتدريب", group: "التشغيل" },
  { key: "hasClientPortal", label: "بوابة عملاء", group: "العملاء" },
  { key: "hasBranding", label: "هوية وبوابة مخصصة", group: "العملاء" },
  { key: "hasGovernance", label: "حوكمة واعتمادات", group: "الحوكمة" },
  { key: "hasChineseWalls", label: "Chinese Walls", group: "الحوكمة" },
  { key: "hasMarketplace", label: "السوق", group: "التعاون" },
  { key: "hasExternalCollaboration", label: "Of Counsel", group: "التعاون" },
  { key: "hasSecondment", label: "إعارات محامين", group: "التعاون" },
  { key: "hasSharedRooms", label: "غرف مشتركة", group: "التعاون" },
  { key: "hasAdvancedAi", label: "AI متقدم بالنقاط", group: "AI" },
  { key: "hasFirmMemory", label: "ذاكرة المكتب", group: "AI" },
  { key: "hasLegalLibrary", label: "المكتبة القانونية", group: "AI" },
  { key: "hasAnalytics", label: "تحليلات وتقارير", group: "التقارير" },
  { key: "hasHealthCheck", label: "Health Check 360", group: "التقارير" },
  { key: "hasFirmPointsWallet", label: "محفظة نقاط الشركة", group: "النقاط" },
  { key: "hasProviderAddons", label: "أدوار مزود إضافية", group: "المزودين" },
];

const SIZE_OPTIONS: Array<{ value: FirmSize; label: string }> = Object.entries(FIRM_SIZE_LABEL).map(([value, label]) => ({
  value: value as FirmSize,
  label,
}));

const STRUCTURE_OPTIONS: Array<{ value: FirmStructure; label: string }> = Object.entries(FIRM_STRUCTURE_LABEL).map(([value, label]) => ({
  value: value as FirmStructure,
  label,
}));

const PRACTICE_OPTIONS: Array<{ value: FirmPracticeModel; label: string }> = Object.entries(FIRM_PRACTICE_MODEL_LABEL).map(([value, label]) => ({
  value: value as FirmPracticeModel,
  label,
}));

export default function AdminFirmProviderProfilesPage() {
  const { isDark } = useTheme();
  const { firmFeatures, currentFirmFeatures, updateFirmFeatures } = useAdminSettings();
  const [selectedFirmId, setSelectedFirmId] = useState(MOCK_CURRENT_FIRM_ID);
  const [toast, setToast] = useState("إدارة شركات المحاماة Backend-ready: كل تعديل هنا محلي فقط حتى ربط Firm/Profile + Billing + Wallet APIs.");

  const firms = useMemo(() => {
    const list = Object.values(firmFeatures);
    return list.length ? list : [currentFirmFeatures];
  }, [firmFeatures, currentFirmFeatures]);

  useEffect(() => {
    if (firms.length && !firms.some((firm) => firm.firmId === selectedFirmId)) {
      setSelectedFirmId(firms[0].firmId);
    }
  }, [firms, selectedFirmId]);

  const selected = firms.find((firm) => firm.firmId === selectedFirmId) ?? currentFirmFeatures;
  const plan = FIRM_PLAN_CONTRACTS.find((item) => item.plan === selected.plan) ?? FIRM_PLAN_CONTRACTS[0];
  const scenario = resolveFirmScenario(selected.firmSize, selected.structure, selected.practiceModel);
  const spentPoints = Math.max(selected.annualPoints - selected.availablePoints, 0);
  const pointsPct = selected.annualPoints > 0 ? Math.round((spentPoints / selected.annualPoints) * 100) : 0;
  const extraSeats = Math.max(selected.activeSeats - selected.baseSeats, 0);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const input = `w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`;

  function updateProfile(updates: Partial<FirmFeatures>, message: string) {
    updateFirmFeatures(selected.firmId, updates);
    setToast(`${message} تم محليا فقط، والحفظ الإنتاجي ينتظر APIs وسجل تدقيق.`);
  }

  function updatePlan(nextPlan: FirmPlanId) {
    const next = FIRM_PLAN_CONTRACTS.find((item) => item.plan === nextPlan) ?? plan;
    updateProfile({
      plan: next.plan,
      baseSeats: next.includedSeats,
      activeSeats: Math.max(selected.activeSeats, next.includedSeats),
      annualPoints: next.includedAnnualPoints,
      availablePoints: Math.min(selected.availablePoints, next.includedAnnualPoints),
    }, `تم تجهيز تغيير الباقة إلى ${next.plan}.`);
  }

  function toggleFeature(key: BooleanFirmFeatureKey) {
    updateProfile({ [key]: !selected[key] } as Partial<FirmFeatures>, `تم تغيير حالة ${FEATURE_FLAGS.find((flag) => flag.key === key)?.label ?? key}.`);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E]/30 text-[#C8A762]">
              <SealCheck size={21} weight="duotone" />
            </span>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-300">Backend-ready</span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">Beta locked</span>
          </div>
          <h1 className={`text-2xl font-black mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>إدارة شركات المحاماة داخل المزودين</h1>
          <p className={`text-sm ${muted}`}>اعتماد الشركة، حجمها، باقتها السنوية، المقاعد، محفظة النقاط، والصلاحيات. لا يوجد حفظ خادمي الآن.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/provider-verification" className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            عودة إلى KYC
          </Link>
          <Link href="/dashboard/admin/pricing" className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-bold text-white">
            <CreditCard size={16} />
            إدارة الأسعار
          </Link>
        </div>
      </motion.div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "الشركات", value: firms.length, icon: Buildings },
          { label: "المقاعد النشطة", value: selected.activeSeats, icon: Users },
          { label: "النقاط المتاحة", value: selected.availablePoints.toLocaleString("ar-SA"), icon: Coins },
          { label: "صرف النقاط", value: `${pointsPct}%`, icon: ChartBar },
        ].map((stat) => (
          <div key={stat.label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.04] text-[#C8A762]" : "bg-slate-50 text-[#0B3D2E]"}`}>
              <stat.icon size={22} weight="duotone" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`${card} p-5 space-y-3`}>
          <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>الشركات المسجلة كمزود</p>
          {firms.map((firm) => (
            <button
              key={firm.firmId}
              onClick={() => setSelectedFirmId(firm.firmId)}
              className={`w-full rounded-xl border p-4 text-right transition ${
                selectedFirmId === firm.firmId
                  ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                  : isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]" : "border-slate-100 bg-slate-50/60 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{FIRM_NAMES[firm.firmId] ?? firm.firmId}</p>
                  <p className={`mt-1 text-[11px] ${muted}`}>{FIRM_SIZE_LABEL[firm.firmSize]} • {firm.plan}</p>
                </div>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">مزود</span>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-lg font-black ${isDark ? "text-white" : "text-slate-800"}`}>{FIRM_NAMES[selected.firmId] ?? selected.firmId}</p>
                <p className={`text-xs ${muted}`}>{scenario.title} • {scenario.readiness}</p>
              </div>
              <button
                onClick={() => updateProfile({}, "تم اعتماد بروفيل شركة المحاماة كواجهة جاهزة للربط.")}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-400 border border-emerald-500/20"
              >
                <ShieldCheck size={15} weight="fill" />
                اعتماد محلي
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="حجم الشركة"><select value={selected.firmSize} onChange={(event) => updateProfile({ firmSize: event.target.value as FirmSize }, "تم تغيير حجم الشركة.")} className={input}>{SIZE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              <Field label="الهيكل"><select value={selected.structure} onChange={(event) => updateProfile({ structure: event.target.value as FirmStructure }, "تم تغيير هيكل الشركة.")} className={input}>{STRUCTURE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              <Field label="نموذج الممارسة"><select value={selected.practiceModel} onChange={(event) => updateProfile({ practiceModel: event.target.value as FirmPracticeModel }, "تم تغيير نموذج الممارسة.")} className={input}>{PRACTICE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            </div>
          </div>

          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>الاشتراك السنوي والمقاعد والنقاط</p>
                <p className={`text-xs ${muted}`}>الأساس: اشتراك سنوي يفتح النظام + مقاعد + محفظة نقاط للشركة كلها.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">
                <LockKey size={12} weight="fill" />
                Billing API pending
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="الباقة"><select value={selected.plan} onChange={(event) => updatePlan(event.target.value as FirmPlanId)} className={input}>{FIRM_PLAN_CONTRACTS.map((item) => <option key={item.plan} value={item.plan}>{item.plan}</option>)}</select></Field>
              <Field label="المقاعد النشطة"><input type="number" min={1} value={selected.activeSeats} onChange={(event) => updateProfile({ activeSeats: Number(event.target.value) }, "تم تعديل عدد المقاعد.")} className={input} /></Field>
              <Field label="النقاط السنوية"><input type="number" min={0} value={selected.annualPoints} onChange={(event) => updateProfile({ annualPoints: Number(event.target.value) }, "تم تعديل رصيد النقاط السنوي.")} className={input} /></Field>
              <Field label="النقاط المتاحة"><input type="number" min={0} value={selected.availablePoints} onChange={(event) => updateProfile({ availablePoints: Number(event.target.value) }, "تم تعديل النقاط المتاحة.")} className={input} /></Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <Info label="السعر السنوي" value={`${plan.annualPrice.toLocaleString("ar-SA")} ر.س`} />
              <Info label="مقاعد مضمّنة" value={`${plan.includedSeats}`} />
              <Info label="مقاعد إضافية" value={`${extraSeats}`} />
              <Info label="سعر المقعد الإضافي" value={plan.extraSeatAnnualPrice ? `${plan.extraSeatAnnualPrice.toLocaleString("ar-SA")} ر.س/سنة` : "مخصص"} />
            </div>

            <div className={`rounded-xl border p-3 ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-100 bg-amber-50 text-amber-800"}`}>
              عند نفاد النقاط لا يتوقف النظام الأساسي. تتوقف فقط الخدمات الاستهلاكية: AI متقدم، OCR، ترجمة، تحليل مستندات ضخمة، وخدمات Marketplace المدفوعة.
            </div>
          </div>

          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>مميزات الشركة المفعلة</p>
              <button
                onClick={() => setToast("تم تجهيز مصفوفة المميزات محليا فقط. عند الإنتاج يلزم Entitlements API وسجل AuditEvent.")}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-700"}`}
              >
                <FloppyDisk size={14} />
                حفظ محلي
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FEATURE_FLAGS.map((flag) => {
                const enabled = selected[flag.key];
                return (
                  <button
                    key={flag.key}
                    onClick={() => toggleFeature(flag.key)}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-right transition ${
                      enabled
                        ? isDark ? "border-emerald-500/20 bg-emerald-500/8" : "border-emerald-100 bg-emerald-50"
                        : isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div>
                      <p className={`text-[12px] font-black ${isDark ? "text-white" : "text-slate-800"}`}>{flag.label}</p>
                      <p className={`text-[10px] ${muted}`}>{flag.group}</p>
                    </div>
                    <ToggleRight size={24} weight={enabled ? "fill" : "regular"} className={enabled ? "text-emerald-500" : muted} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs font-bold text-gray-500">{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="mt-1 font-black text-zinc-100">{value}</p>
    </div>
  );
}
