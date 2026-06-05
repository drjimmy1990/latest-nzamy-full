"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import {
  Tag,
  Link as LinkIcon,
  Plus,
  Copy,
  ChartLineUp,
  Mouse,
  CheckCircle,
  WarningCircle,
  Warning,
  X,
  Target
} from "@phosphor-icons/react";
import type { ProviderPromoLink } from "@/types/adminBackendReady";

// Mock Data
const INITIAL_LINKS: ProviderPromoLink[] = [
  {
    id: "promo-1",
    slug: "saud-consult-20",
    fullUrl: "https://nzamy.com/promo/saud-consult-20",
    providerId: "lawyer-123",
    providerName: "سعود القحطاني",
    providerType: "lawyer",
    promoType: "percentage_off",
    value: 20,
    targetService: "service-consultation",
    targetServiceLabel: "استشارة قانونية ٤٥ دقيقة",
    maxUses: 50,
    usedCount: 12,
    startsAt: "2026-05-01",
    expiresAt: "2026-06-30",
    status: "active",
    createdAt: "2026-04-20",
    usageLog: [],
    totalClicks: 240,
    conversionRate: 5.0,
  },
  {
    id: "promo-2",
    slug: "free-review-v1",
    fullUrl: "https://nzamy.com/promo/free-review-v1",
    providerId: "lawyer-123",
    providerName: "سعود القحطاني",
    providerType: "lawyer",
    promoType: "free",
    value: 100, // 100% off
    targetService: "service-contract-review",
    targetServiceLabel: "مراجعة عقد عمل",
    maxUses: 5,
    usedCount: 5,
    startsAt: "2026-05-10",
    expiresAt: "2026-05-15",
    status: "depleted",
    createdAt: "2026-05-05",
    usageLog: [],
    totalClicks: 85,
    conversionRate: 5.88,
  }
];

