"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Lock, Sparkle,
  ArrowRight, Check, Copy, Scales, Gavel,
  BookBookmark, ListNumbers,
  FileText, BookmarkSimple, CaretLeft, CaretRight, Stack, Printer
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import SidebarPanel from "./_sidebar";
import IdentityPanel from "./_identity-panel";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import { LibraryAI, CommunityQuestionModal } from "@/app/laws/[slug]/_ai-components";
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
import { FeqhBookSystem, FeqhBlock } from "@/app/laws/data";

// Demo Data: الروض المربع
const DEMO_RAWD: FeqhBookSystem = {
  id: "rawd-al-murbi",
  title: "الروض المربع بشرح زاد المستقنع",
  author: "الشيخ منصور بن يونس البهوتي (ت 1051هـ)",
  school: "المذهب الحنبلي",
  investigator: "الشيخ عبد الرحمن بن محمد بن قاسم (حاشية ابن قاسم)",
  publisher: "طبعة دار ابن الجوزي / مطبعة الحكومة بالرياض",
  totalVolumes: 1,
  chapters: [
    {
      title: "كتاب الصلاة - شروط الصلاة",
      sections: [
        {
          title: "باب شروط الصلاة",
          blocks: [
            {
              id: "fb-rawd-1",
              topic: "تعريف شرط الصلاة وعدد الشروط",
              vol: 1,
              page: 204,
              matn: "وَشُرُوطُهَا تِسْعَةٌ: الإِسْلاَمُ، وَالعَقْلُ، وَالتَّمْيِيزُ، وَرَفْعُ الحَدَثِ، وَإِزَالَةُ النَّجَاسَةِ، وَسَتْرُ العَوْرَةِ، وَدُخُولُ الوَقْتِ، وَاسْتِقْبَالُ القِبْلَةِ، وَالنِّيَّةُ.",
              sharh: "وهي -أي شروط الصلاة- جمع شرط، وهو لغة العلامة، واصطلاحاً: ما يلزم من عدمه العدم ولا يلزم من وجوده وجود ولا عدم لذاته. وهي (تسعة) شروط لا تصح الصلاة بدونها، وتقديمها عليها متعيّن مع الاستمرار فيها بقدر الإمكان:\nأحدها: (الإسلام) فلا تصح من كافر إجماعاً.\nوالثاني: (العقل) فلا تصح من مجنون ومعتوه.\nوالثالث: (التمييز) وهو بلوغ سبع سنين، فلا تصح من طفل دونها لعدم النية.",
              hashiyah: [
                "الشرط بالفتح العلامة، ومنه أشراط الساعة. واصطلاحاً: ما وجد قبله واستمر معه، بخلاف الركن الذي هو جزء من الماهية.",
                "الإسلام شرط لصحة كل عبادة، والنية لا تصح من كافر لعدم الأهلية، والخطاب فروعاً لا يصح منه فعلاً بل عقاباً.",
                "التمييز عند الحنابلة يُحدد بالبلوغ سبع سنين، ويؤمر بها لسبع ويُضرب عليها لعشر لحديث سبرة بن معبد."
              ]
            },
            {
              id: "fb-rawd-2",
              topic: "الشرط الرابع: رفع الحدث والوضوء",
              vol: 1,
              page: 205,
              matn: "وَالرَّابِعُ: رَفْعُ الحَدَثِ، وَهُВО الوُضُوءُ إِذَا كَانَ أَصْغَرَ، وَالغُسْلُ إِذَا كَانَ أَكْبَرَ، أَوِ التَّيَمُّمُ عِنْدَ العَجْزِ عَنْهُمَا.",
              sharh: "(والرابع: رفع الحدث) بالماء المطلق, وهو زوال الوصف القائم بالبدن المانع من الصلاة ونحوها، وهو (الوضوء) بضم الواو (إذا كان أصغر) لحدث أصغر، (والغسل إذا كان أكبر) لحدث جنابة أو حيض، (أو التيمم عند العجز عنهما) بالتراب الطهور لمرض أو فقد ماء.",
              hashiyah: [
                "رفع الحدث لا يكون إلا بالماء الطهور وهو الباقي على خلقته، وعند تعذره يُعدل للتيمم بالتراب.",
                "الحدث وصف حكمي يحل بالأعضاء يمنع من الصلاة، والخبث نجاسة عينية تطرأ على البدن أو الثوب أو البقعة."
              ]
            }
          ]
        }
      ]
    }
  ]
};

