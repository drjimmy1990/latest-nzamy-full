"use client";

/**
 * /dashboard/provider — لوحة تحكم مزوّد الخدمة
 * ──────────────────────────────────────────────
 * مزوّد الخدمة ≠ محامٍ
 * هذه الصفحة مخصصة لـ: الموثّق / المُعقِّب / المترجم / المحكّم / المستشار المتخصص
 *
 * تعرض:
 *  - KPIs: عروض مقبولة، أرباح الشهر، تقييم متوسط، طلبات جديدة
 *  - آخر 5 طلبات في السوق تناسب خدماته
 *  - عروضه الجارية (مقبولة / في انتظار الموافقة)
 *  - تقويم الخدمات القادمة
 *  - آخر التقييمات
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Briefcase, CurrencyDollar, Star, Bell, SealCheck,
  ArrowRight, ArrowLeft, CalendarBlank, MapPin, ArrowSquareOut,
  Fire, TrendUp, Storefront, UserCircle, ChatDots, ShieldCheck,
  Sparkle, Package, CaretRight, CaretLeft, Robot, Lock, Crown,
  Scan, Lightning, FileText,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import ArbitratorDashboard from "./components/ArbitratorDashboard";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import {
  MY_OFFERS, MARKET_REQUESTS, REVIEWS, UPCOMING,
  OFFER_STATUS_CONFIG, URGENCY_CONFIG, fadeUp,
} from "./_data";

export default function ProviderDashboardPage() {
  const { isDark, isRTL } = useTheme();
  const user = useUser();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const bg   = isDark ? "bg-zinc-950" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5 backdrop-blur-md" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const Caret = isRTL ? CaretLeft : CaretRight;

  const activeOffers = MY_OFFERS.filter(o => o.status !== "completed");
  const completedOffers = MY_OFFERS.filter(o => o.status === "completed");
  const avgRating = (REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length).toFixed(1);

  if (!mounted) return null;

  // ── Fork: المحكّم يحصل على واجهة مخصصة
  if (user.subRole === "arbitrator") return <ArbitratorDashboard />;

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        {/* -- Onboarding Welcome (first-visit only) -- */}
        <OnboardingBanner role="provider" name={user.name} isDark={isDark} />


        {/* ── Welcome Banner ──────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="rounded-2xl p-6 bg-gradient-to-l from-[#0B3D2E] via-[#0d4a36] to-[#1a6b4e] text-white relative overflow-hidden shadow-xl">
          <div className="absolute start-0 top-0 bottom-0 w-1 bg-[#C8A762]" />
          <div className="absolute end-6 top-1/2 -translate-y-1/2 opacity-5">
            <Storefront size={140} weight="fill" />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 bg-[#C8A762]/20 text-[#C8A762] text-xs font-bold px-3 py-1 rounded-full">
                  <SealCheck size={12} weight="fill" />
                  {user.subRole === "bailiff" ? "مراجع حكومي معتمد" : user.subRole === "notary" ? "موثّق رسمي معتمد" : "مزوّد خدمة معتمد"}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black mb-1">
                مرحباً، {user.name}
              </h1>
              <p className="text-emerald-200/80 text-sm">
                لديك <span className="text-[#C8A762] font-bold">{activeOffers.length}</span> عروض نشطة و
                <span className="text-[#C8A762] font-bold"> {MARKET_REQUESTS.length}</span> طلبات جديدة تنتظرك
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/dashboard/provider/requests"
                className="inline-flex items-center gap-2 bg-[#C8A762] text-[#0B3D2E] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#d4b574] transition shadow-lg">
                <Storefront size={16} />
                تصفح الطلبات
                <Arrow size={14} />
              </Link>
              <Link href="/dashboard/provider/profile"
                className="inline-flex items-center gap-2 bg-white/10 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-white/20 transition">
                <UserCircle size={16} />
                ملفي
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── KPIs ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "عروض مقبولة",
              value: `${activeOffers.filter(o => o.status === "accepted" || o.status === "in-progress").length}`,
              sub: "هذا الشهر",
              icon: Package,
              gradient: "from-[#0B3D2E] to-[#1a6b4e]",
              change: "+٢",
            },
            {
              label: "أرباح الشهر",
              value: "٤,٧٥٠ ر.س",
              sub: "بعد عمولة المنصة",
              icon: CurrencyDollar,
              gradient: "from-[#C8A762] to-[#b8974f]",
              change: "+١٢٪",
            },
            {
              label: "تقييم متوسط",
              value: `${avgRating} ★`,
              sub: `بناءً على ${REVIEWS.length} تقييمات`,
              icon: Star,
              gradient: "from-purple-600 to-purple-500",
              change: "▲",
            },
            {
              label: "طلبات جديدة",
              value: `${MARKET_REQUESTS.length}`,
              sub: "مناسبة لخدماتك",
              icon: Bell,
              gradient: "from-blue-600 to-blue-500",
              change: "اليوم",
            },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className={`${card} p-5 shadow-sm`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow`}>
                    <Icon size={20} weight="fill" className="text-white" />
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                    {kpi.change}
                  </span>
                </div>
                <p className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{kpi.value}</p>
                <p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{kpi.label}</p>
                <p className={`text-xs mt-0.5 ${muted}`}>{kpi.sub}</p>
              </motion.div>
            );
          })}
        </div>

        {/* ── Main Grid ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Left — My Offers + New Market Requests */}
          <div className="xl:col-span-2 space-y-6">

            {/* My Active Offers */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
              className={`${card} overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <div>
                  <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                    عروضي الجارية
                  </h2>
                  <p className={`text-xs mt-0.5 ${muted}`}>{activeOffers.length} عروض نشطة</p>
                </div>
                <Link href="/dashboard/provider/requests"
                  className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
                  عرض الكل <Caret size={13} />
                </Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-[#2d3748]">
                {activeOffers.map((offer, i) => {
                  const cfg = OFFER_STATUS_CONFIG[offer.status];
                  return (
                    <motion.div key={offer.id}
                      initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.08 }}
                      className={`p-4 hover:${isDark ? "bg-white/2" : "bg-gray-50/70"} transition-colors`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm leading-snug mb-1.5 ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                            {offer.requestTitle}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`flex items-center gap-1 ${muted}`}>
                              <MapPin size={11} weight="fill" />{offer.requestCity}
                            </span>
                            <span className={muted}>·</span>
                            <span className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                              {offer.category}
                            </span>
                            <span className={muted}>·</span>
                            <span className={`flex items-center gap-1 ${muted}`}>
                              <CalendarBlank size={11} />{offer.dueDate}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-bold ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                          <span className={`text-sm font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {offer.myPrice.toLocaleString()} ر.س
                          </span>
                        </div>
                      </div>
                      {offer.status === "accepted" && (
                        <div className={`mt-3 pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"} flex items-center justify-between`}>
                          <span className={`text-xs ${muted}`}>
                            طلب من: <span className={`font-medium ${isDark ? "text-gray-200" : "text-gray-700"}`}>{offer.postedBy}</span>
                          </span>
                          <button className="flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] bg-[#0B3D2E]/10 px-3 py-1.5 rounded-xl hover:bg-[#0B3D2E]/20 transition">
                            <ChatDots size={13} /> تواصل
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                {activeOffers.length === 0 && (
                  <div className="p-8 text-center">
                    <Package size={40} className="mx-auto mb-3 opacity-20" />
                    <p className={`text-sm ${muted}`}>لا توجد عروض نشطة</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* New Market Requests */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
              className={`${card} overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                    طلبات جديدة تناسبك
                  </h2>
                </div>
                <Link href="/dashboard/provider/requests"
                  className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
                  كل الطلبات <Caret size={13} />
                </Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-[#2d3748]">
                {MARKET_REQUESTS.map((req, i) => {
                  const urg = URGENCY_CONFIG[req.urgency];
                  return (
                    <motion.div key={req.id}
                      initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.1 }}
                      className={`p-4 hover:${isDark ? "bg-white/2" : "bg-gray-50/70"} transition-colors`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${urg.dot} flex-shrink-0`} />
                            <span className={`text-xs font-bold ${urg.color}`}>{urg.label}</span>
                            {req.isVerified && (
                              <span className={`inline-flex items-center gap-0.5 text-xs ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} font-medium`}>
                                <SealCheck size={11} weight="fill" /> موثّق
                              </span>
                            )}
                          </div>
                          <p className={`font-semibold text-sm leading-snug mb-1.5 line-clamp-2 ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                            {req.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`flex items-center gap-1 ${muted}`}>
                              <MapPin size={11} weight="fill" />{req.city}
                            </span>
                            <span className={muted}>·</span>
                            <span className={`text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                              {req.budgetMin.toLocaleString()}–{req.budgetMax.toLocaleString()} ر.س
                            </span>
                            <span className={muted}>·</span>
                            <span className={muted}>{req.offersCount} عرض</span>
                          </div>
                        </div>
                        <Link href={`/dashboard/provider/requests/${req.id}`}
                          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition">
                          قدِّم عرضاً
                          <Arrow size={12} />
                        </Link>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div className={`px-5 py-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"} text-center`}>
                <Link href="/dashboard/provider/requests"
                  className={`text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
                  عرض جميع الطلبات المتاحة →
                </Link>
              </div>
            </motion.div>
          </div>

          {/* Right — Calendar + Reviews */}
          <div className="space-y-6">

            {/* Upcoming Services */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
              className={`${card} overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <h2 className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                  خدماتي القادمة
                </h2>
                <Link href="/dashboard/provider/calendar"
                  className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
                  التقويم <Caret size={13} />
                </Link>
              </div>
              <div className="p-3 space-y-2">
                {UPCOMING.map((svc, i) => (
                  <motion.div key={svc.id}
                    whileHover={{ x: isRTL ? -3 : 3 }}
                    className={`rounded-xl p-3.5 border transition-all ${
                      svc.status === "confirmed"
                        ? isDark ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/15" : "border-[#0B3D2E]/20 bg-[#0B3D2E]/5"
                        : isDark ? "border-amber-500/30 bg-amber-500/5" : "border-amber-200 bg-amber-50"
                    }`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className={`text-xs font-bold leading-snug ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                        {svc.title}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        svc.status === "confirmed"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}>
                        {svc.status === "confirmed" ? "مؤكد" : "بانتظار التأكيد"}
                      </span>
                    </div>
                    <p className={`text-xs ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} font-bold mb-1`}>
                      {svc.date} — {svc.time}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${muted} flex items-center gap-1`}>
                        <MapPin size={10} weight="fill" /> {svc.city}
                      </span>
                      <span className={`text-xs ${muted}`}>{svc.clientName}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Latest Reviews */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={8}
              className={`${card} overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <div>
                  <h2 className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                    آخر التقييمات
                  </h2>
                  <p className={`text-xs ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} font-bold`}>
                    {avgRating} / ٥ ★ متوسط
                  </p>
                </div>
                <Link href="/dashboard/provider/reviews"
                  className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}>
                  الكل <Caret size={13} />
                </Link>
              </div>
              <div className="p-3 space-y-3">
                {REVIEWS.map((review) => (
                  <div key={review.id}
                    className={`rounded-xl p-3.5 ${isDark ? "bg-white/3" : "bg-gray-50"}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                        {review.clientName}
                      </p>
                      <span className="text-xs text-amber-500 font-bold">
                        {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed ${muted} mb-1.5`}>{review.comment}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] ${isDark ? "text-[#C8A762]/60" : "text-[#0B3D2E]/60"} font-medium`}>
                        {review.serviceName}
                      </span>
                      <span className={`text-[10px] ${muted}`}>{review.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Profile completion CTA */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={9}
              className={`${card} p-4 shadow-sm`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/15" : "bg-[#0B3D2E]/10"}`}>
                  <ShieldCheck size={18} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} weight="fill" />
                </div>
                <div>
                  <p className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}>اكتمال الملف المهني</p>
                  <p className={`text-xs ${muted}`}>٧٨٪ مكتمل</p>
                </div>
              </div>
              <div className={`w-full h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"} mb-3`}>
                <div className="h-full rounded-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]" style={{ width: "78%" }} />
              </div>
              <p className={`text-xs ${muted} mb-3`}>
                أكمل ملفك لتظهر في نتائج البحث أعلى وترفع فرص قبولك.
              </p>
              <Link href="/dashboard/provider/profile"
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${
                  isDark
                    ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25"
                    : "bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/15"
                }`}>
                <Sparkle size={13} weight="fill" />
                اكتمل ملفك الآن
              </Link>
            </motion.div>

          </div>
        </div>

        {/* ── Completed Deals ──────────────────────────────────────────────── */}
        {completedOffers.length > 0 && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={10}
            className={`${card} overflow-hidden shadow-sm`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
              <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                الصفقات المكتملة
              </h2>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                {completedOffers.length} صفقة
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs border-b ${isDark ? "border-[#2d3748] text-gray-400 bg-[#0c0f12]" : "border-gray-100 text-gray-500 bg-gray-50"}`}>
                    {["الخدمة", "المدينة", "العميل", "السعر", "الحالة"].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-start font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completedOffers.map((offer, i) => {
                    const cfg = OFFER_STATUS_CONFIG[offer.status];
                    return (
                      <tr key={offer.id}
                        className={`border-t transition-colors ${isDark ? "border-[#2d3748] hover:bg-[#1a1f2e]" : "border-gray-50 hover:bg-gray-50"}`}>
                        <td className={`px-4 py-3.5 text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>{offer.requestTitle}</td>
                        <td className={`px-4 py-3.5 text-xs ${muted} flex items-center gap-1 mt-0.5`}>
                          <MapPin size={11} weight="fill" />{offer.requestCity}
                        </td>
                        <td className={`px-4 py-3.5 text-xs ${muted}`}>{offer.postedBy}</td>
                        <td className={`px-4 py-3.5 text-sm font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                          {offer.myPrice.toLocaleString()} ر.س
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-bold ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ── Premium Provider Upgrade Banner ──────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={11}
          className={`rounded-2xl border-2 border-dashed overflow-hidden ${
            isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-amber-50/50"
          }`}
        >
          <div className="p-6 flex flex-col md:flex-row items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 shadow-md">
              <Crown size={28} weight="fill" className="text-[#C8A762]" />
            </div>
            <div className="flex-1 text-center md:text-start">
              <h3 className={`text-base font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>
                ترقّ لمزوّد خدمة مميز — ٩٩ ﷼/شهر
              </h3>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-2">
                {[
                  { icon: Lightning, label: "أولوية في نتائج البحث" },
                  { icon: Robot,     label: "مستشار AI — ١٠ استخدامات/يوم" },
                  { icon: Scan,      label: "فحص مستندات — ٣/شهر" },
                  { icon: FileText,  label: "قوالب ونماذج حسب تخصصك" },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                    isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    <Icon size={11} weight="fill" /> {label}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href="/dashboard/provider/earnings"
              className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold shadow-md hover:bg-[#155e41] transition-colors"
            >
              ترقية الآن <Arrow size={14} />
            </Link>
          </div>
        </motion.div>

        {/* ── AI Tools for Provider ──────────────────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={12}
          className={`${card} p-5 shadow-sm`}>
          <div className="flex items-center gap-2 mb-4">
            <Robot size={15} className="text-[#C8A762]" weight="duotone" />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${muted}`}>
              أدوات ذكية لمزوّد الخدمة
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "المستشار الذكي", desc: "١/يوم مجاناً",  icon: Robot,      locked: false, href: "/ai/consult" },
              { label: "فحص مستند",      desc: "مقفل — المميز",  icon: Scan,       locked: true,  href: "/ai/analyze" },
              { label: "تتبع المعاملات", desc: "مقفل — المميز",  icon: FileText,   locked: true,  href: "#" },
              { label: "قوالب ونماذج",   desc: "مقفل — المميز",  icon: ShieldCheck, locked: true,  href: "#" },
            ].map((tool) => {
              const Icon = tool.icon;
              if (tool.locked) {
                return (
                  <div key={tool.label}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center opacity-50 cursor-not-allowed ${
                      isDark ? "border-[#2d3748] bg-white/[0.01]" : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-white/[0.03]" : "bg-gray-100"}`}>
                      <Lock size={18} weight="duotone" className={isDark ? "text-gray-600" : "text-gray-300"} />
                    </div>
                    <span className={`text-[12px] font-semibold ${isDark ? "text-gray-500" : "text-gray-400"}`}>{tool.label}</span>
                    <span className={`text-[10px] ${isDark ? "text-gray-700" : "text-gray-300"}`}>{tool.desc}</span>
                  </div>
                );
              }
              return (
                <Link key={tool.label} href={tool.href}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${
                    isDark ? "border-[#2d3748] bg-white/[0.02] hover:bg-[#0B3D2E]/15 hover:border-[#C8A762]/20" : "border-gray-100 hover:border-[#0B3D2E]/20 hover:bg-[#0B3D2E]/[0.02]"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"}`}>
                    <Icon size={18} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
                  </div>
                  <span className={`text-[12px] font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{tool.label}</span>
                  <span className={`text-[10px] ${muted}`}>{tool.desc}</span>
                </Link>
              );
            })}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