export default function LawyerPromotionsPage() {
  const { isDark } = useTheme();
  const [links, setLinks] = useState(INITIAL_LINKS);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState("الواجهة جاهزة للربط: البيانات تُحفظ محلياً في نسخة البيتا.");
  
  // Draft State
  const [slug, setSlug] = useState("");
  const [promoType, setPromoType] = useState<"percentage_off" | "fixed_off" | "free">("percentage_off");
  const [value, setValue] = useState(15);
  const [service, setService] = useState("استشارة قانونية ٤٥ دقيقة");

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5 backdrop-blur-md" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    setToast("تم نسخ الرابط! يمكنك مشاركته الآن في تويتر أو لينكدإن.");
  }

  function handleCreate() {
    if (!slug) return;
    const newLink: ProviderPromoLink = {
      id: `promo-${Date.now()}`,
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      fullUrl: `https://nzamy.com/promo/${slug.toLowerCase().replace(/\s+/g, '-')}`,
      providerId: "lawyer-123",
      providerName: "سعود القحطاني",
      providerType: "lawyer",
      promoType,
      value: promoType === "free" ? 100 : value,
      targetService: "service-draft",
      targetServiceLabel: service,
      maxUses: 100,
      usedCount: 0,
      startsAt: new Date().toISOString().split('T')[0],
      expiresAt: "2026-12-31",
      status: "active",
      createdAt: new Date().toISOString(),
      usageLog: [],
      totalClicks: 0,
      conversionRate: 0,
    };
    setLinks([newLink, ...links]);
    setIsCreating(false);
    setSlug("");
    setToast("تم إنشاء الرابط الترويجي بنجاح (محلياً).");
  }

  return (
    <div className="space-y-6">

      {/* بيانات تجريبية Banner */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
          <Warning size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>العروض الترويجية — قريباً</p>
        </div>
      </motion.div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
              <Tag size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
            </div>
            <div>
              <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>روابطي الترويجية</h1>
              <p className={`text-xs ${muted}`}>أنشئ روابط تسويقية لخدماتك وشاركها في السوشيال ميديا لجلب عملاء جدد.</p>
            </div>
          </div>
        </div>
        <button onClick={() => setIsCreating(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 transition">
          <Plus size={16} weight="bold" />
          رابط جديد
        </button>
      </div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          ["إجمالي النقرات", links.reduce((acc, l) => acc + l.totalClicks, 0), "Mouse"],
          ["الاستخدامات (حجوزات)", links.reduce((acc, l) => acc + l.usedCount, 0), "CheckCircle"],
          ["متوسط التحويل", "5.4%", "ChartLineUp"],
        ].map(([label, val, iconName]) => {
          const Icon = iconName === "Mouse" ? Mouse : iconName === "CheckCircle" ? CheckCircle : ChartLineUp;
          return (
            <div key={label.toString()} className={`${card} p-5 flex items-center gap-4`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                <Icon size={24} className={isDark ? "text-gray-400" : "text-gray-500"} />
              </div>
              <div>
                <p className={`text-xs mb-1 ${muted}`}>{label}</p>
                <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{val}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Links List */}
      <div className="grid grid-cols-1 gap-4">
        {links.map((link, i) => (
          <motion.div key={link.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={`${card} p-5`}>
            <div className="flex flex-col md:flex-row justify-between gap-4">
              
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${link.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-500/10 text-gray-500'}`}>
                    {link.status === 'active' ? 'نشط' : 'مستنفذ'}
                  </span>
                  <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    {link.promoType === "free" ? "خدمة مجانية" : link.promoType === "percentage_off" ? `خصم ${link.value}%` : `خصم ${link.value} ر.س`}
                  </span>
                </div>
                
                <div>
                  <h3 className={`text-lg font-black font-mono ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                    /{link.slug}
                  </h3>
                  <div className={`flex items-center gap-1 text-xs mt-1 ${muted}`}>
                    <Target size={14} />
                    يُطبّق على: <span className="font-bold">{link.targetServiceLabel}</span>
                  </div>
                </div>

                <div className={`flex items-center gap-2 p-2 rounded-lg text-xs font-mono border ${isDark ? "border-white/10 bg-black/20 text-gray-400" : "border-gray-100 bg-gray-50 text-gray-500"}`}>
                  <LinkIcon size={14} />
                  <span className="flex-1 truncate">{link.fullUrl}</span>
                  <button onClick={() => handleCopy(link.fullUrl)} className="p-1 hover:text-indigo-500 transition">
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div className={`w-full md:w-64 p-4 rounded-xl flex flex-col justify-center space-y-3 ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                <div className="flex justify-between items-center text-sm">
                  <span className={muted}>النقرات</span>
                  <span className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{link.totalClicks}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className={muted}>الاستخدام</span>
                  <span className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{link.usedCount} / {link.maxUses}</span>
                </div>
                <div className={`h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"} w-full`}>
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min((link.usedCount / link.maxUses) * 100, 100)}%` }} />
                </div>
              </div>

            </div>
          </motion.div>
        ))}
      </div>

      {/* Creation Modal */}
      <AnimatePresence>
        {isCreating && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setIsCreating(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-6 shadow-2xl ${card}`}>
              
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>رابط ترويجي جديد</h2>
                <button onClick={() => setIsCreating(false)} className={`p-2 rounded-full ${isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-600"}`}>
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className={`text-xs font-bold ${muted}`}>الرابط (Slug)</span>
                  <div className="flex" dir="ltr">
                    <span className={`inline-flex items-center px-3 rounded-l-xl border-y border-l text-sm font-mono ${isDark ? "border-white/10 bg-white/5 text-gray-500" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
                      nzamy.com/promo/
                    </span>
                    <input 
                      value={slug}
                      onChange={e => setSlug(e.target.value)}
                      placeholder="e.g. ramadan-offer"
                      className={`flex-1 rounded-r-xl border px-3 py-2 outline-none font-mono text-sm ${isDark ? "bg-zinc-950 border-white/5 text-white" : "bg-white border-gray-200 text-gray-900"}`}
                    />
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className={`text-xs font-bold ${muted}`}>الخدمة المستهدفة</span>
                  <select value={service} onChange={e => setService(e.target.value)} className={`w-full rounded-xl border px-3 py-2 outline-none text-sm ${isDark ? "bg-zinc-950 border-white/5 text-white" : "bg-white border-gray-200 text-gray-900"}`}>
                    <option value="استشارة قانونية ٤٥ دقيقة">استشارة قانونية ٤٥ دقيقة</option>
                    <option value="مراجعة عقد عمل">مراجعة عقد عمل</option>
                    <option value="صياغة لائحة اعتراضية">صياغة لائحة اعتراضية</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-1">
                    <span className={`text-xs font-bold ${muted}`}>نوع العرض</span>
                    <select value={promoType} onChange={e => setPromoType(e.target.value as any)} className={`w-full rounded-xl border px-3 py-2 outline-none text-sm ${isDark ? "bg-zinc-950 border-white/5 text-white" : "bg-white border-gray-200 text-gray-900"}`}>
                      <option value="percentage_off">نسبة خصم (%)</option>
                      <option value="fixed_off">مبلغ ثابت (ر.س)</option>
                      <option value="free">مجاني بالكامل</option>
                    </select>
                  </label>
                  {promoType !== "free" && (
                    <label className="block space-y-1">
                      <span className={`text-xs font-bold ${muted}`}>القيمة</span>
                      <input type="number" value={value} onChange={e => setValue(Number(e.target.value))} className={`w-full rounded-xl border px-3 py-2 outline-none text-sm ${isDark ? "bg-zinc-950 border-white/5 text-white" : "bg-white border-gray-200 text-gray-900"}`} />
                    </label>
                  )}
                </div>

                <div className={`mt-4 p-3 rounded-xl border text-xs leading-relaxed ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  <span className="font-bold">ملاحظة الخصم:</span> هذا الخصم سيتم اقتطاعه من <span className="font-bold underline">حصتك من الأرباح</span> كنوع من التسويق لخدماتك الخاصة، ولن يؤثر على رسوم المنصة الأساسية.
                </div>

                <button onClick={handleCreate} disabled={!slug} className="w-full mt-4 py-3 rounded-xl bg-indigo-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-600 transition">
                  إنشاء واعتماد الرابط
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
