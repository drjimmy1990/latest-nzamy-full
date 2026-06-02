"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlass, Newspaper, Clock, Eye, ArrowRight, Tag,
  Scales, Briefcase, House, Users, BookOpen, Fire, Rss,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ──────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all", label: "الكل", labelEn: "All", icon: BookOpen },
  { id: "labor", label: "عمالي", labelEn: "Labor", icon: Briefcase },
  { id: "commercial", label: "تجاري", labelEn: "Commercial", icon: Scales },
  { id: "civil", label: "مدني", labelEn: "Civil", icon: House },
  { id: "family", label: "أحوال", labelEn: "Family", icon: Users },
  { id: "news", label: "أخبار قانونية", labelEn: "Legal News", icon: Newspaper },
];

const ARTICLES = [
  {
    id: 1, slug: "wrongful-termination-rights",
    category: "labor", tag: "عمالي", tagEn: "Labor",
    title: "حقوق العمال في حالة الفصل التعسفي — دليلك الشامل",
    titleEn: "Workers' Rights in Wrongful Termination — Complete Guide",
    excerpt: "يواجه الكثير من العمال خطر الفصل التعسفي دون إدراك حقوقهم الكاملة. في هذا المقال نستعرض ما يكفله نظام العمل السعودي.",
    excerptEn: "Many workers face the risk of wrongful termination without knowing their full rights. In this article, we review what Saudi labor law guarantees.",
    author: "أ. أحمد الغامدي", authorSlug: "ahmed-alghamdi", authorEn: "Ahmed Al-Ghamdi",
    date: "فبراير ٢٠٢٦", dateEn: "Feb 2026",
    readTime: "٧ دقائق", readTimeEn: "7 min",
    views: 4231, featured: true,
  },
  {
    id: 2, slug: "commercial-disputes",
    category: "commercial", tag: "تجاري", tagEn: "Commercial",
    title: "كيف تحمي شركتك من النزاعات التجارية قبل فوات الأوان؟",
    titleEn: "How to Protect Your Business from Commercial Disputes Before It's Too Late",
    excerpt: "النزاعات التجارية تُكلّف الشركات ملايين سنوياً. تعرّف على أهم الإجراءات الوقائية التي يجب اتخاذها من اليوم الأول.",
    excerptEn: "Commercial disputes cost companies millions annually. Learn the most important preventive measures to take from day one.",
    author: "أ. خالد المطيري", authorSlug: "khalid-almutairi", authorEn: "Khalid Al-Mutairi",
    date: "يناير ٢٠٢٦", dateEn: "Jan 2026",
    readTime: "٩ دقائق", readTimeEn: "9 min",
    views: 3178, featured: true,
  },
  {
    id: 3, slug: "lease-contracts-guide",
    category: "civil", tag: "عقاري", tagEn: "Real Estate",
    title: "دليلك الكامل لعقود الإيجار في السعودية ٢٠٢٦",
    titleEn: "Complete Guide to Lease Contracts in KSA 2026",
    excerpt: "عقود الإيجار مليئة بالتفاصيل التي يغفل عنها كثيرون. إليك أهم البنود التي يجب مراجعتها قبل التوقيع.",
    excerptEn: "Lease contracts are full of details that many overlook. Here are the most important clauses to review before signing.",
    author: "أ. سارة العتيبي", authorSlug: "sara-alotaibi", authorEn: "Sara Al-Otaibi",
    date: "ديسمبر ٢٠٢٥", dateEn: "Dec 2025",
    readTime: "٦ دقائق", readTimeEn: "6 min",
    views: 2943, featured: false,
  },
  {
    id: 4, slug: "end-of-service-calculator",
    category: "labor", tag: "عمالي", tagEn: "Labor",
    title: "كيف تحسب مكافأة نهاية الخدمة بدقة؟",
    titleEn: "How to Calculate End-of-Service Accurately?",
    excerpt: "حسابات نهاية الخدمة معقدة وتعتمد على عوامل متعددة. سنوضح لك الصيغة الدقيقة مع مثال عملي.",
    excerptEn: "End-of-service calculations are complex and depend on multiple factors. We'll show you the exact formula with a practical example.",
    author: "أ. أحمد الغامدي", authorSlug: "ahmed-alghamdi", authorEn: "Ahmed Al-Ghamdi",
    date: "نوفمبر ٢٠٢٥", dateEn: "Nov 2025",
    readTime: "٥ دقائق", readTimeEn: "5 min",
    views: 5670, featured: false,
  },
  {
    id: 5, slug: "custody-procedures",
    category: "family", tag: "أحوال", tagEn: "Family",
    title: "إجراءات الحضانة في المملكة — ما تحتاج معرفته",
    titleEn: "Custody Procedures in Saudi Arabia — What You Need to Know",
    excerpt: "قضايا الحضانة من أكثر القضايا حساسية. في هذا الدليل نستعرض معايير المحاكم والإجراءات المتبعة.",
    excerptEn: "Custody cases are among the most sensitive. In this guide, we review court standards and procedures.",
    author: "أ. سارة العتيبي", authorSlug: "sara-alotaibi", authorEn: "Sara Al-Otaibi",
    date: "أكتوبر ٢٠٢٥", dateEn: "Oct 2025",
    readTime: "٨ دقائق", readTimeEn: "8 min",
    views: 3421, featured: false,
  },
  {
    id: 6, slug: "company-data-protection",
    category: "commercial", tag: "تجاري", tagEn: "Commercial",
    title: "حماية البيانات للشركات في ضوء الأنظمة السعودية",
    titleEn: "Data Protection for Companies Under Saudi Regulations",
    excerpt: "اللوائح الجديدة لحماية البيانات تضع مسؤوليات ضخمة على الشركات. تعرف على التزاماتك القانونية.",
    excerptEn: "New data protection regulations place huge responsibilities on companies. Learn your legal obligations.",
    author: "أ. خالد المطيري", authorSlug: "khalid-almutairi", authorEn: "Khalid Al-Mutairi",
    date: "سبتمبر ٢٠٢٥", dateEn: "Sep 2025",
    readTime: "١٠ دقائق", readTimeEn: "10 min",
    views: 2187, featured: false,
  },
];

