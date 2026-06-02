"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  MagnifyingGlass, SealCheck, Star, Clock, MapPin, Briefcase,
  Funnel, Sliders, X, ArrowLeft, ArrowRight,
  CheckCircle, Circle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ───────────────────────────────────────────────────────────────────

type Specialty = "الكل" | "عمالي" | "مدني" | "تجاري" | "جنائي" | "أسرة" | "إداري";
type SortOption = "rating" | "cases" | "response";

interface Lawyer {
  id: number;
  name: string;
  nameEn: string;
  initials: string;
  specialty: Specialty;
  city: string;
  rating: number;
  reviews: number;
  sessions: number;
  responseTime: string;
  price: number;
  available: boolean;
  slug: string;
  tagline: string;
}

// ─── Data ──────────────────────────────────────────────────────────────────

const SPECIALTY_HUE: Record<string, string> = {
  عمالي:  "#0B3D2E",
  مدني:   "#1d5c45",
  تجاري:  "#a07828",
  جنائي:  "#7a1515",
  أسرة:   "#5c1a6b",
  إداري:  "#1a3a6b",
  الكل:   "#6b7280",
};

const MOCK_LAWYERS: Lawyer[] = [
  { id: 1, name: "أحمد الغامدي",  nameEn: "Ahmed Al-Ghamdi",  initials: "أغ", specialty: "عمالي",  city: "الرياض",        rating: 4.9, reviews: 234, sessions: 89,  responseTime: "٢ ساعة",   price: 99,  available: true,  slug: "ahmed-alghamdi",   tagline: "خبرة ١٢ عاماً في نزاعات العمل والفصل التعسفي" },
  { id: 2, name: "نورة الشهراني", nameEn: "Noura Al-Shahrani", initials: "نش", specialty: "مدني",   city: "جدة",           rating: 4.8, reviews: 187, sessions: 112, responseTime: "ساعة",     price: 149, available: true,  slug: "noura-alshahrani", tagline: "متخصصة في عقود البناء والنزاعات المدنية" },
  { id: 3, name: "خالد المطيري",  nameEn: "Khalid Al-Mutairi", initials: "خم", specialty: "تجاري", city: "الرياض",        rating: 4.7, reviews: 312, sessions: 203, responseTime: "٣ ساعات", price: 199, available: false, slug: "khalid-almutairi", tagline: "تأسيس الشركات والعقود التجارية الدولية" },
  { id: 4, name: "ريم الدوسري",   nameEn: "Reem Al-Dosari",   initials: "رد", specialty: "أسرة",   city: "مكة",           rating: 4.9, reviews: 156, sessions: 67,  responseTime: "٢ ساعة",  price: 129, available: true,  slug: "reem-aldosari",    tagline: "قضايا الأحوال الشخصية والميراث والحضانة" },
  { id: 5, name: "محمد الزهراني", nameEn: "Mohammed Al-Zahrani",initials:"مز",specialty: "جنائي", city: "الدمام",        rating: 4.6, reviews: 421, sessions: 178, responseTime: "٤ ساعات", price: 299, available: true,  slug: "mohammed-alzahrani",tagline:"الدفاع الجنائي والاستئناف أمام المحاكم العليا"},
  { id: 6, name: "سلمى العتيبي",  nameEn: "Salma Al-Otaibi",  initials: "سع", specialty: "إداري", city: "الرياض",        rating: 4.8, reviews: 98,  sessions: 45,  responseTime: "ساعة",    price: 179, available: true,  slug: "salma-alotaibi",   tagline: "الطعون الإدارية وديوان المظالم" },
  { id: 7, name: "عمر القحطاني",  nameEn: "Omar Al-Qahtani",  initials: "عق", specialty: "تجاري", city: "جدة",           rating: 4.7, reviews: 267, sessions: 134, responseTime: "٢ ساعة",  price: 249, available: false, slug: "omar-alqahtani",   tagline: "الملكية الفكرية والعقود التجارية" },
  { id: 8, name: "هند الحربي",    nameEn: "Hind Al-Harbi",    initials: "هح", specialty: "عمالي", city: "المدينة المنورة",rating: 4.5, reviews: 143, sessions: 88,  responseTime: "٣ ساعات", price: 89,  available: true,  slug: "hind-alharbi",     tagline: "مطالبات العمالة المنزلية والوافدين" },
  { id: 9, name: "يوسف العسيري",  nameEn: "Yousef Al-Asiri",  initials: "يع", specialty: "مدني",  city: "الدمام",        rating: 4.6, reviews: 189, sessions: 97,  responseTime: "٢ ساعة",  price: 119, available: true,  slug: "yousef-alasiri",   tagline: "التعويضات والمسؤولية المدنية" },
];

