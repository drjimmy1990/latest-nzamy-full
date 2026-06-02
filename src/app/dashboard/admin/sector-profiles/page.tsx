"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Buildings,
  CheckCircle,
  CreditCard,
  Database,
  Gavel,
  HandHeart,
  LockKey,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  MOCK_CURRENT_GOVERNMENT_ID,
  MOCK_CURRENT_MICRO_ID,
  MOCK_CURRENT_NGO_ID,
  useAdminSettings,
  type GovernmentSectorFeatures,
  type MicroSectorFeatures,
  type NgoSectorFeatures,
} from "@/hooks/useAdminSettings";
import {
  GOVERNMENT_ENTITY_TYPE_LABEL,
  GOVERNMENT_PLAN_LABEL,
  GOVERNMENT_ROLE_CONTRACTS,
  MICRO_BUSINESS_TYPE_LABEL,
  MICRO_PLAN_LABEL,
  NGO_ORGANIZATION_TYPE_LABEL,
  NGO_PLAN_LABEL,
  SECTOR_ADMIN_CONTROLS,
  getSectorEntitlements,
  getSectorPlanContracts,
  resolveGovernmentScenario,
  resolveMicroScenario,
  resolveNgoScenario,
} from "@/constants/sectorProfileReadiness";
import type {
  GovernmentEntityType,
  GovernmentPlanId,
  MicroBusinessType,
  MicroPlanId,
  NgoOrganizationType,
  NgoPlanId,
  SectorProfileType,
} from "@/types/sectorBackendReady";

type TabKey = SectorProfileType;

type BooleanGovernmentFeatureKey = {
  [Key in keyof GovernmentSectorFeatures]: GovernmentSectorFeatures[Key] extends boolean ? Key : never;
}[keyof GovernmentSectorFeatures];

type BooleanNgoFeatureKey = {
  [Key in keyof NgoSectorFeatures]: NgoSectorFeatures[Key] extends boolean ? Key : never;
}[keyof NgoSectorFeatures];

type BooleanMicroFeatureKey = {
  [Key in keyof MicroSectorFeatures]: MicroSectorFeatures[Key] extends boolean ? Key : never;
}[keyof MicroSectorFeatures];

const GOVERNMENT_NAMES: Record<string, string> = {
  "G-001": "جهة عدلية تجريبية",
  "G-002": "إدارة ضبط وتحقيق",
  "G-003": "وزارة الخدمات العامة",
};

const NGO_NAMES: Record<string, string> = {
  "N-001": "جمعية البر الأهلية",
  "N-002": "وقف النماء الخيري",
  "N-003": "حملة عطاء موسمية",
};

const MICRO_NAMES: Record<string, string> = {
  "M-001": "مؤسسة الندى التجارية",
  "M-002": "مطعم ركن المدينة",
};

const GOVERNMENT_TOGGLES: Array<{ key: BooleanGovernmentFeatureKey; label: string; desc: string }> = [
  { key: "hasJudiciary", label: "صلاحيات القضاء", desc: "أدوات أحكام واختصاص وبحث قضائي للقاضي." },
  { key: "hasProsecution", label: "النيابة/الادعاء", desc: "لوائح اتهام وتحليل أدلة ومدد نظامية." },
  { key: "hasInvestigation", label: "التحقيق", desc: "نماذج تحقيق وضمانات مستقلة عن أدوات الضابط." },
  { key: "hasPolice", label: "الضبط الشرطي", desc: "محاضر، حوادث، قبض وتفتيش، ودليل إجراءات." },
  { key: "hasCounsel", label: "مستشار حكومي", desc: "عقود ومشتريات وآراء قانونية." },
  { key: "hasCompliance", label: "امتثال/رقابة", desc: "مدقق امتثال وتقارير رقابية." },
  { key: "hasReports", label: "التقارير", desc: "لوحات قياس بلا تصدير خادمي." },
  { key: "hasContracts", label: "العقود", desc: "مراجعة عقود حكومية واتفاقيات." },
  { key: "hasSso", label: "SSO pending", desc: "وسم انتظار تكامل الهوية فقط." },
  { key: "hasAiByRole", label: "AI حسب الدور", desc: "فصل أدوات القاضي والمحقق والضابط." },
];