// ─── Component ─────────────────────────────────────────────────────────────
export default function BlogPage() {
  const { isRTL, isDark } = useTheme();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = `rounded-[2rem] border overflow-hidden backdrop-blur-xl shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] ${isDark ? "bg-[#161b22]/80 border-white/[0.06]" : "bg-white/80 border-slate-200/50"}`;

  const featured = ARTICLES.filter(a => a.featured);
  const filtered = ARTICLES
    .filter(a => !a.featured || category !== "all")
    .filter(a => category === "all" || a.category === category)
    .filter(a => search === "" || (isRTL ? a.title : a.titleEn).toLowerCase().includes(search.toLowerCase()));

  const ArticleCard = ({ article, big = false }: { article: typeof ARTICLES[0]; big?: boolean }) => (
    <Link href={`/blog/${article.slug}`} className={`group ${card} flex flex-col hover:border-[#0B3D2E]/30 transition-colors`}>
      {/* Image placeholder */}
      <div className={`w-full ${big ? "h-52" : "h-36"} bg-gradient-to-br from-[#0B3D2E]/10 via-[#C8A762]/10 to-[#0B3D2E]/5 flex items-center justify-center relative`}>
        <Newspaper size={big ? 40 : 28} color="#C8A762" weight="duotone" className="opacity-40" />
        <div className="absolute top-3 start-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white"}`}>
            {isRTL ? article.tag : article.tagEn}
          </span>
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h2 className={`font-bold leading-snug mb-2 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition tracking-tight ${big ? "text-xl" : "text-sm"} ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
          {isRTL ? article.title : article.titleEn}
        </h2>
        <p className={`text-xs leading-relaxed mb-4 flex-1 ${muted}`}>
          {(isRTL ? article.excerpt : article.excerptEn).slice(0, big ? 150 : 90)}...
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-xs font-bold">
              {(isRTL ? article.author : article.authorEn).charAt(2)}
            </div>
            <span className={`text-xs ${muted}`}>{isRTL ? article.author : article.authorEn}</span>
          </div>
          <div className={`flex items-center gap-2 text-xs ${muted}`}>
            <span className="flex items-center gap-1"><Clock size={11} />{isRTL ? article.readTime : article.readTimeEn}</span>
            <span className="flex items-center gap-1"><Eye size={11} />{article.views.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className={`min-h-[100dvh] flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-[#f9fafb] text-zinc-900"}`} dir={isRTL ? "rtl" : "ltr"} suppressHydrationWarning>
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className={`text-4xl font-black tracking-tight mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "المدونة القانونية" : "Legal Blog"}
            </h1>
            <p className={`text-[13.5px] leading-relaxed ${muted}`}>
              {isRTL ? "مقالات قانونية معمّقة بقلم محامين متخصصين" : "In-depth legal articles by specialized lawyers"}
            </p>
          </div>
          <button className={`flex items-center gap-2 px-5 py-3 rounded-2xl border text-sm font-semibold transition-all backdrop-blur-sm ${isDark ? "bg-[#161b22]/60 border-white/[0.06] text-zinc-300 hover:bg-white/5" : "bg-white/80 border-slate-200/60 text-slate-600 hover:bg-slate-50 shadow-sm"}`}>
            <Rss size={15} color="#C8A762" /> {isRTL ? "اشترك بـ RSS" : "Subscribe RSS"}
          </button>
        </div>

        {/* Featured */}
        {category === "all" && search === "" && featured.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-1 bg-[#C8A762] rounded-full inline-block" />
              <span className={`text-[11px] uppercase tracking-widest font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{isRTL ? "مقالات مميزة" : "Featured Articles"}</span>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5`}>
              {featured.map(a => <ArticleCard key={a.id} article={a} big />)}
            </div>
          </motion.div>
        )}

        {/* Search + Categories */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className={`flex-1 flex items-center gap-2 rounded-2xl border px-4 backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-[#0B3D2E]/20 ${isDark ? "bg-[#161b22]/60 border-white/[0.06]" : "bg-white/80 border-slate-200/60 shadow-sm"}`}>
            <MagnifyingGlass size={18} className={muted} weight="duotone" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isRTL ? "ابحث في المقالات..." : "Search articles..."} className={`flex-1 py-3.5 text-sm bg-transparent outline-none ${isDark ? "text-white placeholder-zinc-500" : "text-slate-900 placeholder-slate-400"}`} />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-6">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button key={cat.id} onClick={() => setCategory(cat.id)} className={`flex-shrink-0 flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[13px] font-semibold border backdrop-blur-sm transition-all active:scale-[0.97] ${category === cat.id ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-md" : `${muted} bg-white/60 dark:bg-[#161b22]/60 border-slate-200/60 dark:border-white/[0.06] hover:border-[#0B3D2E]/30`}`}>
                <Icon size={16} weight={category === cat.id ? "fill" : "regular"} />{isRTL ? cat.label : cat.labelEn}
              </button>
            );
          })}
        </div>

        {/* Articles grid */}
        {filtered.length === 0 ? (
          <div className={`rounded-[2rem] border p-16 text-center backdrop-blur-sm min-h-[300px] flex flex-col items-center justify-center ${isDark ? "bg-[#161b22]/80 border-white/[0.06]" : "bg-white/80 border-slate-200/50 shadow-sm"}`}>
            <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5 dark:bg-zinc-800 dark:border-white/10">
              <Newspaper size={36} color="#C8A762" weight="duotone" />
            </div>
            <p className={`text-lg font-black tracking-tight mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{isRTL ? "لم يُعثر على مقالات" : "No articles found"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <ArticleCard article={a} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Newsletter */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className={`mt-12 rounded-[2rem] border p-10 text-center backdrop-blur-xl shadow-lg relative overflow-hidden ${isDark ? "bg-[#0B3D2E]/20 border-[#0B3D2E]/40" : "bg-[#0B3D2E]/[0.03] border-[#0B3D2E]/20"}`}>
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#C8A762]/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#0B3D2E]/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-5 dark:bg-[#161b22] dark:border-white/10 relative z-10">
            <Newspaper size={28} color="#C8A762" weight="duotone" />
          </div>
          <h3 className={`text-2xl font-black tracking-tight mb-2 relative z-10 ${isDark ? "text-white" : "text-zinc-900"}`}>{isRTL ? "اشترك في النشرة القانونية" : "Subscribe to Legal Newsletter"}</h3>
          <p className={`text-[13.5px] leading-relaxed mb-8 relative z-10 ${muted}`}>{isRTL ? "أحدث المقالات والتحديثات القانونية أسبوعياً إلى بريدك" : "Latest articles and legal updates weekly to your inbox"}</p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto relative z-10">
            <input placeholder={isRTL ? "بريدك الإلكتروني" : "Your email"} className={`flex-1 rounded-2xl border px-5 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-[#0B3D2E]/20 ${isDark ? "bg-[#0c0f12] border-white/[0.06] text-white placeholder-zinc-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400"}`} />
            <button className="px-6 py-3.5 bg-[#0B3D2E] text-white text-[13.5px] font-bold rounded-2xl hover:bg-[#0a3328] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] active:scale-[0.98]">
              {isRTL ? "اشترك" : "Subscribe"}
            </button>
          </div>
        </motion.div>
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}