const SPECIALTIES: { ar: Specialty; en: string; count: number }[] = [
  { ar: "الكل",   en: "All",            count: MOCK_LAWYERS.length },
  { ar: "عمالي",  en: "Labour",         count: MOCK_LAWYERS.filter(l => l.specialty === "عمالي").length },
  { ar: "مدني",   en: "Civil",          count: MOCK_LAWYERS.filter(l => l.specialty === "مدني").length },
  { ar: "تجاري",  en: "Commercial",     count: MOCK_LAWYERS.filter(l => l.specialty === "تجاري").length },
  { ar: "جنائي",  en: "Criminal",       count: MOCK_LAWYERS.filter(l => l.specialty === "جنائي").length },
  { ar: "أسرة",   en: "Family",         count: MOCK_LAWYERS.filter(l => l.specialty === "أسرة").length },
  { ar: "إداري",  en: "Administrative", count: MOCK_LAWYERS.filter(l => l.specialty === "إداري").length },
];

const CITIES = ["الكل", "الرياض", "جدة", "مكة", "الدمام", "المدينة المنورة"];

// ─── Spotlight Card (cursor-tracking border glow) ─────────────────────────

function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY]);

  const background = useTransform(
    [mouseX, mouseY],
    ([x, y]) =>
      `radial-gradient(280px circle at ${x}px ${y}px, rgba(11,61,46,0.10), transparent 65%)`
  );

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] z-10 transition-opacity duration-300"
        style={{ background }}
      />
      {children}
    </motion.div>
  );
}

// ─── Lawyer Card ──────────────────────────────────────────────────────────

