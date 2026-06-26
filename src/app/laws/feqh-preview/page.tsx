"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, MagnifyingGlass, Lock, Sparkle,
  ArrowRight, Check, Copy, Scales, Gavel,
  BookBookmark, Info, ListNumbers, Sidebar,
  FileText, ChatCircleDots, BookmarkSimple,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface FeqhBlock {
  id: string;
  topic: string;
  vol: number;
  page: number;
  matn: string;       // متن زاد المستقنع
  sharh: string;      // شرح الروض المربع
  hashiyah: string[]; // حاشية ابن قاسم (موزعة كحواشي مرقمة)
  relatedLawArticles: {
    lawName: string;
    articleNum: string;
    text: string;
  }[];
  hadithVerification: {
    text: string;
    status: "صحيح" | "حسن" | "ضعيف" | "متفق عليه";
    source: string;
  }[];
}

interface FeqhChapter {
  title: string;
  blocks: FeqhBlock[];
}

interface FeqhBook {
  id: string;
  title: string;
  author: string;
  school: string;
  investigator: string;
  publisher: string;
  chapters: FeqhChapter[];
}

// ─── Demo Data: الروض المربع شرح زاد المستقنع ────────────────────────────────
const DEMO_BOOK: FeqhBook = {
  id: "rawd-al-murbi",
  title: "الروض المربع بشرح زاد المستقنع",
  author: "الشيخ منصور بن يونس البهوتي (ت 1051هـ)",
  school: "المذهب الحنبلي",
  investigator: "الشيخ عبد الرحمن بن محمد بن قاسم (حاشية ابن قاسم)",
  publisher: "طبعة دار ابن الجوزي / مطبعة الحكومة بالرياض",
  chapters: [
    {
      title: "كتاب الصلاة - شروط الصلاة",
      blocks: [
        {
          id: "fb-1",
          topic: "تعريف شرط الصلاة وعدد الشروط",
          vol: 1,
          page: 204,
          matn: "وَشُرُوطُهَا تِسْعَةٌ: الإِسْلاَمُ، وَالعَقْلُ، وَالتَّمْيِيزُ، وَرَفْعُ الحَدَثِ، وَإِزَالَةُ النَّجَاسَةِ، وَسَتْرُ العَوْرَةِ، وَدُخُولُ الوَقْتِ، وَاسْتِقْبَالُ القِبْلَةِ، وَالنِّيَّةُ.",
          sharh: "وهي -أي شروط الصلاة- جمع شرط، وهو لغة العلامة، واصطلاحاً: ما يلزم من عدمه العدم ولا يلزم من وجوده وجود ولا عدم لذاته. وهي (تسعة) شروط لا تصح الصلاة بدونها، وتقديمها عليها متعيّن مع الاستمرار فيها بقدر الإمكان: \nأحدها: (الإسلام) فلا تصح من كافر إجماعاً. \nوالثاني: (العقل) فلا تصح من مجنون ومعتوه. \nوالثالث: (التمييز) وهو بلوغ سبع سنين، فلا تصح من طفل دونها لعدم النية.",
          hashiyah: [
            "الشرط بالفتح العلامة، ومنه أشراط الساعة. واصطلاحاً: ما وجد قبله واستمر معه، بخلاف الركن الذي هو جزء من الماهية.",
            "الإسلام شرط لصحة كل عبادة، والنية لا تصح من كافر لعدم الأهلية، والخطاب فروعاً لا يصح منه فعلاً بل عقاباً.",
            "التمييز عند الحنابلة يُحدد بالبلوغ سبع سنين، ويؤمر بها لسبع ويُضرب عليها لعشر لحديث سبرة بن معبد.",
          ],
          relatedLawArticles: [
            {
              lawName: "نظام المعاملات المدنية (مفهوم الأهلية والتمييز)",
              articleNum: "المادة الثامنة والأربعون",
              text: "كل شخص يبلغ سن التمييز ولم يبلغ سن الرشد يكون ناقص الأهلية، وسن التمييز هي سبع سنين كاملة."
            }
          ],
          hadithVerification: [
            {
              text: "حديث: «مروا أولادكم بالصلاة وهم أبناء سبع سنين، واضربوهم عليها وهم أبناء عشر»",
              status: "حسن",
              source: "رواه أبو داود (495) وأحمد (6684) من حديث عمرو بن شعيب عن أبيه عن جده."
            }
          ]
        },
        {
          id: "fb-2",
          topic: "الشرط الرابع: رفع الحدث والوضوء",
          vol: 1,
          page: 205,
          matn: "وَالرَّابِعُ: رَفْعُ الحَدَثِ، وَهُوَ الوُضُوءُ إِذَا كَانَ أَصْغَرَ، وَالغُسْلُ إِذَا كَانَ أَكْبَرَ، أَوِ التَّيَمُّمُ عِنْدَ العَجْزِ عَنْهُمَا.",
          sharh: "(والرابع: رفع الحدث) بالماء المطلق, وهو زوال الوصف القائم بالبدن المانع من الصلاة ونحوها، وهو (الوضوء) بضم الواو (إذا كان أصغر) لحدث أصغر، (والغسل إذا كان أكبر) لحدث جنابة أو حيض، (أو التيمم عند العجز عنهما) بالتراب الطهور لمرض أو فقد ماء.",
          hashiyah: [
            "رفع الحدث لا يكون إلا بالماء الطهور وهو الباقي على خلقته، وعند تعذره يُعدل للتيمم بالتراب.",
            "الحدث وصف حكمي يحل بالأعضاء يمنع من الصلاة، والخبث نجاسة عينية تطرأ على البدن أو الثوب أو البقعة."
          ],
          relatedLawArticles: [],
          hadithVerification: [
            {
              text: "حديث: «لا تقبل صلاة من أحدث حتى يتوضأ»",
              status: "متفق عليه",
              source: "رواه البخاري (135) ومسلم (225) من حديث أبي هريرة."
            }
          ]
        },
        {
          id: "fb-3",
          topic: "الشرط الخامس والسادس: إزالة النجاسة وستر العورة",
          vol: 1,
          page: 206,
          matn: "وَالخَامِسُ: إِزَالَةُ النَّجَاسَةِ عَنِ البَدَنِ، وَالثَّوْبِ، وَالبُقْعَةِ. وَالسَّادِسُ: سَتْرُ العَوْرَةِ بِثَوْبٍ طَاهِرٍ يُبَاحُ.",
          sharh: "(والخامس: إزالة النجاسة) بماء طهور (عن البدن والثوب والبقعة) التي يصلي عليها، فلا تصح مع نجاسة أحدهما مع العلم والقدرة. (والسادس: ستر العورة) لقوله تعالى: {خذوا زينتكم عند كل مسجد}، ويكون (بثوب طاهر يباح) غير مغصوب ولا حرير لغير ضرورة، يستر لون البشرة.",
          hashiyah: [
            "شرط الطهارة من النجاسة يختلف عن طهارة الحدث بسقوطه عند النسيان أو العجز في أصح الروايتين.",
            "ستر العورة في الصلاة حق لله تعالى، ويشترط أن يكون الساتر مباحاً، فلو صلى بثوب مغصوب لم تصح في المذهب الحنبلي."
          ],
          relatedLawArticles: [
            {
              lawName: "نظام المعاملات المدنية (بطلان التصرف في المغصوب)",
              articleNum: "المادة الرابعة والأربعون بعد المائتين",
              text: "الغاصب ملزم برد العين المغصوبة وضمان منافعها، والتصرف فيها باطل لا يرتب أثراً شرعياً."
            }
          ],
          hadithVerification: []
        }
      ]
    }
  ]
};

