"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import {
  BookOpen,
  MagnifyingGlass,
  FileText,
  Buildings,
  Users,
  Scales,
  Money,
  ShieldCheck,
  Handshake,
  ArrowLeft,
  ArrowRight,
  Download,
  Star,
  Tag,
  FunnelSimple,
  Eye,
  Copy,
  Lightning,
  Check,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",       label: { ar: "الكل",              en: "All" },              icon: BookOpen },
  { id: "corporate", label: { ar: "قانون الشركات",     en: "Corporate Law" },    icon: Buildings },
  { id: "hr",        label: { ar: "عقود الموارد البشرية", en: "HR Contracts" },  icon: Users },
  { id: "litigation",label: { ar: "المرافعات والتقاضي", en: "Litigation" },      icon: Scales },
  { id: "finance",   label: { ar: "المالية والفوترة",   en: "Finance" },          icon: Money },
  { id: "compliance",label: { ar: "الامتثال التنظيمي",  en: "Compliance" },      icon: ShieldCheck },
  { id: "contracts", label: { ar: "العقود العامة",      en: "General Contracts" }, icon: Handshake },
];

const TEMPLATES = [
  {
    id: 1, category: "corporate",
    title: { ar: "عقد تأسيس شركة ذات مسؤولية محدودة", en: "LLC Incorporation Agreement" },
    desc:  { ar: "نموذج متكامل لتأسيس شركة ذات مسؤولية محدودة وفق نظام الشركات السعودي 2022", en: "Full template for LLC incorporation under Saudi Companies Law 2022" },
    pages: 14, downloads: 1247, rating: 4.9, badge: { ar: "الأكثر تحميلاً", en: "Top Download" }, badgeColor: "bg-gold/15 text-gold-dark dark:text-gold",
  },
  {
    id: 2, category: "hr",
    title: { ar: "عقد عمل لوظيفة تنفيذية", en: "Executive Employment Contract" },
    desc:  { ar: "عقد عمل احترافي للمناصب التنفيذية متوافق مع نظام العمل السعودي ولوائح هيئة الموارد البشرية", en: "Professional employment contract for executive roles, compliant with Saudi Labor Law" },
    pages: 8, downloads: 983, rating: 4.8, badge: null, badgeColor: "",
  },
  {
    id: 3, category: "contracts",
    title: { ar: "عقد توريد وخدمات", en: "Supply & Services Agreement" },
    desc:  { ar: "نموذج شامل لعقود التوريد والخدمات مع بنود الضمان وحل النزاعات والتحكيم", en: "Comprehensive supply and services template with warranty clauses, dispute resolution, and arbitration" },
    pages: 11, downloads: 856, rating: 4.7, badge: null, badgeColor: "",
  },
  {
    id: 4, category: "compliance",
    title: { ar: "سياسة الامتثال لمكافحة غسل الأموال", en: "AML Compliance Policy" },
    desc:  { ar: "سياسة متكاملة للامتثال لمتطلبات مكافحة غسل الأموال وفق متطلبات SAMA وFATF", en: "Comprehensive AML compliance policy per SAMA and FATF requirements" },
    pages: 18, downloads: 724, rating: 4.9, badge: { ar: "محدّث 2025", en: "Updated 2025" }, badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  {
    id: 5, category: "litigation",
    title: { ar: "مذكرة دفاع في قضية تجارية", en: "Commercial Defense Memorandum" },
    desc:  { ar: "هيكل احترافي لمذكرة الدفاع في القضايا التجارية أمام المحكمة التجارية السعودية", en: "Professional defense memorandum structure for commercial cases before Saudi Commercial Court" },
    pages: 6, downloads: 611, rating: 4.6, badge: null, badgeColor: "",
  },
  {
    id: 6, category: "finance",
    title: { ar: "فاتورة خدمات قانونية (ZATCA Phase 2)", en: "Legal Services Invoice (ZATCA Phase 2)" },
    desc:  { ar: "قالب فاتورة إلكترونية متوافق مع متطلبات هيئة الزكاة والضريبة والجمارك — المرحلة الثانية", en: "E-invoice template compliant with ZATCA Phase 2 requirements" },
    pages: 2, downloads: 2103, rating: 5.0, badge: { ar: "متوافق ZATCA", en: "ZATCA Compliant" }, badgeColor: "bg-royal/10 text-royal dark:text-emerald-400",
  },
  {
    id: 7, category: "corporate",
    title: { ar: "نظام حوكمة مجلس الإدارة", en: "Board Governance Charter" },
    desc:  { ar: "لائحة تنظيمية شاملة لمجلس الإدارة تتوافق مع متطلبات هيئة السوق المالية وإرشادات الحوكمة", en: "Comprehensive board regulation compliant with CMA requirements and governance guidelines" },
    pages: 22, downloads: 445, rating: 4.8, badge: null, badgeColor: "",
  },
  {
    id: 8, category: "hr",
    title: { ar: "لائحة الموارد البشرية الداخلية", en: "Internal HR Policy" },
    desc:  { ar: "لائحة شاملة للموارد البشرية تغطي التوظيف والأداء والإجازات والانضباط والإنهاء", en: "Comprehensive HR policy covering recruitment, performance, leave, discipline, and termination" },
    pages: 35, downloads: 788, rating: 4.7, badge: null, badgeColor: "",
  },
  {
    id: 9, category: "contracts",
    title: { ar: "اتفاقية عدم إفصاح وسرية (NDA)", en: "Non-Disclosure Agreement (NDA)" },
    desc:  { ar: "اتفاقية سرية متبادلة أو أحادية الاتجاه مع بنود حماية المعلومات التجارية السرية", en: "Mutual or one-way NDA with clauses protecting confidential business information" },
    pages: 5, downloads: 1876, rating: 4.9, badge: { ar: "الأكثر استخداماً", en: "Most Used" }, badgeColor: "bg-gold/15 text-gold-dark dark:text-gold",
  },
];

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ t, isAr, isDark, index }: { t: typeof TEMPLATES[0]; isAr: boolean; isDark: boolean; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      {t.badge && (
        <span className={`absolute top-4 ${isAr ? "left-4" : "right-4"} inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${t.badgeColor}`}>
          <Star size={9} weight="fill" />
          {isAr ? t.badge.ar : t.badge.en}
        </span>
      )}

      {/* Icon */}
      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
        <FileText size={22} weight="duotone" className="text-royal dark:text-emerald-400" />
      </div>

      {/* Content */}
      <h3 className={`text-[15px] font-bold leading-snug mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>
        {isAr ? t.title.ar : t.title.en}
      </h3>
      <p className={`text-[13px] leading-relaxed flex-1 mb-5 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
        {isAr ? t.desc.ar : t.desc.en}
      </p>

      {/* Meta */}
      <div className={`flex items-center gap-3 text-[11px] mb-4 ${isDark ? "text-gray-500" : "text-slate-400"}`}>
        <span className="flex items-center gap-1"><Tag size={11} />{isAr ? `${t.pages} صفحة` : `${t.pages} pages`}</span>
        <span>·</span>
        <span className="flex items-center gap-1"><Download size={11} />{t.downloads.toLocaleString()}</span>
        <span>·</span>
        <span className="flex items-center gap-1 text-gold"><Star size={11} weight="fill" />{t.rating}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all ${
            isDark
              ? "border border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
              : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
          }`}
        >
          {copied ? <Check size={13} weight="bold" className="text-emerald-500" /> : <Copy size={13} />}
          {isAr ? (copied ? "تم" : "نسخ") : (copied ? "Copied" : "Copy")}
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-white transition-all ${
            isDark ? "bg-royal hover:bg-royal-light" : "bg-royal hover:bg-royal-light"
          } shadow-sm`}
        >
          <Eye size={13} />
          {isAr ? "معاينة" : "Preview"}
        </button>
        <button className="flex items-center justify-center rounded-xl bg-gold/10 px-3 py-2 text-gold transition hover:bg-gold/20">
          <Download size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ErpLibraryPage() {
  const { isRTL, isDark } = useTheme();
  const isAr = isRTL;
  const dir = isAr ? "rtl" : "ltr";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return TEMPLATES.filter((t) => {
      const matchesCat = activeCategory === "all" || t.category === activeCategory;
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        t.title.ar.toLowerCase().includes(q) ||
        t.title.en.toLowerCase().includes(q) ||
        t.desc.ar.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [activeCategory, search]);

  return (
    <div dir={dir} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-28 pb-16">
        <div className="absolute inset-0 bg-gradient-to-br from-[#06101a] via-[#0a1a2e] to-[#0d1f3c]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 70% 50%, #C8A762 0%, transparent 60%)" }} />

        <div className="relative mx-auto max-w-6xl px-4">
          {/* Breadcrumb */}
          <div className="mb-6 flex items-center gap-2 text-sm text-white/50">
            <Link href="/erp" className="hover:text-white/80 transition-colors">
              {isAr ? "نظامي ERP" : "Nezamy ERP"}
            </Link>
            <span>/</span>
            <span className="text-white/80">{isAr ? "مكتبة القوالب" : "Template Library"}</span>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-sm font-medium text-blue-300">
              <BookOpen size={14} weight="fill" />
              {isAr ? "مكتبة قوالب ERP المؤسسية" : "ERP Institutional Template Library"}
            </span>
            <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl">
              {isAr ? "مكتبة القوالب القانونية" : "Legal Template Library"}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/70">
              {isAr
                ? "مئات القوالب القانونية الجاهزة، مُحدَّثة باستمرار، ومتوافقة مع الأنظمة السعودية. استخدمها مباشرةً أو خصّصها بالذكاء الاصطناعي."
                : "Hundreds of ready-made legal templates, continuously updated and compliant with Saudi regulations. Use them directly or customize with AI."}
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 flex flex-wrap gap-6"
          >
            {[
              { value: "٣٠٠+", label: isAr ? "قالب جاهز" : "Ready Templates" },
              { value: "١٢", label: isAr ? "تصنيفاً قانونياً" : "Legal Categories" },
              { value: "٩٨٪", label: isAr ? "توافق مع الأنظمة" : "Regulatory Compliance" },
              { value: "AI", label: isAr ? "تخصيص تلقائي" : "Auto-Customization" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
                <span className="text-2xl font-black text-gold">{s.value}</span>
                <span className="text-sm text-white/60">{s.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Search + Filter ── */}
      <section className={`sticky top-16 z-20 border-b py-4 backdrop-blur-lg ${isDark ? "border-white/[0.07] bg-dark-bg/80" : "border-slate-200/80 bg-white/80"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className={`relative flex flex-1 items-center rounded-xl border ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              <MagnifyingGlass size={16} className={`absolute ${isAr ? "right-3" : "left-3"} ${isDark ? "text-gray-500" : "text-slate-400"}`} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "ابحث في القوالب..." : "Search templates..."}
                className={`w-full bg-transparent py-2.5 text-sm outline-none ${isAr ? "pr-9 pl-3" : "pl-9 pr-3"} ${isDark ? "text-white placeholder:text-gray-500" : "text-slate-900 placeholder:text-slate-400"}`}
              />
            </div>

            {/* AI Customize CTA */}
            <Link
              href="/ai/templates"
              className="inline-flex items-center gap-2 rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-royal-light"
            >
              <Lightning size={15} weight="fill" />
              {isAr ? "تخصيص بالذكاء الاصطناعي" : "Customize with AI"}
            </Link>
          </div>

          {/* Category pills */}
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

      {/* ── Grid ── */}
      <section className={`py-12 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-6xl px-4">
          {/* Results count */}
          <div className={`mb-6 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
            {isAr ? `${filtered.length} قالب` : `${filtered.length} templates`}
          </div>

          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              <motion.div
                key={activeCategory + search}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filtered.map((t, i) => (
                  <TemplateCard key={t.id} t={t} isAr={isAr} isDark={isDark} index={i} />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-20 text-center"
              >
                <BookOpen size={48} className={`mx-auto mb-4 ${isDark ? "text-gray-600" : "text-slate-300"}`} />
                <p className={`text-lg font-medium ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {isAr ? "لا توجد قوالب مطابقة" : "No matching templates"}
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
      <section className="bg-gradient-to-br from-[#06101a] to-[#0d1f3c] py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Lightning size={40} className="mx-auto mb-4 text-gold" />
          <h2 className="text-2xl font-bold text-white">
            {isAr ? "لا تجد ما تبحث عنه؟" : "Can't find what you need?"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/60">
            {isAr
              ? "استخدم ذكاء نظامي الاصطناعي لإنشاء قالب مخصص يناسب احتياجاتكم القانونية تماماً"
              : "Use Nezamy AI to create a custom template tailored exactly to your legal needs"}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/ai/templates" className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-semibold text-royal transition hover:bg-gold/90">
              {isAr ? "إنشاء قالب مخصص" : "Create Custom Template"}
              <Arrow size={16} />
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20">
              {isAr ? "تواصل مع فريقنا" : "Contact Our Team"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}