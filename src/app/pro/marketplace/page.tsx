"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import {
  Storefront,
  MagnifyingGlass,
  Brain,
  FileText,
  ShieldCheck,
  ChartBar,
  Headset,
  Robot,
  Handshake,
  Star,
  ArrowLeft,
  ArrowRight,
  Lightning,
  Check,
  Tag,
  FunnelSimple,
  SealCheck,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",        label: { ar: "الكل",               en: "All" },               icon: Storefront },
  { id: "ai",         label: { ar: "أدوات AI",            en: "AI Tools" },          icon: Brain },
  { id: "docs",       label: { ar: "المستندات والعقود",   en: "Docs & Contracts" },  icon: FileText },
  { id: "compliance", label: { ar: "الامتثال",            en: "Compliance" },        icon: ShieldCheck },
  { id: "analytics",  label: { ar: "التحليلات",           en: "Analytics" },         icon: ChartBar },
  { id: "support",    label: { ar: "خدمات الدعم",         en: "Support Services" },  icon: Headset },
];

const PRODUCTS = [
  {
    id: 1, category: "ai",
    name:    { ar: "الصائغ القانوني Pro", en: "Legal Drafter Pro" },
    vendor:  { ar: "نظامي AI", en: "Nezamy AI" },
    desc:    { ar: "توليد مسودات قانونية متكاملة بالذكاء الاصطناعي — عقود، مذكرات، ردود، في ثوانٍ", en: "Generate complete legal drafts with AI — contracts, memos, responses, in seconds" },
    price:   { ar: "٢٩٩ ر.س/شهر", en: "SAR 299/mo" },
    rating: 4.9, reviews: 312, verified: true,
    badge:   { ar: "الأكثر مبيعاً", en: "Best Seller" }, badgeColor: "bg-gold/15 text-gold-dark dark:text-gold",
    features: { ar: ["عقود لا محدودة", "دعم 40+ نوع مستند", "مراجعة ذاتية AI"], en: ["Unlimited contracts", "40+ document types", "AI self-review"] },
    icon: Brain,
  },
  {
    id: 2, category: "compliance",
    name:    { ar: "مراقب الامتثال التنظيمي", en: "Regulatory Compliance Monitor" },
    vendor:  { ar: "نظامي AI", en: "Nezamy AI" },
    desc:    { ar: "متابعة التغييرات التنظيمية تلقائياً وإشعارك عند صدور لوائح أو أحكام تؤثر على ملفاتك", en: "Auto-track regulatory changes and alert you when rules or rulings affect your files" },
    price:   { ar: "١٩٩ ر.س/شهر", en: "SAR 199/mo" },
    rating: 4.8, reviews: 187, verified: true,
    badge:   { ar: "محدّث باستمرار", en: "Always Updated" }, badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    features: { ar: ["تنبيهات فورية", "تغطية كاملة للأنظمة السعودية", "تقارير أسبوعية"], en: ["Real-time alerts", "Full Saudi regulations coverage", "Weekly reports"] },
    icon: ShieldCheck,
  },
  {
    id: 3, category: "docs",
    name:    { ar: "مدير العقود الذكي", en: "Smart Contract Manager" },
    vendor:  { ar: "نظامي AI", en: "Nezamy AI" },
    desc:    { ar: "تنظيم وتتبع وتجديد عقودك تلقائياً مع تنبيهات انتهاء الصلاحية ومراجعة AI للبنود الخطرة", en: "Automatically organize, track, and renew your contracts with expiry alerts and AI risk clause review" },
    price:   { ar: "١٤٩ ر.س/شهر", en: "SAR 149/mo" },
    rating: 4.7, reviews: 243, verified: true,
    badge:   null, badgeColor: "",
    features: { ar: ["تنبيهات الانتهاء", "تحليل بنود الخطر", "توقيع إلكتروني"], en: ["Expiry alerts", "Risk clause analysis", "e-Signature"] },
    icon: FileText,
  },
  {
    id: 4, category: "analytics",
    name:    { ar: "لوحة تحليلات الأداء Pro", en: "Performance Analytics Dashboard Pro" },
    vendor:  { ar: "نظامي Analytics", en: "Nezamy Analytics" },
    desc:    { ar: "تقارير مفصّلة عن أداء مكتبك: الإيرادات، معدل نجاح القضايا، إنتاجية الفريق، ورضا الموكلين", en: "Detailed reports on your firm's performance: revenue, case win rate, team productivity, and client satisfaction" },
    price:   { ar: "٩٩ ر.س/شهر", en: "SAR 99/mo" },
    rating: 4.6, reviews: 156, verified: true,
    badge:   null, badgeColor: "",
    features: { ar: ["١٥+ تقرير تلقائي", "تصدير Excel/PDF", "مقارنة شهرية"], en: ["15+ auto reports", "Excel/PDF export", "Monthly comparison"] },
    icon: ChartBar,
  },
  {
    id: 5, category: "ai",
    name:    { ar: "محاكي الخصم (Wargaming)", en: "Opponent Simulator (Wargaming)" },
    vendor:  { ar: "نظامي AI", en: "Nezamy AI" },
    desc:    { ar: "AI يحاكي حجج الطرف الآخر في قضيتك ويساعدك في بناء دفاع صلب قبل الجلسة", en: "AI simulates opposing party arguments and helps you build a solid defense before the hearing" },
    price:   { ar: "٢٤٩ ر.س/شهر", en: "SAR 249/mo" },
    rating: 4.8, reviews: 98, verified: true,
    badge:   { ar: "جديد", en: "New" }, badgeColor: "bg-royal/10 text-royal dark:text-emerald-400",
    features: { ar: ["محاكاة 3 سيناريوهات", "تحليل نقاط الضعف", "مقترحات دفاع AI"], en: ["3-scenario simulation", "Weakness analysis", "AI defense suggestions"] },
    icon: Robot,
  },
  {
    id: 6, category: "support",
    name:    { ar: "مراجعة قانونية متخصصة", en: "Specialist Legal Review" },
    vendor:  { ar: "شبكة محامي نظامي", en: "Nezamy Lawyer Network" },
    desc:    { ar: "مراجعة عقودك ومستنداتك من محامٍ متخصص خلال ٢٤ ساعة مع تقرير تفصيلي", en: "Get your contracts and documents reviewed by a specialist lawyer within 24 hours with a detailed report" },
    price:   { ar: "٣٩٩ ر.س/مراجعة", en: "SAR 399/review" },
    rating: 5.0, reviews: 421, verified: true,
    badge:   { ar: "الأعلى تقييماً", en: "Top Rated" }, badgeColor: "bg-gold/15 text-gold-dark dark:text-gold",
    features: { ar: ["رد خلال ٢٤ ساعة", "محامٍ متخصص", "تقرير تفصيلي + توصيات"], en: ["24h turnaround", "Specialist lawyer", "Detailed report + recommendations"] },
    icon: Handshake,
  },
];

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ p, isAr, isDark, index }: { p: typeof PRODUCTS[0]; isAr: boolean; isDark: boolean; index: number }) {
  const [added, setAdded] = useState(false);
  const Icon = p.icon;

  const handleAdd = () => {
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 200, damping: 24 }}
      className={`group relative flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
        isDark
          ? "border-white/[0.07] bg-dark-card hover:border-white/15"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-slate-100"
      }`}
    >
      {/* Badge */}
      {p.badge && (
        <span className={`absolute top-4 ${isAr ? "left-4" : "right-4"} inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${p.badgeColor}`}>
          <Star size={9} weight="fill" />
          {isAr ? p.badge.ar : p.badge.en}
        </span>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
          <Icon size={24} weight="duotone" className="text-royal dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h3 className={`text-[14px] font-bold leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>
            {isAr ? p.name.ar : p.name.en}
          </h3>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-[11px] ${isDark ? "text-gray-500" : "text-slate-400"}`}>
              {isAr ? p.vendor.ar : p.vendor.en}
            </span>
            {p.verified && <SealCheck size={12} weight="fill" className="text-royal dark:text-emerald-400" />}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className={`text-[13px] leading-relaxed flex-1 mb-4 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
        {isAr ? p.desc.ar : p.desc.en}
      </p>

      {/* Features */}
      <ul className="space-y-1.5 mb-5">
        {(isAr ? p.features.ar : p.features.en).map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-[12px]">
            <Check size={12} weight="bold" className="text-royal dark:text-emerald-400 shrink-0" />
            <span className={isDark ? "text-gray-400" : "text-slate-500"}>{f}</span>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
        {/* Rating + Price */}
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={11} weight={i < Math.floor(p.rating) ? "fill" : "regular"} className="text-gold" />
            ))}
            <span className={`text-[11px] ${isDark ? "text-gray-500" : "text-slate-400"}`}>({p.reviews})</span>
          </div>
          <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isAr ? p.price.ar : p.price.en}
          </p>
        </div>

        <button
          onClick={handleAdd}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all shadow-sm ${
            added
              ? "bg-emerald-500 text-white"
              : "bg-royal text-white hover:bg-royal-light"
          }`}
        >
          {added ? <Check size={13} weight="bold" /> : <Tag size={13} />}
          {added
            ? (isAr ? "تمت الإضافة" : "Added!")
            : (isAr ? "أضف للخطة" : "Add to Plan")}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProMarketplacePage() {
  const { isRTL, isDark } = useTheme();
  const isAr = isRTL;
  const dir = isAr ? "rtl" : "ltr";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return PRODUCTS.filter((p) => {
      const matchesCat = activeCategory === "all" || p.category === activeCategory;
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        p.name.ar.toLowerCase().includes(q) ||
        p.name.en.toLowerCase().includes(q) ||
        p.desc.ar.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [activeCategory, search]);

  return (
    <div dir={dir} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-28 pb-16">
        <div className="absolute inset-0 bg-gradient-to-br from-royal via-[#0d4a35] to-[#061f17]" />
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 70% 50%, #C8A762 0%, transparent 55%)" }} />

        <div className="relative mx-auto max-w-6xl px-4">
          {/* Breadcrumb */}
          <div className="mb-6 flex items-center gap-2 text-sm text-white/50">
            <Link href="/pro" className="hover:text-white/80 transition-colors">
              {isAr ? "نظامي Pro" : "Nezamy Pro"}
            </Link>
            <span>/</span>
            <span className="text-white/80">{isAr ? "السوق" : "Marketplace"}</span>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-sm font-medium text-gold">
              <Lightning size={14} weight="fill" />
              {isAr ? "سوق أدوات Pro الحصري" : "Exclusive Pro Tools Marketplace"}
            </span>
            <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl">
              {isAr ? "سوق نظامي Pro" : "Nezamy Pro Marketplace"}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/70">
              {isAr
                ? "أدوات وخدمات قانونية متكاملة مُختارة خصيصاً لمحامي Pro. أضف ما تحتاجه لخطتك بنقرة واحدة."
                : "Curated legal tools and services exclusively for Pro lawyers. Add what you need to your plan in one click."}
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 flex flex-wrap gap-4"
          >
            {[
              { value: "٥٠+", label: isAr ? "أداة وخدمة" : "Tools & Services" },
              { value: "١٠٠٪", label: isAr ? "موثّقة ومعتمدة" : "Verified & Certified" },
              { value: "تكامل", label: isAr ? "فوري مع Pro" : "Instant with Pro" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
                <span className="text-xl font-black text-gold">{s.value}</span>
                <span className="text-sm text-white/60">{s.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Filter Bar ── */}
      <section className={`sticky top-16 z-20 border-b py-4 backdrop-blur-lg ${isDark ? "border-white/[0.07] bg-dark-bg/80" : "border-slate-200/80 bg-white/80"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className={`relative flex flex-1 items-center rounded-xl border ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              <MagnifyingGlass size={16} className={`absolute ${isAr ? "right-3" : "left-3"} ${isDark ? "text-gray-500" : "text-slate-400"}`} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "ابحث في السوق..." : "Search marketplace..."}
                className={`w-full bg-transparent py-2.5 text-sm outline-none ${isAr ? "pr-9 pl-3" : "pl-9 pr-3"} ${isDark ? "text-white placeholder:text-gray-500" : "text-slate-900 placeholder:text-slate-400"}`}
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <FunnelSimple size={16} className={`shrink-0 self-center ${isDark ? "text-gray-500" : "text-slate-400"}`} />
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-all ${
                    activeCategory === cat.id
                      ? "bg-royal text-white shadow-sm"
                      : isDark
                        ? "border border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                        : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <Icon size={12} />
                  {isAr ? cat.label.ar : cat.label.en}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Products Grid ── */}
      <section className={`py-12 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className={`mb-6 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
            {isAr ? `${filtered.length} منتج وخدمة` : `${filtered.length} products & services`}
          </div>

          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              <motion.div
                key={activeCategory + search}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filtered.map((p, i) => (
                  <ProductCard key={p.id} p={p} isAr={isAr} isDark={isDark} index={i} />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-20 text-center"
              >
                <Storefront size={48} className={`mx-auto mb-4 ${isDark ? "text-gray-600" : "text-slate-300"}`} />
                <p className={`text-lg font-medium ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {isAr ? "لا توجد نتائج" : "No results found"}
                </p>
                <button
                  onClick={() => { setSearch(""); setActiveCategory("all"); }}
                  className="mt-4 text-sm font-semibold text-royal hover:underline dark:text-emerald-400"
                >
                  {isAr ? "مسح الفلترة" : "Clear filters"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-gradient-to-br from-royal to-[#0d4a35] py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold text-white">
            {isAr ? "لديك أداة تريد إضافتها للسوق؟" : "Have a tool you want to add to the marketplace?"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/60">
            {isAr
              ? "شارك أداتك القانونية مع آلاف المحامين في منصة نظامي Pro"
              : "Share your legal tool with thousands of Pro lawyers on the Nezamy platform"}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-semibold text-royal transition hover:bg-gold/90">
              {isAr ? "تواصل معنا" : "Contact Us"}
              <Arrow size={16} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}