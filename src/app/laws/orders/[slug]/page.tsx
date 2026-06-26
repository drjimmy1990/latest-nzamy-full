"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Crown, Scroll, Check, Copy, FolderSimple,
  TextT, NotePencil, Bookmark, Trash, CheckCircle, Warning, Lock,
  Plus, X, FolderSimplePlus, MagnifyingGlass, Gavel, BookOpen, Stack, Scales, Printer
} from "@phosphor-icons/react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import { LibraryAI, CommunityQuestionModal } from "@/app/laws/[slug]/_ai-components";
import { getLawMeta } from "@/app/laws/law-metadata-map";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { DEMO_ORDERS, DemoOrder } from "../../demo-data";
import { ISSUER_MAP } from "../../components/ListItems";
import { useDraftCart } from "@/hooks/useDraftCart";
import { SmartFolder } from "../../components/SmartFolders";
import { DraftDrawer } from "@/components/laws/DraftDrawer";
import SidebarPanel from "./_sidebar";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";

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

function formatBold(text: string): string {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>");
}

const FOLDER_COLORS = [
  { id: "emerald", hex: "#10b981" },
  { id: "sky",     hex: "#0ea5e9" },
  { id: "amber",   hex: "#f59e0b" },
  { id: "rose",    hex: "#f43f5e" },
  { id: "violet",  hex: "#8b5cf6" },
  { id: "slate",   hex: "#64748b" },
  { id: "orange",  hex: "#f97316" },
  { id: "teal",    hex: "#14b8a6" },
];

