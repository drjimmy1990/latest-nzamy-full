"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, ArrowLeft, ArrowRight, Star,
  CheckCircle, SealCheck, ClockCounterClockwise,
  MagnifyingGlass, Crown, Lock, Globe,
  ShieldCheck, Brain, Scales, ChatCircleDots,
  Gavel, Article, Info, FileArrowDown, Scroll,
} from "@phosphor-icons/react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

// ─── Data: Law of Civil Procedure ───────────────────────────────────────────
const SYSTEM_DETAILS = {
  title: "نظام المرافعات الشرعية ولائحته التنفيذية",
  titleEn: "Law of Sharia Procedure & Executive Regulations",
  dateSystem: "١٤٣٥/٠١/٢٢هـ.",
  dateRegs: "١٤٣٥/٠٥/١٩هـ.",
  approval: "المرسوم الملكي رقم (م/١) وتاريخ ٢٢ / ١ / ١٤٣٥ هـ، وقرار مجلس الوزراء رقم (١١)، والقرار الوزاري رقم (٣٩٩٣٣).",
  status: "ساري",
  statusType: "active",
  amendmentsStatus: "جرى تعديل بعض مواده.",
  category: "الأنظمة السعودية – أنظمة السلطة القضائية",
};

interface ArticleData {
  id: number;
  numTitle: string;
  currentText: string;
  executiveRegulations: { num: string; text: string }[];
  amendment?: {
    source: string;
    date: string;
    originalText: string;
    description: string;
  };
}

const ARTICLES: ArticleData[] = [
  {
    id: 1,
    numTitle: "المادة الأولى",
    currentText: "تطبق المحاكم على القضايا المعروضة أمامها أحكام الشريعة الإسلامية، وفقاً لما دل عليه الكتاب والسنة، وما يصدره ولي الأمر من أنظمة لا تتعارض معهما، وتتقيد في إجراءات نظرها بما ورد في هذا النظام.",
    executiveRegulations: [
      { num: "١/١", text: "كل تصرف ينقض حكمًا شرعيًا أو نظاميًا فلا عبرة به، ويُرد." },
      { num: "١/٢", text: "يُقصد بالأنظمة التي يصدرها ولي الأمر: جميع الأنظمة السارية في المملكة التي لا تتعارض مع الشريعة." }
    ]
  },
  {
    id: 2,
    numTitle: "المادة الثانية",
    currentText: "لا تقبل أي دعوى أو طلب لا يكون لصاحبه فيه مصلحة قائمة مشروعة، وتكفي المصلحة المحتملة إذا كان الغرض من الطلب الاحتياط لدفع ضرر محدق أو الاستيثاق لحق يخشى زوال دليله عند النزاع فيه.",
    executiveRegulations: [
      { num: "٢/١", text: "المصلحة القائمة: هي الفائدة أو الحق الذي يعود للمدعي من رفع الدعوى وقت إقامتها." },
      { num: "٢/٢", text: "من المصلحة المحتملة دعوى إثبات حالة، كإثبات الزوجة ترك زوجها لها، ونحو ذلك." },
      { num: "٢/٣", text: "في حال انتفاء المصلحة القائمة أو المحتملة في القضية، فعلى القاضي الحكم برد الدعوى." }
    ],
    amendment: {
      source: "مرسوم ملكي م/14",
      date: "١٤٤١/٠٣/١٥هـ",
      originalText: "لا تقبل أي دعوى لا يكون لصاحبها مصلحة قائمة مشروعة فقط.",
      description: "تمت إضافة فقرة المصلحة المحتملة لتشمل الدعاوى الاستباقية لمنع الأضرار."
    }
  },
  {
    id: 3,
    numTitle: "المادة الثالثة",
    currentText: "لا يجوز نقل أي قضية رُفعت بطريقة صحيحة لمحكمة مختصة إلى محكمة أو جهة أخرى قبل الحكم فيها، إلا بناءً على طلب من الخصوم طبقاً لهذا النظام، أو بقرار صادر من المجلس الأعلى للقضاء.",
    executiveRegulations: []
  },
  {
    id: 4,
    numTitle: "المادة الرابعة",
    currentText: "يكون رفع الدعوى من المدعي بصحيفة تودع لدى المحكمة المختصة وتُقيد في يوم إيداعها، وتُسلّم للمدعي وللمدعى عليه صورة منها. ويكون الإيداع والقيد وفقاً للإجراءات التقنية المعتمدة المنظمة لذلك.",
    executiveRegulations: [
      { num: "٤/١", text: "يراد بالصحيفة: وثيقة الدعوى التي تتضمن بيانات المدعي والمدعى عليه، وموضوع الدعوى، وأسانيدها." },
      { num: "٤/٢", text: "يتم الإيداع من خلال منصة (ناجز) الإلكترونية أو ما يحل محلها." }
    ],
    amendment: {
      source: "قرار إداري",
      date: "١٤٤٣هـ",
      originalText: "يكون رفع الدعوى بصحيفة تودع في إدارة المحكمة من أصل وصور بعدد المدعى عليهم.",
      description: "تم استبدال الإيداع الورقي بالأنظمة الإلكترونية وتفعيل الوسائل الرقمية."
    }
  }
];

