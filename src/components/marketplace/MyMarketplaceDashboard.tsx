"use client";

/**
 * MyMarketplaceDashboard — مكوّن مشترك لـ:
 *  - /dashboard/lawyer/marketplace
 *  - /dashboard/firm/marketplace
 *  - /dashboard/business/marketplace
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, CheckCircle, Clock, Hourglass, Eye,
  X, Users, ArrowRight, ArrowLeft, Storefront, Plus,
  CaretDown, CaretUp, MapPin, Star, Handshake,
  UsersThree, Scales, ArrowSquareOut, CheckFat, Calculator
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

import {
  type ReqStatus,
  type CollabRequest,
  MY_REQUESTS,
  COLLAB_REQUESTS,
  getStatusCfg,
  URGENCY_CFG,
  OFFER_STATUS_CFG,
  COLLAB_STATUS_CFG
} from "./MyMarketplaceDashboardData";

import { FeeSplitModal } from "./FeeSplitModal";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

interface Props {
  userType?: "lawyer" | "firm" | "corporate" | "micro";
  initialMode?: "solo" | "collab";
}

function MyMarketplaceDashboardInner({ userType = "lawyer", initialMode = "solo" }: Props) {
  const { isDark, lang } = useTheme();
  const isRTL = lang === "ar";
  const searchParams = useSearchParams();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<ReqStatus | "all">("all");
  const [viewMode, setViewMode] = useState<"solo" | "collab">(initialMode);
  const [feeSplitTarget, setFeeSplitTarget] = useState<CollabRequest | null>(null);

  // Consume ?view=post-request — redirect directly to marketplace post wizard
  useEffect(() => {
    if (searchParams.get("view") === "post-request") {
      router.replace("/marketplace/post");
    }
    if (searchParams.get("mode") === "collab") {
      setViewMode("collab");
    }
  }, [searchParams, router]);

  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const filtered = MY_REQUESTS.filter(r => filterStatus === "all" || r.status === filterStatus);

  const stats = {
    open:       MY_REQUESTS.filter(r => r.status === "open").length,
    inProgress: MY_REQUESTS.filter(r => r.status === "in-progress").length,
    totalOffers:MY_REQUESTS.reduce((s, r) => s + r.offersCount, 0),
    completed:  MY_REQUESTS.filter(r => r.status === "completed").length,
  };

  return (
    <>
      <div className={`${bg} min-h-full`} dir="rtl">
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

          {/* Mode Toggle: طلباتي / التعاون */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
            className={`flex items-center gap-1 p-1 rounded-2xl border w-fit ${
              isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50"
            }`}
          >
            {[{id: "solo" as const, label: "طلباتي", icon: Briefcase}, {id: "collab" as const, label: "دعوات تعاون", icon: Handshake}].map(m => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setViewMode(m.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                    viewMode === m.id
                      ? "bg-[#0B3D2E] text-[#C8A762] shadow-md"
                      : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  <Icon size={15} weight={viewMode === m.id ? "fill" : "regular"} />
                  {m.label}
                  {m.id === "collab" && COLLAB_REQUESTS.filter(c => c.status === "pending").length > 0 && (
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </motion.div>

          {/* Header */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                {viewMode === "solo" ? "طلباتي في سوق المهنيين" : "دعوات التعاون"}
              </h1>
              <p className={`text-sm mt-1 ${muted}`}>
                {viewMode === "solo" ? "تابع طلباتك المنشورة والعروض الواردة عليها" : "دعوات تشارك من محامين آخرين للعمل معك على قضايا مشتركة"}
              </p>
            </div>
            <Link
              href="/marketplace/post"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition shadow-lg"
            >
              <Plus size={16} weight="bold" />
              انشر طلباً جديداً
            </Link>
          </motion.div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "طلبات مفتوحة", value: stats.open,       icon: Briefcase,      color: "from-[#0B3D2E] to-[#1a6b4e]" },
              { label: "جارٍ التنفيذ", value: stats.inProgress, icon: Hourglass,      color: "from-blue-600 to-blue-500"   },
              { label: "عروض واردة كلياً",  value: stats.totalOffers, icon: Users,   color: "from-[#C8A762] to-[#b8974f]" },
              { label: "مكتملة",       value: stats.completed,  icon: CheckCircle,    color: "from-emerald-600 to-emerald-500" },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                  whileHover={{ y: -2, transition: { duration: 0.2 } }}
                  className={`${card} p-4 flex items-center gap-3`}>
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center flex-shrink-0 shadow`}>
                    <Icon size={18} weight="fill" className="text-white" />
                  </div>
                  <div>
                    <p className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>{s.value}</p>
                    <p className={`text-xs ${muted}`}>{s.label}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {viewMode === "solo" && (
            <>
              {/* Filter Tabs */}
              <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
                className="flex flex-wrap gap-2">
                {[
                  { id: "all"          as const, label: "الكل", count: MY_REQUESTS.length },
                  { id: "open"         as const, label: "مفتوح", count: stats.open },
                  { id: "in-progress"  as const, label: "جارٍ", count: stats.inProgress },
                  { id: "completed"    as const, label: "مكتمل", count: stats.completed },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilterStatus(f.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition ${
                      filterStatus === f.id
                        ? "bg-[#0B3D2E] text-white"
                        : isDark
                          ? "bg-[#161b22] border border-[#2d3748] text-gray-400 hover:text-gray-200"
                          : "bg-white border border-gray-200 text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {f.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === f.id ? "bg-white/20" : isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </motion.div>

              {/* Requests List */}
              <div className="space-y-3">
                <AnimatePresence>
                  {filtered.map((req, i) => {
                    const statCfg = getStatusCfg(req.status);
                    const urgCfg = URGENCY_CFG[req.urgency];
                    const isExpanded = expandedId === req.id;
                    const pendingOffers = req.offers.filter(o => o.status === "pending");

                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: i * 0.06 }}
                        className={`${card} overflow-hidden shadow-sm`}
                      >
                        {/* Request Row */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : req.id)}
                          className="w-full p-5 text-right"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Badges */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className={`text-xs font-bold ${urgCfg.color} flex items-center gap-1`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${urgCfg.dot}`} />
                                  {urgCfg.label}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                                  {req.categoryLabel}
                                </span>
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold ${statCfg.bg} ${statCfg.color}`}>
                                  {statCfg.icon} {statCfg.label}
                                </span>
                              </div>
                              {/* Title */}
                              <p className={`font-bold text-sm leading-snug text-right ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                                {req.title}
                              </p>
                              {/* Meta */}
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                                <span className={`flex items-center gap-1 ${muted}`}>
                                  <MapPin size={11} weight="fill" /> {req.city}
                                </span>
                                <span className={`flex items-center gap-1 ${muted}`}>
                                  <Clock size={11} /> {req.postedAt}
                                </span>
                                <span className={`font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                                  {req.budgetMin.toLocaleString()} – {req.budgetMax.toLocaleString()} ر.س
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              {/* Offers count badge */}
                              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs ${
                                pendingOffers.length > 0
                                  ? isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                                  : isDark ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"
                              }`}>
                                <Users size={13} />
                                {req.offersCount} عرض
                                {pendingOffers.length > 0 && req.status === "open" && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] animate-pulse ms-0.5" />
                                )}
                              </div>
                              {isExpanded ? (
                                <CaretUp size={16} className={muted} />
                              ) : (
                                <CaretDown size={16} className={muted} />
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Expanded Offers */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className={`border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"} p-5`}>
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                                    العروض الواردة ({req.offers.length})
                                  </h3>
                                  <Link
                                    href={`/marketplace/${req.id}`}
                                    className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}
                                  >
                                    عرض تفاصيل الطلب
                                    <Arrow size={12} />
                                  </Link>
                                </div>

                                {req.offers.length === 0 ? (
                                  <div className={`text-center py-6 ${muted}`}>
                                    <Hourglass size={28} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-xs">لا توجد عروض بعد — انتظر قليلاً</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {req.offers.map(offer => {
                                      const oState = OFFER_STATUS_CFG[offer.status];
                                      return (
                                        <div key={offer.id}
                                          className={`flex items-center justify-between gap-3 p-3 rounded-xl ${isDark ? "bg-white/3" : "bg-gray-50"}`}>
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {offer.isTop && (
                                              <Star size={13} className="text-[#C8A762] flex-shrink-0" weight="fill" />
                                            )}
                                            <div className="min-w-0">
                                              <p className={`text-xs font-bold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                                                {offer.providerName}
                                              </p>
                                              <p className={`text-xs ${muted}`}>
                                                {offer.rating}★ · {offer.deliveryTime}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-sm font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                                              {offer.price.toLocaleString()} ر.س
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${oState.bg} ${oState.color}`}>
                                              {oState.label}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {req.status === "open" && pendingOffers.length > 0 && (
                                  <div className="mt-3 flex justify-center">
                                    <Link
                                      href={`/marketplace/${req.id}`}
                                      className="flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition"
                                    >
                                      قارن العروض واختر الأنسب
                                      <Arrow size={13} />
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {filtered.length === 0 && (
                  <div className={`${card} p-12 text-center`}>
                    <Storefront size={48} className="mx-auto mb-4 opacity-20" />
                    <p className={`font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      لا توجد طلبات بعد
                    </p>
                    <p className={`text-sm ${muted} mb-4`}>
                      انشر طلبك الأول وسيتنافس مزودو الخدمة لخدمتك.
                    </p>
                    <Link href="/marketplace/post"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition">
                      <Plus size={15} weight="bold" />
                      انشر طلباً الآن
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Collab View */}
          {viewMode === "collab" && (
            <div className="space-y-3">
              {COLLAB_REQUESTS.map((collab, i) => {
                const stCfg = COLLAB_STATUS_CFG[collab.status];
                const myFee = Math.round((collab.totalFee * collab.mySplit) / 100);
                return (
                  <motion.div
                    key={collab.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07, type: "spring", stiffness: 120, damping: 20 }}
                    className={`${card} overflow-hidden shadow-sm`}
                  >
                    <div className="h-1 w-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]" />

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <UsersThree size={15} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{collab.fromLawyer}</p>
                            <span className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{collab.fromCity} · {collab.fromRating}★</span>
                          </div>
                          <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{collab.caseTitle}</p>
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full mt-1 ${isDark ? "bg-royal/10 text-royal" : "bg-royal/5 text-royal"}`}>{collab.caseType}</span>
                        </div>
                        <span className={`flex-shrink-0 flex items-center gap-1.5 text-[10px] font-bold rounded-full border px-2.5 py-0.5 ${stCfg.bg} ${stCfg.color} ${stCfg.border}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {stCfg.label}
                        </span>
                      </div>

                      <div className={`p-3 rounded-xl mb-4 ${isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-zinc-50 border border-zinc-100"}`}>
                        <div className="flex items-center justify-between text-[11px] mb-2">
                          <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>توزيع الأتعاب المقترح</span>
                          <span className={`font-bold font-mono ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{collab.totalFee.toLocaleString()} ر.س</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden flex">
                          <div className="bg-[#0B3D2E] h-full" style={{ width: `${collab.mySplit}%` }} />
                          <div className="bg-[#C8A762] flex-1 h-full" />
                        </div>
                        <div className="flex justify-between mt-2">
                          <div>
                            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نصيبي ({collab.mySplit}٪)</p>
                            <p className="text-[13px] font-bold font-mono text-emerald-500">{myFee.toLocaleString()} ر.س</p>
                          </div>
                          <div className="text-end">
                            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نصيب الشريك ({100 - collab.mySplit}٪)</p>
                            <p className={`text-[13px] font-bold font-mono ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{(collab.totalFee - myFee).toLocaleString()} ر.س</p>
                          </div>
                        </div>
                      </div>

                      <p className={`text-[11px] mb-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                        دوري في هذه القضية: <span className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{collab.myRole}</span>
                        &nbsp;&middot;&nbsp;{collab.sentAt}
                      </p>

                      <div className="flex gap-2">
                        <button className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] py-2.5 text-[12px] font-bold text-[#C8A762] hover:bg-[#155e41] transition-colors">
                          <Handshake size={14} />
                          قبول الدعوة
                        </button>
                        <button
                          onClick={() => setFeeSplitTarget(collab)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-bold transition-colors border ${
                            isDark ? "border-white/[0.07] text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                          }`}
                        >
                          <Calculator size={14} /> تعديل التوزيع
                        </button>
                        <button className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-bold transition-colors text-red-400 hover:bg-red-500/10">
                          <X size={14} /> رفض
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className={`${card} p-5 border-dashed opacity-70 hover:opacity-100 transition-opacity`}
              >
                <div className="flex items-center gap-4">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isDark ? "bg-white/[0.04]" : "bg-zinc-50"
                  }`}>
                    <Scales size={20} weight="duotone" className="text-royal" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>غرفة المهمة المشتركة</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>تعاون في قضية مقبولة بشكل موحّد — مستندات ومهام مشتركة</p>
                  </div>
                  <Link
                    href="/marketplace/workspace/col-1"
                    className={`flex items-center gap-1.5 text-[12px] font-bold ${
                      isDark ? "text-[#C8A762] hover:underline" : "text-[#0B3D2E] hover:underline"
                    }`}
                  >
                    <ArrowSquareOut size={13} /> فتح الغرفة
                  </Link>
                </div>
              </motion.div>
            </div>
          )}

          {/* Go to full marketplace */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={10}>
            <Link
              href="/marketplace"
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-sm transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <Storefront size={16} />
              تصفح سوق المهنيين الكامل
              <Arrow size={14} />
            </Link>
          </motion.div>

        </div>
      </div>

      {/* FeeSplitModal */}
      <AnimatePresence>
        {feeSplitTarget && (
          <FeeSplitModal
            collab={feeSplitTarget}
            onClose={() => setFeeSplitTarget(null)}
            isDark={isDark}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default function MyMarketplaceDashboard(props: Props) {
  return (
    <Suspense fallback={<div className="p-8 text-center opacity-40 text-sm">جارٍ التحميل...</div>}>
      <MyMarketplaceDashboardInner {...props} />
    </Suspense>
  );
}