const NGO_TOGGLES: Array<{ key: BooleanNgoFeatureKey; label: string; desc: string }> = [
  { key: "hasVolunteers", label: "المتطوعون", desc: "عقود وتسجيل ومهام متطوعين." },
  { key: "hasDonations", label: "التبرعات", desc: "سجل تبرعات وتمويل برامج بدون دفع فعلي." },
  { key: "hasAwqaf", label: "الأوقاف والأصول", desc: "أصول وريوع وارتباط بالبرامج." },
  { key: "hasBoard", label: "مجلس الإدارة", desc: "قرارات واجتماعات ومصفوفة موافقات." },
  { key: "hasPrograms", label: "البرامج", desc: "برامج وحملات ومؤشرات أثر." },
  { key: "hasCompliance", label: "الامتثال", desc: "متطلبات القطاع غير الربحي." },
  { key: "hasReports", label: "التقارير", desc: "تقارير دورية كواجهة فقط." },
  { key: "hasAi", label: "AI للجمعيات", desc: "حوكمة، تبرعات، عقود تطوع، وتقارير." },
];

const MICRO_TOGGLES: Array<{ key: BooleanMicroFeatureKey; label: string; desc: string }> = [
  { key: "hasRequirements", label: "اشتراطات النشاط", desc: "بلدية وزكاة وتأمينات وعمل ورخص." },
  { key: "hasContracts", label: "العقود", desc: "قوالب ومراجعة تشغيلية بسيطة." },
  { key: "hasDocuments", label: "المستندات", desc: "رخص وتصاريح ومرفقات محلية." },
  { key: "hasWallet", label: "درع المنشأة", desc: "حدود استخدام ضمن الخطة، وليس نقاط." },
  { key: "hasRequests", label: "الطلبات", desc: "رفع ومتابعة طلب قانوني." },
  { key: "hasMarketplace", label: "السوق", desc: "تصعيد لمهني عند الحاجة." },
  { key: "hasCases", label: "القضايا", desc: "متابعة أو تصعيد بدون تعقيد إداري." },
  { key: "hasAi", label: "AI للمنشأة", desc: "مساعد منشآت وفحص مستندات." },
];

