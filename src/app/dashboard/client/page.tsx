"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Gavel, CalendarBlank, FolderOpen, Coins, Robot, Sparkle,
  ArrowLeft, MagnifyingGlass, Bell,
  CheckCircle, Clock, Warning, ChatCircle, Phone,
  FileText, Wallet, Shield,
  ChatDots, Headset, ArrowUp, SealCheck, Users, PencilSimple,
  Package, Lightning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { CaseCard } from "./_components/CaseCard";
import {
  COMMUNITY_PREVIEW,
  fadeUp,
  MY_CASES,
  NEXT_APPOINTMENT,
  QUICK_SERVICES,
  RECENT_MESSAGES,
  USER_PLAN,
} from "./_data";

export default function ClientDashboard() {
  const { isDark } = useTheme();
  const user = useUser();
  const [aiInput, setAiInput] = useState("");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  return (
    <div
      className={`p-5 md:p-8 space-y-6 max-w-[1200px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
      dir="rtl"
      suppressHydrationWarning
    >

      {/* ── Onboarding Welcome (first-visit only) ── */}
      <OnboardingBanner role="client" name={user.name} isDark={isDark} />

      {/* ══ Section 1 – Welcome Hero ═══════════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Welcome left */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0B3D2E] to-[#0d5238] p-7 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]">
          <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.05]">
            <Shield size={160} weight="fill" />
          </div>
          <div className="relative">
            <div className="flex items-start gap-3 mb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                  أهلاً، {user.name?.split(" ")[0] || "خالد"}
                  <Sparkle size={26} weight="fill" className="text-[#C8A762]" />
                </h1>
                <p className="text-emerald-300/70 text-sm mt-1">
                  لديك <strong className="text-white">قضيتان نشطتان</strong> يتابعهما محاموك الآن
                </p>
              </div>
              {MY_CASES.some(c => c.urgent) && (
                <Link href="/notifications" aria-label="عرض الإشعارات العاجلة"
                  className="mt-1 text-[11px] font-bold bg-red-500/20 border border-red-400/30 text-red-300 px-3 py-1 rounded-full flex items-center gap-1 flex-shrink-0 animate-pulse hover:bg-red-500/30 transition-colors"
                >
                  <Bell size={11} weight="fill" /> تنبيه عاجل
                </Link>
              )}
            </div>

            <p className="text-emerald-100/60 text-sm mb-5 max-w-md leading-relaxed">
              قضيتك في أيدٍ أمينة — يمكنك متابعة مراحل القضية، التواصل مع محاميك، وحجز استشارة جديدة بنقرة واحدة.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/client/services">
                <motion.div
                  whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-[#C8A762] text-[#0B3D2E] font-bold px-5 py-2.5 rounded-xl text-sm shadow-md cursor-pointer"
                >
                  <Headset size={16} weight="bold" />
                  احجز استشارة
                  <ArrowLeft size={14} />
                </motion.div>
              </Link>
              <Link href="/ai/consult">
                <motion.div
                  whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-5 py-2.5 rounded-xl text-sm backdrop-blur-sm cursor-pointer"
                >
                  <Robot size={16} weight="fill" />
                  اسأل نظامي AI
                </motion.div>
              </Link>
            </div>
          </div>
        </div>

        {/* Next appointment card */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
          className={`${card} p-5 flex flex-col gap-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <CalendarBlank size={17} weight="fill" className="text-amber-500" />
              </div>
              <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>موعدك القادم</p>
            </div>
            <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/30">
              {NEXT_APPOINTMENT.countdown}
            </span>
          </div>

          <div className={`rounded-2xl p-4 ${isDark ? "bg-zinc-800" : "bg-amber-50/60 border border-amber-100"}`}>
            <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>
              {NEXT_APPOINTMENT.title}
            </p>
            <p className={`text-[12px] mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              مع {NEXT_APPOINTMENT.lawyer}
            </p>
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <Clock size={13} className="text-amber-500" />
              <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>
                {NEXT_APPOINTMENT.date} — {NEXT_APPOINTMENT.time}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/dashboard/client/consultation" className="flex-1">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-1.5 bg-royal/10 text-royal text-[12px] font-bold py-2.5 rounded-xl transition-colors hover:bg-royal/20 cursor-pointer"
              >
                <CalendarBlank size={13} /> كل المواعيد
              </motion.div>
            </Link>
            <motion.a
              href={`tel:${NEXT_APPOINTMENT.lawyerPhone}`}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer ${
                isDark ? "bg-zinc-800 text-zinc-400 hover:text-emerald-400" : "bg-zinc-100 text-zinc-500 hover:text-emerald-600"
              }`}
            >
              <Phone size={16} />
            </motion.a>
          </div>
        </motion.div>
      </motion.div>

      {/* ══ Section 2 — My Cases ════════════════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gavel size={17} weight="fill" className="text-royal" />
            <h2 className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-800"}`}>قضاياي</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
              {MY_CASES.length} نشطة
            </span>
          </div>
          <Link href="/dashboard/client/cases" className="flex items-center gap-1 text-royal text-[12px] font-medium hover:underline">
            عرض الكل <ArrowLeft size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {MY_CASES.map(cs => (
            <CaseCard key={cs.id} cs={cs} isDark={isDark} />
          ))}
        </div>
      </motion.div>

      {/* ══ Section 2.5 — Plan Banner (Subscription-Aware) ═══════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>

        {/* ── Scenario A: NO PLAN (free tier) ── */}
        {USER_PLAN.id === "free" && (
          <div className={`relative overflow-hidden rounded-3xl border p-5 flex items-center justify-between gap-4 ${
            isDark ? "bg-[#1a1f27] border-[#C8A762]/20" : "bg-gradient-to-l from-amber-50 to-white border-amber-200/70 shadow-sm"
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Warning size={20} weight="fill" className="text-amber-500" />
              </div>
              <div>
                <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>أنت على الباقة المجانية</p>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  ١ استفسار AI يومياً فقط — الاستشارات والعقود بالعمل القانوني
                </p>
              </div>
            </div>
            <Link href="/dashboard/client/wallet">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-[#C8A762] hover:bg-[#b8974f] transition flex-shrink-0 cursor-pointer shadow-sm"
              >
                <Lightning size={13} weight="fill" /> اشترك الآن
              </motion.div>
            </Link>
          </div>
        )}

        {/* ── Scenario B: ACTIVE PLAN (ai-individual / shield / legal-protection) ── */}
        {USER_PLAN.id !== "free" && (
          <div className={`relative overflow-hidden rounded-3xl border p-5 ${
            isDark
              ? "bg-gradient-to-l from-[#0B3D2E]/20 to-[#161b22] border-white/[0.07]"
              : "bg-gradient-to-l from-emerald-50 to-white border-emerald-100/80 shadow-sm"
          }`}>
            {/* Top row */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Package size={18} weight="duotone" className="text-emerald-500" />
                </div>
                <div>
                  <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>
                    باقة {USER_PLAN.name}
                    <span className={`ms-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700"
                    }`}>{USER_PLAN.priceLabel}</span>
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    الاشتراك نشط · يتجدد {USER_PLAN.renewDate}
                  </p>
                </div>
              </div>
              <Link href="/dashboard/client/wallet">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-[#0B3D2E] border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 hover:bg-[#0B3D2E]/10 transition cursor-pointer"
                >
                  <Lightning size={12} weight="fill" /> ترقية الباقة
                </motion.div>
              </Link>
            </div>

            {/* Usage bars — ما هو مشمول */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {[
                {
                  label: "المستشار AI",
                  used: USER_PLAN.used.aiQueries,
                  limit: USER_PLAN.limits.aiQueries,
                  unit: "استفسار",
                  icon: Robot,
                  included: true,
                  extraPrice: USER_PLAN.payPerUse.extraAiQuery,
                },
                {
                  label: "صياغة العقود AI",
                  used: USER_PLAN.used.contractDrafts,
                  limit: USER_PLAN.limits.contractDrafts,
                  unit: "عقد",
                  icon: FileText,
                  included: USER_PLAN.contractDraftIncluded,
                  extraPrice: 700,
                },
                {
                  label: "استشارة محامٍ",
                  used: USER_PLAN.used.consultations,
                  limit: USER_PLAN.consultationIncluded ? USER_PLAN.limits.consultations : 0,
                  unit: "استشارة",
                  icon: ChatCircle,
                  included: USER_PLAN.consultationIncluded,
                  extraPrice: USER_PLAN.payPerUse.consultation,
                },
              ].map((item) => {
                const pct = item.included ? Math.round((item.used / item.limit) * 100) : 0;
                const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`rounded-xl p-3 ${
                    isDark ? "bg-white/[0.04]" : "bg-gray-50 border border-gray-100"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Icon size={13} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                        <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{item.label}</span>
                      </div>
                      <span className={`text-[10px] font-bold font-mono ${
                        !item.included
                          ? "text-amber-500"
                          : pct >= 90 ? "text-red-500" : pct >= 70 ? "text-amber-500" : isDark ? "text-zinc-400" : "text-zinc-500"
                      }`}>
                        {item.included ? `${item.used}/${item.limit} ${item.unit}` : `غير مشمول`}
                      </span>
                    </div>
                    {item.included ? (
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-700" : "bg-gray-200"}`}>
                        <motion.div
                          className={`h-full rounded-full ${barColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                        />
                      </div>
                    ) : (
                      <p className={`text-[10px] font-medium ${
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      }`}>
                        بالعمل القانوني: <strong className="text-amber-500">{item.extraPrice} ر.س</strong>
                        {" · "}
                        <Link href="/dashboard/client/wallet" className="underline text-royal">ارقِّ الباقة</Link>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Warning if >70% on AI */}
            {(() => {
              const aiPct = Math.round((USER_PLAN.used.aiQueries / USER_PLAN.limits.aiQueries) * 100);
              if (aiPct < 70) return null;
              return (
                <div className={`flex items-center gap-2 rounded-xl p-3 text-[11px] ${
                  aiPct >= 90
                    ? isDark ? "bg-red-900/20 border border-red-700/30 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
                    : isDark ? "bg-amber-900/20 border border-amber-700/30 text-amber-300" : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}>
                  <Warning size={13} weight="fill" />
                  {aiPct >= 90
                    ? `وصلت لـ ${aiPct}% من حد AI الشهري — ${USER_PLAN.payPerUse.extraAiQuery} ر.س للاستفسار الإضافي أو `
                    : `اقتربت من حد AI الشهري (${aiPct}%) — تبقّى ${USER_PLAN.limits.aiQueries - USER_PLAN.used.aiQueries} استفساراً `
                  }
                  <Link href="/dashboard/client/wallet" className="underline font-bold">ارقِّ الباقة</Link>
                </div>
              );
            })()}
          </div>
        )}
      </motion.div>

      {/* ══ Section 3 — اطلب خدمة (Primary Services CTA) ══════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="fill" className="text-[#C8A762]" />
            <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>اطلب خدمة</p>
          </div>
          <Link href="/dashboard/client/services" className={`text-[11px] font-medium hover:underline flex items-center gap-0.5 ${
            isDark ? "text-zinc-500" : "text-zinc-400"
          }`}>
            كل الخدمات <ArrowLeft size={10} />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_SERVICES.map((svc) => {
            const Icon = svc.icon;
            const isPayPerUse = !svc.planBadgeOk;
            return (
              <Link key={svc.href} href={svc.href}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.02, boxShadow: "0 16px 40px -8px rgba(11,61,46,0.2)" }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative overflow-hidden rounded-2xl p-4 text-white cursor-pointer bg-gradient-to-br ${svc.color} shadow-md`}
                >
                  <Icon size={22} weight="duotone" className="mb-2 opacity-90" />
                  <p className="text-[13px] font-bold leading-tight">{svc.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{svc.desc}</p>
                  {/* Plan badge — أحمر للدفع المنفرد، شفاف للمشمول */}
                  <span className={`absolute bottom-2 end-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isPayPerUse
                      ? "bg-black/30 text-amber-300"
                      : "bg-white/20 text-white"
                  }`}>
                    {svc.planBadge}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* ══ Section 4 — Messages + Documents (2-col) ════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        {/* Messages */}
        <div className={card}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <div className="flex items-center gap-2">
              <ChatDots size={16} weight="fill" className="text-royal" />
              <h3 className={`font-bold text-[14px] ${isDark ? "text-white" : "text-zinc-800"}`}>رسائل المحامين</h3>
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                ظ،
              </span>
            </div>
            <Link href="/dashboard/client/messages" className="text-xs text-royal hover:underline flex items-center gap-0.5">
              الكل <ArrowLeft size={11} />
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {RECENT_MESSAGES.map((msg, i) => (
              <Link key={i} href="/dashboard/client/messages" className={`flex items-start gap-3 p-3 rounded-xl transition-colors cursor-pointer ${
                msg.unread
                  ? isDark ? "bg-royal/10 hover:bg-royal/15" : "bg-royal/5 border border-royal/10 hover:bg-royal/10"
                  : isDark ? "hover:bg-white/[0.04]" : "hover:bg-zinc-50"
              }`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-royal to-emerald-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {msg.from.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{msg.from}</p>
                    <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{msg.time}</span>
                  </div>
                  <p className={`text-[12px] truncate ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{msg.msg}</p>
                </div>
                {msg.unread && <div className="w-2 h-2 rounded-full bg-royal flex-shrink-0 mt-1.5" />}
              </Link>
            ))}
          </div>
        </div>

        {/* Documents */}
        <div className={card}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <div className="flex items-center gap-2">
              <FolderOpen size={16} weight="fill" className="text-blue-500" />
              <h3 className={`font-bold text-[14px] ${isDark ? "text-white" : "text-zinc-800"}`}>مستنداتي</h3>
            </div>
            <Link href="/dashboard/client/documents" className="text-xs text-royal hover:underline flex items-center gap-0.5">
              الكل <ArrowLeft size={11} />
            </Link>
          </div>
          <div className="p-4 space-y-2">
            {[
              { name: "عقد التوظيف.pdf", type: "PDF", date: "١٢ أبريل ٢٠٢٦", case: "قضية ٢٠٢٥-٠٠١" },
              { name: "إشعار قانوني.docx", type: "Word", date: "٨ أبريل ٢٠٢٦", case: "قضية ٢٠٢٥-٠٠٢" },
              { name: "محضر الجلسة.pdf", type: "PDF", date: "١ مارس ٢٠٢٦", case: "قضية ٢٠٢٥-٠٠١" },
            ].map((doc, i) => (
              <Link key={i} href="/dashboard/client/documents">
                <motion.div whileHover={{ x: -2 }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    isDark ? "hover:bg-white/[0.05]" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-[10px] ${
                    doc.type === "PDF"
                      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}>
                    {doc.type}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{doc.name}</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{doc.case} · {doc.date}</p>
                  </div>
                  <ArrowLeft size={12} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ══ Section 5 — Wallet Banner ════════════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}>
        <div className={`relative overflow-hidden flex flex-col md:flex-row items-start md:items-center gap-5 rounded-3xl border p-6 ${
          isDark
            ? "bg-gradient-to-l from-amber-950/40 to-[#0B3D2E]/40 border-amber-700/20"
            : "bg-gradient-to-l from-amber-50 to-emerald-50 border-amber-200"
        }`}>
          <div className="absolute start-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-emerald-500 rounded-e-full" />

          <div className="ms-2 w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Wallet size={26} weight="fill" className="text-white" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                رصيد محفظتك — <span className="text-amber-500">٢٥٠ ر.س</span> جاهزة للاستخدام
              </p>
            </div>
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              كسبتها من إحالة أصدقائك ← تُخصم تلقائياً عند دفع أي خدمة قانونية.
              لديك أيضاً <strong className={isDark ? "text-amber-400" : "text-amber-600"}>٣ كوبونات خصم</strong> نشطة.
            </p>
          </div>

          <Link href="/dashboard/client/wallet">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-[#0B3D2E] text-white text-[12px] font-bold px-4 py-2.5 rounded-xl flex-shrink-0 cursor-pointer shadow-md"
            >
              <Coins size={14} /> إدارة المحفظة <ArrowLeft size={12} />
            </motion.div>
          </Link>
        </div>
      </motion.div>

      {/* ══ Section 5.5 — المجتمع القانوني ══════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}>
        <div className={`overflow-hidden rounded-3xl border ${
          isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100 shadow-sm"
        }`}>
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${
            isDark ? "border-white/[0.06]" : "border-zinc-100"
          }`}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0B3D2E]/10 flex items-center justify-center">
                <Users size={16} weight="duotone" className="text-[#0B3D2E]" />
              </div>
              <div>
                <h3 className={`font-bold text-[14px] ${isDark ? "text-white" : "text-zinc-800"}`}>المجتمع القانوني</h3>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>أسئلة يُجيب عليها محامون معتمدون</p>
              </div>
            </div>
            <Link href="/community" className="text-xs text-royal hover:underline flex items-center gap-0.5">
              الكل <ArrowLeft size={11} />
            </Link>
          </div>

          {/* Questions Preview */}
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
            {COMMUNITY_PREVIEW.map((q) => (
              <Link key={q.id} href={`/community/${q.id}`}>
                <motion.div
                  whileHover={{ x: -2 }}
                  className={`flex items-start gap-3 px-5 py-3.5 transition-colors group ${
                    isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50"
                  }`}
                >
                  {/* Vote count */}
                  <div className={`flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0 w-8`}>
                    <ArrowUp size={12} className="text-emerald-500" />
                    <span className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{q.votes}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium leading-snug mb-1.5 group-hover:text-royal transition-colors ${
                      isDark ? "text-zinc-200" : "text-zinc-700"
                    }`}>
                      {q.title}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isDark ? "bg-[#0B3D2E]/20 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                      }`}>{q.tag}</span>
                      <span className={`flex items-center gap-0.5 text-[10px] ${
                        q.isAnswered ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-zinc-400"
                      }`}>
                        {q.isAnswered
                          ? <><CheckCircle size={10} weight="fill" /> أُجيب ({q.answers})</>
                          : <><ChatCircle size={10} /> {q.answers} إجابة</>}
                      </span>
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{q.ago}</span>
                    </div>
                  </div>

                  {/* Lawyer badge */}
                  <div className="flex-shrink-0 self-center">
                    <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"
                    }`}>
                      <SealCheck size={9} weight="fill" /> محامٍ
                    </span>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>

          {/* Footer CTA */}
          <div className={`flex items-center justify-between px-5 py-3 border-t ${
            isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-zinc-100 bg-zinc-50"
          }`}>
            <p className={`text-[11px] flex items-center gap-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              <MagnifyingGlass size={11} className="flex-shrink-0" />
              الأسئلة + الإجابات مُفهرسة على Google — تساعد نظامي في السيو
            </p>
            <Link href="/community/ask">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white cursor-pointer"
              >
                <PencilSimple size={11} weight="bold" /> اطرح سؤالاً
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ══ Section 6 — AI Quick Question ═══════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}>
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C8A762] to-[#b8974f] flex items-center justify-center">
              <Robot size={20} weight="fill" className="text-[#0B3D2E]" />
            </div>
            <div>
              <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>لديك سؤال قانوني؟</p>
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                اسأل بالكلام العادي — نظامي AI يجيبك فوراً
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              placeholder="مثال: ما حقوقي لو الموظف شتمني؟"
              className={`flex-1 rounded-xl border px-4 py-3 text-[13px] outline-none transition-colors ${
                isDark
                  ? "bg-zinc-800 border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 focus:border-royal/40"
                  : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/40"
              }`}
            />
            <Link href={`/ai/consult${aiInput ? `?q=${encodeURIComponent(aiInput)}` : ""}`}>
              <motion.div
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="h-full px-4 flex items-center gap-2 bg-[#0B3D2E] hover:bg-[#1a6b4e] text-white text-[13px] font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkle size={14} weight="fill" /> اسأل
              </motion.div>
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {["ما حقوقي عند الفصل؟", "كيف أرفع دعوى؟", "هل عقدي صحيح؟"].map(q => (
              <button
                key={q}
                onClick={() => setAiInput(q)}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                  isDark
                    ? "border-white/[0.08] text-zinc-500 hover:border-royal/40 hover:text-royal"
                    : "border-zinc-200 text-zinc-400 hover:border-royal/40 hover:text-royal"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

    </div>
  );
}