function LawyerCard({ lawyer, delay, isRTL, isDark }: {
  lawyer: Lawyer; delay: number; isRTL: boolean; isDark: boolean;
}) {
  const hue = SPECIALTY_HUE[lawyer.specialty] ?? "#0B3D2E";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 120, damping: 18 }}
    >
      <SpotlightCard
        className={`group rounded-2xl border flex flex-col h-full transition-all duration-300 ${
          isDark
            ? "bg-zinc-900 border-white/[0.07] hover:border-white/20"
            : "bg-white border-zinc-100/80 hover:border-zinc-300/60 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_-8px_rgba(11,61,46,0.12)]"
        }`}
      >
        <div className="p-5 flex-1 relative z-20">
          {/* Avatar + name row */}
          <div className="flex items-start gap-3.5 mb-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-base flex-shrink-0 shadow-md"
              style={{ backgroundColor: hue }}
            >
              {lawyer.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`font-bold text-sm leading-tight ${isDark ? "text-white" : "text-zinc-800"}`}>
                  {lawyer.name}
                </p>
                <SealCheck size={14} weight="fill" style={{ color: "#C8A762" }} />
              </div>
              <span
                className="inline-block text-[11px] px-2 py-0.5 rounded-full mt-1 font-semibold"
                style={{ backgroundColor: `${hue}18`, color: hue }}
              >
                {lawyer.specialty}
              </span>
            </div>
            {lawyer.available ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0 mt-0.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                متاح
              </span>
            ) : (
              <span className={`text-[10px] flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                غير متاح
              </span>
            )}
          </div>

          {/* Tagline */}
          <p className={`text-[12px] leading-relaxed mb-4 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {lawyer.tagline}
          </p>

          {/* Stats row */}
          <div className={`grid grid-cols-3 gap-2 rounded-xl p-3 mb-4 ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"}`}>
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Star size={11} weight="fill" style={{ color: "#C8A762" }} />
                <span className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>{lawyer.rating}</span>
              </div>
              <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>({lawyer.reviews})</p>
            </div>
            <div className="text-center border-x dark:border-white/[0.06] border-zinc-200">
              <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>{lawyer.sessions}</p>
              <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>جلسة</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Clock size={9} style={{ color: "#C8A762" }} />
                <span className={`text-[11px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>{lawyer.responseTime}</span>
              </div>
              <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>رد خلال</p>
            </div>
          </div>

          {/* Location + price */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[11px]">
              <MapPin size={11} style={{ color: "#C8A762" }} />
              <span className={isDark ? "text-zinc-400" : "text-zinc-500"}>{lawyer.city}</span>
            </div>
            <span className="text-[13px] font-black" style={{ color: "#C8A762" }}>
              من {lawyer.price} ر.س
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className={`grid grid-cols-2 border-t relative z-20 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
          <a
            href={`/lawyers/${lawyer.slug}`}
            className={`py-3 text-center text-[12px] font-semibold transition-colors border-e ${
              isDark
                ? "border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                : "border-zinc-100 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50"
            }`}
          >
            {isRTL ? "عرض الملف" : "View Profile"}
          </a>
          <a
            href={`/lawyers/${lawyer.slug}#consult`}
            className={`py-3 text-center text-[12px] font-bold text-white transition-colors ${
              lawyer.available
                ? "bg-[#0B3D2E] hover:bg-[#0f4f39]"
                : isDark ? "bg-zinc-700 cursor-not-allowed" : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
            }`}
          >
            {lawyer.available ? (isRTL ? "استشارة فورية" : "Book Now") : (isRTL ? "غير متاح" : "Unavailable")}
          </a>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────

function EmptyState({ isDark }: { isDark: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="col-span-full flex flex-col items-center justify-center py-24 text-center"
    >
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
        <MagnifyingGlass size={28} className={isDark ? "text-zinc-600" : "text-zinc-300"} weight="duotone" />
      </div>
      <p className={`text-[15px] font-bold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
        لا توجد نتائج
      </p>
      <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
        جرّب تغيير فلاتر البحث
      </p>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function BrowseLawyersPage() {
  const { isRTL, isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<Specialty>("الكل");
  const [city, setCity] = useState("الكل");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState<SortOption>("rating");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filtered = useMemo(() => {
    let r = [...MOCK_LAWYERS];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(l => l.name.includes(q) || l.nameEn.toLowerCase().includes(q) || l.specialty.includes(q));
    }
    if (specialty !== "الكل") r = r.filter(l => l.specialty === specialty);
    if (city !== "الكل") r = r.filter(l => l.city === city);
    if (onlyAvailable) r = r.filter(l => l.available);
    if (sort === "rating") r.sort((a, b) => b.rating - a.rating);
    else if (sort === "cases") r.sort((a, b) => b.sessions - a.sessions);
    else r.sort((a, b) => a.price - b.price);
    return r;
  }, [search, specialty, city, onlyAvailable, sort]);

  const perPage = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const activeFiltersCount = [
    specialty !== "الكل",
    city !== "الكل",
    onlyAvailable,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSpecialty("الكل");
    setCity("الكل");
    setOnlyAvailable(false);
    setPage(1);
  };

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0a0d10] text-white" : "bg-[#f7f8fa] text-zinc-900"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      {/* ── Hero Strip ── */}
      <div className="relative pt-28 pb-10 overflow-hidden">
        {/* Subtle background geometry */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, #0B3D2E 0%, transparent 50%), radial-gradient(circle at 80% 20%, #C8A762 0%, transparent 40%)",
          }}
        />
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 relative">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 rounded-full bg-[#C8A762]" />
              <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {isRTL ? "محامون مرخصون" : "Licensed Lawyers"}
              </p>
            </div>
            <h1 className={`text-3xl md:text-4xl font-black tracking-tight leading-tight mb-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "ابحث عن المحامي المناسب" : "Find the Right Lawyer"}
            </h1>
            <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL
                ? `+${MOCK_LAWYERS.length} محامٍ مرخص ومعتمد من وزارة العدل — قارن التخصصات والأسعار واحجز استشارتك في دقائق.`
                : `${MOCK_LAWYERS.length}+ licensed lawyers — compare specialties, prices, and book a consultation in minutes.`}
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-5 md:px-8 pb-16">
        <div className="flex gap-7 items-start">

          {/* ── Sidebar Filters (desktop) ── */}
          <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-24">
            <div className={`rounded-2xl border p-5 space-y-6 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100 shadow-sm"}`}>
              {/* Sidebar header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={15} className={isDark ? "text-zinc-400" : "text-zinc-500"} weight="duotone" />
                  <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                    {isRTL ? "الفلاتر" : "Filters"}
                  </span>
                  {activeFiltersCount > 0 && (
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#0B3D2E] text-white text-[9px] font-black">
                      {activeFiltersCount}
                    </span>
                  )}
                </div>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className={`text-[10px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"} transition-colors`}
                  >
                    {isRTL ? "إعادة ضبط" : "Reset"}
                  </button>
                )}
              </div>

              {/* Specialty */}
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {isRTL ? "التخصص" : "Specialty"}
                </p>
                <div className="space-y-1">
                  {SPECIALTIES.map(s => (
                    <button
                      key={s.ar}
                      onClick={() => { setSpecialty(s.ar); setPage(1); }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                        specialty === s.ar
                          ? "bg-[#0B3D2E] text-white"
                          : isDark
                            ? "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      }`}
                    >
                      <span>{isRTL ? s.ar : s.en}</span>
                      <span className={`text-[10px] ${specialty === s.ar ? "text-white/60" : isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                        {s.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* City */}
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {isRTL ? "المدينة" : "City"}
                </p>
                <div className="space-y-1">
                  {CITIES.map(c => (
                    <button
                      key={c}
                      onClick={() => { setCity(c); setPage(1); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                        city === c
                          ? "bg-[#0B3D2E] text-white"
                          : isDark
                            ? "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      }`}
                    >
                      {city === c
                        ? <CheckCircle size={13} weight="fill" />
                        : <Circle size={13} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
                      }
                      {c === "الكل" ? (isRTL ? "كل المدن" : "All Cities") : c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Availability */}
              <div>
                <button
                  onClick={() => { setOnlyAvailable(v => !v); setPage(1); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                    onlyAvailable
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : isDark
                        ? "border-white/[0.07] text-zinc-400 hover:border-white/20 hover:text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  <span>{isRTL ? "متاح الآن فقط" : "Available Now"}</span>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    onlyAvailable ? "border-white bg-white" : isDark ? "border-zinc-600" : "border-zinc-300"
                  }`}>
                    {onlyAvailable && <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
                  </span>
                </button>
              </div>
            </div>
          </aside>

          {/* ── Main Results ── */}
          <div className="flex-1 min-w-0">
            {/* Search + sort bar */}
            <div className="flex items-center gap-3 mb-5">
              <div className={`flex-1 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 ${
                isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200 shadow-sm"
              }`}>
                <MagnifyingGlass size={15} weight="duotone" style={{ color: "#C8A762", flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder={isRTL ? "ابحث باسم المحامي أو التخصص..." : "Search by name or specialty..."}
                  className={`flex-1 bg-transparent text-[13px] outline-none ${
                    isDark ? "text-white placeholder-zinc-600" : "text-zinc-800 placeholder-zinc-400"
                  }`}
                />
                {search && (
                  <button onClick={() => setSearch("")}>
                    <X size={14} className={isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"} />
                  </button>
                )}
              </div>

              {/* Sort */}
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortOption)}
                className={`rounded-xl border px-3 py-2.5 text-[12px] font-medium outline-none transition-colors ${
                  isDark ? "bg-zinc-900 border-white/[0.07] text-zinc-300" : "bg-white border-zinc-200 text-zinc-700 shadow-sm"
                }`}
              >
                <option value="rating">{isRTL ? "الأعلى تقييماً" : "Top Rated"}</option>
                <option value="cases">{isRTL ? "الأكثر قضايا" : "Most Cases"}</option>
                <option value="response">{isRTL ? "السعر" : "By Price"}</option>
              </select>

              {/* Mobile filter toggle */}
              <button
                onClick={() => setSidebarOpen(true)}
                className={`lg:hidden relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[12px] font-semibold ${
                  isDark ? "bg-zinc-900 border-white/[0.07] text-zinc-300" : "bg-white border-zinc-200 text-zinc-700 shadow-sm"
                }`}
              >
                <Funnel size={14} />
                {isRTL ? "فلتر" : "Filter"}
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-[#0B3D2E] text-white text-[9px] font-black">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>

            {/* Results meta */}
            <div className="flex items-center justify-between mb-4">
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                {isRTL
                  ? `${filtered.length} نتيجة − عرض ${paginated.length}`
                  : `${filtered.length} results — showing ${paginated.length}`}
              </p>
              {activeFiltersCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-[11px] font-semibold text-[#0B3D2E] dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <X size={11} />
                  {isRTL ? "مسح الفلاتر" : "Clear filters"}
                </button>
              )}
            </div>

            {/* Grid */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${specialty}-${city}-${sort}-${page}-${search}-${onlyAvailable}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8"
              >
                {paginated.length === 0 ? (
                  <EmptyState isDark={isDark} />
                ) : (
                  paginated.map((lawyer, i) => (
                    <LawyerCard
                      key={lawyer.id}
                      lawyer={lawyer}
                      isRTL={isRTL}
                      isDark={isDark}
                      delay={i * 0.05}
                    />
                  ))
                )}
              </motion.div>
            </AnimatePresence>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    isDark ? "border-white/[0.07] text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {isRTL ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                  {isRTL ? "السابق" : "Prev"}
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`w-9 h-9 rounded-xl text-[12px] font-bold transition-colors ${
                      page === i + 1
                        ? "bg-[#0B3D2E] text-white"
                        : isDark
                          ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          : "text-zinc-500 hover:bg-zinc-100"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    isDark ? "border-white/[0.07] text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {isRTL ? "التالي" : "Next"}
                  {isRTL ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Mobile Sidebar Drawer ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: isRTL ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? "100%" : "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className={`fixed top-0 ${isRTL ? "right-0" : "left-0"} bottom-0 w-72 z-50 overflow-y-auto p-5 space-y-6 ${
                isDark ? "bg-zinc-900" : "bg-white"
              }`}
              dir={isRTL ? "rtl" : "ltr"}
            >
              <div className="flex items-center justify-between">
                <p className={`font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                  {isRTL ? "الفلاتر" : "Filters"}
                </p>
                <button onClick={() => setSidebarOpen(false)}>
                  <X size={18} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                </button>
              </div>
              {/* Same filter UI as desktop */}
              <div className="space-y-1">
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  التخصص
                </p>
                {SPECIALTIES.map(s => (
                  <button
                    key={s.ar}
                    onClick={() => { setSpecialty(s.ar); setPage(1); setSidebarOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                      specialty === s.ar ? "bg-[#0B3D2E] text-white" : isDark ? "text-zinc-400 hover:bg-white/5" : "text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <span>{s.ar}</span>
                    <span className={`text-[10px] ${specialty === s.ar ? "text-white/60" : "text-zinc-500"}`}>{s.count}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  المدينة
                </p>
                {CITIES.map(c => (
                  <button
                    key={c}
                    onClick={() => { setCity(c); setPage(1); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                      city === c ? "bg-[#0B3D2E] text-white" : isDark ? "text-zinc-400 hover:bg-white/5" : "text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {c === "الكل" ? "كل المدن" : c}
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <button
                  onClick={() => { setOnlyAvailable(v => !v); setPage(1); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[12px] font-semibold ${
                    onlyAvailable ? "bg-emerald-600 border-emerald-600 text-white" : isDark ? "border-white/[0.07] text-zinc-400" : "border-zinc-200 text-zinc-600"
                  }`}
                >
                  <span>متاح الآن فقط</span>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${onlyAvailable ? "border-white bg-white" : "border-zinc-400"}`}>
                    {onlyAvailable && <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
                  </span>
                </button>
              </div>
              {activeFiltersCount > 0 && (
                <button
                  onClick={() => { resetFilters(); setSidebarOpen(false); }}
                  className="w-full py-2 text-center text-[12px] font-semibold text-red-500 hover:underline"
                >
                  إعادة ضبط الكل
                </button>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