export default function OrderReaderPage() {
  const { isDark, isRTL } = useTheme();
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const [showCommunity, setShowCommunity] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const lawMeta = getLawMeta(slug);
  
  // Notes states
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  const [showFolderModal, setShowFolderModal] = useState(false);

  // Draft Cart
  const { cart, setCart } = useDraftCart();
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);

  const clearAll = () => setCart([]);
  const removeArticle = (id: string) => setCart(prev => prev.filter(e => e.articleId !== id));

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

  const muted  = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card   = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;

  // ── Load order data (API-backed with demo fallback) ──
  useEffect(() => {
    if (!slug) return;
    async function loadOrder() {
      // Try API first
      try {
        const res = await fetch(`/api/library/decrees/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data as DemoOrder);
          trackSession(data);
          return;
        }
      } catch (e) {
        console.warn('[OrderReader] API fetch failed, using demo fallback:', e);
      }
      // Fallback to demo data
      const found = DEMO_ORDERS.find(o => o.id === slug);
      if (found) {
        setOrder(found);
        trackSession(found);
      }
    }

    function trackSession(found: DemoOrder) {
      // Load sticky note
      const savedNote = localStorage.getItem(`sticky_note_text_order-${slug}`);
      if (savedNote) setNoteText(savedNote);

      // Track this order/circular in recent sessions
      try {
        const raw = localStorage.getItem("nzamy_recent_sessions");
        const sessions = raw ? JSON.parse(raw) : [];
        const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "order"));
        filtered.unshift({
          slug,
          title: found.title,
          titleEn: found.title,
          catId: found.cat,
          type: "order"
        });
        localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
      } catch (e) {
        console.error(e);
      }
    }

    loadOrder();
  }, [slug]);

  const [activeArtId, setActiveArtId] = useState<string>("");
  const isScrolling = useRef(false);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  // Intersection Observer: update activeArtId on scroll
  useEffect(() => {
    if (!order || !order.articles || order.articles.length === 0) return;
    const ids = order.articles.map((_, idx) => `order-${order.id}-art-${idx}`);
    const observers = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrolling.current) {
            setActiveArtId(id);
          }
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, [order]);



  // ── Save note ──
  const handleSaveNote = () => {
    if (order) {
      localStorage.setItem(`sticky_note_text_order-${order.id}`, noteText);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }
  };

  const handleClearNote = () => {
    if (order) {
      localStorage.removeItem(`sticky_note_text_order-${order.id}`);
      setNoteText("");
    }
  };

  // HTML clipboard conversion functions
  const md2html = (s: string) => s
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g,   "<b>$1</b>")
    .replace(/\n/g, "<br>");

  async function copyRich(html: string, plain: string) {
    try {
      const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${html}</p></body></html>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html":  new Blob([full],  { type: "text/html"  }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      navigator.clipboard.writeText(plain);
    }
  }

  const handleCopyArt = (art: string, idx: number, itemUniqueId: string) => {
    if (!order) return;
    const selectedText = getSelectedTextWithin(itemUniqueId);
    let textBlock = "";
    
    if (selectedText) {
      textBlock = selectedText;
    } else {
      textBlock = art;
    }
    
    const docTypeLabel = order.type === "royal" ? (isRTL ? "أمر ملكي" : "Royal Decree") : 
                         order.type === "cabinet" ? (isRTL ? "قرار مجلس الوزراء" : "Cabinet Order") : 
                         (isRTL ? "تعميم" : "Circular");
                         
    const prefixPlain = isRTL
      ? `الصفحة ${idx + 1} من ${docTypeLabel} رقم (${order.ref}) ونصه:`
      : `Page ${idx + 1} of ${docTypeLabel} Ref (${order.ref}), text:`;
      
    const prefixHtml = isRTL
      ? `<b>الصفحة ${idx + 1} من ${docTypeLabel} رقم (${order.ref}) ونصه:</b>`
      : `<b>Page ${idx + 1} of ${docTypeLabel} Ref (${order.ref}), text:</b>`;
      
    const plain = `${prefixPlain}\n“${stripMd(textBlock)}”`;
    const html  = `${prefixHtml}<br>“${md2html(textBlock)}”`;
    
    copyRich(html, plain);
    setCopiedId(itemUniqueId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Add to Draft Cart ──
  const handleAddToDraft = (text: string, index: number) => {
    if (!order) return;
    const itemUniqueId = `order-${order.id}-art-${index}`;
    
    setCart(prev => {
      const exists = prev.find(item => item.articleId === itemUniqueId);
      if (exists) return prev;
      return [
        ...prev,
        {
          articleId: itemUniqueId,
          articleNum: `${isRTL ? "الصفحة" : "Page"} ${index + 1}`,
          articleTitle: order.title,
          articleText: text,
          lawName: order.ref,
          lawSlug: `orders/${order.id}`,
          isArticleAdded: true,
          isExecRegAdded: false,
          principles: [],
          precedents: [],
        }
      ];
    });
    setCopiedDraftId(itemUniqueId);
    setTimeout(() => setCopiedDraftId(null), 2000);
  };

  // ── Current Document Meta for folder auto-add ──
  const currentDoc = useMemo(() => {
    if (!order) return null;
    return {
      slug: order.id,
      title: order.title,
      titleEn: order.title,
      catId: order.cat,
      type: "order" as const
    };
  }, [order]);

  if (!order) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <Warning size={40} className="text-amber-500 mb-4" />
        <p className="text-sm font-bold">{isRTL ? "لم يتم العثور على المستند المطلوب." : "Document not found."}</p>
        <Link href="/laws" className="mt-4 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-xs font-bold">
          {isRTL ? "العودة للمكتبة" : "Back to Library"}
        </Link>
      </div>
    );
  }

  // ── Custom colors based on issuer ──
  const isRoyal = order.type === "royal";
  const themeClass = isRoyal
    ? isDark ? "border-[#C8A762]/30 text-[#C8A762]" : "border-[#C8A762] text-[#C8A762]"
    : isDark ? "border-emerald-500/20 text-emerald-400" : "border-emerald-200 text-[#0B3D2E]";

  const fontSizeClass = 
    fontSize === "large" ? "text-[16px] leading-[2.1]" : 
    fontSize === "xlarge" ? "text-[18px] leading-[2.3]" : 
    "text-[14px] leading-[1.8]";

  const issuerLabel = ISSUER_MAP[order.issuer]?.[isRTL ? "ar" : "en"] || order.issuer;

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"} font-sans`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 pt-32 pb-24">
        
        <div className="h-6" />

        {/* ── Order/Circular header banner ── */}
        <div className={`${card} ${border} p-4 mb-5`}>
          <div className={`flex items-center gap-2 text-[11px] mb-3 print:hidden ${muted}`}>
            <Link href="/laws" className="hover:underline">{isRTL ? "المكتبة القانونية" : "Legal Library"}</Link>
            <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
            <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{issuerLabel}</span>
          </div>
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div>
              <h1 className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{order.title}</h1>
              <p className={`text-[12px] ${muted}`}>
                {order.ref} • {order.date}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                  isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
                title={isRTL ? "طباعة القرار" : "Print Order"}
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
              </button>
            </div>
          </div>
        </div>

        {/* ── شريط وضع القراءة وحجم الخط والعودة ── */}
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
                  {size === "normal" ? (isRTL ? "عادي" : "A") : size === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضخم" : "A++")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${isReadingMode ? "justify-center" : ""}`}>
          
          {/* RIGHT COLUMN: Identity Panel AND Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-6 z-40 space-y-3 print:hidden">
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                order={order}
                issuerLabel={issuerLabel}
                fontSize={fontSize}
                setFontSize={setFontSize}
                noteText={noteText}
                setNoteText={setNoteText}
                noteSaved={noteSaved}
                handleSaveNote={handleSaveNote}
                handleClearNote={handleClearNote}
                setShowFolderModal={setShowFolderModal}
              />

              {/* Clauses Index Panel */}
              {order.articles && order.articles.length > 1 && (
                <div className={`${card} p-3`}>
                  <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5 mb-2.5">
                    <Stack size={14} className="text-[#C8A762]" weight="fill" />
                    <span>{isRTL ? "صفحات المستند" : "Document Pages"}</span>
                  </h3>
                  
                  {/* Scrollable list of clauses */}
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
                    {order.articles.map((art, idx) => {
                      const itemUniqueId = `order-${order.id}-art-${idx}`;
                      const label = isRTL ? `الصفحة ${idx + 1}` : `Page ${idx + 1}`;
                      const snippet = art.slice(0, 45) + (art.length > 45 ? "..." : "");
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            isScrolling.current = true;
                            setActiveArtId(itemUniqueId);
                            document.getElementById(itemUniqueId)?.scrollIntoView({ behavior: "smooth", block: "center" });
                            setTimeout(() => { isScrolling.current = false; }, 1000);
                          }}
                          className={`w-full flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg text-[11px] transition text-right ${
                            activeArtId === itemUniqueId
                              ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                              : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          <span className="font-bold">{label}</span>
                          <span className="text-[9px] line-clamp-1 opacity-70">{snippet}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </aside>
          )}

          {/* CENTER COLUMN: Document Content Reading Area */}
          <div className={`nzamy-reader-container col-span-12 min-w-0 space-y-6 ${isReadingMode ? "max-w-3xl mx-auto w-full" : "lg:col-span-6"}`}>
            
            {/* Header Card */}
            <div className={`p-6 md:p-8 rounded-[2rem] border shadow-sm ${
              isRoyal
                ? isDark ? "bg-[#161b22]/40 border-[#C8A762]/30" : "bg-white border-[#C8A762]/40"
                : isDark ? "bg-[#161b22]/40 border-white/[0.06]" : "bg-white border-gray-200"
            }`}>

              {/* Summary */}
              <div className={`p-4 rounded-2xl mb-6 text-xs leading-relaxed ${
                isDark ? "bg-white/[0.02]" : "bg-slate-50"
              } border border-dashed ${isDark ? "border-white/10" : "border-gray-200"} whitespace-pre-wrap`}>
                <span className="font-bold text-[#C8A762]">{isRTL ? "موجز المستند:\n" : "Document Summary:\n"}</span>
                <span className={isDark ? "text-gray-300" : "text-gray-600"} dangerouslySetInnerHTML={{ __html: formatBold(order.summary || "") }}></span>
              </div>

              {/* Preamble */}
              {order.preamble && (
                <div className="mb-8 print:hidden">
                  <h3 className={`text-xs font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isRTL ? "الديباجة التمهيدية" : "Preamble"}
                  </h3>
                  <div className={`p-5 rounded-2xl border text-xs leading-loose whitespace-pre-wrap font-serif ${
                    isDark ? "bg-[#0c0f12]/50 border-white/5 text-zinc-300" : "bg-slate-50/50 border-slate-100 text-gray-700"
                  }`}>
                    {order.preamble}
                  </div>
                </div>
              )}

              {/* Clauses/Articles */}
              <div className="space-y-4">
                <h3 className={`text-xs font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {isRTL ? "صفحات القرار والتعميم" : "Document Pages"}
                </h3>
                {order.articles && order.articles.length > 0 ? (
                  order.articles.map((art, idx) => {
                    const itemUniqueId = `order-${order.id}-art-${idx}`;
                    const isAdded = cart.some(item => item.articleId === itemUniqueId);
                    return (
                      <div key={idx} id={itemUniqueId} className={`nzamy-reader-block p-5 rounded-2xl border transition-all ${
                        isDark 
                          ? "bg-[#0c0f12]/30 border-white/5 hover:border-white/10 text-zinc-300" 
                          : "bg-white border-slate-100 hover:border-slate-200 text-gray-700 shadow-sm"
                      } ${activeArtId === itemUniqueId ? (isDark ? "border-[#C8A762]/50" : "border-amber-400") : ""}`}>
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                            isRoyal ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {isRTL ? `الصفحة ${idx + 1}` : `Page ${idx + 1}`}
                          </span>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-1 print:hidden">
                            <button
                              onClick={() => handleCopyArt(art, idx, itemUniqueId)}
                              className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-gray-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-gray-800"}`}
                              title={isRTL ? "نسخ النص" : "Copy text"}
                            >
                              {copiedId === itemUniqueId ? (
                                <Check size={14} className="text-emerald-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                            <button
                              onClick={() => handleAddToDraft(art, idx)}
                              className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-gray-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-gray-800"}`}
                              title={isRTL ? "إضافة للمسودة" : "Add to draft"}
                            >
                              {copiedDraftId === itemUniqueId ? (
                                <CheckCircle size={14} className="text-emerald-500" />
                              ) : isAdded ? (
                                <CheckCircle size={14} weight="fill" className="text-emerald-600" />
                              ) : (
                                <Plus size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                        <p className={`${fontSizeClass} whitespace-pre-wrap font-sans`} dangerouslySetInnerHTML={{ __html: formatBold(art) }}></p>
                      </div>
                    );
                  })
                ) : (
                  <div className={`p-5 rounded-2xl border ${fontSizeClass} leading-relaxed ${
                    isDark ? "bg-[#0c0f12]/30 border-white/5 text-zinc-300" : "bg-white border-slate-100 text-gray-700 shadow-sm"
                  }`}>
                    {order.summary}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LEFT COLUMN: AI Assistant & Tools */}
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

              <ResearchWorkspace isDark={isDark} pageId={`order-${order.id}`} isRTL={isRTL} />

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
                              isDark ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white" : "border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#0B3D2E]"
                            }`}
                          >
                            <span>{doc.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Principles */}
                  {lawMeta.related_principles && lawMeta.related_principles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-purple-600 dark:text-purple-400/90 uppercase tracking-wider">
                        {isRTL ? "المبادئ القضائية المرتبطة:" : "Related Judicial Principles:"}
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {lawMeta.related_principles.map((doc, idx) => (
                          <Link
                            key={idx}
                            href={`/precedents/${doc.slug}`}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                              isDark ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white" : "border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#0B3D2E]"
                            }`}
                          >
                            <span>{doc.title}</span>
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

      {/* ── Folder Selection Modal ── */}
      {currentDoc && (
        <FolderSelectionModal
          isOpen={showFolderModal}
          onClose={() => setShowFolderModal(false)}
          currentDoc={currentDoc}
        />
      )}

      {/* ── Community Question Modal ── */}
      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={order.title}
            onClose={() => setShowCommunity(false)}
          />
        )}
      </AnimatePresence>



      <Footer />
      <FloatingButtons
        reportConfig={{ pageSlug: `order-${slug}`, pageType: "order" }}
        cartCount={cart.length}
        onCartClick={() => setShowCart(true)}
      />

      {showCart && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCart(false)}
            className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[2px]"
          />
          <DraftDrawer
            cart={cart}
            onRemoveArticle={removeArticle}
            onClearAll={clearAll}
            onClose={() => setShowCart(false)}
            isDark={isDark}
            isRTL={isRTL}
          />
        </>
      )}
      <PrintWatermark isRTL={isRTL} />
    </div>
  );
}
