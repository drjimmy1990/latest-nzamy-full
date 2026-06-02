"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, MagnifyingGlass, Lock, Sparkle,
  ArrowRight, Faders, CaretDown, Check, Scales,
  Gavel, Scroll, CheckCircle, Clock, Buildings,
  Crown, Warning,
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { PaywallModal, AdvancedSearchModal, RegisteredUserStats } from "./components/PaywallModal";
import {
  DEMO_PRINCIPLES, DEMO_PRECEDENTS, DEMO_ORDERS,
  PRINCIPLE_SUBJECTS, PRINCIPLE_SOURCES,
  type DemoPrinciple, type DemoPrecedent, type DemoOrder,
  type PrincipleSubject, type PrincipleSourceId,
} from "./demo-data";
import { PrincipleRow, PrecedentRow, OrderRow, EmptyState } from "./components/ListItems";
import RecentSessions from "./components/RecentSessions";
import SmartFolders from "./components/SmartFolders";
import LegislativeUpdates from "./components/LegislativeUpdates";

import {
  type Cat,
  type ContentType,
  type PrecMode,
  CONTENT_TYPES,
  PLACEHOLDERS,
  PLACEHOLDERS_EN,
  PREC_MODES,
  PRINCIPLE_SUBJECT_LABELS_EN,
  PRINCIPLE_SOURCE_LABELS_EN,
  FULL_LAWS_SYSTEMS,
  catTotalCount,
  MAIN_CATEGORIES,
  OTHER_CATEGORIES,
} from "@/constants/lawsLibraryData";

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function LegalLibraryPage() {
  const { isRTL, isDark } = useTheme();
  const { isLoggedIn }    = useUser();

  // — Core filters —
  const [search,         setSearch]         = useState("");
  const [activeCat,      setActiveCat]      = useState<Cat>("all");
  const [activeType,     setActiveType]     = useState<ContentType>("all");
  const [otherMenuOpen,  setOtherMenuOpen]  = useState(false);
  const [showPaywall,    setShowPaywall]    = useState(false);
  const [showAdvSearch,  setShowAdvSearch]  = useState(false);
  const [mounted,        setMounted]        = useState(false);

  // — Precedents dual-filter —
  const [precMode,       setPrecMode]       = useState<PrecMode>("all");
  const [precSubject,    setPrecSubject]    = useState<PrincipleSubject>("all");
  const [precSource,     setPrecSource]     = useState<PrincipleSourceId>("all");

  // — Rotating placeholder —
  const [phIdx, setPhIdx] = useState(0);
  const phList = (isRTL ? PLACEHOLDERS : PLACEHOLDERS_EN)[activeType];
  useEffect(() => { setPhIdx(0); }, [activeType]);
  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % phList.length), 3000);
    return () => clearInterval(t);
  }, [phList]);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const muted       = isDark ? "text-gray-400" : "text-gray-500";
  const isOtherActive = OTHER_CATEGORIES.some(c => c.id === activeCat);
  const q           = search.toLowerCase();

  // ─── Filter: Laws ─────────────────────────────────────────────────────────────
  const filteredLaws = FULL_LAWS_SYSTEMS.filter(s => {
    const inCat = activeCat === "all" || s.cat === activeCat;
    const inQ   = !q || s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
    return inCat && inQ;
  });

  // ─── Filter: Principles ───────────────────────────────────────────────────────
  const filteredPrinciples = DEMO_PRINCIPLES.filter(p => {
    const inCat    = activeCat === "all" || p.cat === activeCat;
    const inSubj   = precSubject === "all" || p.subject === precSubject;
    const inSrc    = precSource  === "all" || p.sourceId === precSource;
    const inQ      = !q || p.text.toLowerCase().includes(q) || p.source.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q);
    return inCat && inSubj && inSrc && inQ;
  });

  // ─── Filter: Precedents ───────────────────────────────────────────────────────
  const filteredPrecedents = DEMO_PRECEDENTS.filter(pr => {
    const inCat  = activeCat === "all" || pr.cat === activeCat;
    const inSubj = precSubject === "all" || pr.subject === precSubject;
    const inQ    = !q || pr.summary.toLowerCase().includes(q) || pr.court.toLowerCase().includes(q) || pr.relevance.toLowerCase().includes(q);
    return inCat && inSubj && inQ;
  });

  // ─── Filter: Orders ───────────────────────────────────────────────────────────
  const filteredOrders = DEMO_ORDERS.filter(o => {
    const inCat = activeCat === "all" || o.cat === activeCat;
    const inQ   = !q || o.title.toLowerCase().includes(q) || o.summary.toLowerCase().includes(q) || o.ref.toLowerCase().includes(q);
    return inCat && inQ;
  });

  const hasResults = (type: ContentType) => {
    if (type === "laws")       return filteredLaws.length > 0;
    if (type === "orders")     return filteredOrders.length > 0;
    if (type === "precedents") return filteredPrinciples.length > 0 || filteredPrecedents.length > 0;
    return filteredLaws.length > 0 || filteredOrders.length > 0 ||
           filteredPrinciples.length > 0 || filteredPrecedents.length > 0;
  };

  const catHasContent = (catId: string) => catTotalCount(catId, activeType) > 0;

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"} font-sans`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-16 overflow-hidden mt-10">
        <div className="absolute top-0 right-0 -mr-32 -mt-32 opacity-20 pointer-events-none">
          <svg width="404" height="404" fill="none" viewBox="0 0 404 404">
            <defs>
              <pattern id="dot-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="2" fill={isDark ? "#ffffff" : "#0B3D2E"} />
              </pattern>
            </defs>
            <rect width="404" height="404" fill="url(#dot-pattern)" />
          </svg>
        </div>

        <div className="mx-auto max-w-[1200px] px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8A762]/10 border border-[#C8A762]/20 text-[#C8A762] text-xs font-bold"
          >
            <PhosphorIcons.Crown size={14} weight="fill" />
            {isRTL ? "المكتبة القانونية الشاملة" : "Comprehensive Legal Library"}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`text-4xl md:text-5xl font-black tracking-tight mb-4 ${isDark ? "text-white" : "text-[#0B3D2E]"}`}
          >
            {isRTL ? "الأنظمة والتشريعات" : "Laws & Regulations"}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`max-w-2xl mx-auto text-sm md:text-base leading-relaxed ${muted}`}
          >
            {isRTL
              ? "مرجعك الشامل والمحدث لكافة الأنظمة والمبادئ القضائية بالمملكة."
              : "Your comprehensive and updated reference for all laws, regulations, and judicial principles."}
          </motion.p>

          {/* Content Type Pills */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            className="mt-5 mx-auto max-w-3xl flex flex-wrap justify-center gap-2"
          >
            {CONTENT_TYPES.map(ct => {
              const CtIcon   = ct.icon;
              const isActive = activeType === ct.id;
              return (
                <button key={ct.id}
                  onClick={() => { setActiveType(ct.id); setPrecMode("all"); setPrecSubject("all"); setPrecSource("all"); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-white text-[#0B3D2E] border-slate-200 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] scale-[1.02]"
                      : isDark
                        ? "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                        : "bg-white/60 border-slate-200/60 text-slate-500 hover:bg-white hover:text-[#0B3D2E] backdrop-blur-sm"
                  }`}
                >
                  <CtIcon size={16} weight={isActive ? "fill" : "duotone"} className={isActive ? "text-[#C8A762]" : ""} />
                  {isRTL ? ct.label : ct.labelEn}
                </button>
              );
            })}
          </motion.div>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mt-6 mx-auto max-w-2xl flex flex-col md:flex-row gap-3"
          >
            <div className="relative flex-1">
              <div className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "right-4" : "left-4"}`}>
                <MagnifyingGlass size={20} className={isDark ? "text-gray-500" : "text-gray-400"} />
              </div>
              <AnimatePresence mode="wait">
                <motion.input
                  key={phIdx}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  placeholder={phList[phIdx]}
                  className={`w-full py-4 px-12 rounded-2xl border text-sm font-medium transition-all focus:ring-2 focus:ring-[#0B3D2E]/20 focus:border-[#0B3D2E] outline-none ${
                    isDark
                      ? "bg-[#161b22] border-[#2d3748] text-white placeholder-gray-500"
                      : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 shadow-sm"
                  }`}
                />
              </AnimatePresence>
            </div>
            <button
              onClick={() => setShowAdvSearch(true)}
              className="shrink-0 flex items-center justify-center gap-2 px-6 py-4 bg-[#0B3D2E] text-white rounded-2xl font-bold text-sm hover:bg-[#0a3328] transition-colors shadow-md"
            >
              <Faders size={20} weight="fill" />
              {isRTL ? "بحث متقدم" : "Advanced"}
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <section className="pb-32 px-4 flex-1">
        <div className="mx-auto max-w-[1200px]">

          {/* User Stats */}
          {isLoggedIn && <RegisteredUserStats isRTL={isRTL} isDark={isDark} />}

          {/* ── Recent Sessions + Smart Folders (logged-in users) ─────── */}
          {isLoggedIn && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <RecentSessions isDark={isDark} isRTL={isRTL} />
              <SmartFolders isDark={isDark} isRTL={isRTL} />
            </div>
          )}

          {/* ── Legislative Updates (all users) ──────────────────────── */}
          <div className="mb-8">
            <LegislativeUpdates isDark={isDark} isRTL={isRTL} />
          </div>

          {/* ── Category Tabs ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            <div className={`inline-flex items-center p-1.5 rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
              {MAIN_CATEGORIES.map(cat => {
                const isActive = activeCat === cat.id;
                const Icon     = cat.icon;
                const count    = cat.id === "all" ? null : catTotalCount(cat.id, activeType);
                return (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                    className={`relative flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      isActive
                        ? isDark ? "text-white" : "text-white bg-[#0B3D2E]"
                        : isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    {isActive && isDark && <motion.div layoutId="cat-active" className="absolute inset-0 bg-white/10 rounded-xl" />}
                    <Icon size={16} weight={isActive ? "fill" : "duotone"} className="relative z-10 hidden sm:block" />
                    <span className="relative z-10">{isRTL ? cat.label : cat.labelEn}</span>
                    {count !== null && count > 0 && (
                      <span className={`relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? "bg-white/20 text-white" : isDark ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-500"
                      }`}>{count}</span>
                    )}
                    {count !== null && count === 0 && (
                      <span className={`relative z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"
                      }`}>{isRTL ? "قريباً" : "Soon"}</span>
                    )}
                  </button>
                );
              })}

              {/* Other dropdown */}
              <div className="relative">
                <button onClick={() => setOtherMenuOpen(!otherMenuOpen)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    isOtherActive
                      ? isDark ? "bg-white/10 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                      : isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <span>{isRTL ? "أخرى" : "Other"}</span>
                  <CaretDown size={14} weight="bold" className={`transition-transform duration-200 ${otherMenuOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {otherMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }} transition={{ duration: 0.15 }}
                      className={`absolute top-full mt-2 w-56 rounded-2xl border shadow-xl z-30 p-2 ${isRTL ? "right-0" : "left-0"} ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}
                    >
                      {OTHER_CATEGORIES.map(cat => {
                        const isSelect = activeCat === cat.id;
                        const count    = catTotalCount(cat.id, activeType);
                        return (
                          <button key={cat.id}
                            onClick={() => { setActiveCat(cat.id); setOtherMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition ${
                              isSelect
                                ? isDark ? "bg-white/10 text-white font-bold" : "bg-gray-100 text-gray-900 font-bold"
                                : isDark ? "text-gray-400 hover:bg-white/5 hover:text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            <span>{isRTL ? cat.label : cat.labelEn}</span>
                            <div className="flex items-center gap-1.5">
                              {count > 0
                                ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{count}</span>
                                : <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"}`}>{isRTL ? "قريباً" : "Soon"}</span>
                              }
                              {isSelect && <Check size={14} weight="bold" />}
                            </div>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* ── Content Area ──────────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">

            {/* ── PRECEDENTS / PRINCIPLES TAB ── */}
            {(activeType === "precedents" || (activeType === "all" && (filteredPrinciples.length > 0 || filteredPrecedents.length > 0))) && activeType === "precedents" && (
              <motion.div key="precedents-section"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              >
                {/* Dual filter bar */}
                <div className="mb-6 space-y-3">
                  {/* Mode toggle: الكل | مبادئ | سوابق */}
                  <div className={`inline-flex p-1 rounded-xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
                    {PREC_MODES.map(m => {
                      const MIcon    = m.icon;
                      const isActive = precMode === m.id;
                      return (
                        <button key={m.id} onClick={() => setPrecMode(m.id)}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            isActive
                              ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                              : isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          <MIcon size={14} weight={isActive ? "fill" : "duotone"} />
                          {isRTL ? m.label : m.labelEn}
                        </button>
                      );
                    })}
                  </div>

                  {/* Subject filter */}
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>
                      {isRTL ? "حسب الموضوع" : "By Subject"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRINCIPLE_SUBJECTS.map(s => (
                        <button key={s.id} onClick={() => setPrecSubject(s.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                            precSubject === s.id
                              ? "bg-[#C8A762] text-[#0B3D2E] shadow-sm scale-105"
                              : isDark ? "bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10" : "bg-white text-slate-500 border border-slate-200/50 hover:bg-slate-50 hover:text-slate-800"
                          }`}
                        >
                          {isRTL ? s.label : PRINCIPLE_SUBJECT_LABELS_EN[s.id]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Source filter — grouped by judicial track */}
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>
                      {isRTL ? "حسب جهة الإصدار" : "By Issuing Authority"}
                    </p>
                    {/* All button */}
                    <button onClick={() => setPrecSource("all")}
                      className={`mb-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                        precSource === "all"
                          ? "bg-[#0B3D2E] text-white shadow-sm scale-105"
                          : isDark ? "bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10" : "bg-white text-slate-500 border border-slate-200/50 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      {isRTL ? "الكل" : "All"}
                    </button>
                    {/* Grouped sources */}
                    {(["القضاء العادي", "ديوان المظالم", "شبه قضائية"] as const).map(group => {
                      const groupSources = PRINCIPLE_SOURCES.filter(s => s.group === group);
                      if (groupSources.length === 0) return null;
                      const groupLabel: Record<string, string> = {
                        "القضاء العادي":  isRTL ? "القضاء العادي" : "Ordinary Judiciary",
                        "ديوان المظالم":  isRTL ? "ديوان المظالم (إداري)" : "Board of Grievances",
                        "شبه قضائية":     isRTL ? "هيئات شبه قضائية" : "Semi-Judicial Bodies",
                      };
                      const groupColors: Record<string, string> = {
                        "القضاء العادي": isDark ? "text-amber-500" : "text-amber-700",
                        "ديوان المظالم": isDark ? "text-blue-400"  : "text-blue-700",
                        "شبه قضائية":    isDark ? "text-purple-400" : "text-purple-700",
                      };
                      return (
                        <div key={group} className="mb-2">
                          <span className={`text-[9px] font-black uppercase tracking-wider block mb-1 ${groupColors[group]}`}>
                            {groupLabel[group]}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {groupSources.map(s => (
                              <button key={s.id} onClick={() => setPrecSource(s.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                                  precSource === s.id
                                    ? "bg-[#0B3D2E] text-white shadow-sm scale-105"
                                    : isDark ? "bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10" : "bg-white text-slate-500 border border-slate-200/50 hover:bg-slate-50 hover:text-slate-800"
                                }`}
                              >
                                {isRTL ? s.label : PRINCIPLE_SOURCE_LABELS_EN[s.id]}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Principles list */}
                {(precMode === "all" || precMode === "principles") && filteredPrinciples.length > 0 && (
                  <div className="mb-6">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
                      <Scales size={13} />
                      {isRTL ? "المبادئ القضائية" : "Judicial Principles"}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>{filteredPrinciples.length}</span>
                    </p>
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {filteredPrinciples.map((p, idx) => (
                          <PrincipleRow key={p.id} p={p} isDark={isDark} idx={idx} isRTL={isRTL} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Precedents list */}
                {(precMode === "all" || precMode === "precedents") && filteredPrecedents.length > 0 && (
                  <div className="mb-6">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
                      <Gavel size={13} />
                      {isRTL ? "السوابق القضائية" : "Judicial Precedents"}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-purple-900/20 text-purple-400" : "bg-purple-50 text-purple-700"}`}>{filteredPrecedents.length}</span>
                    </p>
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {filteredPrecedents.map((pr, idx) => (
                          <PrecedentRow key={pr.id} pr={pr} isDark={isDark} idx={idx} isRTL={isRTL} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {filteredPrinciples.length === 0 && filteredPrecedents.length === 0 && (
                  <EmptyState
                    type="no-results"
                    catId={activeCat}
                    isDark={isDark}
                    isRTL={isRTL}
                    hasSearch={!!q}
                  />
                )}
              </motion.div>
            )}

            {/* ── ORDERS TAB ── */}
            {activeType === "orders" && (
              <motion.div key="orders-section"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              >
                {filteredOrders.length > 0 ? (
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {filteredOrders.map((o, idx) => (
                        <OrderRow key={o.id} o={o} isDark={isDark} idx={idx} isRTL={isRTL} />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <EmptyState
                    type={catHasContent(activeCat) ? "no-results" : "coming-soon"}
                    catId={activeCat}
                    isDark={isDark}
                    isRTL={isRTL}
                    hasSearch={!!q}
                  />
                )}
              </motion.div>
            )}

            {/* ── LAWS TAB or ALL ── */}
            {(activeType === "laws" || activeType === "all") && (
              <motion.div key="laws-section"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              >
                {/* Laws grid */}
                {(activeType === "all" || activeType === "laws") && filteredLaws.length > 0 && (
                  <>
                    {activeType === "all" && (
                      <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
                        <BookOpen size={13} />
                        {isRTL ? "الأنظمة واللوائح" : "Laws & Regulations"}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{filteredLaws.length}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                      <AnimatePresence mode="popLayout">
                        {filteredLaws.map((sys, idx) => (
                          <motion.div key={sys.id}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`group relative rounded-2xl border p-5 transition-all ${
                              sys.free
                                ? `hover:border-[#0B3D2E]/40 cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`
                                : `${isDark ? "bg-[#161b22]/60 border-[#2d3748]/60" : "bg-gray-50 border-gray-200/80"}`
                            }`}
                          >
                            {!sys.free && (
                              <div
                                className={`absolute inset-0 rounded-2xl ${isDark ? "bg-[#0c0f12]/30" : "bg-white/30"} backdrop-blur-[1px] z-10 flex items-center justify-center cursor-pointer`}
                                onClick={() => setShowPaywall(true)}
                              >
                                <div className={`rounded-2xl border px-4 py-2 flex items-center gap-2 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} shadow-lg`}>
                                  <Lock size={16} color="#C8A762" weight="fill" />
                                  <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{isRTL ? "يتطلب اشتراكاً" : "Requires Subscription"}</span>
                                </div>
                              </div>
                            )}
                            <Link href={sys.free ? `/laws/${sys.slug}` : "#"} onClick={e => { if (!sys.free) { e.preventDefault(); setShowPaywall(true); } }}>
                              <div className={!sys.free ? "opacity-40 filter blur-[2px]" : ""}>
                                <div className="flex items-center justify-between mb-4">
                                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{isRTL ? "مُحدث" : "Updated"}</span>
                                  {sys.free && (
                                    <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                                      <Sparkle size={10} weight="fill" />{isRTL ? "متاح" : "FREE"}
                                    </span>
                                  )}
                                </div>
                                <h3 className={`text-lg font-black mb-1.5 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors ${isDark ? "text-white" : "text-gray-900"}`}>
                                  {isRTL ? sys.title : sys.titleEn}
                                </h3>
                                <p className={`text-xs mb-5 line-clamp-2 leading-relaxed ${muted}`}>{isRTL ? sys.desc : sys.descEn}</p>
                                <div className={`grid grid-cols-2 gap-3 mb-5 p-3 rounded-xl border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
                                  <div className="flex flex-col">
                                    <span className={`text-[10px] uppercase tracking-wider ${muted}`}>{isRTL ? "المواد" : "Articles"}</span>
                                    <span className={`text-base font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.articlesCount}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className={`text-[10px] uppercase tracking-wider ${muted}`}>{isRTL ? "الأبواب" : "Chapters"}</span>
                                    <span className={`text-base font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.chaptersCount}</span>
                                  </div>
                                </div>
                                {isLoggedIn && sys.free && (
                                  <div className="mb-4">
                                    <div className="flex justify-between items-center mb-1.5 text-xs">
                                      <span className={muted}>{isRTL ? "نسبة القراءة" : "Progress"}</span>
                                      <span className={`font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{sys.progress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                      <div className="h-full bg-[#0B3D2E] dark:bg-[#C8A762]" style={{ width: `${sys.progress}%` }} />
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between mt-auto">
                                  <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                                    {isRTL ? "تصفح النظام" : "Browse System"}
                                    <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                                  </span>
                                  <span className={`text-[10px] ${muted}`}>{sys.lastUpdated}</span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </>
                )}

                {/* "all" mode: also show principles + orders below */}
                {activeType === "all" && filteredPrinciples.length > 0 && (
                  <div className="mb-8">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
                      <Scales size={13} />
                      {isRTL ? "أبرز المبادئ القضائية" : "Featured Principles"}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>{filteredPrinciples.length}</span>
                    </p>
                    <div className="space-y-3">
                      {filteredPrinciples.slice(0, 3).map((p, idx) => (
                        <PrincipleRow key={p.id} p={p} isDark={isDark} idx={idx} isRTL={isRTL} />
                      ))}
                      {filteredPrinciples.length > 3 && (
                        <button
                          onClick={() => setActiveType("precedents")}
                          className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-[#C8A762] hover:text-[#C8A762]/80" : "text-[#0B3D2E] hover:text-[#0a3328]"} transition-colors`}
                        >
                          {isRTL ? `عرض كل ${filteredPrinciples.length} مبدأ` : `View all ${filteredPrinciples.length} principles`}
                          <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {activeType === "all" && filteredOrders.length > 0 && (
                  <div className="mb-8">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
                      <Scroll size={13} />
                      {isRTL ? "أحدث الأوامر والتعاميم" : "Latest Orders & Circulars"}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{filteredOrders.length}</span>
                    </p>
                    <div className="space-y-3">
                      {filteredOrders.slice(0, 3).map((o, idx) => (
                        <OrderRow key={o.id} o={o} isDark={isDark} idx={idx} isRTL={isRTL} />
                      ))}
                      {filteredOrders.length > 3 && (
                        <button
                          onClick={() => setActiveType("orders")}
                          className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"} transition-colors`}
                        >
                          {isRTL ? `عرض كل ${filteredOrders.length} أوامر وتعاميم` : `View all ${filteredOrders.length} orders`}
                          <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty states */}
                {!hasResults(activeType) && (
                  <EmptyState
                    type={catHasContent(activeCat) ? "no-results" : "coming-soon"}
                    catId={activeCat}
                    isDark={isDark}
                    isRTL={isRTL}
                    hasSearch={!!q}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </section>

      <Footer />
      <FloatingButtons />
      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} isRTL={isRTL} isDark={isDark} />
      <AdvancedSearchModal isOpen={showAdvSearch} onClose={() => setShowAdvSearch(false)} isRTL={isRTL} isDark={isDark} />
    </div>
  );
}

// Components moved to ListItems.tsx
