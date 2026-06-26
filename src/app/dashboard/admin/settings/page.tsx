"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookBookmark,
  Check,
  FloppyDisk,
  Gear,
  Plus,
  Shield,
  Sliders,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TierLimit {
  tier: string;
  label: string;
  cases: number;
  contracts: number;
  credits: number;
}

interface SettingsData {
  library_free_article_limit: { default: number };
  library_whitelisted_laws: { slugs: string[] };
  tier_limits: TierLimit[];
}

const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  free:       { label: "مجاني",      color: "text-slate-400",  bg: "bg-slate-400/10" },
  ai:         { label: "AI",         color: "text-cyan-400",   bg: "bg-cyan-400/10" },
  pro:        { label: "Pro",        color: "text-blue-500",   bg: "bg-blue-500/10" },
  max:        { label: "Max",        color: "text-violet-500", bg: "bg-violet-500/10" },
  enterprise: { label: "Enterprise", color: "text-amber-500",  bg: "bg-amber-500/10" },
};

const DEFAULT_TIERS: TierLimit[] = [
  { tier: "free",       label: "مجاني",      cases: 5,  contracts: 3,  credits: 20 },
  { tier: "ai",         label: "AI",         cases: 15, contracts: 10, credits: 150 },
  { tier: "pro",        label: "Pro",        cases: -1, contracts: 20, credits: 300 },
  { tier: "max",        label: "Max",        cases: -1, contracts: -1, credits: 1200 },
  { tier: "enterprise", label: "Enterprise", cases: -1, contracts: -1, credits: -1 },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const { isDark } = useTheme();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Library settings
  const [freeArticleLimit, setFreeArticleLimit] = useState(5);
  const [whitelistedSlugs, setWhitelistedSlugs] = useState<string[]>([]);
  const [newSlug, setNewSlug] = useState("");

  // Tier limits
  const [tierLimits, setTierLimits] = useState<TierLimit[]>(DEFAULT_TIERS);

  // ── Styles ──
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  // ── Toast Helper ──
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load Settings ──
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/v1/admin/settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SettingsData) => {
        if (data.library_free_article_limit?.default != null) {
          setFreeArticleLimit(data.library_free_article_limit.default);
        }
        if (Array.isArray(data.library_whitelisted_laws?.slugs)) {
          setWhitelistedSlugs(data.library_whitelisted_laws.slugs);
        }
        if (Array.isArray(data.tier_limits) && data.tier_limits.length > 0) {
          setTierLimits(
            data.tier_limits.map((t) => ({
              ...t,
              label: TIER_META[t.tier]?.label ?? t.tier,
            })),
          );
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        setError("تعذر تحميل الإعدادات. يتم عرض القيم الافتراضية.");
        setLoading(false);
      });
  }, []);

  // ── Save Helpers ──
  async function saveSettingKey(key: string, value: unknown, toastMessage: string) {
    setSaving(key);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(toastMessage, "success");
    } catch (err) {
      console.error("Failed to save setting:", err);
      showToast("فشل في حفظ الإعدادات. حاول مرة أخرى.", "error");
    } finally {
      setSaving(null);
    }
  }

  function saveLibraryLimit() {
    saveSettingKey("library_free_article_limit", { default: freeArticleLimit }, "تم حفظ عدد المواد المجانية بنجاح.");
  }

  function saveWhitelistedLaws() {
    saveSettingKey("library_whitelisted_laws", { slugs: whitelistedSlugs }, "تم حفظ القوانين المجانية بنجاح.");
  }

  function saveTierLimits() {
    saveSettingKey("tier_limits", tierLimits, "تم حفظ حدود الاستخدام لجميع المستويات.");
  }

  // ── Slug Helpers ──
  function addSlug() {
    const slug = newSlug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) return;
    if (whitelistedSlugs.includes(slug)) {
      showToast("هذا المعرّف موجود بالفعل.", "info");
      return;
    }
    setWhitelistedSlugs((prev) => [...prev, slug]);
    setNewSlug("");
  }

  function removeSlug(slug: string) {
    setWhitelistedSlugs((prev) => prev.filter((s) => s !== slug));
  }

  // ── Tier Limit Update ──
  function updateTierLimit(tier: string, field: "cases" | "contracts" | "credits", value: number) {
    setTierLimits((prev) => prev.map((t) => (t.tier === tier ? { ...t, [field]: value } : t)));
  }

  // ── Loading Skeleton ──
  if (loading) {
    return (
      <div className="p-6 md:p-10 space-y-6 max-w-[1200px] mx-auto pb-32" dir="rtl">
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/25" : "bg-[#0B3D2E]/10"}`}>
            <SpinnerGap size={24} className="animate-spin text-[#C8A762]" />
          </div>
          <div>
            <div className={`h-7 w-48 rounded-lg animate-pulse ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
            <div className={`h-4 w-72 rounded-lg animate-pulse mt-2 ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`${card} p-6`}>
            <div className={`h-5 w-40 rounded-lg animate-pulse mb-4 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
            <div className={`h-12 w-full rounded-xl animate-pulse ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-[1200px] mx-auto pb-32" dir="rtl">
      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-xl text-sm font-bold ${
              toast.type === "success"
                ? isDark
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
                : toast.type === "error"
                  ? isDark
                    ? "border-red-500/30 bg-red-500/15 text-red-300"
                    : "border-red-200 bg-red-50 text-red-800"
                  : isDark
                    ? "border-blue-500/30 bg-blue-500/15 text-blue-300"
                    : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            {toast.type === "success" ? <Check size={16} weight="bold" /> : toast.type === "error" ? <X size={16} weight="bold" /> : <WarningCircle size={16} weight="fill" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/25 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              <Gear size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>
              إعدادات المنصة
            </h1>
          </div>
          <p className={`text-sm leading-relaxed max-w-3xl ${muted}`}>
            تحكم في إعدادات المكتبة القانونية، حدود الاستخدام لكل مستوى اشتراك، والسياسات العامة للمنصة.
          </p>
        </div>
      </motion.div>

      {/* ── Error Banner ── */}
      {error && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-100" : "border-amber-100 bg-amber-50 text-amber-800"}`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "عدد المواد المجانية", value: freeArticleLimit, icon: BookBookmark },
          { label: "القوانين المجانية دائماً", value: whitelistedSlugs.length, icon: Shield },
          { label: "مستويات الاشتراك", value: tierLimits.length, icon: Sliders },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className={`${card} p-5 flex items-center justify-between`}
          >
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              <stat.icon size={22} weight="duotone" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── Section 1: Library Settings ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${card} overflow-hidden`}>
        {/* Section Header */}
        <div className={`px-6 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
              <BookBookmark size={20} weight="duotone" />
            </div>
            <div>
              <h2 className={`text-base font-black ${isDark ? "text-white" : "text-gray-900"}`}>إعدادات المكتبة القانونية</h2>
              <p className={`text-xs mt-0.5 ${muted}`}>تحكم في المحتوى المجاني وسياسة الوصول للمواد القانونية</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* ── Free Article Limit ── */}
          <div>
            <label className={`text-sm font-bold block mb-3 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              عدد المواد المجانية الافتراضي
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={50}
                value={freeArticleLimit}
                onChange={(e) => setFreeArticleLimit(Number(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-[#0B3D2E]"
                style={{
                  background: isDark
                    ? `linear-gradient(to left, #0B3D2E ${((freeArticleLimit - 1) / 49) * 100}%, #27272a ${((freeArticleLimit - 1) / 49) * 100}%)`
                    : `linear-gradient(to left, #0B3D2E ${((freeArticleLimit - 1) / 49) * 100}%, #e2e8f0 ${((freeArticleLimit - 1) / 49) * 100}%)`,
                }}
              />
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${isDark ? "border-white/10 bg-[#0d1117]" : "border-gray-200 bg-white"}`}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={freeArticleLimit}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(50, Number(e.target.value)));
                    setFreeArticleLimit(v);
                  }}
                  className={`w-12 text-center text-lg font-black font-mono bg-transparent outline-none ${isDark ? "text-white" : "text-gray-900"}`}
                />
                <span className={`text-xs ${muted}`}>مادة</span>
              </div>
            </div>
            <p className={`text-xs mt-2 ${muted}`}>
              عدد المواد القانونية التي يمكن لأي مستخدم قراءتها مجاناً قبل ظهور نظام الاشتراك.
            </p>
            <div className="flex justify-end mt-4">
              <button
                onClick={saveLibraryLimit}
                disabled={saving === "library_free_article_limit"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
              >
                {saving === "library_free_article_limit" ? (
                  <SpinnerGap size={16} className="animate-spin" />
                ) : (
                  <FloppyDisk size={16} />
                )}
                حفظ
              </button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`} />

          {/* ── Whitelisted Laws ── */}
          <div>
            <label className={`text-sm font-bold block mb-3 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              القوانين المجانية دائماً
            </label>
            <p className={`text-xs mb-4 ${muted}`}>
              قوانين يمكن لجميع المستخدمين الوصول إليها بالكامل بدون اشتراك. أضف المعرّف (slug) لكل قانون.
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              <AnimatePresence>
                {whitelistedSlugs.map((slug) => (
                  <motion.span
                    key={slug}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold font-mono ${
                      isDark
                        ? "bg-[#0B3D2E]/20 text-[#C8A762] border border-[#C8A762]/20"
                        : "bg-[#0B3D2E]/5 text-[#0B3D2E] border border-[#0B3D2E]/15"
                    }`}
                  >
                    {slug}
                    <button
                      onClick={() => removeSlug(slug)}
                      className={`p-0.5 rounded-md transition-colors ${isDark ? "hover:bg-white/10" : "hover:bg-red-100"}`}
                    >
                      <X size={12} weight="bold" className={isDark ? "text-zinc-400" : "text-slate-500"} />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
              {whitelistedSlugs.length === 0 && (
                <span className={`text-xs italic ${muted}`}>لا توجد قوانين مضافة</span>
              )}
            </div>

            {/* Add slug input */}
            <div className="flex items-center gap-2">
              <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-white/10 bg-[#0d1117]" : "border-gray-200 bg-white"}`}>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSlug(); }}
                  placeholder="أدخل معرّف القانون (slug)..."
                  className={`w-full bg-transparent outline-none text-sm font-mono ${isDark ? "text-white placeholder:text-zinc-600" : "text-gray-900 placeholder:text-gray-400"}`}
                />
              </div>
              <button
                onClick={addSlug}
                className={`p-2.5 rounded-xl border transition-colors ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={saveWhitelistedLaws}
                disabled={saving === "library_whitelisted_laws"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
              >
                {saving === "library_whitelisted_laws" ? (
                  <SpinnerGap size={16} className="animate-spin" />
                ) : (
                  <FloppyDisk size={16} />
                )}
                حفظ القوانين
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── Section 2: Tier Limits ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={`${card} overflow-hidden`}>
        {/* Section Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? "bg-violet-500/10 text-violet-400" : "bg-violet-50 text-violet-600"}`}>
              <Shield size={20} weight="duotone" />
            </div>
            <div>
              <h2 className={`text-base font-black ${isDark ? "text-white" : "text-gray-900"}`}>حدود الاستخدام لكل مستوى</h2>
              <p className={`text-xs mt-0.5 ${muted}`}>تعيين الحدود القصوى للقضايا، العقود، ورصيد الذكاء الاصطناعي لكل مستوى اشتراك. -1 = غير محدود</p>
            </div>
          </div>
          <button
            onClick={saveTierLimits}
            disabled={saving === "tier_limits"}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
          >
            {saving === "tier_limits" ? (
              <SpinnerGap size={16} className="animate-spin" />
            ) : (
              <FloppyDisk size={16} />
            )}
            حفظ الكل
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className={`text-xs font-bold ${isDark ? "bg-zinc-950/40 text-zinc-500 border-b border-white/[0.06]" : "bg-slate-50 text-slate-400 border-b border-slate-100"}`}>
                <th className="px-6 py-3">المستوى</th>
                <th className="px-6 py-3">حد القضايا</th>
                <th className="px-6 py-3">حد العقود</th>
                <th className="px-6 py-3">رصيد AI</th>
              </tr>
            </thead>
            <tbody>
              {tierLimits.map((tier, index) => {
                const meta = TIER_META[tier.tier] ?? { label: tier.tier, color: "text-gray-400", bg: "bg-gray-400/10" };
                return (
                  <motion.tr
                    key={tier.tier}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + index * 0.04 }}
                    className={`border-b last:border-0 ${isDark ? "border-white/[0.04] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50"}`}
                  >
                    {/* Tier Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg}`}>
                          <Shield size={16} weight="duotone" className={meta.color} />
                        </div>
                        <div>
                          <p className={`text-sm font-black ${meta.color}`}>{meta.label}</p>
                          <p className={`text-[10px] font-mono ${muted}`}>{tier.tier}</p>
                        </div>
                      </div>
                    </td>

                    {/* Cases */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={-1}
                          value={tier.cases}
                          onChange={(e) => updateTierLimit(tier.tier, "cases", Number(e.target.value))}
                          className={inputClass(isDark)}
                        />
                        {tier.cases === -1 && (
                          <span className="text-[10px] font-bold text-emerald-500">∞</span>
                        )}
                      </div>
                    </td>

                    {/* Contracts */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={-1}
                          value={tier.contracts}
                          onChange={(e) => updateTierLimit(tier.tier, "contracts", Number(e.target.value))}
                          className={inputClass(isDark)}
                        />
                        {tier.contracts === -1 && (
                          <span className="text-[10px] font-bold text-emerald-500">∞</span>
                        )}
                      </div>
                    </td>

                    {/* Credits */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={-1}
                          value={tier.credits}
                          onChange={(e) => updateTierLimit(tier.tier, "credits", Number(e.target.value))}
                          className={inputClass(isDark)}
                        />
                        {tier.credits === -1 && (
                          <span className="text-[10px] font-bold text-emerald-500">∞</span>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className={`px-6 py-3 border-t flex items-center gap-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-emerald-500">∞</span>
            <span className={`text-[11px] ${muted}`}>= غير محدود (-1)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trash size={12} className={muted} />
            <span className={`text-[11px] ${muted}`}>أدخل -1 لإلغاء الحد</span>
          </div>
        </div>
      </motion.div>

      {/* ── Summary Card ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${card} p-5`}>
        <p className={`text-sm font-black mb-3 ${isDark ? "text-white" : "text-slate-800"}`}>ملاحظات هامة</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-slate-50 text-slate-600"}`}>
            تغييرات الحدود تؤثر على المستخدمين الجدد فوراً. المستخدمون الحاليون يتأثرون عند تجديد اشتراكهم.
          </div>
          <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-slate-50 text-slate-600"}`}>
            القوانين المجانية دائماً تتجاوز نظام الاشتراك ويمكن لأي زائر قراءتها كاملة.
          </div>
          <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] text-zinc-300" : "bg-slate-50 text-slate-600"}`}>
            المصدر: <code className="font-mono text-[11px]">GET/PATCH /api/v1/admin/settings</code>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputClass(isDark: boolean) {
  return `w-20 rounded-xl border px-3 py-2 text-sm font-mono text-center outline-none ${isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`;
}