// ─── Article Card Component ───────────────────────────────────────────────
function ArticleCard({ article, isDark, isRTL }: { article: ArticleData; isDark: boolean; isRTL: boolean }) {
  const [showAmends, setShowAmends] = useState(false);
  const muted = isDark ? "text-gray-400" : "text-slate-500";
  const border = isDark ? "border-white/[0.06]" : "border-slate-200";
  const bgCard = isDark ? "bg-[#0c0f12]" : "bg-white";

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${bgCard} ${border} mb-6`} id={`article-${article.id}`}>
      {/* 1. Article Header */}
      <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? "bg-white/[0.02]" : "bg-slate-50"} ${border}`}>
        <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-royal"}`}>
          {article.numTitle}
        </h3>
        {article.amendment && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
            {isRTL ? "مُعدَّلة" : "Amended"}
          </span>
        )}
      </div>

      {/* 2. Current Text (النص الساري) */}
      <div className="p-5">
        <p className={`text-sm font-bold mb-3 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
          {isRTL ? "📜 النص الساري:" : "Current Text:"}
        </p>
        <p className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-800"}`}>
          {article.currentText}
        </p>
      </div>

      {/* 3. Executive Regulations (اللائحة التنفيذية) */}
      {article.executiveRegulations.length > 0 && (
        <div className={`p-5 border-t relative overflow-hidden ${isDark ? "bg-[#1f1e1c]/40" : "bg-[#faf9f6]"} ${border}`}>
          <div className="absolute top-0 bottom-0 w-1 bg-[#C8A762] right-0" />
          <div className="flex items-center gap-2 mb-3">
            <Scroll size={18} weight="fill" className="text-[#C8A762]" />
            <h4 className={`text-sm font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "اللائحة التنفيذية:" : "Executive Regulations:"}
            </h4>
          </div>
          <div className="space-y-3 ms-2">
            {article.executiveRegulations.map((reg) => (
              <div key={reg.num} className="flex gap-3 items-start">
                <span className={`text-xs font-bold mt-1 shrink-0 px-1.5 py-0.5 rounded-md ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#C8A762]/20 text-[#0B3D2E]"}`}>
                  {reg.num}
                </span>
                <p className={`text-sm leading-relaxed ${muted}`}>{reg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Amendments History (التعديلات) */}
      {article.amendment && (
        <div className={`border-t ${border}`}>
          <button
            onClick={() => setShowAmends(!showAmends)}
            className={`w-full px-5 py-3 text-start flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
          >
            <div className="flex items-center gap-2">
              <ClockCounterClockwise size={16} className={isDark ? "text-amber-400" : "text-amber-600"} />
              <span className={`text-sm font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                {isRTL ? "تاريخ التعديلات والنص الأصلي" : "Amendment History & Original Text"}
              </span>
            </div>
            <span className={`text-[11px] ${muted}`}>
              {showAmends ? (isRTL ? "إخفاء التفاصيل" : "Hide details") : (isRTL ? "إظهار التفاصيل" : "Show details")}
            </span>
          </button>
          
          <AnimatePresence>
            {showAmends && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className={`p-5 pt-1 border-t border-dashed ${border}`}>
                  <div className={`p-4 rounded-xl mt-3 ${isDark ? "bg-amber-500/5 border border-amber-500/10" : "bg-amber-50 border border-amber-100"}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                      <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${isDark ? "bg-white/10 text-amber-400" : "bg-white text-amber-700 shadow-sm"}`}>
                        {article.amendment.source}
                      </span>
                      <span className={`text-[11px] font-bold ${muted}`}>
                        التاريخ: {article.amendment.date}
                      </span>
                    </div>
                    <p className={`text-[12px] font-bold mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>النص قبل التعديل:</p>
                    <p className={`text-sm leading-relaxed mb-3 line-through opacity-70 ${isDark ? "text-gray-300" : "text-gray-800"}`}>
                      {article.amendment.originalText}
                    </p>
                    <p className={`text-[12px] font-bold mb-1 ${isDark ? "text-amber-500" : "text-amber-700"}`}>سبب/طبيعة التعديل:</p>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {article.amendment.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}


// ─── Main Page ──────────────────────────────────────────────────────────────
export default function CivilProcedureLawPage() {
  const { lang, theme } = useTheme();
  const user = useUser();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";

  const muted = isDark ? "text-gray-400" : "text-slate-500";
  const border = isDark ? "border-white/[0.06]" : "border-slate-200";

  return (
    <div className={`min-h-screen ${isDark ? "bg-dark-bg" : "bg-[#f8f9fa]"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 pt-32 pb-20 relative flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Main Content */}
        <div className="flex-1 min-w-0">
          
          {/* Back link */}
          <Link href="/laws" className={`inline-flex items-center gap-2 text-sm font-semibold mb-6 transition-colors ${isDark ? "text-[#C8A762] hover:text-white" : "text-[#0B3D2E] hover:text-royal"}`}>
            <ArrowRight size={16} />
            {isRTL ? "العودة إلى المكتبة القانونية" : "Back to Legal Library"}
          </Link>

          {/* System Detals Card (Header) */}
          <div className={`rounded-3xl border overflow-hidden mb-8 ${isDark ? "bg-dark-card border-white/[0.06]" : "bg-white border-slate-200 shadow-md"}`}>
            <div className="bg-gradient-to-l from-[#0B3D2E] to-[#12503d] p-8 text-white relative">
               <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
               <h1 className="text-3xl font-black mb-3 font-brand relative z-10">{SYSTEM_DETAILS.title}</h1>
               <div className="flex items-center gap-3 relative z-10">
                 <span className="px-3 py-1 rounded-full bg-[#C8A762] text-[#0B3D2E] text-xs font-bold">
                   تفعيل: {SYSTEM_DETAILS.status}
                 </span>
                 <span className="text-xs text-white/80">
                   {SYSTEM_DETAILS.category}
                 </span>
               </div>
            </div>
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className={`text-xs uppercase mb-1 ${muted}`}>تاريخ النظام</p>
                <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{SYSTEM_DETAILS.dateSystem}</p>
              </div>
              <div>
                <p className={`text-xs uppercase mb-1 ${muted}`}>تاريخ اللائحة</p>
                <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{SYSTEM_DETAILS.dateRegs}</p>
              </div>
              <div className="md:col-span-2">
                <p className={`text-xs uppercase mb-1 ${muted}`}>الاعتماد</p>
                <p className={`text-sm font-bold leading-relaxed ${isDark ? "text-white" : "text-gray-900"}`}>{SYSTEM_DETAILS.approval}</p>
              </div>
              <div className="md:col-span-2">
                <p className={`text-xs uppercase mb-1 ${muted}`}>التعديلات والحالة</p>
                <p className={`text-sm font-medium ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  <Info size={16} className="inline me-1 -mt-0.5" />
                  {SYSTEM_DETAILS.amendmentsStatus} (يتم عرض النص الساري افتراضياً مع إمكانية عرض التعديلات).
                </p>
              </div>
            </div>
          </div>

          {/* Articles list */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-royal"}`}>
                مواد النظام ولائحته التنفيذية
              </h2>
            </div>

            <div className="space-y-6">
              {ARTICLES.map(article => (
                <ArticleCard key={article.id} article={article} isDark={isDark} isRTL={isRTL} />
              ))}
            </div>

            {/* Note about continuation */}
            <div className={`mt-8 text-center p-8 rounded-2xl border border-dashed ${isDark ? "border-white/20 text-gray-500" : "border-slate-300 text-slate-500"}`}>
              <p className="text-sm">هذا العرض يشمل المواد الأولية كنموذج (بناءً على النصوص المزودة).</p>
              <p className="text-xs mt-2">يمكنك تصفح باقي المواد (حتى المادة ٧١ وما بعدها) من خلال محرك البحث المخصص للمكتبة.</p>
            </div>
          </div>

        </div>

        {/* Right Column: AI Assistant & Index */}
        <div className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="sticky top-28 space-y-6">
            
            {/* Quick Search */}
            <div className={`rounded-2xl border p-5 ${isDark ? "bg-[#0c0f12] border-white/[0.06]" : "bg-white border-slate-200"}`}>
              <h3 className={`font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>البحث في النظام</h3>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="رقم المادة، أداة إثبات..." 
                  className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-[#C8A762]/50 ${isDark ? "bg-dark-bg border-white/10 text-white" : "bg-slate-50 border-slate-200 text-gray-900"}`}
                />
                <MagnifyingGlass size={18} className={`absolute left-3 top-3 ${muted}`} />
              </div>
            </div>

            {/* AI Call to Action */}
            <div className="rounded-2xl rounded-tr-none bg-gradient-to-br from-[#0B3D2E] to-[#12503d] text-white p-6 shadow-xl relative overflow-hidden">
               <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#C8A762]/20 rounded-full blur-3xl pointer-events-none" />
               <Brain size={32} weight="duotone" className="text-[#C8A762] mb-3" />
               <h3 className="font-bold text-lg mb-2">هل لديك استفسار؟</h3>
               <p className="text-xs text-white/80 leading-relaxed mb-4">
                 اسأل "نظامي AI" عن أي إجراء من إجراءات المرافعات ليقوم بالرد فوراً مع السند النظامي.
               </p>
               <Link href="/ai/consult" className="block w-full text-center bg-[#C8A762] text-[#0B3D2E] font-bold text-sm py-2.5 rounded-xl hover:opacity-90 transition">
                 اسأل المساعد الذكي
               </Link>
            </div>

            {/* Index Map */}
            <div className={`rounded-2xl border p-5 ${isDark ? "bg-[#0c0f12] border-white/[0.06]" : "bg-white border-slate-200"}`}>
              <h3 className={`font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>فهرس النظام</h3>
              <ul className={`space-y-3 text-sm ${muted}`}>
                <li><a href="#article-1" className="hover:text-[#C8A762] transition-colors">الباب الأول: أحكام عامة</a></li>
                <li><a href="#" className="hover:text-[#C8A762] transition-colors">الباب الثاني: الاختصاص</a></li>
                <li><a href="#" className="hover:text-[#C8A762] transition-colors">الباب الثالث: رفع الدعوى وقيدها</a></li>
                <li><a href="#" className="hover:text-[#C8A762] transition-colors">الباب الرابع: حضور الخصوم وغيابهم</a></li>
                <li className="pt-2"><a href="#" className="text-xs text-[#0B3D2E] dark:text-emerald-400 font-bold hover:underline">عرض الفهرس كاملاً...</a></li>
              </ul>
            </div>

          </div>
        </div>

      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
