"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Crown, Stack, Check, Copy, Lock, Sparkle, ChatCircle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { COMPANIES_LAW } from "../data";
import type { LawArticle, JudicialPrinciple, JudicialPrecedent } from "../data";
import { PaywallModal } from "../components/PaywallModal";
import { useDraftCart } from "@/hooks/useDraftCart";
import {
  ArticleBlock,
  ArticleExplainModal,
  DraftDrawer,
  LibraryAI,
  PreambleBlock,
  RightPanel,
  type CartEntry,
} from "./_components";

export default function LawSystemPage() {
  const { isDark, isRTL }  = useTheme();
  const { userType, isLoggedIn } = useUser();

  const [showPaywall, setShowPaywall] = useState(false);
  const [showCart,    setShowCart]    = useState(false);
  const [activeId,    setActiveId]    = useState<string>("art-1");
  const [explainArticle, setExplainArticle] = useState<LawArticle | null>(null);

  // VIEW MODE
  const [viewMode, setViewMode] = useState<"standard" | "integrated">("integrated");

  // Cart: global, backed by localStorage via useDraftCart
  const { cart, setCart } = useDraftCart();

  const law          = COMPANIES_LAW;
  const allArticles  = law.chapters.flatMap(ch => ch.articles);
  const activeArticle = allArticles.find(a => a.id === activeId) ?? null;
  const cartMap      = new Map(cart.map(e => [e.articleId, e]));

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
  }, [getOrCreateEntry]);

  const removeArticle = useCallback((id: string) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === id);
      if (!exists) return prev;
      const hasOthers = exists.isExecRegAdded || exists.principles.length > 0 || exists.precedents.length > 0;
      if (!hasOthers) return prev.filter(e => e.articleId !== id);
      return prev.map(e => e.articleId === id ? { ...e, isArticleAdded: false } : e);
    });
  }, []);

  const addExecReg = useCallback((a: LawArticle) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === a.id);
      if (exists) return prev.map(e => e.articleId === a.id ? { ...e, isExecRegAdded: true } : e);
      return [...prev, { ...getOrCreateEntry(a), isExecRegAdded: true }];
    });
  }, [getOrCreateEntry]);

  const removeExecReg = useCallback((id: string) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === id);
      if (!exists) return prev;
      const hasOthers = exists.isArticleAdded || exists.principles.length > 0 || exists.precedents.length > 0;
      if (!hasOthers) return prev.filter(e => e.articleId !== id);
      return prev.map(e => e.articleId === id ? { ...e, isExecRegAdded: false } : e);
    });
  }, []);

  const clearAll = useCallback(() => setCart([]), []);

  const togglePrinciple = useCallback((articleId: string, p: JudicialPrinciple) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === articleId);
      if (!exists) {
        const art = allArticles.find(a => a.id === articleId)!;
        return [...prev, { ...getOrCreateEntry(art), principles: [p] }];
      }
      const alreadyIn = exists.principles.some((pp: JudicialPrinciple) => pp.id === p.id);
      return prev.map(e => e.articleId !== articleId ? e : {
        ...e, principles: alreadyIn ? e.principles.filter((pp: JudicialPrinciple) => pp.id !== p.id) : [...e.principles, p],
      });
    });
  }, [allArticles, getOrCreateEntry]);

  const togglePrecedent = useCallback((articleId: string, pr: JudicialPrecedent) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === articleId);
      if (!exists) {
        const art = allArticles.find(a => a.id === articleId)!;
        return [...prev, { ...getOrCreateEntry(art), precedents: [pr as any] }];
      }
      const alreadyIn = exists.precedents.some((pp: any) => pp.id === pr.id);
      return prev.map(e => e.articleId !== articleId ? e : {
        ...e, precedents: alreadyIn ? e.precedents.filter((pp: any) => pp.id !== pr.id) : [...e.precedents, pr as any],
      });
    });
  }, [allArticles, getOrCreateEntry]);

  const muted  = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card   = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const lawTitle = isRTL ? law.title : law.titleEn;
  const textStart = isRTL ? "text-right" : "text-left";

  // Copy DRAFT only (not all articles)
  const [copiedDraft, setCopiedDraft] = useState(false);
  const handleCopyDraft = () => {
    if (cart.length === 0) return;
    const text = cart.map(e => {
      let out = "";
      if (e.isArticleAdded) {
        out += `**${e.articleNum} من ${e.lawName}**\n\n${e.articleText}`;
        if (e.execReg) out += `\n\n**${e.execReg.ref}**\n${e.execReg.text}`;
      }
      if (e.principles.length) out += "\n\n[المبادئ القضائية]\n" + e.principles.map((p: JudicialPrinciple) => `- ${p.text} (${p.source})`).join("\n");
      if (e.precedents.length) out += "\n\n[السوابق القضائية]\n" + e.precedents.map((pr: any) => `- ${pr.court} — ${pr.caseNum}\n  ${pr.summary}`).join("\n");
      return out;
    }).join("\n\n" + "─".repeat(40) + "\n\n");
    navigator.clipboard.writeText(text);
    setCopiedDraft(true); setTimeout(() => setCopiedDraft(false), 2000);
  };

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1280px] mx-auto w-full px-3 py-8">

        {/* ── Law header ── */}
        <div className={`${card} ${border} p-4 mb-5`}>
          <div className={`flex items-center gap-2 text-[11px] mb-3 ${muted}`}>
            <Link href="/laws" className="hover:underline">{isRTL ? "المكتبة القانونية" : "Legal Library"}</Link>
            <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
            <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{lawTitle}</span>
          </div>
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div>
              <h1 className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{lawTitle}</h1>
              <p className={`text-[12px] ${muted}`}>{law.issuanceDecree}</p>
            </div>
            <div className="flex gap-2">
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

        {/* ── View Mode Toggle ── */}
        <div className={`mb-5 flex justify-center`}>
          <div className={`inline-flex p-1 rounded-xl transition-all ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}>
            <button
              onClick={() => setViewMode("standard")}
              className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
                viewMode === "standard"
                  ? isDark ? "bg-[#0B3D2E] text-white shadow" : "bg-white text-zinc-900 shadow-sm"
                  : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {isRTL ? "النصوص النظامية فقط" : "Legal Text Only"}
            </button>
            <button
              onClick={() => setViewMode("integrated")}
              className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "integrated"
                  ? isDark ? "bg-[#0B3D2E] text-[#C8A762] shadow" : "bg-white text-amber-700 shadow-sm"
                  : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {isRTL ? "التجربة القانونية المتكاملة" : "Integrated Legal View"}
              <Sparkle size={12} weight={viewMode === "integrated" ? "fill" : "duotone"} />
            </button>
          </div>
        </div>

        {/* ── Dynamic layout ── */}
        <div className="flex gap-4 items-start">

          {/* LEFT: Table of contents */}
          <aside className="hidden lg:block w-52 shrink-0 sticky top-6 z-40">
            <div className={`${card} ${border} p-3`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2.5 ${muted}`}>{isRTL ? "فهرس المواد" : "Articles Index"}</p>
              <div className="space-y-0.5 max-h-[75vh] overflow-y-auto">
                {law.chapters.map((ch, ci) => (
                  <div key={ci}>
                    <p className={`text-[10px] font-bold px-2 py-1 ${muted}`}>{ch.title.replace("الباب الأول: ", "").replace("الفصل الثاني: ", "")}</p>
                    {ch.articles.map(a => (
                      <button
                        key={a.id}
                        onClick={() => { setActiveId(a.id); document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                        className={`w-full ${textStart} flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition ${
                          activeId === a.id
                            ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                            : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                        } ${a.status === "repealed" ? "line-through opacity-50" : ""}`}
                      >
                        {!a.free && <Lock size={9} className="flex-shrink-0" />}
                        <span className="truncate">{a.num}</span>
                        {cartMap.has(a.id) && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762] flex-shrink-0 mr-auto" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* CTA */}
            {userType !== "lawyer" && userType !== "firm" && (
              <div className={`mt-3 ${card} ${border} p-3 text-center`}>
                <Crown size={20} color="#C8A762" weight="fill" className="mx-auto mb-1.5" />
                <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>{isRTL ? "وصول كامل للمكتبة" : "Full library access"}</p>
                <button onClick={() => setShowPaywall(true)} className="w-full py-1.5 bg-[#0B3D2E] text-white text-[11px] font-bold rounded-xl hover:opacity-90 transition">
                  {isRTL ? "اشترك الآن" : "Subscribe"}
                </button>
              </div>
            )}

            {/* Premium Research Tools — Logged-in users only */}
            {isLoggedIn && (
              <ResearchWorkspace isDark={isDark} pageId={law.id || "companies_law"} isRTL={isRTL} />
            )}
          </aside>

          {/* CENTER: Articles */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Preamble */}
            <PreambleBlock text={law.preamble} isDark={isDark} isRTL={isRTL} />

            {law.chapters.map((ch, ci) => (
              <div key={ci} className="space-y-3">
                <div className="flex items-center gap-3 py-1">
                  <div className={`h-px flex-1 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${isDark ? "border-white/[0.07] text-zinc-400 bg-zinc-800/60" : "border-slate-200 text-slate-500 bg-slate-50"}`}>{ch.title}</span>
                  <div className={`h-px flex-1 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                </div>
                {ch.articles.map(article => (
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
                  />
                ))}
              </div>
            ))}
            {/* AI Library Assistant */}
            <LibraryAI isDark={isDark} isRTL={isRTL} />
          </div>

          {/* RIGHT: Principles + Precedents (only in Integrated mode) */}
          <AnimatePresence mode="popLayout">
            {viewMode === "integrated" && (
              <motion.aside
                initial={{ opacity: 0, width: 0, x: isRTL ? -20 : 20 }}
                animate={{ opacity: 1, width: 256, x: 0 }}
                exit={{ opacity: 0, width: 0, x: isRTL ? -20 : 20 }}
                className="hidden xl:block shrink-0 sticky top-6"
              >
                <RightPanel
                  article={activeArticle}
                  isDark={isDark}
                  cart={cartMap.get(activeId ?? "")}
                  onTogglePrinciple={togglePrinciple}
                  onTogglePrecedent={togglePrecedent}
                  locked={activeArticle ? !activeArticle.free : false}
                  onLock={() => setShowPaywall(true)}
                  isRTL={isRTL}
                />
                <div className="mt-3">
                  <Link href="/community/ask" className={`${card} ${border} p-3 flex items-center gap-2.5 hover:opacity-80 transition`}>
                    <div className="w-8 h-8 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0">
                      <ChatCircle size={15} color="#0B3D2E" />
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{isRTL ? "لديك سؤال؟" : "Have a question?"}</p>
                      <p className={`text-[10px] ${muted}`}>{isRTL ? "اسأل المجتمع القانوني" : "Ask the legal community"}</p>
                    </div>
                  </Link>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Footer />

      <FloatingButtons />

      {/* Cart badge */}
      {cart.length > 0 && !showCart && (
        <motion.button initial={{ scale: 0.8 }} animate={{ scale: 1 }} onClick={() => setShowCart(true)}
          className={`fixed bottom-24 ${isRTL ? "left-5" : "right-5"} z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0B3D2E] text-white shadow-2xl`}>
          <Stack size={16} weight="fill" />
          <span className="text-[12px] font-bold">{isRTL ? `${cart.length} مادة` : `${cart.length} items`}</span>
        </motion.button>
      )}

      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCart(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
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
    </div>
  );
}

// ─── Library AI Assistant ───────────────────────────────────────────────────────
