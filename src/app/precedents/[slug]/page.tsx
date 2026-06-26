"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scales, Check, Copy, FileText, Lock, Stack, ArrowRight,
  Plus, Minus, BookOpen, Bookmark, MagnifyingGlass, X
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import PrincipleBlock from "./_principle-block";
import IdentityPanel from "./_identity-panel";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";

// ─── Global Features ─────────────────────────────────────────────────────────
import { useDraftCart } from "@/hooks/useDraftCart";
import { DraftDrawer } from "@/components/laws/DraftDrawer";
import { LibraryAI, CommunityQuestionModal } from "@/app/laws/[slug]/_ai-components";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
import { getLawMeta } from "@/app/laws/law-metadata-map";


function getSelectedTextWithin(containerId: string): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const selectedText = selection.toString().trim();
  if (!selectedText) return "";
  const container = document.getElementById(containerId);
  if (!container) return "";
  const range = selection.getRangeAt(0);
  if (container.contains(range.commonAncestorContainer)) {
    return selectedText;
  }
  return "";
}

function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g,   "$1");
}

// ─── Interfaces ─────────────────────────────────────────────────────────────
import { JudicialPrinciplesSystem, JudicialPrincipleItem } from "@/app/laws/data";

export default function JudicialPrinciplesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { isDark, isRTL } = useTheme();

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [collection, setCollection] = useState<JudicialPrinciplesSystem | null>(null);
  const [loading, setLoading] = useState(true);

  // Reader states
  const [activePrincipleId, setActivePrincipleId] = useState<string>("");
  const [copiedPrincipleId, setCopiedPrincipleId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fontSize, setFontSize] = useState<"normal"|"large"|"xlarge">("normal"); // حجم الخط
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);

  const activePrinciple = useMemo(() => {
    return collection?.principles.find(p => p.id === activePrincipleId) || null;
  }, [collection, activePrincipleId]);

  const handleCopyCitation = () => {
    if (!activePrinciple) return;
    const refText = getReferenceForPrinciple(activePrinciple);
    navigator.clipboard.writeText(refText);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  // Helper functions for citation extraction and normalization
  const getCourtOrIssuer = (p: JudicialPrincipleItem | null) => {
    if (collection?.court && collection.court !== "جهة غير محددة") return collection.court;
    if (p?.issuing_body && p.issuing_body !== "جهة غير محددة") return p.issuing_body;
    if (collection?.title && collection.title !== "مبادئ قضائية") return collection.title;
    return isRTL ? "جهة غير محددة" : "Unspecified Authority";
  };

  const isReferenceText = (txt: string) => txt.includes("الجهة:") || txt.includes("المرجع:") || txt.startsWith("**الجهة:**");

  const cleanTextOfRef = (text: string) => text ? text.split("\n").filter(line => !isReferenceText(line)).join("\n").trim() : "";

  const getReferenceForPrinciple = (p: JudicialPrincipleItem) => {
    if (!p) return "";
    const refPara = p.paragraphs?.find(para => isReferenceText(para.text));
    if (refPara) return refPara.text;
    const refLine = p.text?.split("\n").find(line => isReferenceText(line));
    if (refLine) return refLine;
    if (p.reference) return p.reference;
    const court = getCourtOrIssuer(p);
    return `${isRTL ? "مبدأ رقم" : "Principle #"} (${p.number})، صادر عن (${court})${p.decision_number ? ` ذي الرقم (${p.decision_number})` : ""}${p.session_date ? ` بتاريخ ${p.session_date}` : ""}${collection?.title ? ` - المنشور في (${collection.title})` : ""}${collection?.part ? `، الجزء (${collection.part})` : ""}`;
  };

  // Global cart states
  const { cart, setCart } = useDraftCart();
  const [showCart, setShowCart] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const isScrolling = useRef(false);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  // Intersection Observer: update activePrincipleId on scroll
  useEffect(() => {
    if (!collection) return;
    const ids = collection.principles.map(p => p.id);
    const observers = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrolling.current) {
            setActivePrincipleId(id);
          }
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, [collection]);

  const cartMap = new Map(cart.map(e => [e.articleId, e]));

  const getOrCreateEntry = (p: JudicialPrincipleItem) => {
    const mainParas = p.paragraphs?.filter(para => !isReferenceText(para.text)) || [];
    const mainText = mainParas.length > 0 ? mainParas.map(para => para.text).join("\n") : cleanTextOfRef(p.text);
    const refText = getReferenceForPrinciple(p);
    return {
      articleId: p.id,
      articleNum: `${isRTL ? "مبدأ رقم" : "Principle #"} ${p.number}`,
      articleTitle: p.classification_keywords.slice(0, 3).join(" / ") || (mainText.slice(0, 45) + (mainText.length > 45 ? "..." : "")),
      articleText: refText ? `${mainText}\n\nالمرجع: ${refText}` : mainText,
      lawName: collection?.court ?? "",
      lawSlug: collection?.id ?? slug,
      isArticleAdded: true,
      isExecRegAdded: false,
      principles: [],
      precedents: [],
    };
  };

  const addPrincipleToCart = (p: JudicialPrincipleItem) => {
    setCart(prev => prev.find(e => e.articleId === p.id) ? prev : [...prev, getOrCreateEntry(p)]);
  };

  const removePrincipleFromCart = (id: string) => setCart(prev => prev.filter(e => e.articleId !== id));

  const clearAll = () => setCart([]);
  const removeArticle = (id: string) => setCart(prev => prev.filter(e => e.articleId !== id));


  // Copy DRAFT helper (Word Rich Text)
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

  // Dynamic collection loading — API-backed with JSON fallback
  useEffect(() => {
    async function loadCollectionData() {
      setLoading(true);
      try {
        // Try API first
        const res = await fetch(`/api/library/precedents/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const apiData = await res.json();
          setCollection(apiData as JudicialPrinciplesSystem);
          if (apiData.principles?.[0]) {
            setActivePrincipleId(apiData.principles[0].id);
          }
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[Precedents] API fetch failed, using JSON fallback:', e);
      }

      // Fallback: static JSON imports
      try {
        let data;
        if (slug === "admin-supreme-1442-part1") {
          data = await import("@/constants/precedents/admin-supreme-1442-part1.json");
        } else if (slug === "admin-supreme-1442-part2") {
          data = await import("@/constants/precedents/admin-supreme-1442-part2.json");
        } else if (slug === "admin-supreme-1442-part3") {
          data = await import("@/constants/precedents/admin-supreme-1442-part3.json");
        } else if (slug === "admin-supreme-1443-part1") {
          data = await import("@/constants/precedents/admin-supreme-1443-part1.json");
        } else if (slug === "admin-supreme-1443-part2") {
          data = await import("@/constants/precedents/admin-supreme-1443-part2.json");
        } else if (slug === "admin-supreme-1443-part3") {
          data = await import("@/constants/precedents/admin-supreme-1443-part3.json");
        } else if (slug === "admin-supreme-1443-part4") {
          data = await import("@/constants/precedents/admin-supreme-1443-part4.json");
        } else if (slug === "admin-supreme-1443-part5") {
          data = await import("@/constants/precedents/admin-supreme-1443-part5.json");
        } else if (slug === "admin-supreme-1444-part1") {
          data = await import("@/constants/precedents/admin-supreme-1444-part1.json");
        } else if (slug === "admin-supreme-1444-part2") {
          data = await import("@/constants/precedents/admin-supreme-1444-part2.json");
        } else if (slug === "admin-supreme-1444-part3") {
          data = await import("@/constants/precedents/admin-supreme-1444-part3.json");
        } else if (slug === "admin-supreme-1444-part4") {
          data = await import("@/constants/precedents/admin-supreme-1444-part4.json");
        } else if (slug === "admin-supreme-1444-part5") {
          data = await import("@/constants/precedents/admin-supreme-1444-part5.json");
        } else if (slug === "admin-supreme-1439-1440-1441-part1") {
          data = await import("@/constants/precedents/admin-supreme-1439-1440-1441-part1.json");
        } else if (slug === "admin-supreme-1439-1440-1441-part2") {
          data = await import("@/constants/precedents/admin-supreme-1439-1440-1441-part2.json");
        } else if (slug === "tamyeez") {
          data = await import("@/constants/precedents/tamyeez.json");
        } else if (slug === "supreme-judicial-council") {
          data = await import("@/constants/precedents/supreme-judicial-council.json");
        } else if (slug === "labor-principles-1431-vol1") {
          data = await import("@/constants/precedents/labor-principles-1431-vol1.json");
        } else if (slug === "labor-principles-1431-vol2") {
          data = await import("@/constants/precedents/labor-principles-1431-vol2.json");
        } else if (slug === "labor-principles-1432") {
          data = await import("@/constants/precedents/labor-principles-1432.json");
        } else if (slug === "zakat-tax-2020-2021-j1") {
          data = await import("@/constants/precedents/zakat-tax-2020-2021-j1.json");
        } else if (slug === "zakat-tax-2020-2021-j2") {
          data = await import("@/constants/precedents/zakat-tax-2020-2021-j2.json");
        } else if (slug === "zakat-tax-2022-j3") {
          data = await import("@/constants/precedents/zakat-tax-2022-j3.json");
        } else if (slug === "zakat-tax-2023-j4") {
          data = await import("@/constants/precedents/zakat-tax-2023-j4.json");
        } else if (slug === "zakat-2024") {
          data = await import("@/constants/precedents/zakat-2024.json");
        } else if (slug === "tax-2024") {
          data = await import("@/constants/precedents/tax-2024.json");
        } else if (slug === "customs-2015-2023") {
          data = await import("@/constants/precedents/customs-2015-2023.json");
        } else if (slug === "customs-2024") {
          data = await import("@/constants/precedents/customs-2024.json");
        } else if (slug === "insurance-1438" || slug === "insurance-principles") {
          data = await import("@/constants/precedents/insurance-principles.json");
        } else if (slug === "banking-1443") {
          data = await import("@/constants/precedents/banking-1443.json");
        } else if (slug === "banking-1408-1427") {
          data = await import("@/constants/precedents/banking-1408-1427.json");
        } else if (slug === "commercial-papers") {
          data = await import("@/constants/precedents/commercial-papers.json");
        } else if (slug === "price-adjustment") {
          data = await import("@/constants/precedents/price-adjustment.json");
        } else {
          throw new Error("Unknown slug or dynamic JSON not available: " + slug);
        }
        
        const colData = data.default as JudicialPrinciplesSystem;
        setCollection(colData);
        if (colData.principles[0]) {
          setActivePrincipleId(colData.principles[0].id);
        }
      } catch (e) {
        console.error("Failed to load collection", slug, e);
      }
      setLoading(false);
    }
    loadCollectionData();
  }, [slug]);

  // Track recent sessions
  useEffect(() => {
    if (!slug || !collection?.title) return;
    try {
      const raw = localStorage.getItem("nzamy_recent_sessions");
      const sessions = raw ? JSON.parse(raw) : [];
      const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "precedent"));
      filtered.unshift({
        slug,
        title: collection.title,
        titleEn: collection.title,
        catId: "SA-00",
        type: "precedent"
      });
      localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
    } catch {}
  }, [slug, collection]);

  // Current Document Meta for folder
  const currentDoc = useMemo(() => {
    return {
      slug,
      title: collection?.title ?? "",
      titleEn: collection?.title ?? "",
      catId: "SA-00",
      type: "precedent" as const
    };
  }, [slug, collection]);

  // Filter principles based on search query
  const filteredPrinciples = useMemo(() => {
    if (!collection) return [];
    const q = searchQuery.trim();
    if (!q) return collection.principles;
    
    const normalize = (s: string) =>
      s.replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي").toLowerCase();
    const nq = normalize(q);

    return collection.principles.filter(p => {
      const haystack = normalize([
        p.number,
        p.reference || "",
        p.issuing_body || "",
        p.classification_keywords.join(" "),
        p.text,
        p.paragraphs?.map(para => para.text).join(" ") || ""
      ].join(" "));
      return haystack.includes(nq);
    });
  }, [collection, searchQuery]);

  const handleCopyPrinciple = (p: JudicialPrincipleItem) => {
    const mainParas = p.paragraphs?.filter(para => !isReferenceText(para.text)) || [];
    const mainText = mainParas.length > 0 
      ? mainParas.map(para => para.text).join("\n")
      : cleanTextOfRef(p.text);
      
    const selectedText = getSelectedTextWithin(`principle-card-${p.id}`);
    let textBlock = "";
    let isSelectionCopy = false;
    
    if (selectedText) {
      textBlock = selectedText;
      isSelectionCopy = true;
    } else {
      textBlock = mainText;
    }

    const court = getCourtOrIssuer(p);
    const decisionSuffix = p.decision_number ? ` (قرار رقم ${p.decision_number})` : "";
    const decisionSuffixEn = p.decision_number ? ` (Decision #${p.decision_number})` : "";

    const prefixPlain = isSelectionCopy
      ? (isRTL 
          ? `مقتبس من مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:` 
          : `Excerpt from Principle #${p.number}${decisionSuffixEn} issued by (${court}):`)
      : (isRTL 
          ? `مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:` 
          : `Principle #${p.number}${decisionSuffixEn} issued by (${court}):`);

    const prefixHtml = isSelectionCopy
      ? (isRTL 
          ? `<b>مقتبس من مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:</b>` 
          : `<b>Excerpt from Principle #${p.number}${decisionSuffixEn} issued by (${court}):</b>`)
      : (isRTL 
          ? `<b>مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:</b>` 
          : `<b>Principle #${p.number}${decisionSuffixEn} issued by (${court}):</b>`);

    const refText = getReferenceForPrinciple(p);
    const plain = `${prefixPlain}\n“${stripMd(textBlock)}”\n\nالمرجعية: ${refText}`;
    const html  = `${prefixHtml}<br>“${textBlock.replace(/\n/g, "<br>")}”<br><br><i>المرجعية: ${refText}</i>`;

    try {
      const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${html}</p></body></html>`;
      navigator.clipboard.write([
        new ClipboardItem({
          "text/html":  new Blob([full],  { type: "text/html"  }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      navigator.clipboard.writeText(plain);
    }

    setCopiedPrincipleId(p.id);
    setTimeout(() => setCopiedPrincipleId(""), 2000);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#C8A762] border-t-transparent animate-spin" />
          <p className="text-xs font-semibold">{isRTL ? "جاري تحميل المجموعة..." : "Loading rulings collection..."}</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <p className="text-sm font-bold">{isRTL ? "المجموعة المطلوبة غير موجودة." : "Rulings collection not found."}</p>
      </div>
    );
  }

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const fontClass = { normal: "text-xs md:text-sm", large: "text-sm md:text-base", xlarge: "text-base md:text-lg" }[fontSize];

  const layoutClass = isRTL ? "flex-row-reverse" : "flex-row";

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-8 pt-32 pb-24">
        <div className="h-6" />

        {/* Breadcrumbs */}
        <div className={`flex items-center gap-2 text-[11px] mb-3 print:hidden ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <Link href="/laws" className="hover:underline">
            {isRTL ? "المكتبة القانونية" : "Legal Library"}
          </Link>
          <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
          <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{collection.title}</span>
        </div>

        {/* Header Banner */}
        <div className={`${card} p-6 mb-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {collection.court && collection.court !== "جهة غير محددة" && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8A762]/10 border border-[#C8A762]/20 text-[#C8A762] text-xs font-bold mb-2">
                  <Scales size={12} weight="fill" />
                  {collection.court}
                </div>
              )}
              <h1 className="text-2xl font-black">{collection.title}</h1>
              {((collection.yearHijri && collection.yearHijri !== 0) || (collection.part && collection.part !== 0)) && (
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {collection.yearHijri && collection.yearHijri !== 0 && (
                    <>{isRTL ? "مجموعة مبادئ وقرارات قضائية لعام:" : "Rulings collection for year:"} {collection.yearHijri}هـ</>
                  )}
                  {collection.yearHijri && collection.yearHijri !== 0 && collection.part && collection.part !== 0 && " | "}
                  {collection.part && collection.part !== 0 && (
                    <>{isRTL ? "الجزء:" : "Part:"} {collection.part}</>
                  )}
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center print:hidden">
              <button
                onClick={handleCopyDraft}
                disabled={cart.length === 0}
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
        <div className={`relative z-45 flex flex-wrap items-center justify-between gap-4 mb-4 print:hidden ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
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
                <button key={size} onClick={() => setFontSize(size)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition font-semibold ${
                    fontSize === size
                      ? isDark ? "border-[#C8A762]/40 text-[#C8A762] bg-[#C8A762]/10" : "border-amber-400 text-amber-700 bg-amber-50"
                      : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                  }`}>
                  {size === "normal" ? (isRTL ? "عادي" : "A") : size === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضخم" : "A++")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Sidebar + Reading layout */}
        <div className={isReadingMode ? "flex gap-6 items-start justify-center" : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full"}>
          
          {/* RIGHT COLUMN: Identity Panel AND Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-36 z-40 space-y-3 print:hidden">
              {collection && (
                <IdentityPanel
                  isDark={isDark}
                  isRTL={isRTL}
                  collection={collection}
                  setShowFolderModal={setShowFolderModal}
                />
              )}
              
              {/* Index Panel (TOC) */}
              {collection && (
                <div className={`${card} p-3`}>
                  <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5 mb-2.5">
                    <Stack size={14} className="text-[#C8A762]" weight="fill" />
                    <span>{isRTL ? "فهرس المبادئ" : "Principles Index"}</span>
                  </h3>
                  
                  {/* Scrollable list of principles */}
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
                    {filteredPrinciples.length === 0 ? (
                      <p className={`text-[10px] text-center py-3 ${muted}`}>{isRTL ? "لا توجد نتائج" : "No results"}</p>
                    ) : (
                      filteredPrinciples.map((p) => {
                        const label = `${isRTL ? "مبدأ رقم" : "Principle #"} ${p.number}`;
                        const keywords = p.classification_keywords.slice(0, 2).join(" / ");
                        return (
                          <button
                            key={p.id}
                            onClick={() => {
                              isScrolling.current = true;
                              setActivePrincipleId(p.id);
                              document.getElementById(p.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                              setTimeout(() => { isScrolling.current = false; }, 1000);
                            }}
                            className={`w-full flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg text-[11px] transition text-right ${
                              activePrincipleId === p.id
                                ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                                : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-600 hover:text-slate-800"
                            }`}
                          >
                            <span className="font-bold">{label}</span>
                            {keywords && (
                              <span className={`text-[9px] line-clamp-1 opacity-70`}>{keywords}</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}

          {/* CENTER COLUMN: Principle Reader */}
          <div className={`nzamy-reader-container ${isReadingMode ? "max-w-3xl w-full" : "lg:col-span-6"} min-w-0 space-y-6 w-full`}>

            {/* Quick Search inside Principles */}
            {!isReadingMode && (
              <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition print:hidden ${isDark ? "bg-zinc-800/60 border-white/[0.06]" : "bg-white border-slate-200 shadow-sm"}`}>
                <MagnifyingGlass size={16} className={muted} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={isRTL ? "البحث في نصوص المبادئ أو التصنيفات المرتبطة..." : "Search inside principles or tags..."}
                  dir={isRTL ? "rtl" : "ltr"}
                  className="flex-1 bg-transparent text-xs outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className={`text-xs ${muted} hover:text-zinc-300`}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {filteredPrinciples.map((p) => (
              <PrincipleBlock
                key={p.id}
                p={p}
                isDark={isDark}
                isRTL={isRTL}
                activePrincipleId={activePrincipleId}
                copiedPrincipleId={copiedPrincipleId}
                searchQuery={searchQuery}
                fontSize={fontSize}
                isReadingMode={isReadingMode}
                handleCopyPrinciple={handleCopyPrinciple}
                cartMap={cartMap}
                addPrincipleToCart={addPrincipleToCart}
                removePrincipleFromCart={removePrincipleFromCart}
                getReferenceForPrinciple={getReferenceForPrinciple}
                isReferenceText={isReferenceText}
                cleanTextOfRef={cleanTextOfRef}
                card={card}
                fontClass={fontClass}
              />
            ))}
            {filteredPrinciples.length === 0 && (
              <div className={`${card} p-8 text-center`}>
                <p className="text-xs text-slate-500">{isRTL ? "لا توجد مبادئ مطابقة للبحث." : "No matching principles."}</p>
              </div>
            )}
          </div>

          {/* LEFT COLUMN: AI Assistant & Tools */}
          {!isReadingMode && (() => {
            const meta = getLawMeta(slug);
            return (
              <aside className="hidden lg:block lg:col-span-3 sticky top-36 z-40 space-y-3 print:hidden">
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

                {/* Research Workspace */}
                <ResearchWorkspace isDark={isDark} pageId={`precedent-principles-${slug}`} isRTL={isRTL} />

                {/* Related Documents Card */}
                {meta && ((meta.related_systems && meta.related_systems.length > 0) || 
                  (meta.related_principles && meta.related_principles.length > 0)) && (
                  <div className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"} space-y-3.5`}>
                    <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5">
                      <Stack size={14} className="text-[#C8A762]" weight="fill" />
                      <span>{isRTL ? "وثائق وأنظمة ذات صلة" : "Related Documents"}</span>
                    </h3>
                    
                    {/* Related Systems */}
                    {meta.related_systems && meta.related_systems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                          {isRTL ? "الأنظمة واللوائح المرتبطة:" : "Related Laws & Regs:"}
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {meta.related_systems.map((doc: any, idx: number) => (
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
                    {meta.related_principles && meta.related_principles.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                          {isRTL ? "المبادئ القضائية المتصلة:" : "Related Principles:"}
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {meta.related_principles.map((doc: any, idx: number) => (
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
            );
          })()}
        </div>
      </main>

      <Footer />
      <FloatingButtons
        reportConfig={{ pageSlug: slug, pageType: "precedent" }}
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

      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={collection?.title}
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
