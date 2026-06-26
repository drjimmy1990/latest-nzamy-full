"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Gavel, Check, Copy, Warning, BookOpen, Plus, Bookmark, NotePencil, X, Stack, Scales, Printer
} from "@phosphor-icons/react";
import Link from "next/link";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import { LibraryAI, CommunityQuestionModal } from "@/app/laws/[slug]/_ai-components";
import { getLawMeta } from "@/app/laws/law-metadata-map";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { DEMO_PRECEDENTS, DemoPrecedent } from "../../../laws/demo-data";
import { useDraftCart } from "@/hooks/useDraftCart";
import { SmartFolder } from "../../../laws/components/SmartFolders";
import SidebarPanel from "./_sidebar";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import { DraftDrawer } from "@/components/laws/DraftDrawer";

import { getSelectedTextWithin, stripMd, handleCopyDraft } from "./_helpers";
import { RelatedDocs } from "./_related";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";

export default function PrecedentReaderPage() {
  const { isDark, isRTL } = useTheme();
  const muted  = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card   = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [precedent, setPrecedent] = useState<DemoPrecedent | null>(null);
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const [showCommunity, setShowCommunity] = useState(false);
  const lawMeta = getLawMeta(slug);
  
  // Notes states
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  // Folder states
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);

  // Reading Mode
  const [isReadingMode, setIsReadingMode] = useState(false);

  // Active section for TOC
  const [activeId, setActiveId] = useState("summary");
  const isScrolling = useRef(false);

  // Draft Cart
  const { cart, setCart } = useDraftCart();
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);

  const [copiedDraft, setCopiedDraft] = useState(false);
  const handleCopyDraftWrapper = async () => {
    const success = await handleCopyDraft(cart);
    if (success) {
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2000);
    }
  };

  const handleCopySegment = (text: string, segmentId: string, segmentLabel: string) => {
    if (!precedent) return;
    const selectedText = getSelectedTextWithin(`judgment-segment-${segmentId}`);
    const textBlock = selectedText || text;
    const isSelectionCopy = !!selectedText;
    const citation = `${precedent.court}، قضية رقم ${precedent.caseNum} لعام ${precedent.year}`;
    const prefix = isSelectionCopy
      ? (isRTL ? `مقتبس من (${segmentLabel}) - صك حكم ${precedent.court}:` : `Excerpt from (${segmentLabel}) - Judgment ${precedent.court}:`)
      : (isRTL ? `(${segmentLabel}) - صك حكم ${precedent.court}:` : `(${segmentLabel}) - Judgment ${precedent.court}:`);
    const plain = `${prefix}\n“${stripMd(textBlock)}”\n\nالمرجعية: ${citation}`;
    navigator.clipboard.writeText(plain);
    setCopiedSegmentId(segmentId);
    setTimeout(() => setCopiedSegmentId(null), 2000);
  };

  // ── Load data ──
  useEffect(() => {
    if (slug) {
      const found = DEMO_PRECEDENTS.find(p => p.id === slug);
      if (found) {
        setPrecedent(found);
        const savedNote = localStorage.getItem(`sticky_note_text_judgment-${slug}`);
        if (savedNote) setNoteText(savedNote);

        // Track this precedent in recent sessions
        try {
          const raw = localStorage.getItem("nzamy_recent_sessions");
          const sessions = raw ? JSON.parse(raw) : [];
          const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "precedent"));
          filtered.unshift({
            slug,
            title: found.relevance,
            titleEn: found.relevance,
            catId: found.cat,
            type: "precedent"
          });
          localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [slug]);

  // ── Load folders ──
  useEffect(() => {
    const savedFolders = localStorage.getItem("nzamy_smart_folders");
    if (savedFolders) {
      try {
        setFolders(JSON.parse(savedFolders));
      } catch {}
    }
  }, []);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  // Listen to external folder state changes to sync dynamically
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setFolders(e.detail);
    };
    window.addEventListener("nzamy_smart_folders_changed", handleUpdate);
    return () => window.removeEventListener("nzamy_smart_folders_changed", handleUpdate);
  }, []);

  // ── ScrollSpy Observer ──
  useEffect(() => {
    if (!precedent) return;
    const ids = ["summary", precedent.preamble ? "preamble" : "", "facts", precedent.reasons ? "reasons" : "", "ruling"].filter(Boolean);
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
      return { obs, el };
    });

    return () => {
      observers.forEach(o => {
        if (o) o.obs.disconnect();
      });
    };
  }, [precedent]);

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      isScrolling.current = true;
      setActiveId(id);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        isScrolling.current = false;
      }, 800);
    }
  };

  // ── Save note ──
  const handleSaveNote = () => {
    if (precedent) {
      localStorage.setItem(`sticky_note_text_judgment-${precedent.id}`, noteText);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }
  };

  const handleClearNote = () => {
    if (precedent) {
      localStorage.removeItem(`sticky_note_text_judgment-${precedent.id}`);
      setNoteText("");
    }
  };

  // ── Add to Draft Cart ──
  const handleAddToDraft = (text: string, title: string, idSuffix: string) => {
    if (!precedent) return;
    const itemUniqueId = `judgment-${precedent.id}-${idSuffix}`;
    
    setCart(prev => {
      const exists = prev.find(item => item.articleId === itemUniqueId);
      if (exists) return prev;
      return [
        ...prev,
        {
          articleId: itemUniqueId,
          articleNum: title,
          articleTitle: precedent.relevance,
          articleText: text,
          lawName: precedent.court,
          lawSlug: `precedents/judgment/${precedent.id}`,
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

  // ── Folders checklist logic ──
  const isItemInFolder = (folder: SmartFolder) => {
    if (!precedent) return false;
    return folder.laws.some(item => item.slug === precedent.id && item.type === "precedent");
  };

  const currentDoc = useMemo(() => {
    return {
      slug: precedent?.id || "",
      title: precedent?.relevance || "",
      titleEn: precedent?.relevance || "",
      catId: precedent?.cat || "",
      type: "precedent" as const
    };
  }, [precedent]);

  if (!precedent) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <Warning size={40} className="text-amber-500 mb-4" />
        <p className="text-sm font-bold">{isRTL ? "لم يتم العثور على الحكم المطلوب." : "Judgment not found."}</p>
        <Link href="/laws" className="mt-4 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-xs font-bold">
          {isRTL ? "العودة للمكتبة" : "Back to Library"}
        </Link>
      </div>
    );
  }

  const fontSizeClass = 
    fontSize === "large" ? "text-[16px] leading-[2.1]" : 
    fontSize === "xlarge" ? "text-[18px] leading-[2.3]" : 
    "text-[14px] leading-[1.8]";

  const isItemInAnyFolder = folders.some(isItemInFolder);

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"} font-sans`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 pt-32 pb-24">
        <div className="h-6" />

        {/* ── Precedent header banner ── */}
        {!isReadingMode && (
          <div className={`${card} ${border} p-4 mb-5`}>
            <div className={`flex items-center gap-2 text-[11px] mb-3 print:hidden ${muted}`}>
              <Link href="/laws" className="hover:underline">{isRTL ? "المكتبة القانونية" : "Legal Library"}</Link>
              <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
              <Link href="/precedents" className="hover:underline">{isRTL ? "المبادئ والقرارات القضائية" : "Judicial Principles"}</Link>
              <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
              <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{precedent.court}</span>
            </div>
            <div className="flex flex-wrap items-start gap-3 justify-between">
              <div>
                <h1 className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{precedent.relevance}</h1>
                <p className={`text-[12px] ${muted}`}>
                  {isRTL ? "رقم القضية" : "Case No"}: {precedent.caseNum} لعام {precedent.year}
                </p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                    isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                  title={isRTL ? "طباعة الحكم" : "Print Judgment"}
                >
                  <Printer size={11} />
                  <span>{isRTL ? "طباعة" : "Print"}</span>
                </button>
                <button
                  onClick={handleCopyDraftWrapper}
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
        )}

        {/* Reading mode toolbar */}
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

        {/* ── Grid Dynamic Layout ── */}
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${isReadingMode ? "justify-center" : ""}`}>
          
          {/* RIGHT COLUMN: Identity Panel AND Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-6 z-40 space-y-3 print:hidden">
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                precedent={precedent}
                activeId={activeId}
                handleScrollToSection={handleScrollToSection}
                noteText={noteText}
                setNoteText={setNoteText}
                noteSaved={noteSaved}
                handleSaveNote={handleSaveNote}
                handleClearNote={handleClearNote}
                setShowFolderModal={setShowFolderModal}
                isItemInAnyFolder={isItemInAnyFolder}
                fontSize={fontSize}
                setFontSize={setFontSize}
              />
            </aside>
          )}

          {/* CENTER COLUMN: Center Content Area ── */}
          <div className={`nzamy-reader-container ${isReadingMode ? "max-w-3xl mx-auto w-full" : "col-span-12 lg:col-span-6"} min-w-0 space-y-6 relative`}>
            
            {/* Redacted Watermark Stamp */}
            {precedent.isRedacted && (
              <div className="absolute top-4 left-4 select-none rotate-[-6deg] opacity-80 z-20">
                <span className="border-2 border-red-500/80 text-red-500 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded bg-[#0c0f12]/20 backdrop-blur-sm">
                  {isRTL ? "بيانات ممسوحة" : "REDACTED"}
                </span>
              </div>
            )}

            {/* Header Card */}
            <div className={`p-6 md:p-8 rounded-[2rem] border shadow-sm ${
              isDark ? "bg-[#161b22]/40 border-white/[0.06]" : "bg-white border-gray-200"
            }`}>
              {/* Only show header in reading mode (as it is moved to the top banner in standard view) */}
              {isReadingMode && (
                <div className="flex flex-col items-center text-center pb-6 border-b border-slate-100 dark:border-white/[0.04] mb-6">
                  <Gavel size={36} className="text-purple-500 mb-3" weight="fill" />
                  <span className="text-[10px] tracking-widest font-black uppercase text-purple-500 dark:text-purple-400">
                    {precedent.court}
                  </span>
                  <h1 className={`text-xl md:text-2xl font-black mt-3 leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                    {precedent.relevance}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      isDark ? "bg-white/5 text-gray-400" : "bg-slate-100 text-slate-600"
                    }`}>
                      {isRTL ? "رقم القضية" : "Case No"}: {precedent.caseNum}
                    </span>
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${isDark ? "bg-white/5 text-gray-400" : "bg-slate-100 text-slate-600"}`}>
                      {precedent.year}
                    </span>
                  </div>
                </div>
              )}

              {/* Summary Brief */}
               <div id="summary" className={`nzamy-reader-block p-5 rounded-2xl mb-6 text-xs leading-relaxed ${
                isDark ? "bg-white/[0.02]" : "bg-slate-50"
              } border border-dashed ${isDark ? "border-white/10" : "border-gray-200"}`}>
                <span className="font-bold text-purple-500 block mb-1">{isRTL ? "موجز وتلخيص صك الحكم: " : "Judgment Summary: "}</span>
                <span className={isDark ? "text-gray-300" : "text-gray-600"}>{precedent.summary_brief}</span>
              </div>

              {/* Preamble */}
              {precedent.preamble && (
                <div id="preamble" className="mb-6 print:hidden">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`text-xs font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {isRTL ? "الديباجة القضائية" : "Preamble"}
                    </h3>
                    <button
                      onClick={() => handleCopySegment(precedent.preamble || "", "preamble", isRTL ? "الديباجة القضائية" : "Preamble")}
                      className="p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1 print:hidden"
                    >
                      {copiedSegmentId === "preamble" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {isRTL ? "نسخ" : "Copy"}
                    </button>
                  </div>
                  <div id="judgment-segment-preamble" className={`nzamy-reader-block p-5 rounded-2xl border text-xs leading-loose whitespace-pre-wrap font-serif ${
                    isDark ? "bg-[#0c0f12]/50 border-white/5 text-zinc-300" : "bg-slate-50/50 border-slate-100 text-gray-700"
                  }`}>
                    {precedent.preamble}
                  </div>
                </div>
              )}

              {/* Case Facts */}
              <div id="facts" className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isRTL ? "وقائع القضية والخط الزمني" : "Case Facts & Timeline"}
                  </h3>
                  <div className="flex items-center gap-3 print:hidden">
                    <button
                      onClick={() => handleCopySegment(precedent.facts || precedent.summary, "facts", isRTL ? "وقائع القضية" : "Case Facts")}
                      className="p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1"
                    >
                      {copiedSegmentId === "facts" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {isRTL ? "نسخ" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        const txt = precedent.facts || precedent.summary;
                        handleAddToDraft(txt, isRTL ? "وقائع القضية" : "Case Facts", "facts");
                      }}
                      className={`p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1`}
                    >
                      <Plus size={12} />
                      {isRTL ? "إضافة للمسودة" : "Add to draft"}
                    </button>
                  </div>
                </div>
                <div id="judgment-segment-facts" className={`nzamy-reader-block p-5 rounded-2xl border ${fontSizeClass} whitespace-pre-wrap leading-loose ${
                  isDark ? "bg-[#0c0f12]/30 border-white/5 text-zinc-300" : "bg-white border-slate-100 text-gray-700 shadow-sm"
                }`}>
                  {precedent.facts || precedent.summary}
                </div>
              </div>

              {/* Case Reasons / التسبيب */}
              {precedent.reasons && (
                <div id="reasons" className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {isRTL ? "الأسباب والتسبيب القضائي" : "Judicial Reasoning"}
                    </h3>
                    <div className="flex items-center gap-3 print:hidden">
                      <button
                        onClick={() => handleCopySegment(precedent.reasons || "", "reasons", isRTL ? "أسباب الحكم" : "Judicial Reasoning")}
                        className="p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1"
                      >
                        {copiedSegmentId === "reasons" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        {isRTL ? "نسخ" : "Copy"}
                      </button>
                      <button
                        onClick={() => handleAddToDraft(precedent.reasons || "", isRTL ? "أسباب الحكم" : "Judicial Reasoning", "reasons")}
                        className={`p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1`}
                      >
                        <Plus size={12} />
                        {isRTL ? "إضافة للمسودة" : "Add to draft"}
                      </button>
                    </div>
                  </div>
                  <div id="judgment-segment-reasons" className={`nzamy-reader-block p-5 rounded-2xl border ${fontSizeClass} whitespace-pre-wrap leading-loose ${
                    isDark ? "bg-[#0c0f12]/30 border-white/5 text-zinc-300" : "bg-white border-slate-100 text-gray-700 shadow-sm"
                  }`}>
                    {precedent.reasons}
                  </div>
                </div>
              )}

              {/* Ruling / المنطوق */}
              <div id="ruling" className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isRTL ? "منطوق الحكم النهائي" : "Final Ruling"}
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCopySegment(precedent.ruling || "", "ruling", isRTL ? "منطوق الحكم" : "Final Ruling")}
                      className="p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1"
                    >
                      {copiedSegmentId === "ruling" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {isRTL ? "نسخ" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleAddToDraft(precedent.ruling || "", isRTL ? "منطوق الحكم" : "Final Ruling", "ruling")}
                      className={`p-1 text-xs text-purple-500 hover:text-purple-400 transition flex items-center gap-1`}
                    >
                      <Plus size={12} />
                      {isRTL ? "إضافة للمسودة" : "Add to draft"}
                    </button>
                  </div>
                </div>
                <div id="judgment-segment-ruling" className={`nzamy-reader-block p-5 rounded-2xl border ${fontSizeClass} whitespace-pre-wrap leading-loose ${
                  isDark ? "bg-purple-950/10 border-purple-500/20 text-purple-300" : "bg-purple-50/50 border-purple-100 text-purple-950 font-bold"
                }`}>
                  {precedent.ruling}
                </div>
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

              {/* Research Workspace */}
              <ResearchWorkspace isDark={isDark} pageId={`precedent-judgment-${precedent.id}`} isRTL={isRTL} />

              {/* Related Documents Card */}
              <RelatedDocs lawMeta={lawMeta} isRTL={isRTL} isDark={isDark} />
            </aside>
          )}

        </div>
      </main>

      {/* Mobile Sticky bottom sheet note drawer */}
      <AnimatePresence>
        {showNotesDrawer && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm lg:hidden print:hidden">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className={`w-full max-h-[80vh] p-6 rounded-t-[2.5rem] border-t shadow-2xl overflow-y-auto ${
                isDark ? "bg-[#161b22] border-white/10 text-white" : "bg-white border-slate-200 text-gray-900"
              }`}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/[0.04] mb-4 flex-shrink-0">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <NotePencil size={18} className="text-purple-500" />
                  {isRTL ? "الملاحظات الشخصية" : "Personal Notes"}
                </h3>
                <button
                  onClick={() => setShowNotesDrawer(false)}
                  className={`p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400`}
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder={isRTL ? "اكتب هنا استنتاجاتك أو ملاحظاتك..." : "Write your highlights here..."}
                className={`w-full h-40 p-3 text-xs rounded-xl outline-none resize-none border ${
                  isDark
                    ? "bg-[#0c0f12] border-white/5 text-white placeholder-gray-600 focus:border-[#C8A762]/40"
                    : "bg-slate-50 border-slate-200 text-gray-900 placeholder-gray-400 focus:border-[#0B3D2E]"
                }`}
              />
              <div className="mt-4 flex gap-3">
                {noteText.trim() && (
                  <button
                    onClick={() => { handleClearNote(); setShowNotesDrawer(false); }}
                    className="flex-1 py-3 rounded-xl text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                  >
                    {isRTL ? "حذف الملاحظة" : "Clear"}
                  </button>
                )}
                <button
                  onClick={() => { handleSaveNote(); setShowNotesDrawer(false); }}
                  disabled={!noteText.trim()}
                  className={`flex-[2] py-3 rounded-xl text-xs font-bold transition-all ${
                    noteText.trim()
                      ? "bg-[#0B3D2E] text-white"
                      : isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isRTL ? "حفظ ومتابعة" : "Save & Close"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <Footer />
      <FloatingButtons
        reportConfig={{ pageSlug: `judgment-${slug}`, pageType: "precedent" }}
        cartCount={cart.length}
        onCartClick={() => setShowCart(true)}
      />

      <FolderSelectionModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        currentDoc={currentDoc}
      />

      {/* ── Community Question Modal ── */}
      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={precedent.relevance}
            onClose={() => setShowCommunity(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Draft Drawer overlay ── */}
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
            onRemoveArticle={(id) => setCart(prev => prev.filter(e => e.articleId !== id))}
            onClearAll={() => setCart([])}
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
