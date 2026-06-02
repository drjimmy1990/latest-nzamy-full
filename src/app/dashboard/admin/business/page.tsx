"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Buildings,
  CaretLeft,
  CheckCircle,
  Database,
  Gear,
  MagnifyingGlass,
  ShieldCheck,
  Storefront,
  ToggleLeft,
  ToggleRight,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useAdminSettings, type CompanyFeatures } from "@/hooks/useAdminSettings";
import {
  BUSINESS_ADMIN_CONTROLS,
  BUSINESS_COMPANY_SIZE_LABEL,
  BUSINESS_LEGAL_STRUCTURE_LABEL,
  BUSINESS_PROFILE_SCENARIOS,
  BUSINESS_SERVICE_ENTITLEMENTS,
  BUSINESS_SERVICE_MODEL_LABEL,
  resolveBusinessScenario,
  serviceKeyToFeatureFlag,
} from "@/constants/businessProfileReadiness";
import type {
  BusinessCompanySize,
  BusinessLegalStructure,
  BusinessServiceKey,
  BusinessServiceModel,
} from "@/types/businessBackendReady";

type BooleanFeatureKey = {
  [Key in keyof CompanyFeatures]: CompanyFeatures[Key] extends boolean ? Key : never;
}[keyof CompanyFeatures];

const COMPANIES = [
  { id: "C-001", name: "شركة الأفق للتجارة", plan: "Enterprise", owner: "نورة الزهراني", mrr: 2499 },
  { id: "C-002", name: "شركة التقنية المتقدمة", plan: "Pro", owner: "فهد السبيعي", mrr: 999 },
  { id: "C-003", name: "شركة المدار للخدمات", plan: "Corp", owner: "ريم القحطاني", mrr: 1499 },
  { id: "C-004", name: "مؤسسة الندى الصغيرة", plan: "Shield", owner: "سالم المطيري", mrr: 249 },
  { id: "C-005", name: "مجموعة الخليج القابضة", plan: "Enterprise", owner: "عبدالله الشمري", mrr: 4999 },
];

const SIZE_OPTIONS = Object.keys(BUSINESS_COMPANY_SIZE_LABEL) as BusinessCompanySize[];
const LEGAL_OPTIONS = Object.keys(BUSINESS_LEGAL_STRUCTURE_LABEL) as BusinessLegalStructure[];
const MODEL_OPTIONS = Object.keys(BUSINESS_SERVICE_MODEL_LABEL) as BusinessServiceModel[];

const FEATURE_TOGGLES: Array<{ key: BooleanFeatureKey; label: string; desc: string }> = [
  { key: "hasInternalLegal", label: "قانوني داخلي", desc: "يفتح أدوار legal_manager/legal_staff ومسارات الإدارات." },
  { key: "hasLegalAdvisor", label: "مستشار قانوني", desc: "يظهر أن الشركة لديها مسؤول قانوني، داخلي أو خارجي." },
  { key: "hasDepartments", label: "إدارات داخلية", desc: "يفتح الأقسام ورؤساء الإدارات ومسارات الموافقة." },
  { key: "hasHrFinanceAccess", label: "HR/Finance", desc: "يفتح عقود الموظفين والتقارير المالية حسب الدور." },
  { key: "hasAiCorpTools", label: "AI للشركات", desc: "CorpMind، تحليل الصفقات، ومساعد HR ضمن قيود البيتا." },
  { key: "hasLegalLibrary", label: "المكتبة القانونية", desc: "وصول معرفي، ومصدر الإنتاج ينتظر CMS/DB." },
  { key: "hasSecondment", label: "انتداب مستشار", desc: "يفتح المستشار المنتدب وساعات الانتداب." },
  { key: "hasLitigation", label: "تقاضي وقضايا", desc: "يفتح القضايا والجلسات كمسار واجهة." },
  { key: "hasMarketplace", label: "سوق المهنيين", desc: "يفتح نشر/تصفح طلبات المكاتب والمحامين." },
  { key: "hasGovernance", label: "حوكمة وامتثال", desc: "يفتح فحص 360 ومصفوفة الحوكمة." },
  { key: "hasCommunitySupervisors", label: "مشرفو مجتمع", desc: "يحجز صلاحيات moderation عند فتح مجتمع الشركة." },
];

function isInternalLegalStructure(legalStructure: BusinessLegalStructure) {
  return ["internal_advisor", "legal_department", "hybrid"].includes(legalStructure);
}

