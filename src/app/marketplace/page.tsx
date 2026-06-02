"use client";

import { Suspense } from "react";

/**
 * /marketplace — سوق المهنيين (Professional Services Marketplace)
 * ──────────────────────────────────────────────────────────────────────────
 * 3 تبويبات رئيسية:
 *   1. "طلباتي"       — يظهر لجميع المستخدمين (طلباتي المنشورة + حالتها)
 *   2. "تصفح السوق"   — يرى الكل الطلبات المتاحة
 *      • مزود الخدمة: يرى فقط الطلبات المطابقة لتخصصه
 *   3. "اطلب خدمة"   — نموذج إنشاء طلب جديد (لجميع المستخدمين)
 *
 * Smart Matching Logic:
 *   - كل طلب له category (تعقيب، توثيق، ترافع، صياغة...)
 *   - مزود الخدمة له specialty → يرى فقط الطلبات المطابقة
 *   - المحامي يرى كل الطلبات لأنه قد يحتاج أي خدمة
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, MagnifyingGlass, SlidersHorizontal,
  Star, SealCheck, Briefcase, Globe, X,
  Sparkle, ArrowRight, Warning, Shield, Plus, ListBullets,
  ChartBar, UserCheck, Funnel,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Internal
import type { ServiceCategory, MainTab } from "./_types";
import {
  CATEGORIES, CITIES, STATS_GENERAL,
  ALL_REQUESTS, MY_OFFERS, MY_REQUESTS,
  MOCK_PROVIDER_SPECIALTIES,
} from "./_data";
import { RequestCard } from "./_components/RequestCard";
import { MyRequestsTab } from "./_components/MyRequestsTab";
import { PostRequestTab } from "./_components/PostRequestTab";

// ─── Main Component ───────────────────────────────────────────────────────────
function MarketplaceInner() {
  const { isDark } = useTheme();
  const user = useUser();

  const isLawyer    = user.userType === "lawyer" || user.userType === "firm";
  const isProvider  = user.userType === "provider";
  const isAdmin     = user.userType === "admin";
  // Individual client = logged in, not lawyer/firm/provider/admin
  const isClient    = user.isLoggedIn && !isLawyer && !isProvider && !isAdmin;
  const canOffer    = isProvider || isLawyer;
  const isGuest     = !user.isLoggedIn;
  const router      = useRouter();

  // Provider specialties — in production comes from user profile
  const providerSpecialties: ServiceCategory[] = isProvider ? MOCK_PROVIDER_SPECIALTIES : [];

  // Deep-link support: ?tab=my-requests OR default by user type
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as MainTab | null;

  const [activeTab, setActiveTab] = useState<MainTab>("browse"); // safe SSR default
  const [category,  setCategory]  = useState<ServiceCategory>("all");
  const [city,      setCity]      = useState("كل المدن");
  const [urgency,   setUrgency]   = useState<"" | "urgent" | "normal" | "flexible">("");
  const [search,    setSearch]    = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // After mount, sync the correct default tab based on real user session
  useEffect(() => {
    if (!mounted) return;
    if (tabParam) { setActiveTab(tabParam); return; }
    // Lawyers/providers default to browse, clients to my-requests
    if (canOffer)  { setActiveTab("browse");      return; }
    if (isClient)  { setActiveTab("my-requests"); return; }
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const bg    = isDark ? "bg-[#0c0f12] text-white"   : "bg-gray-50 text-gray-900";
  const card  = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  // Smart filtering for providers
  const filteredRequests = ALL_REQUESTS
    .filter(r => {
      if (isProvider && providerSpecialties.length > 0) {
        const matches = r.requiredSpecialties.some(s => providerSpecialties.includes(s));
        if (!matches) return false;
      }
      return true;
    })
    .filter(r => category === "all" || r.category === category)
    .filter(r => city === "كل المدن" || r.city === city)
    .filter(r => urgency === "" || r.urgency === urgency)
    .filter(r => search === "" || r.title.includes(search) || r.description.includes(search));

  const matchedCount = isProvider
    ? ALL_REQUESTS.filter(r => r.requiredSpecialties.some(s => providerSpecialties.includes(s))).length
    : ALL_REQUESTS.length;

  if (!mounted) return null;

  // Tabs: clients do NOT see "تصفح السوق" — that's for lawyers/providers
  // Clients see "ابحث عن محامٍ" as a redirect link instead
  const TABS: { id: MainTab; label: string; icon: React.ElementType; desc: string; clientOnly?: boolean; lawyerOnly?: boolean }[] = [
    { id: "my-requests"  as MainTab, label: "طلباتي",      icon: ListBullets, desc: "طلباتك المنشورة وحالتها" },
    // "تصفح السوق" — lawyers/providers ONLY: they browse client service requests and bid
    { id: "browse"       as MainTab, label: "تصفح السوق",  icon: Funnel,      desc: isProvider ? `${matchedCount} طلب في تخصصك` : `${ALL_REQUESTS.length} طلب متاح`, lawyerOnly: true },
    { id: "post-request" as MainTab, label: "اطلب خدمة",   icon: Plus,        desc: "انشر طلباً جديداً" },
  ].filter(t => {
    // Hide lawyer-only tabs from individual clients
    if (t.lawyerOnly && isClient) return false;
    return true;
  });

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className={`relative overflow-hidden border-b ${isDark ? "bg-gradient-to-l from-[#0B3D2E]/30 to-transparent border-[#2d3748]" : "bg-gradient-to-l from-[#0B3D2E]/5 to-transparent border-gray-200"}`}>
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {isProvider
                  ? <><span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"/></span>
                    <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>لوحة مزود الخدمة</span></>
                  : <><Sparkle size={16} weight="fill" className="text-[#C8A762]" />
                    <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>سوق المهنيين — نظامي</span></>
                }
              </div>
              <h1 className="text-3xl md:text-4xl font-black mb-2">
                {isProvider ? "الطلبات المطابقة لتخصصك" : "احصل على الخدمة القانونية التي تحتاجها"}
              </h1>
              <p className={`text-sm max-w-lg ${muted}`}>
                {isProvider
                  ? `تخصصاتك: ${providerSpecialties.map(s => CATEGORIES.find(c => c.id === s)?.label).join("، ")} — ستصلك إشعارات فورية عند نشر طلبات جديدة.`
                  : "انشر طلبك — يتنافس مزودو الخدمة على تقديم أفضل عرض. المنصة تضمن العدالة بالتسعير."
                }
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {STATS_GENERAL.map((s, i) => (
                <div key={i} className={`${card} px-3 py-2 text-center min-w-[90px]`}>
                  <p className={`text-base font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{s.value}</p>
                  <p className={`text-[10px] ${muted}`}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Provider — specialty match banner */}
          {isProvider && (
            <div className={`mt-4 rounded-xl border px-4 py-3 flex items-center gap-3 ${isDark ? "border-blue-700/30 bg-blue-900/10" : "border-blue-100 bg-blue-50"}`}>
              <ChartBar size={16} className="text-blue-500 flex-shrink-0" weight="duotone" />
              <p className={`text-sm ${isDark ? "text-blue-300" : "text-blue-800"}`}>
                <strong>{matchedCount} طلب</strong> يطابق تخصصك ({providerSpecialties.map(s => CATEGORIES.find(c => c.id === s)?.label).join("، ")}) — الطلبات خارج تخصصك مخفية تلقائياً.
              </p>
              <Link href="/dashboard/provider/profile" className={`ms-auto text-xs font-bold flex-shrink-0 underline ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                تعديل التخصصات
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Tabs ─────────────────────────────────────────── */}
      <div className={`border-b ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 border-b-2 text-sm font-semibold transition-all -mb-px ${
                    active
                      ? isDark ? "border-[#C8A762] text-[#C8A762]" : "border-[#0B3D2E] text-[#0B3D2E]"
                      : `border-transparent ${muted} hover:${isDark ? "text-gray-300" : "text-gray-700"}`
                  }`}>
                  <Icon size={16} />
                  <span>{t.label}</span>
                  {t.id === "browse" && isProvider && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                      {matchedCount}
                    </span>
                  )}
                  {t.id === "my-requests" && !isGuest && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isProvider
                        ? "bg-amber-500/20 text-amber-400"
                        : isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-50 text-blue-700"
                    }`}>
                      {isProvider
                        ? MY_OFFERS.filter(o => o.status === "pending").length
                        : MY_REQUESTS.filter(r => r.status === "open" || r.status === "in-progress").length
                      }
                    </span>
                  )}
                </button>
              );
            })}
            {/* Client-only: direct link to lawyer search (replaces hidden "تصفح السوق") */}
            {isClient && (
              <Link
                href="/dashboard/client/find-lawyer"
                className={`flex items-center gap-2 px-4 py-3.5 border-b-2 border-transparent text-sm font-semibold transition-all -mb-px ${muted} hover:text-[#0B3D2E] dark:hover:text-[#C8A762]`}
              >
                <MagnifyingGlass size={16} />
                <span>ابحث عن محامٍ</span>
                <ArrowRight size={13} className="rotate-180 opacity-50" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        {/* Tab: My Requests */}
        {activeTab === "my-requests" && (
          <MyRequestsTab isDark={isDark} isGuest={isGuest} isProvider={isProvider} />
        )}

        {/* Tab: Post Request */}
        {activeTab === "post-request" && (
          <PostRequestTab isDark={isDark} isGuest={isGuest} />
        )}

        {/* Tab: Browse Marketplace */}
        {activeTab === "browse" && (
          <div className="flex gap-6">

            {/* Left Sidebar */}
            <aside className="hidden lg:flex flex-col gap-4 w-60 shrink-0">
              {/* Provider matching notice */}
              {isProvider && (
                <div className={`${card} p-3`}>
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck size={14} className="text-emerald-500" weight="fill" />
                    <p className={`text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>فلترة ذكية مفعّلة</p>
                  </div>
                  <p className={`text-[11px] ${muted}`}>تظهر لك فقط الطلبات المطابقة لتخصصاتك. الطلبات خارج مجالك مخفية.</p>
                </div>
              )}

              {/* Category filter */}
              <div className={`${card} p-4`}>
                <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>نوع الخدمة</p>
                <div className="space-y-1">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const active = category === cat.id;
                    return (
                      <button key={cat.id} onClick={() => setCategory(cat.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-right transition-all ${
                          active ? "bg-[#0B3D2E] text-white" : `${muted} hover:bg-gray-100 dark:hover:bg-white/5`
                        }`}>
                        <Icon size={14} /><span className="flex-1">{cat.label}</span>
                        <span className={`text-xs ${active ? "opacity-70" : "opacity-40"}`}>{cat.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* City filter */}
              <div className={`${card} p-4`}>
                <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>المدينة</p>
                <div className="space-y-1">
                  {CITIES.map(c => (
                    <button key={c} onClick={() => setCity(c)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-right transition-all ${
                        city === c ? "bg-[#0B3D2E] text-white" : `${muted} hover:bg-gray-100 dark:hover:bg-white/5`
                      }`}>
                      <MapPin size={13} />{c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Urgency filter */}
              <div className={`${card} p-4`}>
                <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>الأولوية</p>
                <div className="space-y-1">
                  {[{ id: "", label: "الكل" }, { id: "urgent", label: "عاجل 🔴" }, { id: "normal", label: "عادي" }, { id: "flexible", label: "مرن" }].map(u => (
                    <button key={u.id} onClick={() => setUrgency(u.id as any)}
                      className={`w-full px-3 py-2 rounded-xl text-sm text-right transition-all ${urgency === u.id ? "bg-[#0B3D2E] text-white" : `${muted} hover:bg-gray-100 dark:hover:bg-white/5`}`}>
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pricing info */}
              <div className={`${card} p-4`}>
                <p className={`text-xs font-bold mb-2 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>💡 آلية التسعير</p>
                <ul className={`text-xs space-y-2 ${muted}`}>
                  <li>المنصة تقترح نطاق سعر عادل بناءً على:</li>
                  <li className="flex items-start gap-1">• نوع الخدمة ومدة التنفيذ</li>
                  <li className="flex items-start gap-1">• المدينة ومتوسط السوق</li>
                  <li className="flex items-start gap-1">• تقييم المزود السابق</li>
                  <li className={`pt-1 font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>عمولة المنصة: 15%</li>
                </ul>
              </div>
            </aside>

            {/* Main Feed */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Search + mobile filters */}
              <div className="flex gap-3">
                <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
                  <MagnifyingGlass size={16} color={isDark ? "#6b7280" : "#9ca3af"} />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={isProvider ? "ابحث في طلبات تخصصك..." : "ابحث في الطلبات..."}
                    className={`flex-1 py-2.5 text-sm bg-transparent outline-none ${isDark ? "text-white placeholder-gray-600" : "text-gray-900 placeholder-gray-400"}`} />
                  {search && <button onClick={() => setSearch("")}><X size={14} color={isDark ? "#6b7280" : "#9ca3af"} /></button>}
                </div>
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  <SlidersHorizontal size={15} /> فلتر
                </button>
              </div>

              {/* Result count */}
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${muted}`}>
                  <span className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>{filteredRequests.length}</span> طلب
                  {isProvider && <span className={`ms-2 text-xs font-bold text-emerald-500`}>· مطابق لتخصصك</span>}
                  {category !== "all" && ` في ${CATEGORIES.find(c => c.id === category)?.label}`}
                  {city !== "كل المدن" && ` · ${city}`}
                </p>
                <button onClick={() => setActiveTab("post-request")}
                  className={`hidden sm:flex items-center gap-1.5 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
                  <Plus size={13} /> انشر طلبك
                </button>
              </div>

              {/* Requests */}
              <AnimatePresence>
                {filteredRequests.length === 0 ? (
                  <div className={`${card} p-12 text-center`}>
                    <Briefcase size={48} color="#C8A762" weight="duotone" className="mx-auto mb-4 opacity-40" />
                    <p className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      {isProvider ? "لا توجد طلبات مطابقة لتخصصاتك حالياً" : "لا توجد طلبات تطابق البحث"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredRequests.map((req, i) => (
                      <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                        <RequestCard req={req} canOffer={canOffer} isDark={isDark} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>

              {filteredRequests.length > 0 && (
                <div className="text-center pt-2">
                  <button className={`px-6 py-2.5 rounded-xl border text-sm font-medium transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    تحميل المزيد
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}

// ─── Suspense Wrapper (required because useSearchParams is used) ──────────────
export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceInner />
    </Suspense>
  );
}