export default function FeqhPreviewPage() {
  const { isDark, isRTL } = useTheme();

  // Active items
  const [activeBlockId, setActiveBlockId] = useState<string>("fb-1");
  const [viewLayer, setViewLayer] = useState<"all" | "matn-only" | "sharh-only">("all");
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("large");
  const [copiedText, setCopiedText] = useState(false);

  // AI Assistant Mockup
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Active block details
  const activeChapter = DEMO_BOOK.chapters[0];
  const activeBlock = activeChapter.blocks.find(b => b.id === activeBlockId) || activeChapter.blocks[0];

  const handleCopyBlock = () => {
    const text = `[${DEMO_BOOK.title} - ج ${activeBlock.vol}، ص ${activeBlock.page}]\n\nالمتن:\n${activeBlock.matn}\n\nالشرح:\n${activeBlock.sharh}\n\nالحواشي:\n${activeBlock.hashiyah.map((h, i) => `${i+1}- ${h}`).join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleAskAI = () => {
    if (!aiPrompt) return;
    setAiLoading(true);
    setTimeout(() => {
      setAiResponse(
        isRTL
          ? `بناءً على المذهب الحنبلي في "${DEMO_BOOK.title}" (ج ${activeBlock.vol}، ص ${activeBlock.page})، فإن الشرط يختلف عن الركن في أن الشرط يسبق العبادة ويستمر معها (كالوضوء واستقبال القبلة)، بينما الركن يقع في صلب العبادة (كالركوع والسجود). 

وهذا يتناغم مع المفاهيم القانونية المعاصرة في نظام المعاملات المدنية السعودي (مثل المادة 48 و 244)، حيث يتم التمييز بين شروط نفاذ العقد (التي تماثل الشروط الفقهية في كونها خارجية عن التزامات العقد) وأركان العقد الأساسية كالرضا والمحل والسبب.`
          : `Based on the Hanbali school in "${DEMO_BOOK.title}" (Vol ${activeBlock.vol}, Page ${activeBlock.page}), a condition (Shart) differs from a pillar (Rukn) in that a condition precedes and accompanies the worship (like Wudu), while a pillar is an integral part of it (like Ruku).

This maps closely to the concepts of legal capacity (Article 48) and contract validity in the Saudi Civil Transactions Law.`
      );
      setAiLoading(false);
    }, 1200);
  };

  // Font size classes
  const fontClass = {
    normal: "text-base leading-relaxed",
    large: "text-lg md:text-xl leading-loose",
    xlarge: "text-xl md:text-2xl leading-extra-loose",
  }[fontSize];

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-4 py-8 mt-12">
        <div className="h-6" />

        {/* Header Block */}
        <div className={`rounded-2xl border p-6 mb-6 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-black mb-2">
                <Sparkle size={12} weight="fill" />
                {isRTL ? "معاينة تجربة الكتب الفقهية" : "Feqh Books Reader Preview"}
              </div>
              <h1 className="text-2xl font-black">{DEMO_BOOK.title}</h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                {isRTL ? "تأليف: " : "Author: "} {DEMO_BOOK.author} | {DEMO_BOOK.school} | {isRTL ? "بتحشية: " : "Footnotes by: "} {DEMO_BOOK.investigator}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyBlock}
                className="px-4 py-2 text-xs font-bold bg-[#0B3D2E] text-white rounded-xl hover:opacity-90 transition flex items-center gap-2"
              >
                {copiedText ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {isRTL ? "نسخ الموضع الحالي" : "Copy Position"}
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar & Filter View */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
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

            {/* Layer View Switcher */}
            <div className={`inline-flex p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}>
            <button
              onClick={() => setViewLayer("all")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewLayer === "all"
                  ? isDark ? "bg-[#0B3D2E] text-white shadow" : "bg-white text-zinc-900 shadow-sm"
                  : "text-slate-500 dark:text-zinc-400 hover:opacity-85"
              }`}
            >
              {isRTL ? "التجربة الثلاثية الكاملة (متن + شرح + حاشية)" : "Full Tri-Layer View"}
            </button>
            <button
              onClick={() => setViewLayer("matn-only")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewLayer === "matn-only"
                  ? isDark ? "bg-[#0B3D2E] text-white shadow" : "bg-white text-zinc-900 shadow-sm"
                  : "text-slate-500 dark:text-zinc-400 hover:opacity-85"
              }`}
            >
              {isRTL ? "المتن فقط (زاد المستقنع)" : "Matn Only"}
            </button>
          </div>
        </div>

          {/* Font size controllers */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-bold">{isRTL ? "حجم الخط:" : "Font Size:"}</span>
            <div className={`inline-flex p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}>
              {(["normal", "large", "xlarge"] as const).map(sz => (
                <button
                  key={sz}
                  onClick={() => setFontSize(sz)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all capitalize ${
                    fontSize === sz
                      ? isDark ? "bg-[#C8A762] text-[#0B3D2E] shadow" : "bg-white text-amber-700 shadow-sm"
                      : "text-slate-500 dark:text-zinc-400"
                  }`}
                >
                  {sz === "normal" ? (isRTL ? "عادي" : "A") : sz === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "كبير جداً" : "A++")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Multi-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: Sidebar (TOC & Page Navigation) - Span 3 */}
          <aside className="hidden lg:block lg:col-span-3 space-y-4">
            <div className={`rounded-2xl border p-4 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
                <ListNumbers size={16} />
                {isRTL ? "فهرس الأبواب والصفحات" : "Chapters & Pages"}
              </h3>
              
              {/* Natural-sort ordered items */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black text-amber-600 dark:text-amber-500 mb-2">{activeChapter.title}</p>
                  <div className="space-y-1.5">
                    {activeChapter.blocks.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setActiveBlockId(b.id)}
                        className={`w-full text-right flex items-center justify-between p-2.5 rounded-xl text-xs transition-all ${
                          activeBlockId === b.id
                            ? isDark ? "bg-[#0B3D2E] text-[#C8A762] border border-[#C8A762]/20" : "bg-[#0B3D2E]/10 text-[#0B3D2E] font-bold"
                            : isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate max-w-[150px]">{b.topic}</span>
                        <span className="text-[10px] opacity-75 font-semibold px-2 py-0.5 bg-black/10 dark:bg-white/5 rounded">
                          {isRTL ? `ج ${b.vol}، ص ${b.page}` : `V ${b.vol}, P ${b.page}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </aside>

          {/* CENTER COLUMN: The Book Reader - Span 6 */}
          <div className="nzamy-reader-container lg:col-span-6 space-y-4">
            <div id={`feqh-block-${activeBlock.id}`} className={`nzamy-reader-block rounded-2xl border p-6 md:p-8 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
              
              {/* Pagination Marker Header */}
              <div className="flex items-center justify-between border-b pb-4 mb-6 border-slate-200 dark:border-white/[0.05]">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-[#C8A762]">
                  <FileText size={16} />
                  <span>{isRTL ? `المجلد ${activeBlock.vol}` : `Volume ${activeBlock.vol}`}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />
                  <span>{isRTL ? `الصفحة ${activeBlock.page}` : `Page ${activeBlock.page}`}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 select-none">
                  {isRTL ? "مخطط التوثيق المدمج" : "Embedded Citation Layout"}
                </span>
              </div>

              {/* Matn Box (زاد المستقنع) */}
              {(viewLayer === "all" || viewLayer === "matn-only") && (
                <div className="mb-6 relative">
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 tracking-wider">
                    <BookmarkSimple size={10} weight="fill" />
                    {isRTL ? "المتن (زاد المستقنع)" : "Matn"}
                  </div>
                  <div className="p-5 bg-amber-500/[0.03] border border-amber-500/10 dark:border-amber-500/20 rounded-2xl">
                    <p className={`font-serif text-[#9b6f12] dark:text-[#C8A762] text-center ${fontClass}`}>
                      {activeBlock.matn}
                    </p>
                  </div>
                </div>
              )}

              {/* Sharh Block (الروض المربع) */}
              {viewLayer === "all" && (
                <div className="mb-8 relative">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#0B3D2E] dark:text-emerald-400 tracking-wider mb-2.5">
                    <FileText size={11} weight="fill" />
                    {isRTL ? "الشرح (الروض المربع)" : "Sharh"}
                  </div>
                  <div className={`font-sans text-slate-800 dark:text-zinc-200 text-justify ${fontClass}`}>
                    {activeBlock.sharh.split("\n").map((para, pi) => (
                      <p key={pi} className="mb-4">{para}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Footnotes / Hashiyah (حاشية ابن قاسم) */}
              {viewLayer === "all" && activeBlock.hashiyah.length > 0 && (
                <div className="border-t pt-5 mt-6 border-slate-200 dark:border-white/[0.05]">
                  <h4 className="text-xs font-black text-slate-500 dark:text-zinc-400 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                    <ListNumbers size={14} />
                    {isRTL ? "حاشية ابن قاسم (الحواشي)" : "Footnotes"}
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

            {/* AI assistant in the reader */}
            <div className={`rounded-2xl border p-6 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white shadow-sm border-slate-200"}`}>
              <h3 className="text-sm font-black mb-3 flex items-center gap-2">
                <Sparkle size={18} className="text-amber-500" weight="fill" />
                {isRTL ? "مساعد الذكاء الاصطناعي للفقه" : "AI Feqh Assistant"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-4">
                {isRTL 
                  ? "اسأل المساعد عن تخريج الأحاديث أو مقارنة الأحكام الفقهية بالقوانين السعودية المعاصرة."
                  : "Ask the AI assistant for comparative legal analyses."}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={isRTL ? "مثال: ما الفرق بين الشرط والركن وكيف يتفق مع نظام المعاملات؟" : "Ask something..."}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  className={`flex-1 px-4 py-2 text-xs rounded-xl border outline-none ${
                    isDark ? "bg-zinc-800 border-white/10 text-white" : "bg-white border-slate-200"
                  }`}
                  onKeyDown={e => { if (e.key === "Enter") handleAskAI(); }}
                />
                <button
                  onClick={handleAskAI}
                  disabled={aiLoading}
                  className="px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:opacity-90 transition"
                >
                  {aiLoading ? (isRTL ? "جاري التحليل..." : "Analyzing...") : (isRTL ? "اسأل" : "Ask")}
                </button>
              </div>
              <AnimatePresence>
                {aiResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 rounded-xl bg-amber-500/[0.03] border border-amber-500/10 text-xs leading-relaxed text-slate-700 dark:text-zinc-300 text-justify"
                  >
                    {aiResponse}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT COLUMN: Comparative Panel (Saudi Law Matches & Hadith) - Span 3 */}
          <aside className="hidden lg:block lg:col-span-3 space-y-4">
            
            {/* Saudi Modern Law Alignment */}
            <div className={`rounded-2xl border p-4 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
              <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <Scales size={15} className="text-emerald-500" />
                {isRTL ? "التوافق مع الأنظمة السعودية" : "Saudi Statutory Alignment"}
              </h3>
              {activeBlock.relatedLawArticles.length > 0 ? (
                <div className="space-y-3">
                  {activeBlock.relatedLawArticles.map((rel, ri) => (
                    <div key={ri} className="p-3 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 mb-1">{rel.lawName}</p>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 mb-1">{rel.articleNum}</p>
                      <p className="text-[10px] text-slate-600 dark:text-zinc-400 leading-relaxed text-justify">{rel.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 dark:text-zinc-500 text-xs">
                  <Info size={20} className="mx-auto mb-2 opacity-50" />
                  {isRTL ? "لا توجد إحالة مباشرة في المعاملات المدنية" : "No direct statutory match"}
                </div>
              )}
            </div>

            {/* Hadith Verification Panel */}
            <div className={`rounded-2xl border p-4 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
              <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <Gavel size={15} className="text-amber-500" />
                {isRTL ? "تخريج الأحاديث النبوية" : "Hadith Verification"}
              </h3>
              {activeBlock.hadithVerification.length > 0 ? (
                <div className="space-y-3">
                  {activeBlock.hadithVerification.map((h, hi) => (
                    <div key={hi} className="p-3 rounded-xl bg-amber-500/[0.03] border border-amber-500/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-black text-amber-600 dark:text-amber-500">{isRTL ? "تخريج الحديث" : "Verification"}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black ${
                          h.status === "صحيح" || h.status === "متفق عليه"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-amber-500/10 text-amber-600"
                        }`}>{h.status}</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-800 dark:text-zinc-200 mb-1.5 leading-relaxed text-justify">
                        {h.text}
                      </p>
                      <p className="text-[9px] text-slate-500 dark:text-zinc-500 text-justify">{h.source}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 dark:text-zinc-500 text-xs">
                  <Info size={20} className="mx-auto mb-2 opacity-50" />
                  {isRTL ? "لا توجد أحاديث منصوص عليها في هذا الموضع" : "No Hadiths mentioned in this block"}
                </div>
              )}
            </div>

            {/* Custom OCR Feature Pitch */}
            <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#161b22] border-white/[0.07]" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                  <Sparkle size={16} weight="fill" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#0B3D2E] dark:text-[#C8A762] mb-1">
                    {isRTL ? "مهارة استخراج الكتب الفقهية" : "Feqh OCR Extractor"}
                  </h4>
                  <p className="text-[10px] text-slate-600 dark:text-zinc-400 leading-relaxed text-justify">
                    {isRTL 
                      ? "نسخة مخصصة من مهارة تفريغ الـ PDF تقوم بفصل المتن عن الشرح والحواشي تلقائياً، مع تتبع الجزء والصفحة بدقة وإلغاء التداخل البصري."
                      : "A customized PDF OCR processor designed to extract Matn, Sharh, and footnotes separately, maintaining pages."}
                  </p>
                </div>
              </div>
            </div>
          </aside>

        </div>
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