function isDepartmentCompany(companySize: BusinessCompanySize) {
  return ["medium", "large", "enterprise"].includes(companySize);
}

export default function AdminBusinessProfilesPage() {
  const { isDark } = useTheme();
  const { features, updateCompanyFeatures } = useAdminSettings();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(COMPANIES[0].id);
  const [toast, setToast] = useState("بروفيلات الشركات Backend-ready: كل تعديل هنا محلي فقط حتى ربط CompanyProfile API.");

  const filteredCompanies = useMemo(
    () => COMPANIES.filter((company) => `${company.id} ${company.name} ${company.plan}`.toLowerCase().includes(search.toLowerCase())),
    [search],
  );
  const selectedCompany = COMPANIES.find((company) => company.id === selectedId) ?? COMPANIES[0];
  const selectedFeatures = features[selectedCompany.id];
  const scenario = selectedFeatures
    ? resolveBusinessScenario(selectedFeatures.companySize, selectedFeatures.legalStructure, selectedFeatures.serviceModel)
    : BUSINESS_PROFILE_SCENARIOS[0];

  const card = isDark ? "bg-[#0f0f16] border-white/[0.07]" : "bg-white border-zinc-200";
  const soft = isDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-zinc-50 border-zinc-100";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const inputClass = `rounded-xl border px-3 py-2.5 text-sm outline-none ${
    isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-100" : "border-zinc-200 bg-white text-zinc-800"
  }`;

  function updateProfile(updates: Partial<CompanyFeatures>) {
    if (!selectedFeatures) return;

    const merged = { ...selectedFeatures, ...updates };
    const nextScenario = resolveBusinessScenario(merged.companySize, merged.legalStructure, merged.serviceModel);
    const derivedUpdates: Partial<CompanyFeatures> = {
      ...updates,
      profileScenarioId: nextScenario.id,
      hasInternalLegal: updates.hasInternalLegal ?? isInternalLegalStructure(merged.legalStructure),
      hasLegalAdvisor: updates.hasLegalAdvisor ?? merged.legalStructure !== "owner_managed",
      hasDepartments: updates.hasDepartments ?? isDepartmentCompany(merged.companySize),
      hasHrFinanceAccess: updates.hasHrFinanceAccess ?? merged.companySize !== "owner_only",
    };

    updateCompanyFeatures(selectedCompany.id, derivedUpdates);
    setToast("تم تحديث واجهة بروفيل الشركة محلياً. الربط الحقيقي ينتظر CompanyProfile API وAdminAuditEvent.");
  }

  function toggleFeature(key: BooleanFeatureKey) {
    if (!selectedFeatures) return;
    updateCompanyFeatures(selectedCompany.id, { [key]: !selectedFeatures[key] } as Partial<CompanyFeatures>);
    setToast(`تم تغيير ${key} محلياً فقط. لا يوجد حفظ خادمي في مرحلة البيتا.`);
  }

  function serviceEnabled(serviceKey: BusinessServiceKey) {
    if (!selectedFeatures) return false;
    const featureFlag = serviceKeyToFeatureFlag(serviceKey) as BooleanFeatureKey | undefined;
    if (!featureFlag) return scenario.recommendedServices.includes(serviceKey);
    return Boolean(selectedFeatures[featureFlag]);
  }

  function toggleService(serviceKey: BusinessServiceKey) {
    const featureFlag = serviceKeyToFeatureFlag(serviceKey) as BooleanFeatureKey | undefined;
    if (!featureFlag) {
      setToast("هذه الخدمة جزء من تجربة الواجهة الحالية وليست Feature Flag مستقلة حتى الآن.");
      return;
    }
    toggleFeature(featureFlag);
  }

  const internalLegalCount = Object.values(features).filter((feature) => feature.hasInternalLegal).length;
  const backendReadyControls = BUSINESS_ADMIN_CONTROLS.filter((control) => control.readiness === "Backend-ready").length;

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/25 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              <Buildings size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>إدارة بروفيلات الشركات</h1>
          </div>
          <p className={`max-w-3xl text-sm leading-relaxed ${muted}`}>
            مركز تحكم أدمن لتجهيز بروفيل الشركة حسب الحجم، وجود مستشار أو إدارة قانونية، ونموذج الخدمة. كل شيء هنا واجهة محلية موثقة كـ Backend-ready بدون API أو قاعدة بيانات.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/admin/pricing" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
            <Storefront size={15} />
            التسعير والباقات
          </Link>
          <button
            onClick={() => setToast("عقد BusinessProfileContract جاهز للتوثيق فقط. التصدير/الحفظ الخادمي مؤجل للباك إند.")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2.5 text-xs font-black text-[#0B3D2E]"
          >
            <Database size={15} />
            معاينة العقد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "شركات Mock", value: COMPANIES.length, icon: Buildings },
          { label: "بها قانوني داخلي", value: internalLegalCount, icon: ShieldCheck },
          { label: "سيناريوهات مغطاة", value: BUSINESS_PROFILE_SCENARIOS.length, icon: UsersThree },
          { label: "Controls جاهزة", value: backendReadyControls, icon: CheckCircle },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className={`rounded-2xl border p-5 ${card}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
                <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.04] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                <stat.icon size={22} weight="duotone" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className={`rounded-2xl border p-4 ${isDark ? "border-blue-500/20 bg-blue-500/5 text-blue-200" : "border-blue-100 bg-blue-50 text-blue-700"}`}>
        <div className="flex items-start gap-2 text-sm leading-relaxed">
          <Warning size={17} weight="fill" className="mt-0.5 shrink-0" />
          <span>{toast}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
        <section className={`rounded-2xl border overflow-hidden ${card}`}>
          <div className={`p-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-zinc-50"}`}>
              <MagnifyingGlass size={14} className={muted} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث باسم الشركة أو الباقة..."
                className={`w-full bg-transparent text-sm outline-none ${isDark ? "text-zinc-100 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
              />
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {filteredCompanies.map((company) => {
              const companyFeatures = features[company.id];
              const companyScenario = companyFeatures
                ? resolveBusinessScenario(companyFeatures.companySize, companyFeatures.legalStructure, companyFeatures.serviceModel)
                : BUSINESS_PROFILE_SCENARIOS[0];
              const active = company.id === selectedCompany.id;

              return (
                <button
                  key={company.id}
                  onClick={() => setSelectedId(company.id)}
                  className={`w-full p-4 text-start transition ${active ? "bg-[#0B3D2E]/25" : isDark ? "hover:bg-white/[0.03]" : "hover:bg-zinc-50"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-[#C8A762]/20 text-[#C8A762]" : isDark ? "bg-white/[0.04] text-zinc-400" : "bg-zinc-100 text-[#0B3D2E]"}`}>
                      <Buildings size={20} weight="duotone" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`truncate text-sm font-black ${isDark ? "text-white" : "text-zinc-900"}`}>{company.name}</p>
                        {active && <CaretLeft size={14} className="text-[#C8A762]" />}
                      </div>
                      <p className={`mt-1 text-[11px] ${muted}`}>{company.id} · {company.plan} · {company.mrr} ر.س/شهر</p>
                      <p className={`mt-2 text-[11px] font-bold ${companyFeatures?.hasInternalLegal ? "text-emerald-400" : "text-amber-400"}`}>
                        {companyScenario.title}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {selectedFeatures && (
          <section className="space-y-5">
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={`text-xl font-black ${isDark ? "text-white" : "text-zinc-900"}`}>{selectedCompany.name}</h2>
                    <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[11px] font-bold text-blue-300">Backend-ready</span>
                    <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">Beta local</span>
                  </div>
                  <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{scenario.description}</p>
                </div>
                <div className={`rounded-xl border p-3 text-xs ${soft}`}>
                  <p className={`font-bold ${muted}`}>Admin owner</p>
                  <p className={`mt-1 font-black ${isDark ? "text-white" : "text-zinc-900"}`}>{selectedCompany.owner}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="space-y-1.5">
                  <span className={`text-xs font-bold ${muted}`}>حجم الشركة</span>
                  <select
                    value={selectedFeatures.companySize}
                    onChange={(event) => updateProfile({ companySize: event.target.value as BusinessCompanySize })}
                    className={`${inputClass} w-full`}
                  >
                    {SIZE_OPTIONS.map((key) => <option key={key} value={key}>{BUSINESS_COMPANY_SIZE_LABEL[key]}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className={`text-xs font-bold ${muted}`}>الهيكل القانوني</span>
                  <select
                    value={selectedFeatures.legalStructure}
                    onChange={(event) => updateProfile({ legalStructure: event.target.value as BusinessLegalStructure })}
                    className={`${inputClass} w-full`}
                  >
                    {LEGAL_OPTIONS.map((key) => <option key={key} value={key}>{BUSINESS_LEGAL_STRUCTURE_LABEL[key]}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className={`text-xs font-bold ${muted}`}>نموذج الخدمة</span>
                  <select
                    value={selectedFeatures.serviceModel}
                    onChange={(event) => updateProfile({ serviceModel: event.target.value as BusinessServiceModel })}
                    className={`${inputClass} w-full`}
                  >
                    {MODEL_OPTIONS.map((key) => <option key={key} value={key}>{BUSINESS_SERVICE_MODEL_LABEL[key]}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className={`rounded-2xl border overflow-hidden ${card}`}>
              <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <h3 className={`font-black ${isDark ? "text-white" : "text-zinc-900"}`}>خدمات وصلاحيات الشركة</h3>
                <p className={`mt-1 text-xs ${muted}`}>كل Toggle يغير واجهة الشركة محلياً ويحتاج لاحقاً ServiceEntitlement API.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                {FEATURE_TOGGLES.map((feature) => {
                  const enabled = Boolean(selectedFeatures[feature.key]);
                  return (
                    <button
                      key={feature.key}
                      onClick={() => toggleFeature(feature.key)}
                      className={`p-4 text-start border-b md:border-l transition ${isDark ? "border-white/[0.05] hover:bg-white/[0.03]" : "border-zinc-100 hover:bg-zinc-50"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-black ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{feature.label}</p>
                          <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{feature.desc}</p>
                        </div>
                        {enabled ? <ToggleRight size={30} weight="fill" className="text-emerald-400" /> : <ToggleLeft size={30} className={isDark ? "text-zinc-600" : "text-zinc-300"} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className={`font-black ${isDark ? "text-white" : "text-zinc-900"}`}>مصفوفة الخدمات حسب السيناريو</h3>
                  <p className={`mt-1 text-xs ${muted}`}>توضح ما يظهر للمالك، الشركة المتوسطة، أو الإدارة القانونية الكبيرة.</p>
                </div>
                <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[11px] font-bold text-blue-300">{scenario.id}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {BUSINESS_SERVICE_ENTITLEMENTS.map((service) => {
                  const enabled = serviceEnabled(service.key);
                  return (
                    <button
                      key={service.key}
                      onClick={() => toggleService(service.key)}
                      className={`rounded-xl border p-4 text-start transition ${
                        enabled
                          ? isDark ? "border-emerald-500/25 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"
                          : soft
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-black ${enabled ? "text-emerald-400" : isDark ? "text-zinc-200" : "text-zinc-800"}`}>{service.label}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${service.readiness === "UI Working" ? "border-emerald-500/25 text-emerald-400" : "border-blue-500/25 text-blue-300"}`}>
                          {service.readiness}
                        </span>
                      </div>
                      <p className={`mt-2 text-xs leading-relaxed ${muted}`}>{service.description}</p>
                      <p className={`mt-3 text-[10px] font-mono ${muted}`}>{service.contract}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`rounded-2xl border overflow-hidden ${card}`}>
              <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <h3 className={`font-black ${isDark ? "text-white" : "text-zinc-900"}`}>ربط الأدمن بالعقود المطلوبة للباك إند</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                {BUSINESS_ADMIN_CONTROLS.map((control) => (
                  <div key={control.id} className={`p-4 border-b md:border-l ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <Link href={control.route} className={`text-sm font-black hover:underline ${isDark ? "text-white" : "text-zinc-900"}`}>{control.title}</Link>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${control.readiness === "Risk" ? "border-amber-500/25 text-amber-300" : "border-blue-500/25 text-blue-300"}`}>
                        {control.readiness}
                      </span>
                    </div>
                    <p className={`mt-2 text-xs leading-relaxed ${muted}`}>{control.note}</p>
                    <p className={`mt-3 text-[10px] font-mono ${muted}`}>{control.contract}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setToast("تم تثبيت حالة الواجهة محلياً. عند حذف البيتا نربطها بـ CompanyProfile API ونضيف AdminAuditEvent.")}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-xs font-black text-[#C8A762]"
              >
                <Gear size={15} />
                تثبيت واجهة محلية
              </button>
              <Link href="/dashboard/business" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
                <Buildings size={15} />
                معاينة بروفيل الشركة
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
