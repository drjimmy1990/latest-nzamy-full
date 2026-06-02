"use client";

import { useMemo, useState } from "react";
import {
  CurrencyCircleDollar,
  FloppyDisk,
  Info,
  MagnifyingGlass,
  Plus,
  RocketLaunch,
  ShieldCheck,
  Sparkle,
  Storefront,
  ToggleRight,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import type {
  AdminFeatureCategory,
  AdminFeatureEnvironment,
  AdminFeatureFlag,
} from "@/types/adminBackendReady";

const CATEGORY_ICON: Record<AdminFeatureCategory, React.ElementType> = {
  AI: Sparkle,
  Marketplace: Storefront,
  Beta: RocketLaunch,
  Core: ToggleRight,
  Billing: CurrencyCircleDollar,
  Content: Info,
};

const CATEGORY_LABEL: Record<AdminFeatureCategory, string> = {
  AI: "AI",
  Marketplace: "السوق",
  Beta: "البيتا",
  Core: "النظام",
  Billing: "الفوترة",
  Content: "المحتوى",
};

const INITIAL_FLAGS: AdminFeatureFlag[] = [
  {
    id: "F001",
    name: "المحاكي الشامل",
    key: "ENABLE_WARGAMING_AI",
    category: "AI",
    description: "تفعيل أداة المحاكاة الشاملة للقضايا للمحامين.",
    environments: { production: true, staging: true, beta: true },
    teardownNote: "يبقى مربوطاً بسياسة مخرجات legal-data/RAG قبل live.",
  },
  {
    id: "F002",
    name: "المدفوعات الآجلة",
    key: "BILLING_POSTPAY",
    category: "Billing",
    description: "السماح للشركات الكبرى بالدفع الآجل نهاية الشهر.",
    environments: { production: false, staging: true, beta: true },
    teardownNote: "لا يفتح production قبل billing backend وفواتير حقيقية.",
  },
  {
    id: "F003",
    name: "Beta Monopoly",
    key: "BETA_MONOPOLY_MODE",
    category: "Beta",
    description: "إدارة إغلاق/فتح أسطح السوق أثناء مرحلة البيتا.",
    environments: { production: true, staging: true, beta: true },
    teardownNote: "إزالته تتبع BETA_TEARDOWN_REGISTRY ولا تتم من الواجهة فقط.",
  },
  {
    id: "F004",
    name: "بوابة المراجعة البشرية",
    key: "BETA_REVIEW_MODE",
    category: "Beta",
    description: "تغطية المخرجات القانونية الحساسة حتى اعتماد RAG/QA.",
    environments: { production: true, staging: true, beta: true },
    teardownNote: "يعطل فقط بعد اعتماد مصادر RAG وسجل مراجعة المخرجات.",
  },
  {
    id: "F005",
    name: "سوق التعاون المباشر",
    key: "ENABLE_COLLAB_MARKET",
    category: "Marketplace",
    description: "تمكين المحامين من طرح قضايا للتعاون مع محامين آخرين.",
    environments: { production: false, staging: true, beta: true },
    teardownNote: "يفتح production بعد orders/offers/escrow backend.",
  },
];

const EMPTY_FLAG: AdminFeatureFlag = {
  id: "F-new",
  name: "",
  key: "",
  category: "Core",
  description: "",
  environments: { production: false, staging: true, beta: true },
  teardownNote: "يوثق في BETA_TEARDOWN_REGISTRY إذا كان مؤقتاً.",
};

export default function AdminFeatureFlagsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [flags, setFlags] = useState(INITIAL_FLAGS);
  const [draft, setDraft] = useState<AdminFeatureFlag | null>(null);
  const [toast, setToast] = useState("Feature Flags هنا واجهة Backend-ready فقط. لا تغيّر betaConfig أو production runtime فعلياً.");

  const filteredFlags = flags.filter((flag) =>
    [flag.name, flag.key, flag.description, flag.category].some((value) => value.toLowerCase().includes(search.toLowerCase())),
  );

  const stats = useMemo(() => ({
    total: flags.length,
    beta: flags.filter((flag) => flag.category === "Beta").length,
    productionOn: flags.filter((flag) => flag.environments.production).length,
    gated: flags.filter((flag) => flag.teardownNote.includes("BETA") || flag.category === "Beta").length,
  }), [flags]);

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function toggleFlag(id: string, env: AdminFeatureEnvironment) {
    setFlags((current) =>
      current.map((flag) =>
        flag.id === id
          ? { ...flag, environments: { ...flag.environments, [env]: !flag.environments[env] } }
          : flag,
      ),
    );
    setToast(`تم تغيير ${env} محلياً فقط. التنفيذ الحقيقي ينتظر feature-flags backend أو تعديل betaConfig عند الإطلاق.`);
  }

  function openNewFlag() {
    setDraft({ ...EMPTY_FLAG, id: `F${String(flags.length + 1).padStart(3, "0")}` });
  }

  function saveDraft() {
    if (!draft?.name.trim() || !draft.key.trim()) {
      setToast("Feature flag يحتاج اسم ومفتاح واضح قبل تجهيزه للربط.");
      return;
    }

    const normalized = { ...draft, key: draft.key.trim().toUpperCase() };
    setFlags((current) => {
      const exists = current.some((flag) => flag.id === normalized.id);
      return exists ? current.map((flag) => (flag.id === normalized.id ? normalized : flag)) : [normalized, ...current];
    });
    setDraft(null);
    setToast(`تم تجهيز ${normalized.key} محلياً. لا يوجد تغيير runtime فعلي قبل الباك إند.`);
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/20 text-[#00E5FF]" : "bg-cyan-100 text-cyan-700"}`}>
              <ToggleRight size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>إدارة الميزات والبيتا</h1>
          </div>
          <p className={`text-sm ${muted}`}>تحكم محلي في feature flags مع توثيق واضح لمسار الإزالة عند live.</p>
        </div>
        <button onClick={openNewFlag} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
          <Plus size={16} weight="bold" />
          إضافة Feature Flag
        </button>
      </div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المفاتيح", value: stats.total, icon: ToggleRight },
          { label: "Beta controls", value: stats.beta, icon: RocketLaunch },
          { label: "Production on", value: stats.productionOn, icon: ShieldCheck },
          { label: "Teardown tracked", value: stats.gated, icon: Info },
        ].map((stat) => (
          <div key={stat.label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/5 text-[#C8A762]" : "bg-gray-100 text-[#0B3D2E]"}`}>
              <stat.icon size={22} weight="duotone" />
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>تجهيز Feature Flag</h2>
            <span className="text-[11px] px-2 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold">Backend-ready</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="الاسم"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="المفتاح"><input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="التصنيف">
              <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as AdminFeatureCategory })} className={inputClass(isDark)}>
                {(Object.keys(CATEGORY_LABEL) as AdminFeatureCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}
              </select>
            </Field>
            <Field label="ملاحظة الإزالة"><input value={draft.teardownNote} onChange={(event) => setDraft({ ...draft, teardownNote: event.target.value })} className={inputClass(isDark)} /></Field>
          </div>
          <Field label="الوصف"><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass(isDark)} min-h-20`} /></Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>إلغاء</button>
            <button onClick={saveDraft} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white"><FloppyDisk size={16} /> حفظ محلي</button>
          </div>
        </motion.div>
      )}

      <div className={`${card} p-2 flex items-center gap-2`}>
        <MagnifyingGlass size={16} className={muted} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن ميزة أو مفتاح..." className={`w-full bg-transparent outline-none py-2 text-sm ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`} />
      </div>

      <div className="space-y-4">
        {filteredFlags.map((flag, index) => {
          const Icon = CATEGORY_ICON[flag.category];
          return (
            <motion.div key={flag.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`${card} p-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl flex-shrink-0 ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                  <Icon size={24} weight="duotone" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{flag.name}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${isDark ? "bg-white/5 border-white/10 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-600"}`}>{CATEGORY_LABEL[flag.category]}</span>
                  </div>
                  <p className={`text-sm mb-2 ${muted}`}>{flag.description}</p>
                  <code className={`text-xs px-2 py-1 rounded-md font-mono ${isDark ? "bg-[#0d1117] text-gray-400 border border-white/5" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>{flag.key}</code>
                  <p className={`text-xs mt-3 ${isDark ? "text-amber-200" : "text-amber-700"}`}>{flag.teardownNote}</p>
                </div>
              </div>

              <div className={`flex items-center gap-6 p-4 rounded-2xl justify-between ${isDark ? "bg-[#0d1117] border border-white/5" : "bg-gray-50 border border-gray-100"}`}>
                {(["production", "staging", "beta"] as const).map((env) => {
                  const isActive = flag.environments[env];
                  return (
                    <div key={env} className="flex flex-col items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>{env}</span>
                      <button onClick={() => toggleFlag(flag.id, env)} className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${isActive ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-slate-300"}`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isActive ? "start-[calc(100%-22px)]" : "start-0.5"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
        {filteredFlags.length === 0 && <div className={`p-12 text-center ${muted}`}>لا توجد ميزات مطابقة للبحث</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs font-bold text-gray-500">{label}</span>{children}</label>;
}

function inputClass(isDark: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`;
}