export default function FeqhBookPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { isDark, isRTL } = useTheme();

  const [book, setBook] = useState<FeqhBookSystem | null>(null);
  const [loading, setLoading] = useState(true);

  // Reader states
  const [activeBlockId, setActiveBlockId] = useState<string>("");
  const [viewLayer, setViewLayer] = useState<"all" | "matn-only" | "sharh-only">("all");
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("large");
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const lawMeta = getLawMeta(book?.id || slug);

  // Folder & Search states
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickJumpQuery, setQuickJumpQuery] = useState("");
  const [jumpError, setJumpError] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  const filteredChapters = useMemo(() => {
    if (!book) return [];
    if (!searchQuery.trim()) return book.chapters;
    
    const query = searchQuery.toLowerCase().trim();
    return book.chapters.map(ch => {
      const filteredSections = ch.sections.map(sec => {
        const filteredBlocks = sec.blocks.filter(b => 
          b.topic.toLowerCase().includes(query) ||
          b.matn.toLowerCase().includes(query) ||
          b.sharh.toLowerCase().includes(query)
        );
        return { ...sec, blocks: filteredBlocks };
      }).filter(sec => sec.blocks.length > 0);
      
      return { ...ch, sections: filteredSections };
    }).filter(ch => ch.sections.length > 0);
  }, [book, searchQuery]);

  const handleQuickJump = (query: string) => {
    if (!book) return;
    setJumpError(false);
    const trimmed = query.trim();
    if (!trimmed) return;
    
    let targetVol = 1;
    let targetPage = parseInt(trimmed, 10);
    
    if (trimmed.includes("/")) {
      const parts = trimmed.split("/");
      targetVol = parseInt(parts[0], 10);
      targetPage = parseInt(parts[1], 10);
    }
    
    let foundBlockId = "";
    for (const ch of book.chapters) {
      for (const sec of ch.sections) {
        const found = sec.blocks.find(b => b.vol === targetVol && b.page === targetPage);
        if (found) {
          foundBlockId = found.id;
          break;
        }
      }
      if (foundBlockId) break;
    }
    
    if (foundBlockId) {
      setActiveBlockId(foundBlockId);
      handleScrollToBlock(foundBlockId);
    } else {
      setJumpError(true);
      setTimeout(() => setJumpError(false), 2000);
    }
  };

  const handleScrollToBlock = (id: string) => {
    setActiveBlockId(id);
    const el = document.getElementById(`book-block-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const currentDoc = useMemo(() => {
    return {
      slug: book?.id || slug,
      title: book?.title || "",
      titleEn: book?.title || "",
      catId: "SA-00",
      type: "book" as const
    };
  }, [book, slug]);

  useEffect(() => {
    async function loadBookData() {
      setLoading(true);
      try {
        // Try API first
        const res = await fetch(`/api/library/books/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const apiData = await res.json();
          setBook(apiData as FeqhBookSystem);
          if (apiData.chapters?.[0]?.sections?.[0]?.blocks?.[0]) {
            setActiveBlockId(apiData.chapters[0].sections[0].blocks[0].id);
          }
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[Books] API fetch failed, using JSON fallback:', e);
      }

      // Fallback
      if (slug === "rawd-al-murbi") {
        setBook(DEMO_RAWD);
        if (DEMO_RAWD.chapters[0]?.sections[0]?.blocks[0]) {
          setActiveBlockId(DEMO_RAWD.chapters[0].sections[0].blocks[0].id);
        }
        setLoading(false);
      } else if (slug === "sources-of-right-1") {
        try {
          const data = await import("@/constants/sources-of-right-1.json");
          setBook(data.default as FeqhBookSystem);
          if (data.default.chapters[0]?.sections[0]?.blocks[0]) {
            setActiveBlockId(data.default.chapters[0].sections[0].blocks[0].id);
          }
        } catch (e) {
          console.error("Failed to load book sources-of-right-1", e);
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    }
    loadBookData();
  }, [slug]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#C8A762] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold">{isRTL ? "جاري تحميل الكتاب الفقهي..." : "Loading Feqh book..."}</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <BookOpen size={48} className="text-red-500 mb-4" />
          <h1 className="text-xl font-black mb-2">{isRTL ? "عفواً، الكتاب غير موجود" : "Book Not Found"}</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">{isRTL ? "لم نتمكن من العثور على هذا الكتاب الفقهي في المكتبة." : "We couldn't find this Feqh book in the library."}</p>
          <Link href="/laws" className="px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl">{isRTL ? "العودة للمكتبة" : "Back to Library"}</Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Find active block
  let activeBlock: FeqhBlock | null = null;
  let activeChapterTitle = "";
  for (const ch of book.chapters) {
    for (const sec of ch.sections) {
      const found = sec.blocks.find(b => b.id === activeBlockId);
      if (found) {
        activeBlock = found;
        activeChapterTitle = ch.title;
        break;
      }
    }
    if (activeBlock) break;
  }

  // If active block is still empty, default to first block
  if (!activeBlock && book.chapters[0]?.sections[0]?.blocks[0]) {
    activeBlock = book.chapters[0].sections[0].blocks[0];
    activeChapterTitle = book.chapters[0].title;
  }

  const handleCopyCitation = () => {
    if (!book || !activeBlock) return;
    const citation = `${book.author}، ${book.title}، ج ${activeBlock.vol}، ص ${activeBlock.page} (طبعة ${book.publisher})`;
    navigator.clipboard.writeText(citation);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  const handleCopyBlock = () => {
    if (!book || !activeBlock) return;
    
    const selectedText = getSelectedTextWithin(`book-block-${activeBlock.id}`);
    let textBlock = "";
    let isSelectionCopy = false;
    
    if (selectedText) {
      textBlock = selectedText;
      isSelectionCopy = true;
    } else {
      const parts = [];
      if (activeBlock.matn) parts.push(`المتن:\n${activeBlock.matn}`);
      if (activeBlock.sharh) parts.push(`الشرح:\n${activeBlock.sharh}`);
      if (activeBlock.hashiyah && activeBlock.hashiyah.length > 0) {
        parts.push(`الحواشي:\n${activeBlock.hashiyah.map((h, i) => `${i + 1}- ${h}`).join("\n")}`);
      }
      textBlock = parts.join("\n\n");
    }
    
    const citation = `${book.author}، ${book.title}، ج ${activeBlock.vol}، ص ${activeBlock.page} (طبعة ${book.publisher})`;
    const prefixPlain = isSelectionCopy
      ? (isRTL 
          ? `مقتبس من كتاب (${book.title} - ج ${activeBlock.vol}، ص ${activeBlock.page}):` 
          : `Excerpt from book (${book.title} - V ${activeBlock.vol}, P ${activeBlock.page}):`)
      : (isRTL 
          ? `الموضع من كتاب (${book.title} - ج ${activeBlock.vol}، ص ${activeBlock.page}):` 
          : `Excerpt from book (${book.title} - V ${activeBlock.vol}, P ${activeBlock.page}):`);

    const prefixHtml = isSelectionCopy
      ? (isRTL 
          ? `<b>مقتبس من كتاب (${book.title} - ج ${activeBlock.vol}، ص ${activeBlock.page}):</b>` 
          : `<b>Excerpt from book (${book.title} - V ${activeBlock.vol}, P ${activeBlock.page}):</b>`)
      : (isRTL 
          ? `<b>الموضع من كتاب (${book.title} - ج ${activeBlock.vol}، ص ${activeBlock.page}):</b>` 
          : `<b>Excerpt from book (${book.title} - V ${activeBlock.vol}, P ${activeBlock.page}):</b>`);

    const plain = `${prefixPlain}\n“${stripMd(textBlock)}”\n\nالمرجعية: ${citation}`;
    const html  = `${prefixHtml}<br>“${textBlock.replace(/\n/g, "<br>")}”<br><br><i>المرجعية: ${citation}</i>`;

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

    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const fontClass = {
    normal: "text-base leading-relaxed",
    large: "text-lg md:text-xl leading-loose",
    xlarge: "text-xl md:text-2xl leading-extra-loose",
  }[fontSize];

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-8 mt-12">
        {/* Header Banner */}
        <div className={`${card} p-6 mb-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[#C8A762] text-xs font-black mb-2">
                <Sparkle size={12} weight="fill" />
                {book.school}
              </div>
              <h1 className="text-2xl font-black">{book.title}</h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
                {isRTL ? "المؤلف:" : "Author:"} {book.author} | {isRTL ? "التحقيق:" : "Investigation:"} {book.investigator}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className={`px-4 py-2.5 text-xs font-bold border rounded-xl hover:opacity-90 transition flex items-center gap-1.5 ${
                    isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                  title={isRTL ? "طباعة الكتاب" : "Print Book"}
                >
                  <Printer size={14} />
                  <span>{isRTL ? "طباعة" : "Print"}</span>
                </button>
                <button
                  onClick={handleCopyBlock}
                  disabled={!activeBlock}
                  className="px-4 py-2.5 text-xs font-bold bg-[#0B3D2E] text-white rounded-xl hover:opacity-90 transition flex items-center gap-1.5"
                >
                  {copiedText ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {isRTL ? "نسخ الموضع" : "Copy Content"}
                </button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <Link
              href="/laws"
              className={`inline-flex items-center gap-2 text-xs font-bold transition-all ${
                isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-[#0B3D2E]"
              }`}
            >
              <ArrowRight size={14} className={isRTL ? "" : "rotate-180"} />
              {isRTL ? "العودة إلى المكتبة القانونية" : "Back to Legal Library"}
            </Link>

            <div className={`inline-flex p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}>
              <button
                onClick={() => setViewLayer("all")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewLayer === "all"
                    ? isDark ? "bg-[#0B3D2E] text-white shadow" : "bg-white text-zinc-900 shadow-sm"
                    : "text-slate-500 dark:text-zinc-400 hover:opacity-85"
                }`}
              >
                {isRTL ? "التجربة الكاملة" : "Full View"}
              </button>
              <button
                onClick={() => setViewLayer("matn-only")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewLayer === "matn-only"
                    ? isDark ? "bg-[#0B3D2E] text-white shadow" : "bg-white text-zinc-900 shadow-sm"
                    : "text-slate-500 dark:text-zinc-400 hover:opacity-85"
                }`}
              >
                {isRTL ? "المتن فقط" : "Matn Only"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Reading Mode Toggle Button */}
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
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-bold">{isRTL ? "حجم الخط:" : "Font Size:"}</span>
              <div className={`inline-flex p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}>
                {(["normal", "large", "xlarge"] as const).map(sz => (
                  <button
                    key={sz}
                    onClick={() => setFontSize(sz)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      fontSize === sz
                        ? isDark ? "bg-[#C8A762] text-[#0B3D2E] shadow" : "bg-white text-amber-700 shadow-sm"
                        : "text-slate-500 dark:text-zinc-400"
                    }`}
                  >
                    {sz === "normal" ? (isRTL ? "عادي" : "A") : sz === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضخم" : "A++")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Layout */}
        <div className={isReadingMode ? "flex gap-6 items-start justify-center" : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full"}>
          
          {/* RIGHT COLUMN: Book Metadata Card AND TOC Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 shrink-0 sticky top-6 z-40 space-y-3 print:hidden">
              <IdentityPanel
                isDark={isDark}
                isRTL={isRTL}
                book={book}
                activeBlock={activeBlock}
                setShowFolderModal={setShowFolderModal}
              />
              
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                quickJumpQuery={quickJumpQuery}
                setQuickJumpQuery={setQuickJumpQuery}
                handleQuickJump={handleQuickJump}
                jumpError={jumpError}
                filteredChapters={filteredChapters}
                activeBlockId={activeBlockId}
                handleScrollToBlock={handleScrollToBlock}
              />
            </aside>
          )}

          {/* Center Reading Container */}
          <div className={`nzamy-reader-container ${isReadingMode ? "max-w-3xl w-full" : "col-span-12 lg:col-span-6"} print:col-span-12 print:w-full print:max-w-none space-y-4`}>
            {activeBlock ? (
              <div id={`book-block-${activeBlock.id}`} className={`nzamy-reader-block ${card} p-6 md:p-8`}>
                {/* Embedded physical page indicator */}
                <div className="flex items-center justify-between border-b pb-4 mb-6 border-slate-200 dark:border-white/[0.05]">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-600 dark:text-[#C8A762]">
                    <FileText size={16} />
                    <span>{isRTL ? `المجلد ${activeBlock.vol}` : `Volume ${activeBlock.vol}`}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />
                    <span>{isRTL ? `الصفحة ${activeBlock.page}` : `Page ${activeBlock.page}`}</span>
                  </div>
                  <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500">
                    {book.title}
                  </span>
                </div>

                {/* Matn Section */}
                {(viewLayer === "all" || viewLayer === "matn-only") && activeBlock.matn && (
                  <div className="mb-6 relative">
                    <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 tracking-wider">
                      <BookmarkSimple size={10} weight="fill" />
                      {isRTL ? "المتن" : "Matn"}
                    </div>
                    <div className="p-5 bg-amber-500/[0.03] border border-amber-500/10 dark:border-amber-500/20 rounded-2xl">
                      <p className={`font-serif text-[#9b6f12] dark:text-[#C8A762] text-center ${fontClass}`}>
                        {activeBlock.matn}
                      </p>
                    </div>
                  </div>
                )}

                {/* Sharh Section */}
                {viewLayer === "all" && (
                  <div className="mb-8 relative">
                    <div className="flex items-center gap-1 text-[9px] font-black uppercase text-[#0B3D2E] dark:text-[#C8A762] tracking-wider mb-2.5">
                      <FileText size={11} weight="fill" />
                      {isRTL ? "الشرح والتعليق" : "Sharh & Commentary"}
                    </div>
                    <div className={`font-sans text-slate-800 dark:text-zinc-200 text-justify ${fontClass}`}>
                      {activeBlock.sharh.split("\n").map((para, pi) => (
                        <p key={pi} className="mb-4">{para}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hashiyah Section */}
                {viewLayer === "all" && activeBlock.hashiyah && activeBlock.hashiyah.length > 0 && (
                  <div className="border-t pt-5 mt-6 border-slate-200 dark:border-white/[0.05]">
                    <h4 className="text-xs font-black text-slate-500 dark:text-zinc-400 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                      <ListNumbers size={14} />
                      {isRTL ? "الحواشي والتعليقات السفلية" : "Footnotes & Annotations"}
                    </h4>
                    <div className="space-y-3">
                      {activeBlock.hashiyah.map((h, i) => (
                        <div key={i} className="flex gap-2 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                           <span className="font-bold text-[#C8A762]">{i + 1}-</span>
                           <p className="flex-1 text-justify">{h}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={`${card} p-8 text-center`}>
                <p className="text-xs text-slate-500">{isRTL ? "الرجاء اختيار مسألة من الفهرس الجانبي لتصفحها." : "Please select a topic from the sidebar."}</p>
              </div>
            )}
          </div>

          {/* LEFT COLUMN: AI Assistant & Tools */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 shrink-0 space-y-3 sticky top-6 z-40 print:hidden">
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

              <ResearchWorkspace isDark={isDark} pageId={`feqh-${book.id}-${activeBlock?.id || ""}`} isRTL={isRTL} />

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
                        {lawMeta.related_systems.map((doc: any, idx: number) => (
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
                        {lawMeta.related_principles.map((doc: any, idx: number) => (
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

      <Footer />
      <FloatingButtons />

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
            lawName={book?.title}
            onClose={() => setShowCommunity(false)}
          />
        )}
      </AnimatePresence>
      <PrintWatermark isRTL={isRTL} />
    </div>
  );
}