export default function AdminSectorProfilesPage() {
  const { isDark } = useTheme();
  const {
    sectorProfiles,
    updateGovernmentProfile,
    updateNgoProfile,
    updateMicroProfile,
  } = useAdminSettings();
  const [tab, setTab] = useState<TabKey>("government");
  const [selectedGovernmentId, setSelectedGovernmentId] = useState(MOCK_CURRENT_GOVERNMENT_ID);
  const [selectedNgoId, setSelectedNgoId] = useState(MOCK_CURRENT_NGO_ID);
  const [selectedMicroId, setSelectedMicroId] = useState(MOCK_CURRENT_MICRO_ID);
  const [toast, setToast] = useState("بروفيلات القطاعات Backend-ready: كل تعديل هنا محلي فقط حتى ربط APIs.");

  const governmentProfiles = useMemo(() => Object.values(sectorProfiles.government), [sectorProfiles.government]);
  const ngoProfiles = useMemo(() => Object.values(sectorProfiles.ngo), [sectorProfiles.ngo]);
  const microProfiles = useMemo(() => Object.values(sectorProfiles.micro), [sectorProfiles.micro]);
  const selectedGovernment = sectorProfiles.government[selectedGovernmentId] ?? governmentProfiles[0];
  const selectedNgo = sectorProfiles.ngo[selectedNgoId] ?? ngoProfiles[0];
  const selectedMicro = sectorProfiles.micro[selectedMicroId] ?? microProfiles[0];

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const input = `w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`;

  function announce(message: string) {
    setToast(`${message} تم محليا فقط، والربط الحقيقي ينتظر Backend APIs وسجل تدقيق.`);
  }

  function toggleGovernmentFeature(key: BooleanGovernmentFeatureKey) {
    if (!selectedGovernment) return;
    updateGovernmentProfile(selectedGovernment.governmentId, { [key]: !selectedGovernment[key] } as Partial<GovernmentSectorFeatures>);
    announce(`تم تغيير ${GOVERNMENT_TOGGLES.find((item) => item.key === key)?.label ?? key}`);
  }

  function toggleNgoFeature(key: BooleanNgoFeatureKey) {
    if (!selectedNgo) return;
    updateNgoProfile(selectedNgo.ngoId, { [key]: !selectedNgo[key] } as Partial<NgoSectorFeatures>);
    announce(`تم تغيير ${NGO_TOGGLES.find((item) => item.key === key)?.label ?? key}`);
  }

  function toggleMicroFeature(key: BooleanMicroFeatureKey) {
    if (!selectedMicro) return;
    updateMicroProfile(selectedMicro.microId, { [key]: !selectedMicro[key] } as Partial<MicroSectorFeatures>);
    announce(`تم تغيير ${MICRO_TOGGLES.find((item) => item.key === key)?.label ?? key}`);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E]/30 text-[#C8A762]">
              <Buildings size={21} weight="duotone" />
            </span>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-300">Backend-ready</span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">Beta local</span>
          </div>
          <h1 className={`text-2xl font-black mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>بروفيلات القطاعات</h1>
          <p className={`max-w-3xl text-sm leading-relaxed ${muted}`}>
            مركز أدمن نظامي للحكومة، الجمعيات/الأوقاف، والمنشآت الصغيرة. لا يوجد SSO أو Billing أو RBAC أو Entitlements API الآن.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/pricing" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            <CreditCard size={16} />
            إدارة الأسعار
          </Link>
          <button
            onClick={() => setToast("عقود Government/Ngo/Micro/SectorPlan جاهزة للتوثيق فقط. لا يوجد تصدير إنتاجي الآن.")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-bold text-[#C8A762]"
          >
            <Database size={16} />
            معاينة العقود
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "جهات حكومية", value: governmentProfiles.length, icon: Gavel },
          { label: "جمعيات/أوقاف", value: ngoProfiles.length, icon: HandHeart },
          { label: "منشآت صغيرة", value: microProfiles.length, icon: Buildings },
          { label: "Controls موثقة", value: SECTOR_ADMIN_CONTROLS.length, icon: CheckCircle },
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

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{toast}</span>
      </div>

      <div className={`flex flex-wrap gap-2 rounded-2xl border p-2 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
        {[
          { key: "government" as const, label: "الحكومة", icon: Gavel },
          { key: "ngo" as const, label: "الجمعيات والأوقاف", icon: HandHeart },
          { key: "micro" as const, label: "المنشآت الصغيرة", icon: Buildings },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
              tab === item.key
                ? "bg-[#0B3D2E] text-[#C8A762]"
                : isDark ? "text-zinc-400 hover:bg-white/[0.04]" : "text-slate-500 hover:bg-white"
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "government" && selectedGovernment && (
        <GovernmentPanel
          selected={selectedGovernment}
          profiles={governmentProfiles}
          selectedId={selectedGovernmentId}
          setSelectedId={setSelectedGovernmentId}
          updateProfile={(updates) => {
            const entityType = updates.entityType ?? selectedGovernment.entityType;
            updateGovernmentProfile(selectedGovernment.governmentId, {
              ...updates,
              profileScenarioId: resolveGovernmentScenario(entityType).id,
            });
            announce("تم تحديث بروفيل الجهة الحكومية");
          }}
          toggleFeature={toggleGovernmentFeature}
          card={card}
          muted={muted}
          input={input}
          isDark={isDark}
        />
      )}

      {tab === "ngo" && selectedNgo && (
        <NgoPanel
          selected={selectedNgo}
          profiles={ngoProfiles}
          selectedId={selectedNgoId}
          setSelectedId={setSelectedNgoId}
          updateProfile={(updates) => {
            const organizationType = updates.organizationType ?? selectedNgo.organizationType;
            updateNgoProfile(selectedNgo.ngoId, {
              ...updates,
              profileScenarioId: resolveNgoScenario(organizationType).id,
            });
            announce("تم تحديث بروفيل الجمعية/الوقف");
          }}
          toggleFeature={toggleNgoFeature}
          card={card}
          muted={muted}
          input={input}
          isDark={isDark}
        />
      )}

      {tab === "micro" && selectedMicro && (
        <MicroPanel
          selected={selectedMicro}
          profiles={microProfiles}
          selectedId={selectedMicroId}
          setSelectedId={setSelectedMicroId}
          updateProfile={(updates) => {
            const businessType = updates.businessType ?? selectedMicro.businessType;
            updateMicroProfile(selectedMicro.microId, {
              ...updates,
              profileScenarioId: resolveMicroScenario(businessType).id,
            });
            announce("تم تحديث بروفيل المنشأة الصغيرة");
          }}
          toggleFeature={toggleMicroFeature}
          card={card}
          muted={muted}
          input={input}
          isDark={isDark}
        />
      )}

      <div className={`${card} overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-slate-100"}`}>
          <h2 className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>عقود الأدمن المطلوبة للباك إند لاحقاً</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {SECTOR_ADMIN_CONTROLS.map((control) => (
            <div key={control.id} className={`p-4 border-b md:border-l ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={control.route} className={`text-sm font-black hover:underline ${isDark ? "text-white" : "text-slate-800"}`}>{control.title}</Link>
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
    </div>
  );
}

function GovernmentPanel({
  selected,
  profiles,
  selectedId,
  setSelectedId,
  updateProfile,
  toggleFeature,
  card,
  muted,
  input,
  isDark,
}: {
  selected: GovernmentSectorFeatures;
  profiles: GovernmentSectorFeatures[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  updateProfile: (updates: Partial<GovernmentSectorFeatures>) => void;
  toggleFeature: (key: BooleanGovernmentFeatureKey) => void;
  card: string;
  muted: string;
  input: string;
  isDark: boolean;
}) {
  const scenario = resolveGovernmentScenario(selected.entityType);
  return (
    <PanelShell
      card={card}
      muted={muted}
      title="الحكومة"
      subtitle={scenario.backendBoundary}
      list={profiles.map((profile) => ({
        id: profile.governmentId,
        title: GOVERNMENT_NAMES[profile.governmentId] ?? profile.governmentId,
        meta: `${GOVERNMENT_ENTITY_TYPE_LABEL[profile.entityType]} • ${GOVERNMENT_PLAN_LABEL[profile.plan]}`,
      }))}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="نوع الجهة"><select value={selected.entityType} onChange={(event) => updateProfile({ entityType: event.target.value as GovernmentEntityType })} className={input}>{Object.entries(GOVERNMENT_ENTITY_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="الخطة"><select value={selected.plan} onChange={(event) => updateProfile({ plan: event.target.value as GovernmentPlanId })} className={input}>{Object.entries(GOVERNMENT_PLAN_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="المستخدمون"><input type="number" min={1} value={selected.activeUsers} onChange={(event) => updateProfile({ activeUsers: Number(event.target.value) })} className={input} /></Field>
      </div>
      <Field label="الإدارة/الفرع"><input value={selected.departmentName} onChange={(event) => updateProfile({ departmentName: event.target.value })} className={input} /></Field>
      <FeatureGrid toggles={GOVERNMENT_TOGGLES} selected={selected} toggleFeature={toggleFeature} muted={muted} isDark={isDark} />
      <ContractGrid sector="government" muted={muted} isDark={isDark} />
      <div className={`rounded-xl border p-4 ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-100 bg-amber-50 text-amber-800"}`}>
        <div className="flex items-start gap-2 text-xs leading-relaxed">
          <LockKey size={15} weight="fill" className="mt-0.5 shrink-0" />
          <span>القاضي لا يحصل على أدوات الضابط كصلاحية فعلية. المحقق والضابط مفصولان بوضوح، لكن الإلزام الحقيقي ينتظر RBAC API.</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {GOVERNMENT_ROLE_CONTRACTS.map((role) => (
          <div key={role.role} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
            <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{role.label}</p>
            <p className={`mt-1 text-xs ${muted}`}>{role.scope} • {role.permissions.slice(0, 3).join("، ")}</p>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function NgoPanel({
  selected,
  profiles,
  selectedId,
  setSelectedId,
  updateProfile,
  toggleFeature,
  card,
  muted,
  input,
  isDark,
}: {
  selected: NgoSectorFeatures;
  profiles: NgoSectorFeatures[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  updateProfile: (updates: Partial<NgoSectorFeatures>) => void;
  toggleFeature: (key: BooleanNgoFeatureKey) => void;
  card: string;
  muted: string;
  input: string;
  isDark: boolean;
}) {
  const scenario = resolveNgoScenario(selected.organizationType);
  return (
    <PanelShell
      card={card}
      muted={muted}
      title="الجمعيات والأوقاف"
      subtitle={scenario.backendBoundary}
      list={profiles.map((profile) => ({
        id: profile.ngoId,
        title: NGO_NAMES[profile.ngoId] ?? profile.ngoId,
        meta: `${NGO_ORGANIZATION_TYPE_LABEL[profile.organizationType]} • ${NGO_PLAN_LABEL[profile.plan]}`,
      }))}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="نوع الجهة"><select value={selected.organizationType} onChange={(event) => updateProfile({ organizationType: event.target.value as NgoOrganizationType })} className={input}>{Object.entries(NGO_ORGANIZATION_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="الخطة"><select value={selected.plan} onChange={(event) => updateProfile({ plan: event.target.value as NgoPlanId })} className={input}>{Object.entries(NGO_PLAN_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="المتطوعون"><input type="number" min={0} value={selected.activeVolunteers} onChange={(event) => updateProfile({ activeVolunteers: Number(event.target.value) })} className={input} /></Field>
        <Field label="حد المتطوعين"><input type="number" min={0} value={selected.volunteersLimit} onChange={(event) => updateProfile({ volunteersLimit: Number(event.target.value) })} className={input} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="عدد البرامج"><input type="number" min={0} value={selected.programsCount} onChange={(event) => updateProfile({ programsCount: Number(event.target.value) })} className={input} /></Field>
        <Field label="مقاعد مجلس الإدارة"><input type="number" min={0} value={selected.boardSeats} onChange={(event) => updateProfile({ boardSeats: Number(event.target.value) })} className={input} /></Field>
      </div>
      <FeatureGrid toggles={NGO_TOGGLES} selected={selected} toggleFeature={toggleFeature} muted={muted} isDark={isDark} />
      <ContractGrid sector="ngo" muted={muted} isDark={isDark} />
      <div className={`rounded-xl border p-4 ${isDark ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>
        الوقف يظهر كنوع مستقل داخل NGO، وله أصول وريوع وبرامج ومجلس إدارة، وليس مجرد جمعية خيرية عادية.
      </div>
    </PanelShell>
  );
}

function MicroPanel({
  selected,
  profiles,
  selectedId,
  setSelectedId,
  updateProfile,
  toggleFeature,
  card,
  muted,
  input,
  isDark,
}: {
  selected: MicroSectorFeatures;
  profiles: MicroSectorFeatures[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  updateProfile: (updates: Partial<MicroSectorFeatures>) => void;
  toggleFeature: (key: BooleanMicroFeatureKey) => void;
  card: string;
  muted: string;
  input: string;
  isDark: boolean;
}) {
  const scenario = resolveMicroScenario(selected.businessType);
  return (
    <PanelShell
      card={card}
      muted={muted}
      title="المنشآت الصغيرة"
      subtitle={scenario.backendBoundary}
      list={profiles.map((profile) => ({
        id: profile.microId,
        title: MICRO_NAMES[profile.microId] ?? profile.microId,
        meta: `${MICRO_BUSINESS_TYPE_LABEL[profile.businessType]} • ${MICRO_PLAN_LABEL[profile.plan]}`,
      }))}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="نوع النشاط"><select value={selected.businessType} onChange={(event) => updateProfile({ businessType: event.target.value as MicroBusinessType })} className={input}>{Object.entries(MICRO_BUSINESS_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="الخطة"><select value={selected.plan} onChange={(event) => updateProfile({ plan: event.target.value as MicroPlanId })} className={input}>{Object.entries(MICRO_PLAN_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="الموظفون"><input type="number" min={1} value={selected.employeesCount} onChange={(event) => updateProfile({ employeesCount: Number(event.target.value) })} className={input} /></Field>
        <Field label="درجة الاشتراطات"><input type="number" min={0} max={100} value={selected.requirementsScore} onChange={(event) => updateProfile({ requirementsScore: Number(event.target.value) })} className={input} /></Field>
      </div>
      <Field label="عدد الرخص"><input type="number" min={0} value={selected.licensesCount} onChange={(event) => updateProfile({ licensesCount: Number(event.target.value) })} className={input} /></Field>
      <FeatureGrid toggles={MICRO_TOGGLES} selected={selected} toggleFeature={toggleFeature} muted={muted} isDark={isDark} />
      <ContractGrid sector="micro" muted={muted} isDark={isDark} />
      <div className={`rounded-xl border p-4 ${isDark ? "border-blue-500/20 bg-blue-500/5 text-blue-200" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        المنشأة الصغيرة لا تحتاج مقاعد ولا نقاط. يظهر لها درع بسيط وحدود خدمة داخل الخطة فقط.
      </div>
    </PanelShell>
  );
}

function PanelShell({
  card,
  muted,
  title,
  subtitle,
  list,
  selectedId,
  setSelectedId,
  children,
}: {
  card: string;
  muted: string;
  title: string;
  subtitle: string;
  list: Array<{ id: string; title: string; meta: string }>;
  selectedId: string;
  setSelectedId: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className={`${card} p-5 space-y-3`}>
        <p className="text-sm font-black">{title}</p>
        {list.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={`w-full rounded-xl border p-4 text-right transition ${
              selectedId === item.id
                ? "border-[#C8A762]/40 bg-[#C8A762]/10"
                : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
            }`}
          >
            <p className="text-sm font-black">{item.title}</p>
            <p className={`mt-1 text-[11px] ${muted}`}>{item.meta}</p>
          </button>
        ))}
      </div>
      <div className="lg:col-span-2 space-y-5">
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black">{title}</p>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{subtitle}</p>
            </div>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-300">Backend-ready</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function FeatureGrid<T extends object, K extends keyof T & string>({
  toggles,
  selected,
  toggleFeature,
  muted,
  isDark,
}: {
  toggles: Array<{ key: K; label: string; desc: string }>;
  selected: T;
  toggleFeature: (key: K) => void;
  muted: string;
  isDark: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {toggles.map((toggle) => {
        const enabled = Boolean(selected[toggle.key]);
        return (
          <button
            key={toggle.key}
            onClick={() => toggleFeature(toggle.key)}
            className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-right transition ${
              enabled
                ? isDark ? "border-emerald-500/20 bg-emerald-500/8" : "border-emerald-100 bg-emerald-50"
                : isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
            }`}
          >
            <div>
              <p className="text-sm font-black">{toggle.label}</p>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{toggle.desc}</p>
            </div>
            {enabled ? <ToggleRight size={28} weight="fill" className="text-emerald-400" /> : <ToggleLeft size={28} className={muted} />}
          </button>
        );
      })}
    </div>
  );
}

function ContractGrid({ sector, muted, isDark }: { sector: SectorProfileType; muted: string; isDark: boolean }) {
  const entitlements = getSectorEntitlements(sector);
  const plans = getSectorPlanContracts(sector);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entitlements.slice(0, 6).map((item) => (
          <div key={`${item.sector}-${item.key}`} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black">{item.label}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${item.readiness === "UI Working" ? "border-emerald-500/25 text-emerald-400" : "border-blue-500/25 text-blue-300"}`}>{item.readiness}</span>
            </div>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{item.description}</p>
            <p className={`mt-2 text-[10px] font-mono ${muted}`}>{item.contract}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((plan) => (
          <div key={plan.id} className={`rounded-xl border p-3 ${isDark ? "border-[#C8A762]/15 bg-[#C8A762]/5" : "border-amber-100 bg-amber-50"}`}>
            <p className="text-sm font-black">{plan.label}</p>
            <p className={`mt-1 text-xs ${muted}`}>{plan.pricingModel === "annual_quote" ? "عرض سعر سنوي" : plan.yearlyPrice ? `${plan.yearlyPrice.toLocaleString("ar-SA")} ر.س/سنة` : "مجاني"}</p>
            <p className={`mt-2 text-[11px] leading-relaxed ${muted}`}>{plan.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
