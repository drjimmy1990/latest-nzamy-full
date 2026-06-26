"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Crown, Stack, Check, Copy, BookOpen, Bookmark, Scales, Printer
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import { COMPANIES_LAW } from "../data";
import type { LawArticle, LawSystem } from "../data";
import { getLawMeta, SECTION_COLORS } from "../law-metadata-map";
import { PaywallModal } from "../components/PaywallModal";
import { useDraftCart } from "@/hooks/useDraftCart";
import {
  ArticleBlock,
  ArticleExplainModal,
  CommunityQuestionModal,
  DraftDrawer,
  LibraryAI,
  PreambleBlock,
  type CartEntry,
} from "./_components";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import SidebarPanel from "./_sidebar";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";

export default function LawSystemPage() {
  const { isDark, isRTL }  = useTheme();
  const { userType, isLoggedIn } = useUser();

  const [showFolderModal, setShowFolderModal] = useState(false);
  const params = useParams();
  const slug = (params?.slug as string) ?? "companies-law";

  const [showPaywall, setShowPaywall] = useState(false);
  const [showCart,    setShowCart]    = useState(false);
  const [activeId,    setActiveId]    = useState<string>("art-1");
  const [explainArticle, setExplainArticle] = useState<LawArticle | null>(null);
  const [law, setLaw] = useState<LawSystem>(COMPANIES_LAW);
  const [loadError, setLoadError] = useState(false);
  const [jumpQuery,  setJumpQuery]  = useState("");  // بحث سريع للمواد
  const [fontSize,        setFontSize]        = useState<"normal"|"large"|"xlarge">("normal"); // حجم الخط
  const [showCommunity,   setShowCommunity]   = useState(false); // popup اسأل المجتمع
  const isScrolling = useRef(false);                 // منع تعارض scroll و click
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "law" | "regulation">("all");

  // Cart: global, backed by localStorage via useDraftCart
  const { cart, setCart } = useDraftCart();

  // ── Dynamic slug loading (API-backed) ──────────────────────────────────
  useEffect(() => {
    async function loadLaw() {
      // Keep static fallback for companies-law (backward compat)
      if (slug === "companies-law") { setLaw(COMPANIES_LAW); return; }
      try {
        setLoadError(false);
        const res = await fetch(`/api/library/laws/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          console.warn(`[LawReader] Law "${slug}" not found in API (${res.status}), using fallback`);
          setLoadError(true);
          return;
        }
        const data = await res.json();
        // Transform API response to match LawSystem interface
        setLaw({
          id: data.id || data.slug,
          slug: data.slug,
          title: data.title,
          titleEn: data.titleEn || '',
          issuanceDecree: data.issuanceDecree || '',
          issuanceDate: data.issuanceDate || '',
          source: data.source || '',
          preamble: data.preamble || '',
          chapters: (data.chapters || []).map((ch: { title: string; articles: LawArticle[] }) => ({
            title: ch.title,
            articles: (ch.articles || []).map((a: LawArticle) => ({
              id: a.id,
              num: a.num,
              title: a.title || '',
              status: a.status || 'active',
              free: a.free ?? true,
              text: a.text || '',
              executiveReg: a.executiveReg,
              amendments: a.amendments,
            })),
          })),
          summary: data.summary || '',
        } as LawSystem);
      } catch (err) {
        console.error('[LawReader] Failed to load law:', err);
        setLoadError(true);
      }
    }
    loadLaw();
  }, [slug]);

  // ── Persist law name + track activity ────────────────────────────────────
  useEffect(() => {
    if (slug && law?.title) {
      localStorage.setItem(`nzamy_law_title_${slug}`, law.title);
      try {
        const raw = localStorage.getItem("nzamy_activity");
        const data = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        const weekMs  = 7  * 24 * 60 * 60 * 1000;
        const monthMs = 30 * 24 * 60 * 60 * 1000;
        if (!data.lastWeekReset  || now - data.lastWeekReset  > weekMs)  { data.lawsThisWeek  = 0; data.lastWeekReset  = now; }
        if (!data.lastMonthReset || now - data.lastMonthReset > monthMs) { data.lawsThisMonth = 0; data.lastMonthReset = now; }
        data.lawsThisWeek  = (data.lawsThisWeek  || 0) + 1;
        data.lawsThisMonth = (data.lawsThisMonth || 0) + 1;
        localStorage.setItem("nzamy_activity", JSON.stringify(data));
      } catch {}
    }
  }, [slug, law?.title]);

  // Track this law in recent sessions
  useEffect(() => {
    if (!slug || !law?.title) return;
    try {
      const meta = getLawMeta(slug);
      const raw = localStorage.getItem("nzamy_recent_sessions");
      const sessions = raw ? JSON.parse(raw) : [];
      const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "law"));
      filtered.unshift({
        slug,
        title: law.title,
        titleEn: law.titleEn || law.title,
        catId: meta.section_code ? `SA-${meta.section_code}` : "SA-00",
        type: "law"
      });
      localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
    } catch (e) {
      console.error(e);
    }
  }, [slug, law]);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  // Current Document Meta for folder auto-add
  const currentDoc = useMemo(() => {
    const meta = getLawMeta(slug);
    return {
      slug,
      title: law.title,
      titleEn: law.titleEn || law.title,
      catId: meta.section_code ? `SA-${meta.section_code}` : "SA-00",
      type: "law" as const
    };
  }, [slug, law]);

  const regulationTabLabel = useMemo(() => {
    const meta = getLawMeta(slug);
    if (meta.executive_label_override) {
      return isRTL 
        ? `${meta.executive_label_override} فقط` 
        : `${meta.executive_label_override} Only`;
    }
    let foundLabel = "";
    if (law?.chapters) {
      for (const ch of law.chapters) {
        for (const art of ch.articles) {
          if (art.executiveReg?.ref) {
            const refText = art.executiveReg.ref.toLowerCase();
            if (refText.includes("قواعد") || refText.includes("القواعد")) {
              foundLabel = isRTL ? "القواعد فقط" : "Rules Only";
              break;
            } else if (refText.includes("ضوابط") || refText.includes("الضوابط")) {
              foundLabel = isRTL ? "الضوابط فقط" : "Controls Only";
              break;
            } else if (refText.includes("تعليمات") || refText.includes("التعليمات")) {
              foundLabel = isRTL ? "التعليمات فقط" : "Instructions Only";
              break;
            }
          }
        }
        if (foundLabel) break;
      }
    }
    if (foundLabel) return foundLabel;
    return isRTL ? "اللائحة فقط" : "Regulation Only";
  }, [slug, law, isRTL]);

  // ــ Intersection Observer: تحديث activeId عند السكرول تلقائياً ــــــــــــــــــ
  useEffect(() => {
    const ids = law.chapters.flatMap(ch => ch.articles.map(a => a.id));
    const observers = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrolling.current) {
            setActiveId(id);
          }
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, [law]);

  const lawMeta = getLawMeta(slug);
  const sectionColors = SECTION_COLORS[lawMeta.section_code ?? "00"];

  const allArticles  = law.chapters.flatMap(ch => ch.articles);
  const activeArticle = allArticles.find(a => a.id === activeId) ?? null;
  const cartMap      = new Map(cart.map(e => [e.articleId, e]));

  // فلترة البحث الشاملة — رقم المادة + عنوانها + نص المادة + اللائحة التنفيذية
  const filteredArticles = (() => {
    const q = jumpQuery.trim();
    if (!q) return null; // null = no filter, show full chapter tree
    const normalize = (s: string) =>
      s.replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي").toLowerCase();
    const nq = normalize(q);
    return allArticles.filter(a => {
      const haystack = normalize([
        a.num,
        a.title ?? "",
        a.text,
        a.executiveReg?.text ?? "",
        a.executiveReg?.ref  ?? "",
        a.id,
      ].join(" "));
      return haystack.includes(nq);
    });
  })();

  const getOrCreateEntry = useCallback((a: LawArticle): CartEntry => ({
    articleId: a.id, articleNum: a.num, articleTitle: a.title, articleText: a.text,
    lawName: law.title, lawSlug: law.slug,
    execReg: a.executiveReg ? { ref: a.executiveReg.ref, text: a.executiveReg.text } : undefined,
    principles: [], precedents: [], isArticleAdded: false, isExecRegAdded: false,
  }), [law.title, law.slug]);

  const addArticle = useCallback((a: LawArticle) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === a.id);
      if (exists) return prev.map(e => e.articleId === a.id ? { ...e, isArticleAdded: true } : e);
      return [...prev, { ...getOrCreateEntry(a), isArticleAdded: true }];
    });
  }, [getOrCreateEntry, setCart]);

  const removeArticle = useCallback((id: string) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === id);
      if (!exists) return prev;
      const hasOthers = exists.isExecRegAdded || exists.principles.length > 0 || exists.precedents.length > 0;
      if (!hasOthers) return prev.filter(e => e.articleId !== id);
      return prev.map(e => e.articleId === id ? { ...e, isArticleAdded: false } : e);
    });
  }, [setCart]);

  const addExecReg = useCallback((a: LawArticle) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === a.id);
      if (exists) return prev.map(e => e.articleId === a.id ? { ...e, isExecRegAdded: true } : e);
      return [...prev, { ...getOrCreateEntry(a), isExecRegAdded: true }];
    });
  }, [getOrCreateEntry, setCart]);

  const removeExecReg = useCallback((id: string) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === id);
      if (!exists) return prev;
      const hasOthers = exists.isArticleAdded || exists.principles.length > 0 || exists.precedents.length > 0;
      if (!hasOthers) return prev.filter(e => e.articleId !== id);
      return prev.map(e => e.articleId === id ? { ...e, isExecRegAdded: false } : e);
    });
  }, [setCart]);

  const clearAll = useCallback(() => setCart([]), [setCart]);

  const muted  = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card   = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const lawTitle = isRTL ? law.title : law.titleEn;
  const fontClass = { normal: "text-[13px]", large: "text-[15px]", xlarge: "text-[17px]" }[fontSize];

  // Copy DRAFT — HTML Clipboard (Bold في Word)
  const [copiedDraft, setCopiedDraft] = useState(false);
  const handleCopyDraft = async () => {
    if (cart.length === 0) return;
    const base = (name: string) => name.replace(/\s*ولوائحه التنفيذية.*/, "").trim();
    const plainParts = cart.map(e => {
      const parts: string[] = [];
      if (e.isArticleAdded) {
        const bn = base(e.lawName);
        parts.push(`${e.articleNum} من (${bn}):\n"${e.articleText}"`);
        if (e.execReg) parts.push(`${e.execReg.ref} من اللائحة التنفيذية ل (${bn}):\n"${e.execReg.text}"`);
      }
      return parts.join("\n\n");
    }).filter(Boolean).join("\n\n" + "═".repeat(40) + "\n\n");
    const htmlParts = cart.map(e => {
      const parts: string[] = [];
      if (e.isArticleAdded) {
        const bn = base(e.lawName);
        parts.push(`<b>${e.articleNum} من (${bn}):</b><br>“${e.articleText.replace(/\n/g, "<br>")}”`);
        if (e.execReg) parts.push(`<b>${e.execReg.ref} من اللائحة التنفيذية ل (${bn}):</b><br>“${e.execReg.text.replace(/\n/g, "<br>")}”`);
      }
      return parts.join("<br><br>");
    }).filter(Boolean).join(`<br><br>${"═".repeat(40)}<br><br>`);
    try {
      const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${htmlParts}</p></body></html>`;
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([full], { type: "text/html" }), "text/plain": new Blob([plainParts], { type: "text/plain" }) }),
      ]);
    } catch { navigator.clipboard.writeText(plainParts); }
    setCopiedDraft(true); setTimeout(() => setCopiedDraft(false), 2000);
  };

  const layoutClass = "flex-row";

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1280px] mx-auto w-full px-3 py-8 pt-32 pb-24">

        <div className="h-6" />

        {/* ── Law header ── */}
        <div className={`${card} ${border} p-4 mb-5`}>
          <div className={`flex items-center gap-2 text-[11px] mb-3 print:hidden ${muted}`}>
            <Link href="/laws" className="hover:underline">{isRTL ? "المكتبة القانونية" : "Legal Library"}</Link>
            <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
            <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{lawTitle}</span>
          </div>
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div>
              <h1 className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{lawTitle}</h1>
              <p className={`text-[12px] ${muted}`}>{law.issuanceDecree}</p>
            </div>
            <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                    isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                  title={isRTL ? "طباعة النظام" : "Print Law"}
                >
                  <Printer size={11} />
                  <span>{isRTL ? "طباعة" : "Print"}</span>
                </button>
                <button
                  onClick={handleCopyDraft}
                  disabled={cart.length === 0}
                title={cart.length === 0 ? (isRTL ? "أضف مواد للمسودة أولاً" : "Add articles to the draft first") : (isRTL ? "نسخ محتوى المسودة" : "Copy draft content")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                  cart.length === 0
                    ? isDark ? "border-white/[0.04] text-zinc-700 cursor-not-allowed" : "border-slate-100 text-slate-300 cursor-not-allowed"
                    : isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}>
                {copiedDraft ? <><Check size={11} className="text-emerald-500" /> {isRTL ? "تم" : "Copied"}</> : <><Copy size={11} /> {isRTL ? "نسخ المسودة" : "Copy Draft"}</>}
                {cart.length > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>{cart.length}</span>}
              </button>
              <button onClick={() => setShowCart(true)} className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
                <Stack size={11} /> {isRTL ? "المسودة" : "Draft"}
                {cart.length > 0 && (
                  <span className={`absolute -top-1.5 ${isRTL ? "-left-1.5" : "-right-1.5"} w-4 h-4 rounded-full bg-[#C8A762] text-[#0B3D2E] text-[9px] font-black flex items-center justify-center`}>{cart.length}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ــ شريط وضع القراءة وحجم الخط والعودة ــ */}
        <div className={`relative z-45 flex flex-wrap items-center justify-between gap-4 mb-3 print:hidden ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <Link
            href="/laws"
            className={`inline-flex items-center gap-2 text-xs font-bold transition-all ${
              isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-[#0B3D2E]"
            }`}
          >
            <ArrowRight size={14} className={isRTL ? "" : "rotate-180"} />
            {isRTL ? "العودة إلى المكتبة القانونية" : "Back to Legal Library"}
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsReadingMode(!isReadingMode)}
              className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                isReadingMode
                  ? isDark
                    ? "bg-[#C8A762] text-[#0B3D2E] border-[#C8A762]"
                    : "bg-amber-100 text-amber-800 border-amber-300 shadow-sm"
                  : isDark
                  ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <BookOpen size={13} weight={isReadingMode ? "fill" : "regular"} />
              <span>{isRTL ? (isReadingMode ? "الوضع العادي" : "وضع القراءة") : (isReadingMode ? "Standard Mode" : "Reading Mode")}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium">{isRTL ? "حجم الخط:" : "Font:"}</span>
              {(["normal", "large", "xlarge"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition font-semibold ${
                    fontSize === size
                      ? isDark ? "border-[#C8A762]/40 text-[#C8A762] bg-[#C8A762]/10" : "border-amber-400 text-amber-700 bg-amber-50"
                      : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {size === "normal" ? (isRTL ? "عادي" : "A") : size === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضغم" : "A++")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Dynamic layout ── */}
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${isReadingMode ? "justify-center" : ""}`}>

          {/* RIGHT COLUMN: Identity Panel AND Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-6 z-40 space-y-3 print:hidden">
              {/* Identity Card */}
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                law={law}
                lawMeta={lawMeta}
                sectionColors={sectionColors}
                activeId={activeId}
                setActiveId={setActiveId}
                jumpQuery={jumpQuery}
                setJumpQuery={setJumpQuery}
                filteredArticles={filteredArticles}
                cartMap={cartMap}
                isScrolling={isScrolling}
                setShowFolderModal={setShowFolderModal}
                setShowPaywall={setShowPaywall}
                userType={userType}
                mode="identity"
                viewMode={viewMode}
              />
              {/* Index Panel */}
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                law={law}
                lawMeta={lawMeta}
                sectionColors={sectionColors}
                activeId={activeId}
                setActiveId={setActiveId}
                jumpQuery={jumpQuery}
                setJumpQuery={setJumpQuery}
                filteredArticles={filteredArticles}
                cartMap={cartMap}
                isScrolling={isScrolling}
                setShowFolderModal={setShowFolderModal}
                setShowPaywall={setShowPaywall}
                userType={userType}
                mode="index"
                viewMode={viewMode}
              />
            </aside>
          )}

          {/* CENTER COLUMN: Articles list */}
          <div className={`nzamy-reader-container col-span-12 min-w-0 space-y-4 ${isReadingMode ? "max-w-3xl mx-auto w-full" : "lg:col-span-6"}`}>
            {/* View Mode Switcher (Tabs) */}
            {!isReadingMode && (
              <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"} w-fit mb-4 print:hidden`}>
                <button
                  onClick={() => setViewMode("all")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "all"
                      ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {isRTL ? "عرض الكل" : "All View"}
                </button>
                <button
                  onClick={() => setViewMode("law")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "law"
                      ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {isRTL ? "النظام فقط" : "Law Only"}
                </button>
                {(lawMeta.document_type === "نظام_ولائحة" || law.chapters.some(ch => ch.articles.some(a => a.executiveReg))) && (
                  <button
                    onClick={() => setViewMode("regulation")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === "regulation"
                        ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                        : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {regulationTabLabel}
                  </button>
                )}
              </div>
            )}

            {/* Preamble */}
            <PreambleBlock
              text={law.preamble}
              regulationPreamble={(law as any).regulationPreamble}
              isDark={isDark}
              isRTL={isRTL}
              viewMode={viewMode}
            />

            {viewMode === "regulation" ? (
              <div className="space-y-4">
                {(() => {
                  const regArticles = law.chapters
                    .flatMap(ch => ch.articles)
                    .filter(a => a.executiveReg);
                  const visibleRegArts = filteredArticles
                    ? regArticles.filter(a => filteredArticles.some(f => f.id === a.id))
                    : regArticles;

                  return visibleRegArts.map(article => (
                    <ArticleBlock
                      key={article.id}
                      article={article}
                      lawName={lawTitle}
                      isDark={isDark}
                      entry={cartMap.get(article.id)}
                      onAddArticle={addArticle}
                      onRemoveArticle={removeArticle}
                      onAddExecReg={addExecReg}
                      onRemoveExecReg={removeExecReg}
                      onActive={setActiveId}
                      isActive={activeId === article.id}
                      showPaywall={() => setShowPaywall(true)}
                      onExplain={(a) => setExplainArticle(a)}
                      isRTL={isRTL}
                      fontClass={fontClass}
                      isReadingMode={isReadingMode}
                      viewMode={viewMode}
                    />
                  ));
                })()}
              </div>
            ) : (
              law.chapters.map((ch, ci) => {
                const visibleArts = filteredArticles
                  ? ch.articles.filter(a => filteredArticles.some(f => f.id === a.id))
                  : ch.articles;
                
                const displayedArts = visibleArts;

                if (displayedArts.length === 0) return null;
                return (
                  <div key={ci} className="space-y-3">
                    {!filteredArticles && (
                      <div className="flex items-center gap-3 py-1">
                        <div className={`h-px flex-1 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${isDark ? "border-white/[0.07] text-zinc-400 bg-zinc-800/60" : "border-slate-200 text-slate-500 bg-slate-50"}`}>{ch.title}</span>
                        <div className={`h-px flex-1 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                      </div>
                    )}
                    {displayedArts.map(article => (
                      <ArticleBlock
                        key={article.id}
                        article={article}
                        lawName={lawTitle}
                        isDark={isDark}
                        entry={cartMap.get(article.id)}
                        onAddArticle={addArticle}
                        onRemoveArticle={removeArticle}
                        onAddExecReg={addExecReg}
                        onRemoveExecReg={removeExecReg}
                        onActive={setActiveId}
                        isActive={activeId === article.id}
                        showPaywall={() => setShowPaywall(true)}
                        onExplain={(a) => setExplainArticle(a)}
                        isRTL={isRTL}
                        fontClass={fontClass}
                        isReadingMode={isReadingMode}
                        viewMode={viewMode}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* LEFT COLUMN: AI Tools and related documents */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-6 z-40 space-y-3 print:hidden">
              <button
                onClick={() => setShowCommunity(true)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold transition ${
                  isDark ? "border-indigo-500/30 text-indigo-300 bg-indigo-900/10 hover:bg-indigo-900/20" : "border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {isRTL ? "اسأل في المجتمع القانوني" : "Ask Legal Community"}
              </button>
              <LibraryAI isDark={isDark} isRTL={isRTL} />

              <ResearchWorkspace isDark={isDark} pageId={law.id || slug} isRTL={isRTL} />

              {/* Related Documents Card */}
              {((lawMeta.related_systems && lawMeta.related_systems.length > 0) || 
                (lawMeta.related_principles && lawMeta.related_principles.length > 0)) && (
                <div className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"} space-y-3.5`}>
                  <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5">
                    <Stack size={14} className="text-[#C8A762]" weight="fill" />
                    <span>{isRTL ? "وثائق وأنظمة ذات صلة" : "Related Documents"}</span>
                  </h3>
                  
                  {/* Related Systems */}
                  {lawMeta.related_systems && lawMeta.related_systems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                        {isRTL ? "الأنظمة واللوائح المرتبطة:" : "Related Laws & Regs:"}
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {lawMeta.related_systems.map((doc, idx) => (
                          <Link
                            key={idx}
                            href={`/laws/${doc.slug}`}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                              isDark 
                                ? "border-white/5 hover:border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white" 
                                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#0B3D2E]"
                            }`}
                          >
                            <BookOpen size={13} className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                            <span className="leading-tight">{doc.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Principles */}
                  {lawMeta.related_principles && lawMeta.related_principles.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                        {isRTL ? "المبادئ القضائية المتصلة:" : "Related Principles:"}
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {lawMeta.related_principles.map((doc, idx) => (
                          <Link
                            key={idx}
                            href={`/precedents/${doc.slug}`}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                              isDark 
                                ? "border-white/5 hover:border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white" 
                                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#0B3D2E]"
                            }`}
                          >
                            <Scales size={13} className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                            <span className="leading-tight">{doc.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}

        </div>
      </main>

      <Footer />

      <FloatingButtons
        reportConfig={{ pageSlug: slug, pageType: "law" }}
        cartCount={cart.length}
        onCartClick={() => setShowCart(true)}
      />

      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCart(false)} className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[2px]" />
            <DraftDrawer cart={cart} onRemoveArticle={removeArticle} onClearAll={clearAll} onClose={() => setShowCart(false)} isDark={isDark} isRTL={isRTL} />
          </>
        )}
      </AnimatePresence>

      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} isRTL={isRTL} isDark={isDark} />

      <AnimatePresence>
        {explainArticle && (
          <ArticleExplainModal
            article={explainArticle}
            isDark={isDark}
            onClose={() => setExplainArticle(null)}
            isRTL={isRTL}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={law?.title}
            onClose={() => setShowCommunity(false)}
          />
        )}
      </AnimatePresence>

      <FolderSelectionModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        currentDoc={currentDoc}
      />
      <PrintWatermark isRTL={isRTL} />
    </div>
  );
}
