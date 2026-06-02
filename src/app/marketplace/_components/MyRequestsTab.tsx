"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin, CurrencyDollar, ArrowRight, Package, Plus,
  CheckCircle, ChatCircle, X, UserCheck, Users, Briefcase,
  UserCircle, SealCheck, Star, ListBullets, Rocket,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  CATEGORIES, URGENCY, STATUS_CFG, OFFER_STATUS_CFG,
  REQUESTER_TYPE_LABEL, MY_OFFERS, MY_REQUESTS,
} from "../_data";
import { RequestCard } from "./RequestCard";

export function MyRequestsTab({
  isDark, isGuest, isProvider,
}: {
  isDark: boolean; isGuest: boolean; isProvider: boolean;
}) {
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card  = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const [activeSubTab, setActiveSubTab] = useState<"offers" | "my-posts">("offers");
  // Client has two modes: open broadcast vs. direct lawyer targeting
  const [clientMode, setClientMode] = useState<"open" | "direct">("open");

  if (isGuest) {
    return (
      <div className={`${card} p-12 text-center`}>
        <UserCheck size={48} className="mx-auto mb-4 text-[#C8A762] opacity-50" weight="duotone" />
        <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-gray-800"}`}>سجّل للوصول لطلباتك</h3>
        <p className={`text-sm mb-6 ${muted}`}>بعد التسجيل ستجد هنا كل طلباتك وعروضك المُقدَّمة</p>
        <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
          تسجيل الدخول <ArrowRight size={16} className="rotate-180" />
        </Link>
      </div>
    );
  }

  // ── Provider View ────────────────────────────────────────────────────────────
  if (isProvider) {
    const offerCounts = {
      pending:   MY_OFFERS.filter(o => o.status === "pending").length,
      accepted:  MY_OFFERS.filter(o => o.status === "accepted" || o.status === "in-progress").length,
      completed: MY_OFFERS.filter(o => o.status === "completed").length,
      rejected:  MY_OFFERS.filter(o => o.status === "rejected").length,
    };

    return (
      <div className="space-y-4">
        {/* Provider stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "قيد المراجعة", value: offerCounts.pending,   color: "text-amber-500",   bg: "bg-amber-500/10"   },
            { label: "مقبول جارٍ",   value: offerCounts.accepted,  color: "text-blue-500",    bg: "bg-blue-500/10"    },
            { label: "مكتمل",        value: offerCounts.completed, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "مرفوض",        value: offerCounts.rejected,  color: "text-red-400",     bg: "bg-red-400/10"     },
          ].map((s, i) => (
            <div key={i} className={`${card} px-3 py-3 text-center`}>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className={`text-[11px] font-semibold ${muted}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Earnings summary */}
        <div className={`${card} px-5 py-4 flex items-center justify-between`}>
          <div>
            <p className={`text-[11px] uppercase tracking-wider font-bold mb-1 ${muted}`}>إجمالي الأرباح (هذا الشهر)</p>
            <p className={`text-2xl font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>١٬٢٥٠ ر.س</p>
          </div>
          <div className="text-left">
            <p className={`text-[11px] uppercase tracking-wider font-bold mb-1 ${muted}`}>تقييمك</p>
            <p className={`text-2xl font-black text-amber-400`}>4.9 ★</p>
          </div>
          <Link href="/dashboard/provider/profile"
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            ملفي المهني <ArrowRight size={14} className="rotate-180" />
          </Link>
        </div>

        {/* Sub-tabs for provider */}
        <div className={`flex gap-1 p-1 rounded-xl ${isDark ? "bg-[#161b22] border border-[#2d3748]" : "bg-gray-100"}`}>
          {[
            { id: "offers" as const,   label: `العروض المُقدَّمة (${MY_OFFERS.length})` },
            { id: "my-posts" as const, label: `طلباتي المنشورة (${MY_REQUESTS.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveSubTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeSubTab === t.id
                  ? isDark ? "bg-[#0B3D2E] text-white" : "bg-white text-[#0B3D2E] shadow-sm"
                  : muted
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Provider: submitted offers */}
        {activeSubTab === "offers" && (
          <div className="space-y-3">
            {MY_OFFERS.map((offer, i) => {
              const cat = CATEGORIES.find(c => c.id === offer.requestCategory)!;
              const CatIcon = cat?.icon ?? Briefcase;
              const oStat = OFFER_STATUS_CFG[offer.status];
              const OIcon = oStat.icon;
              const urg   = URGENCY[offer.requestUrgency];
              const UrgIcon = urg.icon;
              return (
                <motion.article key={offer.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  className={`${card} p-5`}>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl font-bold ${oStat.bg} ${oStat.color}`}>
                      <OIcon size={11} weight="fill" />{oStat.label}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                      <CatIcon size={11} />{cat?.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-xl font-bold ${urg.bg} ${urg.color}`}>
                      <UrgIcon size={10} weight="fill" />{urg.label}
                    </span>
                    <span className={`ms-auto text-xs ${muted}`}>{offer.submittedAt}</span>
                  </div>

                  <Link href={`/marketplace/${offer.requestId}`}
                    className={`block text-[14px] font-bold leading-snug mb-2 hover:underline ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                    {offer.requestTitle}
                  </Link>

                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold ${isDark ? "bg-white/10 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                      {offer.requesterName.charAt(0)}
                    </div>
                    <p className={`text-[12px] ${muted}`}>
                      {offer.requesterName}
                      <span className={`ms-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/8 text-gray-500" : "bg-gray-100 text-gray-400"}`}>
                        {REQUESTER_TYPE_LABEL[offer.requesterType]}
                      </span>
                    </p>
                    <span className={`ms-auto text-xs ${muted}`}><MapPin size={11} className="inline ms-0.5" />{offer.city}</span>
                  </div>

                  <div className={`rounded-xl p-3 border mb-3 text-[12px] ${isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-400" : "border-gray-100 bg-gray-50 text-gray-500"}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-zinc-600" : "text-gray-400"}`}>عرضي</p>
                    {offer.message}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-100"}`}>
                      <CurrencyDollar size={13} className="text-[#C8A762]" weight="fill" />
                      <span className="text-xs font-black text-[#C8A762]">{offer.offerAmount.toLocaleString()} ر.س</span>
                      <span className={`text-xs ${muted}`}>عرضي</span>
                    </div>
                    <div className="flex gap-2">
                      {offer.status === "accepted" && (
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                          <ChatCircle size={12} /> تواصل مع الطالب
                        </button>
                      )}
                      {offer.status === "pending" && (
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
                          <X size={12} /> سحب العرض
                        </button>
                      )}
                      <Link href={`/marketplace/${offer.requestId}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        عرض الطلب <ArrowRight size={12} className="rotate-180" />
                      </Link>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        {/* Provider: my posted requests */}
        {activeSubTab === "my-posts" && (
          MY_REQUESTS.length === 0 ? (
            <div className={`${card} p-12 text-center`}>
              <Package size={48} className={`mx-auto mb-4 opacity-30 ${muted}`} weight="duotone" />
              <p className={`font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-600"}`}>لم تنشر أي طلب بعد</p>
              <p className={`text-sm mb-4 ${muted}`}>يمكنك كمزود خدمة نشر طلبات أيضاً — مثل طلب توثيق أو استشارة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {MY_REQUESTS.map((req, i) => (
                <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <RequestCard req={req} canOffer={false} isDark={isDark} showMyActions />
                </motion.div>
              ))}
            </div>
          )
        )}
      </div>
    );
  }

  // ── Requester View (Lawyer / Business / Client) ───────────────────────────
  const counts = {
    open:          MY_REQUESTS.filter(r => r.status === "open").length,
    "in-progress": MY_REQUESTS.filter(r => r.status === "in-progress").length,
    completed:     MY_REQUESTS.filter(r => r.status === "completed").length,
  };
  const totalOffers = MY_REQUESTS.reduce((sum, r) => sum + r.offersCount, 0);

  // Mock direct-lawyer requests (client booked/requested a specific lawyer)
  const DIRECT_LAWYER_REQUESTS: {
    id: string; lawyerName: string; lawyerInitial: string; lawyerColor: string;
    specialty: string; rating: number; reviewCount: number; requestTitle: string;
    status: 'pending' | 'accepted' | 'declined';
    sentAt: string; responseAt: string | null;
  }[] = [
    {
      id: "dl-1",
      lawyerName: "أحمد الغامدي",
      lawyerInitial: "أ",
      lawyerColor: "bg-emerald-600",
      specialty: "عمالية وتجارية",
      rating: 4.9,
      reviewCount: 124,
      requestTitle: "استشارة عمالية — فصل تعسفي",
      status: "accepted",
      sentAt: "منذ يومين",
      responseAt: "منذ يوم",
    },
    {
      id: "dl-2",
      lawyerName: "نورة الزهراني",
      lawyerInitial: "ن",
      lawyerColor: "bg-indigo-600",
      specialty: "عقارية ومدنية",
      rating: 4.7,
      reviewCount: 88,
      requestTitle: "صياغة عقد إيجار تجاري",
      status: "pending",
      sentAt: "منذ 3 ساعات",
      responseAt: null,
    },
  ];

  const DIRECT_STATUS_CFG = {
    pending:  { label: "بانتظار الرد",  bg: "bg-amber-50 dark:bg-amber-900/20",   color: "text-amber-600 dark:text-amber-400" },
    accepted: { label: "قبل المحامي",   bg: "bg-emerald-50 dark:bg-emerald-900/20", color: "text-emerald-600 dark:text-emerald-400" },
    declined: { label: "اعتذر المحامي", bg: "bg-red-50 dark:bg-red-900/20",       color: "text-red-500" },
  };

  return (
    <div className="space-y-4">

      {/* ── Mode switcher ── */}
      <div className={`flex gap-1 p-1 rounded-xl ${isDark ? "bg-[#161b22] border border-[#2d3748]" : "bg-gray-100"}`}>
        {[
          { id: "open"   as const, label: "طلباتي المفتوحة",     icon: ListBullets },
          { id: "direct" as const, label: "طلبت محامياً بعينه",  icon: UserCircle  },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setClientMode(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              clientMode === id
                ? isDark ? "bg-[#0B3D2E] text-white" : "bg-white text-[#0B3D2E] shadow-sm"
                : muted
            }`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ══ MODE A: Open / Broadcast requests ══════════════════════════════ */}
      {clientMode === "open" && (
        <div className="space-y-4">
          {/* Explain the mode */}
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
            isDark ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30" : "bg-emerald-50 border-emerald-100"
          }`}>
            <Rocket size={18} weight="duotone" className="text-[#0B3D2E] mt-0.5 flex-shrink-0" />
            <p className={`text-xs leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
              <span className="font-bold text-[#0B3D2E]">الطلبات المفتوحة</span> — تُنشر للمحامين المتخصصين وتَصلك عروضهم مع تقييماتهم. اختر الأنسب لك.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "طلباتي",     value: MY_REQUESTS.length,   color: isDark ? "text-white" : "text-gray-800" },
              { label: "مفتوح",      value: counts.open,          color: "text-emerald-500" },
              { label: "جارٍ",       value: counts["in-progress"],color: "text-blue-500" },
              { label: "عروض واردة", value: totalOffers,          color: "text-[#C8A762]" },
            ].map((s, i) => (
              <div key={i} className={`${card} px-3 py-3 text-center`}>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className={`text-[11px] font-semibold ${muted}`}>{s.label}</p>
              </div>
            ))}
          </div>

          {MY_REQUESTS.length === 0 ? (
            <div className={`${card} p-12 text-center`}>
              <Package size={48} className={`mx-auto mb-4 opacity-30 ${muted}`} weight="duotone" />
              <p className={`font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-600"}`}>لم تنشر أي طلب بعد</p>
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
                <Plus size={16} /> انشر أول طلب
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {MY_REQUESTS.map((req, i) => (
                <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <article className={`${card} p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => { const cat = CATEGORIES.find(c => c.id === req.category)!; const CatIcon = cat?.icon ?? Briefcase;
                          return <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}><CatIcon size={12} />{cat?.label}</span>; })()}
                        {(() => { const stat = STATUS_CFG[req.status]; const StatIcon = stat.icon;
                          return <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-bold ${stat.bg} ${stat.color}`}><StatIcon size={11} weight="fill" />{stat.label}</span>; })()}
                        {(() => { const urg = URGENCY[req.urgency]; const UrgIcon = urg.icon;
                          return <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-xl font-bold ${urg.bg} ${urg.color}`}><UrgIcon size={10} weight="fill" />{urg.label}</span>; })()}
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                        req.offersCount > 0
                          ? isDark ? "bg-emerald-900/30 border border-emerald-700/30" : "bg-emerald-50 border border-emerald-200"
                          : isDark ? "bg-white/[0.04] border border-[#2d3748]" : "bg-gray-50 border border-gray-200"
                      }`}>
                        <Users size={13} className={req.offersCount > 0 ? "text-emerald-500" : muted} weight="fill" />
                        <span className={`text-xs font-black ${req.offersCount > 0 ? "text-emerald-500" : muted}`}>{req.offersCount} عرض وارد</span>
                      </div>
                    </div>

                    <Link href={`/marketplace/${req.id}`}
                      className={`block text-base font-bold leading-snug mb-2 hover:underline ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                      {req.title}
                    </Link>
                    <p className={`text-sm leading-relaxed mb-4 line-clamp-2 ${muted}`}>{req.description}</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex items-center gap-1 text-xs ${muted}`}><MapPin size={11} weight="fill" />{req.city}</span>
                      <span className={muted}>·</span>
                      <span className={`flex items-center gap-1 text-xs ${muted}`}>{req.postedAt}</span>
                      <span className={`flex-1`} />
                      <div className="flex gap-2">
                        {req.offersCount > 0 && (
                          <Link href={`/marketplace/${req.id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#0B3D2E] text-white hover:bg-[#0a3328] transition">
                            <Users size={12} /> عرض العروض ({req.offersCount})
                          </Link>
                        )}
                        {req.status === "open" && (
                          <button className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                            isDark ? "border-red-800/40 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-500 hover:bg-red-50"
                          }`}>
                            <X size={12} /> إلغاء
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MODE B: Direct lawyer targeting ════════════════════════════════ */}
      {clientMode === "direct" && (
        <div className="space-y-4">
          {/* Explain the mode */}
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
            isDark ? "bg-indigo-900/10 border-indigo-700/30" : "bg-indigo-50 border-indigo-100"
          }`}>
            <UserCircle size={18} weight="duotone" className="text-indigo-500 mt-0.5 flex-shrink-0" />
            <p className={`text-xs leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">طلب محامٍ بعينه</span> — اخترت محامياً من الدليل وأرسلت له طلباً مباشراً. يظهر هنا رد المحامي وحالة الطلب.
            </p>
          </div>

          {DIRECT_LAWYER_REQUESTS.length === 0 ? (
            <div className={`${card} p-12 text-center`}>
              <UserCircle size={48} className={`mx-auto mb-4 opacity-30 ${muted}`} weight="duotone" />
              <p className={`font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-600"}`}>لم تطلب محامياً بعينه بعد</p>
              <Link href="/lawyers/browse"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
                <UserCircle size={16} /> تصفح المحامين
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {DIRECT_LAWYER_REQUESTS.map((req, i) => {
                const stat = DIRECT_STATUS_CFG[req.status];
                return (
                  <motion.article key={req.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                    className={`${card} p-5`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-11 h-11 rounded-full ${req.lawyerColor} text-white font-bold text-sm flex items-center justify-center flex-shrink-0`}>
                        {req.lawyerInitial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{req.lawyerName}</span>
                          <SealCheck size={14} weight="fill" className="text-[#0B3D2E]" />
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${stat.bg} ${stat.color}`}>
                            {stat.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs ${muted}`}>{req.specialty}</span>
                          <span className="flex items-center gap-0.5 text-[11px] text-amber-500 font-bold">
                            <Star size={10} weight="fill" />{req.rating} ({req.reviewCount} تقييم)
                          </span>
                        </div>
                      </div>
                      <span className={`text-[11px] ${muted} flex-shrink-0`}>{req.sentAt}</span>
                    </div>

                    <p className={`text-sm font-semibold mb-3 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      {req.requestTitle}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className={`text-xs ${muted}`}>
                        {req.responseAt ? `رد ${req.responseAt}` : "لم يرد بعد"}
                      </div>
                      <div className="flex gap-2">
                        {req.status === "accepted" && (
                          <Link href="/dashboard/client/messages"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#0B3D2E] text-white hover:bg-[#0a3328] transition">
                            <ChatCircle size={12} /> فتح المحادثة
                          </Link>
                        )}
                        {req.status === "pending" && (
                          <button className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                            isDark ? "border-red-800/40 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-500 hover:bg-red-50"
                          }`}>
                            <X size={12} /> سحب الطلب
                          </button>
                        )}
                        {req.status === "declined" && (
                          <Link href="/lawyers/browse"
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                              isDark ? "border-[#2d3748] text-gray-300" : "border-gray-200 text-gray-600"
                            }`}>
                            ابحث عن محامٍ آخر <ArrowRight size={12} className="rotate-180" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
