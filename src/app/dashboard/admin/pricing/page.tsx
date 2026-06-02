"use client";

import { useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  Check,
  CurrencyCircleDollar,
  FloppyDisk,
  LockKey,
  PencilSimple,
  Plus,
  Robot,
  Scales,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { LAWYER_AI_TOOLS } from "@/constants/lawyerAiCatalog";
import { plansLawyers } from "@/constants/pricing/pricing.lawyers";
import { plansFirms } from "@/constants/pricing/pricing.firms";
import type { AdminPricingItem, AdminPricingScope, AdminPricingStatus } from "@/types/adminBackendReady";

const SCOPE_LABEL: Record<AdminPricingScope, string> = {
  individual: "الأفراد",
  business: "الشركات",
  micro: "المنشآت الصغيرة",
  lawyer: "المحامون",
  firm: "مكاتب المحاماة",
  provider: "مقدمو الخدمات",
  government: "الجهات الحكومية",
  ngo: "الجمعيات",
  platform: "رسوم المنصة",
};

const STATUS_LABEL: Record<AdminPricingStatus, string> = {
  live: "Live",
  beta: "Beta",
  draft: "مسودة",
  disabled: "معطل",
};

const LAWYER_PLAN_NUMBERS: Record<string, { price: number; credits: number }> = {
  "lawyer-basic": { price: 1000, credits: 1500 },
  "lawyer-advanced": { price: 2500, credits: 5000 },
  "lawyer-elite": { price: 5000, credits: 12500 },
  "lawyer-royal": { price: 10000, credits: 30000 },
};

const FIRM_PLAN_NUMBERS: Record<string, { monthly: number; yearly: number; credits: number; baseSeats: number; extraSeatYearly: number | null; maxSeats: number | null }> = {
  "firm-basic": { monthly: 1499, yearly: 17988, credits: 30000, baseSeats: 3, extraSeatYearly: 2388, maxSeats: 8 },
  "firm-growth": { monthly: 3999, yearly: 47988, credits: 120000, baseSeats: 10, extraSeatYearly: 2988, maxSeats: 30 },
  "firm-scale": { monthly: 7999, yearly: 95988, credits: 360000, baseSeats: 25, extraSeatYearly: 3588, maxSeats: 75 },
  "firm-enterprise": { monthly: 14999, yearly: 179988, credits: 900000, baseSeats: 50, extraSeatYearly: null, maxSeats: null },
};

const INITIAL_PRICING: AdminPricingItem[] = [
  ...plansLawyers.ar.map((plan): AdminPricingItem => ({
    id: `lawyer-${plan.id}`,
    scope: "lawyer",
    name: plan.name,
    priceMonthly: LAWYER_PLAN_NUMBERS[plan.id]?.price ?? 0,
    priceYearly: LAWYER_PLAN_NUMBERS[plan.id]?.price ?? 0,
    includedCredits: LAWYER_PLAN_NUMBERS[plan.id]?.credits ?? 0,
    status: "beta",
    betaLocked: true,
    notes: plan.desc,
  })),
  ...plansFirms.ar.map((plan): AdminPricingItem => ({
    id: `firm-${plan.id}`,
    scope: "firm",
    name: plan.name,
    priceMonthly: FIRM_PLAN_NUMBERS[plan.id]?.monthly ?? 0,
    priceYearly: FIRM_PLAN_NUMBERS[plan.id]?.yearly ?? 0,
    includedCredits: FIRM_PLAN_NUMBERS[plan.id]?.credits ?? 0,
    pricingModel: "annual_seats_points",
    baseSeats: FIRM_PLAN_NUMBERS[plan.id]?.baseSeats ?? 0,
    minMonthlyCommitment: FIRM_PLAN_NUMBERS[plan.id]?.monthly ?? 0,
    extraSeatPrice: FIRM_PLAN_NUMBERS[plan.id]?.extraSeatYearly ?? undefined,
    maxSeats: FIRM_PLAN_NUMBERS[plan.id]?.maxSeats ?? null,
    billingMetric: "seat",
    status: "beta",
    betaLocked: true,
    notes: `${plan.desc} النموذج: اشتراك سنوي + مقاعد + نقاط للشركة. ${plan.pricingFormulaLabel ?? ""}`,
  })),
  {
    id: "individual-quick-question",
    scope: "individual",
    name: "سؤال سريع",
    priceMonthly: 10,
    status: "live",
    betaLocked: false,
    notes: "سعر خدمة فردية وليس اشتراكاً شهرياً.",
  },
  {
    id: "marketplace-platform-fee",
    scope: "platform",
    name: "عمولة السوق",
    priceMonthly: 0,
    platformFeePct: 15,
    status: "beta",
    betaLocked: true,
    notes: "العمولة موثقة، والتحصيل الحقيقي ينتظر الدفع والضمان.",
  },
  {
    id: "provider-verification-fee",
    scope: "provider",
    name: "رسوم اعتماد مقدم الخدمة",
    priceMonthly: 0,
    status: "draft",
    betaLocked: true,
    notes: "جاهزة للتسعير لاحقاً بعد KYC backend.",
  },
];

const EMPTY_PRICING: AdminPricingItem = {
  id: "custom-pricing",
  scope: "individual",
  name: "",
  priceMonthly: 0,
  priceYearly: 0,
  includedCredits: 0,
  pricingModel: "one_time",
  baseSeats: 0,
  minMonthlyCommitment: 0,
  extraSeatPrice: 0,
  maxSeats: null,
  billingMetric: "service",
  platformFeePct: 0,
  status: "draft",
  betaLocked: true,
  notes: "",
};

export default function PricingPage() {
  const { isDark } = useTheme();
  const [items, setItems] = useState(INITIAL_PRICING);
  const [draft, setDraft] = useState<AdminPricingItem | null>(null);
  const [scope, setScope] = useState<AdminPricingScope | "all">("all");
  const [toast, setToast] = useState("التسعير Backend-ready: أي تعديل هنا محلي فقط حتى ربط Pricing API.");

  const filteredItems = items.filter((item) => scope === "all" || item.scope === scope);
  const betaFreeTools = LAWYER_AI_TOOLS.filter((tool) => tool.betaStatus === "beta-free").length;
  const liveCount = items.filter((item) => item.status === "live").length;
  const betaCount = items.filter((item) => item.status === "beta").length;
  const platformFee = items.find((item) => item.id === "marketplace-platform-fee")?.platformFeePct ?? 0;
  const stats: Array<[string, string | number, ElementType]> = [
    ["بنود التسعير", items.length, CurrencyCircleDollar],
    ["Live / Beta", `${liveCount}/${betaCount}`, Check],
    ["Beta free AI", betaFreeTools, Robot],
    ["عمولة السوق", `${platformFee}%`, Scales],
  ];

  const totalCatalogValue = useMemo(
    () => items.reduce((sum, item) => sum + item.priceMonthly, 0),
    [items],
  );

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  function openNewItem() {
    setDraft({ ...EMPTY_PRICING, id: `pricing-${items.length + 1}` });
  }

  function saveDraft() {
    if (!draft?.name.trim()) {
      setToast("بند التسعير يحتاج اسم واضح قبل تجهيزه للربط.");
      return;
    }
    const normalized = {
      ...draft,
      id: draft.id.trim().toLowerCase().replace(/\s+/g, "-"),
    };
    setItems((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...current];
    });
    setDraft(null);
    setToast(`تم تجهيز "${normalized.name}" محلياً. النشر الفعلي ينتظر admin_pricing_catalog API.`);
  }

  function updateStatus(id: string, status: AdminPricingStatus) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
    setToast(`تم تغيير حالة التسعير إلى ${STATUS_LABEL[status]} محلياً فقط.`);
  }

  function toggleBetaLock(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, betaLocked: !item.betaLocked } : item)));
    setToast("تم تغيير قفل البيتا محلياً. عند live يراجع BETA_TEARDOWN_REGISTRY قبل إزالة القفل.");
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>إدارة التسعير والباقات</h1>
          <p className={`text-sm ${muted}`}>تحكم محلي في أسعار الأدوار، أرصدة AI، رسوم المنصة، وحالة البيتا. لا يوجد حفظ إنتاجي.</p>
        </div>
        <button onClick={openNewItem} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-white font-bold text-sm hover:bg-[#0a3328]">
          <Plus size={16} weight="bold" />
          بند تسعير جديد
        </button>
      </motion.div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map(([label, value, Icon]) => (
          <div key={label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{value as string | number}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.04] text-[#C8A762]" : "bg-slate-50 text-[#0B3D2E]"}`}>
              <Icon size={22} weight="duotone" />
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <p className={`font-black ${isDark ? "text-white" : "text-slate-800"}`}>تجهيز بند تسعير</p>
            <span className="text-[11px] px-2 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold">Backend-ready</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="المعرف"><input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="الاسم"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="النطاق">
              <select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as AdminPricingScope })} className={inputClass(isDark)}>
                {(Object.keys(SCOPE_LABEL) as AdminPricingScope[]).map((key) => <option key={key} value={key}>{SCOPE_LABEL[key]}</option>)}
              </select>
            </Field>
            <Field label="الحالة">
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminPricingStatus })} className={inputClass(isDark)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="السعر الشهري/الخدمة"><input type="number" value={draft.priceMonthly} onChange={(event) => setDraft({ ...draft, priceMonthly: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="السعر السنوي"><input type="number" value={draft.priceYearly ?? 0} onChange={(event) => setDraft({ ...draft, priceYearly: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="رصيد AI"><input type="number" value={draft.includedCredits ?? 0} onChange={(event) => setDraft({ ...draft, includedCredits: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="المقاعد المضمّنة"><input type="number" value={draft.baseSeats ?? 0} onChange={(event) => setDraft({ ...draft, baseSeats: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="سعر المقعد الإضافي/سنة"><input type="number" value={draft.extraSeatPrice ?? 0} onChange={(event) => setDraft({ ...draft, extraSeatPrice: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="الحد الأقصى للمقاعد"><input type="number" value={draft.maxSeats ?? 0} onChange={(event) => setDraft({ ...draft, maxSeats: Number(event.target.value) || null })} className={inputClass(isDark)} /></Field>
            <Field label="نموذج التسعير">
              <select value={draft.pricingModel ?? "one_time"} onChange={(event) => setDraft({ ...draft, pricingModel: event.target.value as AdminPricingItem["pricingModel"] })} className={inputClass(isDark)}>
                <option value="one_time">مرة واحدة/خدمة</option>
                <option value="monthly">شهري</option>
                <option value="annual_seats_points">سنوي + مقاعد + نقاط</option>
                <option value="platform_fee">عمولة منصة</option>
                <option value="custom_contract">عقد مخصص</option>
              </select>
            </Field>
            <Field label="رسوم المنصة %"><input type="number" value={draft.platformFeePct ?? 0} onChange={(event) => setDraft({ ...draft, platformFeePct: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
          </div>
          <Field label="ملاحظات الربط">
            <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={`${inputClass(isDark)} min-h-20`} />
          </Field>
          <label className={`inline-flex items-center gap-2 text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            <input type="checkbox" checked={draft.betaLocked} onChange={(event) => setDraft({ ...draft, betaLocked: event.target.checked })} />
            مقفل أثناء البيتا
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>إلغاء</button>
            <button onClick={saveDraft} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white">
              <FloppyDisk size={16} />
              حفظ محلي
            </button>
          </div>
        </motion.div>
      )}

      <div className={`${card} p-2 flex gap-1 overflow-x-auto`}>
        <button onClick={() => setScope("all")} className={filterClass(isDark, scope === "all")}>الكل</button>
        {(Object.keys(SCOPE_LABEL) as AdminPricingScope[]).map((key) => (
          <button key={key} onClick={() => setScope(key)} className={filterClass(isDark, scope === key)}>{SCOPE_LABEL[key]}</button>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className={`text-xs font-bold ${isDark ? "bg-zinc-950/40 text-zinc-500 border-b border-white/[0.06]" : "bg-slate-50 text-slate-400 border-b border-slate-100"}`}>
                <th className="px-4 py-3">البند</th>
                <th className="px-4 py-3">النطاق</th>
                <th className="px-4 py-3">شهري/خدمة</th>
                <th className="px-4 py-3">سنوي</th>
                <th className="px-4 py-3">AI</th>
                <th className="px-4 py-3">مقاعد</th>
                <th className="px-4 py-3">رسوم منصة</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className={`border-b last:border-0 ${isDark ? "border-white/[0.04] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50"}`}>
                  <td className="px-4 py-4">
                    <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{item.name}</p>
                    <p className={`text-[10px] font-mono ${muted}`}>{item.id}</p>
                    <p className={`text-[10px] mt-1 max-w-sm ${muted}`}>{item.notes}</p>
                  </td>
                  <td className={`px-4 py-4 text-xs font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{SCOPE_LABEL[item.scope]}</td>
                  <td className={`px-4 py-4 text-sm font-mono ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{item.priceMonthly.toLocaleString("ar-SA")}</td>
                  <td className={`px-4 py-4 text-sm font-mono ${muted}`}>{item.priceYearly ? item.priceYearly.toLocaleString("ar-SA") : "-"}</td>
                  <td className={`px-4 py-4 text-sm font-mono ${muted}`}>{item.includedCredits ?? "-"}</td>
                  <td className={`px-4 py-4 text-xs font-mono ${muted}`}>
                    {item.baseSeats ? `${item.baseSeats} + ${item.extraSeatPrice ? item.extraSeatPrice.toLocaleString("ar-SA") : "مخصص"}` : "-"}
                  </td>
                  <td className={`px-4 py-4 text-sm font-mono ${muted}`}>{item.platformFeePct ? `${item.platformFeePct}%` : "-"}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <select value={item.status} onChange={(event) => updateStatus(item.id, event.target.value as AdminPricingStatus)} className={`${inputClass(isDark)} w-28 text-xs`}>
                        {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {item.betaLocked && <span title="مقفل أثناء البيتا" className="text-amber-400"><LockKey size={14} weight="fill" /></span>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1">
                      <button onClick={() => setDraft(item)} className={actionClass(isDark)} title="تعديل"><PencilSimple size={14} /></button>
                      <button onClick={() => toggleBetaLock(item.id)} className={actionClass(isDark)} title="Beta lock"><LockKey size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <p className={`text-sm font-black mb-3 ${isDark ? "text-white" : "text-slate-800"}`}>ملخص الربط القادم</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-slate-50 text-slate-600"}`}>مصدر الإنتاج القادم: `admin_pricing_catalog` أو Pricing API.</div>
          <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-slate-50 text-slate-600"}`}>Beta locks تزال عند live حسب `BETA_TEARDOWN_REGISTRY.md`.</div>
          <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-slate-50 text-slate-600"}`}>إجمالي قيم الكتالوج المحلي: {totalCatalogValue.toLocaleString("ar-SA")} ر.س.</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs font-bold text-gray-500">{label}</span>{children}</label>;
}

function inputClass(isDark: boolean) {
  return `rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`;
}

function filterClass(isDark: boolean, active: boolean) {
  if (active) return isDark ? "px-4 py-2 rounded-xl text-xs font-bold bg-white/10 text-white" : "px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-900";
  return isDark ? "px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:bg-white/5" : "px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50";
}

function actionClass(isDark: boolean) {
  return `p-2 rounded-lg border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`;
}
