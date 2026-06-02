"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  FileText,
  ChatCircleDots,
  PencilSimple,
  MagnifyingGlass,
  Notebook,
  Translate,
  Brain,
  Database,
  UserCheck,
  ArrowLeft,
  Sparkle,
  User,
  Scales,
  Envelope,
  Robot,
  FileMagnifyingGlass,
  Globe,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useUser, UserPermission } from "@/hooks/useUser";
import { LAWYER_AI_TOOLS, getLawyerAiBadge, type LawyerAiTool } from "@/constants/lawyerAiCatalog";

// ─── Data ─────────────────────────────────────────────────────────────────────

const typingQueries = [
  { ar: "ما هي شروط عقد الإيجار في نظام الإيجار السعودي؟", en: "What are lease contract requirements under Saudi tenancy law?" },
  { ar: "كيف أرفع دعوى أمام محكمة العمل؟", en: "How do I file a labor court claim in Saudi Arabia?" },
  { ar: "ما هي حقوقي عند إنهاء عقد العمل؟", en: "What are my rights upon termination of employment contract?" },
];

const capabilities = [
  { icon: FileText, titleAr: "تحليل العقود", titleEn: "Contract Analysis", descAr: "راجع وحلّل أي عقد قانوني وكشف البنود المخفية والمخاطر المحتملة بدقة عالية.", descEn: "Review and analyze any legal contract, uncovering hidden clauses and potential risks with high accuracy." },
  { icon: ChatCircleDots, titleAr: "الإجابة على الاستفسارات", titleEn: "Answer Legal Queries", descAr: "احصل على إجابات فورية لأسئلتك القانونية المستندة إلى الأنظمة السعودية المحدّثة.", descEn: "Get instant answers to your legal questions based on up-to-date Saudi regulations." },
  { icon: PencilSimple, titleAr: "صياغة المستندات", titleEn: "Document Drafting", descAr: "اصدر عقوداً ومذكرات ورسائل رسمية متوافقة مع القانون السعودي في دقائق.", descEn: "Generate contracts, memos, and official letters compliant with Saudi law in minutes." },
  { icon: MagnifyingGlass, titleAr: "البحث القانوني", titleEn: "Legal Research", descAr: "ابحث في قاعدة بيانات شاملة للأنظمة واللوائح والسوابق القضائية السعودية.", descEn: "Search a comprehensive database of Saudi laws, regulations, and judicial precedents." },
  { icon: Notebook, titleAr: "تلخيص الأحكام", titleEn: "Verdict Summarization", descAr: "لخّص أحكاماً قضائية معقدة واستخرج النقاط الجوهرية بأسلوب واضح ومبسّط.", descEn: "Summarize complex court rulings and extract key points in a clear, simplified manner." },
  { icon: Translate, titleAr: "الترجمة القانونية", titleEn: "Legal Translation", descAr: "ترجم المستندات القانونية بين العربية والإنجليزية مع الحفاظ على الدقة المصطلحية.", descEn: "Translate legal documents between Arabic and English while preserving terminological precision." },
];

const chatDemo = [
  {
    userAr: "ما هي مدة الاختبار في عقد العمل السعودي؟",
    userEn: "What is the probation period in a Saudi employment contract?",
    aiAr: "وفقاً لنظام العمل السعودي (المادة ٥٣)، لا تتجاوز فترة الاختبار ٩٠ يوماً للعمال العاديين، وقد تمتد إلى ١٨٠ يوماً بموافقة الطرفين. خلال هذه الفترة يحق لكلا الطرفين إنهاء العقد دون إشعار مسبق.",
    aiEn: "Under Saudi Labor Law (Article 53), the probation period shall not exceed 90 days for regular workers, and may be extended to 180 days by mutual agreement. During this period, either party may terminate the contract without prior notice.",
  },
  {
    userAr: "هل يحق للموظف الحصول على تعويض عند إنهاء العقد أثناء الاختبار؟",
    userEn: "Is the employee entitled to compensation if the contract is terminated during probation?",
    aiAr: "خلال فترة الاختبار، لا يستحق الموظف مكافأة نهاية خدمة. غير أنه يستحق أجراً كاملاً عن الأيام التي أمضاها في العمل، وقد يستحق تعويضاً إذا ثبت أن الإنهاء تعسفي وفق ما تقدّره المحكمة العمالية.",
    aiEn: "During the probation period, the employee is not entitled to end-of-service gratuity. However, they are entitled to full wages for the days worked, and may be entitled to compensation if termination is proven arbitrary as determined by the labor court.",
  },
  {
    userAr: "كيف أرفع شكوى للمحكمة العمالية؟",
    userEn: "How do I file a complaint with the labor court?",
    aiAr: "يمكنك رفع شكوى عمالية عبر: ١) منصة مساند أو أبشر للعمال، ٢) تقديم الطلب للمحكمة العمالية المختصة، ٣) إرفاق عقد العمل والمراسلات والأدلة الداعمة. تُنظر القضايا خلال ٣٠ يوماً كحد أقصى في المرحلة الأولى.",
    aiEn: "You can file a labor complaint via: 1) Musaned or Absher platforms for workers, 2) Submit a request to the competent labor court, 3) Attach the employment contract, correspondence, and supporting evidence. Cases are heard within 30 days max in the first stage.",
  },
];

const techPillars = [
  { icon: Brain, titleAr: "النماذج اللغوية المتقدمة", titleEn: "Advanced Language Models", descAr: "نماذج AI مدرّبة خصيصاً على النصوص القانونية السعودية والعربية لتحقيق أعلى دقة ممكنة.", descEn: "AI models specifically trained on Saudi and Arabic legal texts for maximum accuracy." },
  { icon: Database, titleAr: "قاعدة الأنظمة السعودية", titleEn: "Saudi Law Database", descAr: "أكثر من ٥٠٠٠ نظام ولائحة وقرار وزاري سعودي محدّث بشكل دوري وآني.", descEn: "Over 5,000 Saudi regulations, bylaws, and ministerial decrees updated periodically in real time." },
  { icon: UserCheck, titleAr: "مراجعة المحامين المرخّصين", titleEn: "Licensed Lawyer Review", descAr: "كل مخرجات AI تمر بمرحلة تحقق إضافية من محامين سعوديين مرخّصين لضمان الدقة والموثوقية.", descEn: "All AI outputs pass through an additional verification stage by licensed Saudi lawyers to ensure accuracy and reliability." },
];

const stats = [
  { valueAr: "١٢ مليون", valueEn: "12 Million", labelAr: "سؤال أُجيب", labelEn: "Questions Answered" },
  { valueAr: "٩٨.٤٪", valueEn: "98.4%", labelAr: "دقة الإجابات", labelEn: "Answer Accuracy" },
  { valueAr: "٣٠ ثانية", valueEn: "30 Seconds", labelAr: "متوسط وقت الرد", labelEn: "Average Response Time" },
];

// ─── Typing Animation Hook ────────────────────────────────────────────────────

function useTypingEffect(text: string, speed = 40) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return displayed;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AiLandingPage() {
  const { lang, theme } = useTheme();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";

  const [queryIndex, setQueryIndex] = useState(0);
  const currentQuery = isRTL ? typingQueries[queryIndex].ar : typingQueries[queryIndex].en;
  const typedText = useTypingEffect(currentQuery, 35);

  // Cycle query every 4s after typing finishes
  useEffect(() => {
    const timeout = setTimeout(() => {
      setQueryIndex((prev) => (prev + 1) % typingQueries.length);
    }, 4500);
    return () => clearTimeout(timeout);
  }, [queryIndex]);

  return (
    <div className={`min-h-screen ${isDark ? "bg-dark-bg" : "bg-slate-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* ── 1. Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28">
        {/* Gradient background */}
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-[#0B3D2E] via-dark-bg to-dark-bg" : "bg-gradient-to-br from-[#0B3D2E] via-[#0f5a42] to-[#0B3D2E]"}`} />
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-[#C8A762]/10 blur-3xl"
          />
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute -bottom-20 -left-20 h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-3xl"
          />
        </div>

        <div className="relative mx-auto max-w-[1200px] px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/10 px-4 py-2"
          >
            <Sparkle size={14} weight="fill" className="text-[#C8A762]" />
            <span className="text-xs font-semibold text-[#C8A762]">{isRTL ? "مدعوم بالذكاء الاصطناعي" : "Powered by AI"}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-brand mb-6 text-4xl font-bold leading-tight text-white md:text-6xl"
          >
            {isRTL ? (
              <>نظامي <span className="text-[#C8A762]">AI</span> — مساعدك القانوني الذكي</>
            ) : (
              <>Nezamy <span className="text-[#C8A762]">AI</span> — Your Smart Legal Assistant</>
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mb-12 max-w-[55ch] text-lg text-white/70"
          >
            {isRTL
              ? "مدرّب على الأنظمة والتشريعات السعودية. يجيب، يحلّل، ويصوغ — في ثوانٍ."
              : "Trained on Saudi laws and regulations. It answers, analyzes, drafts — in seconds."}
          </motion.p>

          {/* Typing demo box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ms-2 text-xs text-white/40">{isRTL ? "نظامي AI" : "Nezamy AI"}</span>
            </div>
            <div className="px-6 py-5 text-start">
              <div className="mb-2 flex items-center gap-2">
                <User size={16} className="shrink-0 text-white/50" />
                <span className="text-xs text-white/50">{isRTL ? "أنت" : "You"}</span>
              </div>
              <p className="min-h-[3.5rem] text-base text-white/90" dir={isRTL ? "rtl" : "ltr"}>
                {typedText}
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="inline-block w-0.5 h-[1.1em] bg-[#C8A762] ms-0.5 align-middle"
                />
              </p>
            </div>
          </motion.div>

          <motion.a
            href="/register"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#C8A762] px-8 py-4 text-sm font-bold text-white shadow-[0_8px_24px_-4px_rgba(200,167,98,0.5)] transition-shadow hover:shadow-[0_12px_32px_-4px_rgba(200,167,98,0.65)]"
          >
            {isRTL ? "جرّب نظامي AI مجاناً" : "Try Nezamy AI Free"}
            <ArrowLeft size={16} weight="bold" className={isRTL ? "" : "rotate-180"} />
          </motion.a>
        </div>
      </section>

      {/* ── 2. Capabilities Grid ─────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-card" : "bg-white"}`}>
        <div className="mx-auto max-w-[1200px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className={`font-brand mb-3 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "ما الذي يستطيع نظامي AI فعله؟" : "What can Nezamy AI do?"}
            </h2>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "٦ قدرات جوهرية لتغطية كل احتياجاتك القانونية" : "6 core capabilities to cover all your legal needs"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                  className={`group rounded-2xl border p-6 transition-shadow hover:shadow-lg ${
                    isDark
                      ? "border-white/10 bg-dark-bg hover:border-[#C8A762]/30"
                      : "border-slate-100 bg-white hover:border-[#0B3D2E]/20"
                  }`}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
                    <Icon size={24} weight="duotone" />
                  </div>
                  <h3 className={`mb-2 font-semibold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                    {isRTL ? cap.titleAr : cap.titleEn}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                    {isRTL ? cap.descAr : cap.descEn}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3. Demo Conversation ─────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-[900px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className={`font-brand mb-3 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "شاهد نظامي AI في العمل" : "See Nezamy AI in Action"}
            </h2>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "محادثة حقيقية حول نظام العمل السعودي" : "A real conversation about Saudi labor law"}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className={`overflow-hidden rounded-3xl border shadow-xl ${
              isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-white"
            }`}
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b bg-[#0B3D2E] px-5 py-4 dark:border-white/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <Brain size={18} weight="fill" className="text-[#C8A762]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{isRTL ? "نظامي AI" : "Nezamy AI"}</div>
                <div className="flex items-center gap-1.5">
                  <motion.span
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  />
                  <span className="text-[10px] text-white/60">{isRTL ? "متصل الآن" : "Online now"}</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-6 p-6">
              {chatDemo.map((exchange, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="space-y-3"
                >
                  {/* User bubble */}
                  <div className="flex justify-end">
                    <div className={`max-w-[80%] rounded-2xl rounded-ee-none px-4 py-3 text-sm leading-relaxed ${
                      isDark ? "bg-[#0B3D2E] text-white" : "bg-[#0B3D2E] text-white"
                    }`}>
                      {isRTL ? exchange.userAr : exchange.userEn}
                    </div>
                  </div>
                  {/* AI bubble */}
                  <div className="flex justify-start gap-3">
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#C8A762]/15">
                      <Brain size={14} weight="fill" className="text-[#C8A762]" />
                    </div>
                    <div className={`max-w-[80%] rounded-2xl rounded-ss-none border px-4 py-3 text-sm leading-relaxed ${
                      isDark ? "border-white/10 bg-white/5 text-gray-300" : "border-slate-100 bg-slate-50 text-slate-700"
                    }`}>
                      <span className="mb-1.5 block text-[11px] font-bold text-[#C8A762]">{isRTL ? "نظامي AI" : "Nezamy AI"}</span>
                      {isRTL ? exchange.aiAr : exchange.aiEn}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Disclaimer */}
            <div className={`border-t px-6 py-3 text-center ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>
                {isRTL
                  ? "! الإجابات لأغراض إعلامية فقط ولا تُعدّ استشارة قانونية رسمية"
                  : "! Responses are for informational purposes only and do not constitute official legal advice"}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 4. How AI Works ──────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-card" : "bg-white"}`}>
        <div className="mx-auto max-w-[1200px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className={`font-brand mb-3 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "كيف يعمل نظامي AI؟" : "How does Nezamy AI work?"}
            </h2>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "ثلاثة أعمدة تقنية تضمن الدقة والموثوقية" : "Three technical pillars ensuring accuracy and reliability"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {techPillars.map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="relative text-center"
                >
                  {/* Connector line */}
                  {i < 2 && (
                    <div className={`absolute top-10 hidden w-full translate-x-1/2 border-t-2 border-dashed md:block ${isDark ? "border-white/10" : "border-slate-200"}`} style={{ left: "50%", width: "calc(100% - 3rem)" }} />
                  )}
                  <div className={`relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border-4 ${
                    isDark ? "border-dark-bg bg-dark-bg" : "border-white bg-white"
                  } shadow-xl`}>
                    <div className="flex h-full w-full items-center justify-center rounded-xl bg-[#0B3D2E]">
                      <Icon size={32} weight="duotone" className="text-[#C8A762]" />
                    </div>
                    <span className="absolute -bottom-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#C8A762] text-xs font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className={`mb-2 text-lg font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                    {isRTL ? pillar.titleAr : pillar.titleEn}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                    {isRTL ? pillar.descAr : pillar.descEn}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 5. Stats ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B3D2E] to-[#0f5a42]" />
        <motion.div
          animate={{ x: ["0%", "100%"], opacity: [0, 0.1, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(200,167,98,0.08),transparent)]"
        />
        <div className="relative mx-auto max-w-[1200px] px-4">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="font-brand mb-2 text-5xl font-bold text-[#C8A762]">
                  {isRTL ? stat.valueAr : stat.valueEn}
                </div>
                <div className="text-base font-medium text-white/80">
                  {isRTL ? stat.labelAr : stat.labelEn}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. CTA ───────────────────────────────────────────────────────────── */}
      <section className={`py-24 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-[700px] px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0B3D2E]">
                <Brain size={32} weight="fill" className="text-[#C8A762]" />
              </div>
            </div>
            <h2 className={`font-brand mb-4 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "جرّب نظامي AI مجاناً اليوم" : "Try Nezamy AI Free Today"}
            </h2>
            <p className={`mb-8 text-base ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL
                ? "لا تحتاج بطاقة ائتمانية. ابدأ فوراً واحصل على ٥ استفسارات مجانية."
                : "No credit card required. Start immediately and get 5 free queries."}
            </p>
            <motion.a
              href="/register"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#0B3D2E] px-10 py-4 text-base font-bold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)] transition-shadow hover:shadow-[0_12px_40px_-8px_rgba(11,61,46,0.65)]"
            >
              {isRTL ? "جرّب نظامي AI مجاناً" : "Try Nezamy AI Free"}
              <ArrowLeft size={18} weight="bold" className={isRTL ? "" : "rotate-180"} />
            </motion.a>
          </motion.div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}

// ─── AI Hub (for signed-in users) ──────────────────────────────────────────────

type AiToolCard = {
  id: string | null;
  href: string;
  titleAr: string;
  titleEn: string;
  icon: any;
  descAr: string;
  descEn: string;
  badge?: string;
  badgeAr?: string;
  badgeEn?: string;
};

const LAWYER_AI_ICON_MAP: Record<LawyerAiTool["permission"], any> = {
  "ai:consult": ChatCircleDots,
  "ai:quick-answer": ChatCircleDots,
  "ai:case-brief": Robot,
  "ai:draft": PencilSimple,
  "ai:brief-check": FileMagnifyingGlass,
  "ai:collector": Notebook,
  "ai:contracts": FileText,
  "ai:contract-drafter": FileText,
  "ai:wargaming": Scales,
  "ai:analyze-strength": Sparkle,
  "ai:analyze": MagnifyingGlass,
  "ai:legal-opinion": Brain,
  "ai:procedures": UserCheck,
  "ai:fee-calculator": Sparkle,
  "ai:najiz-optimizer": Sparkle,
  "ai:direction-support": Sparkle,
  "ai:legal-translate": Translate,
  "ai:transcriber": Notebook,
  "ai:compare": Sparkle,
  "ai:secretary": Robot,
  "ai:monitor": Database,
  "ai:communicate": Envelope,
  "ai:assistant": Robot,
};

const LEGACY_AI_TOOLS: AiToolCard[] = [
  { id: "ai:draft", href: "/ai/draft", titleAr: "الصائغ القانوني", titleEn: "Legal Drafter", icon: PencilSimple, descAr: "صياغة عقود ومذكرات قانونية احترافية", descEn: "Draft professional legal contracts and memos" },
  { id: "ai:contracts", href: "/ai/contract-drafter", titleAr: "محترف العقود لايت", titleEn: "Contract Drafter Lite", icon: FileText, descAr: "أنشئ مسودة عقد بسيطة في دقائق ثم احصل على مراجعة محامٍ", descEn: "Create a simple contract draft in minutes, then get lawyer review", badge: "مجاني" },
  { id: "ai:case-brief", href: "/ai/case-brief", titleAr: "الباراليجل", titleEn: "Case Brief (Paralegal)", icon: Robot, descAr: "المساعد الذكي لقراءة أوراق القضية واستخراج الإحاطة القانونية (الخطوة صفر)", descEn: "Upload case files — get full briefing, risk flags & next steps", badge: "جديد" },
  { id: "ai:quick-answer", href: "/ai/quick-answer", titleAr: "المجيب القانوني السريع", titleEn: "Quick Legal Responder", icon: ChatCircleDots, descAr: "سؤال محدد ← إجابة فورية مستندة للنظام السعودي", descEn: "One question → instant answer grounded in Saudi law", badge: "جديد" },
  { id: "ai:memo-studio", href: "/ai/wargaming", titleAr: "المحاكي الشامل للقضايا", titleEn: "Litigation Studio", icon: Scales, descAr: "دمج الذكاء الاصطناعي (قوة الموقف، الخصوم، الجلسات، والمذكرات)", descEn: "Integrated AI for position strength, opponents, hearings & memos", badge: "مُدمَج" },
  { id: "ai:consult", href: "/ai/consult", titleAr: "المستشار الذكي", titleEn: "AI Advisor", icon: ChatCircleDots, descAr: "إجابات فورية لاستفساراتك القانونية", descEn: "Instant answers to your questions" },
  { id: "ai:analyze", href: "/ai/analyze", titleAr: "فاحص المستندات والقضايا", titleEn: "Case & Doc Analyzer", icon: MagnifyingGlass, descAr: "تقييم قضيتك أو فحص وثيقتك مع توصية فورية", descEn: "Evaluate your case or check your document with instant recommendation" },
  { id: "ai:legal-opinion", href: "/ai/legal-opinion", titleAr: "الرأي الفصل", titleEn: "Al-Ra'y Al-Fasl", icon: Brain, descAr: "رأي · دراسة · بحث قانوني · عناية واجبة — متعدد الوكلاء", descEn: "Opinion · Study · Research · Due Diligence — Multi-Agent", badge: "PRO" },
  { id: "ai:brief-check", href: "/ai/brief-check", titleAr: "فاحص المذكرات", titleEn: "Brief Auditor", icon: FileMagnifyingGlass, descAr: "يكشف المواد الملغاة والسوابق الناقصة والثغرات المنطقية في مذكرتك", descEn: "Detects repealed articles, missing precedents & logical gaps in your brief" },
  { id: "ai:procedures", href: "/ai/procedures", titleAr: "المرشد القضائي", titleEn: "Court Guide", icon: UserCheck, descAr: "توجيهك للإجراءات الصحيحة أمام المحاكم", descEn: "Guide to court procedures" },
  { id: "ai:communicate", href: "/ai/communicate", titleAr: "المتحدث الذكي", titleEn: "Smart Communicator", icon: Envelope, descAr: "AI يكتب رسائلك وإيميلاتك بالأسلوب المناسب", descEn: "AI writes your messages and emails in the right tone" },
  { id: "ai:assistant", href: "/ai/assistant", titleAr: "المساعد المتقدم", titleEn: "Advanced Assistant", icon: Robot, descAr: "مساعد قانوني شخصي دائم عبر محادثة ذكية مطولة", descEn: "Persistent personal legal assistant through smart chat" },
  // Corporate specific
  { id: "ai:corp:compliance", href: "/ai/corp/compliance", titleAr: "مراقب الامتثال", titleEn: "Compliance", icon: Database, descAr: "فحص وتأكيد مراعاة الشركة للأنظمة", descEn: "Check company regulatory compliance" },
  { id: "ai:tracker", href: "/ai/tracker", titleAr: "المُعقّب الذكي", titleEn: "AI Agent", icon: Sparkle, descAr: "وكيل AI لمتابعة المعاملات آلياً", descEn: "Agent to follow up on transactions", badge: "جديد" },
  { id: "ai:monitor", href: "/ai/monitor", titleAr: "راصد التشريعات", titleEn: "Law Monitor", icon: Database, descAr: "تنبيهات فورية بأي تعديلات في الأنظمة", descEn: "Instant law change alerts" }
];

const GLOBAL_RESEARCH_CARD: AiToolCard = {
  id: null, // متاح لكل المستخدمين المسجّلين (بحث حي دولي)
  href: "/ai/global",
  titleAr: "نظامي عالمي",
  titleEn: "Nezamy Global",
  icon: Globe,
  descAr: "اسأل عن قانون أي دولة — بحث حي في المصادر الرسمية + مصادر موثّقة + مقياس ثقة + تحويل لمحامٍ محلي",
  descEn: "Ask about any country's law — live research, cited sources, confidence score & local lawyer referral",
  badgeAr: "بحث حي",
  badgeEn: "Live",
};

const AI_TOOLS: AiToolCard[] = [
  GLOBAL_RESEARCH_CARD,
  ...LAWYER_AI_TOOLS.map((tool) => ({
    id: tool.permission,
    href: tool.href,
    titleAr: tool.titleAr,
    titleEn: tool.titleEn,
    icon: LAWYER_AI_ICON_MAP[tool.permission],
    descAr:
      tool.betaStatus === "beta-free"
        ? "أداة قانونية رسمية للمحامي في البيتا، متاحة مجاناً حتى اعتماد سعرها من الأدمن."
        : "أداة قانونية رسمية ضمن كتالوج المحامي ونظام الرصيد.",
    descEn:
      tool.betaStatus === "beta-free"
        ? "Official lawyer beta tool, free until admin pricing is approved."
        : "Official lawyer tool connected to the credit catalog.",
    badgeAr: getLawyerAiBadge(tool, "ar"),
    badgeEn: getLawyerAiBadge(tool, "en"),
  })),
  ...LEGACY_AI_TOOLS.filter((tool) => tool.id === "ai:tracker" || tool.id?.startsWith("ai:corp:")),
];

function AiHubDashboard() {
  const { lang, theme } = useTheme();
  const user = useUser();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";

  // Filter tools based on user permissions
  // If a tool has no ID required (null), it's public (like generic consult)
  // Otherwise, user must have the exact permission.
  const allowedTools = AI_TOOLS.filter((t) => {
    // ── Access Control Logic ──
    if (t.href === "/ai/global") {
      if (user.userType === "admin") return true;
      if (user.country && user.country !== "SA") return true;
      if (user.country === "SA" && (user.userType === "lawyer" || user.userType === "firm")) return true;
      return false;
    }
    if (t.href === "/ai/consult") {
      if (user.country && user.country !== "SA" && user.userType === "individual") return false;
      return true;
    }
    if (!t.id) return true;
    return user.permissions.includes(t.id as UserPermission);
  });

  return (
    <div className={`p-6 md:p-10 max-w-[1200px] mx-auto min-h-screen`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="mb-10 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mx-auto w-16 h-16 bg-[#C8A762]/10 text-[#C8A762] rounded-2xl flex items-center justify-center mb-4">
          <Brain size={32} weight="fill" />
        </motion.div>
        <h1 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-[#0B3D2E]"}`} style={{ fontFamily: 'var(--font-brand)' }}>
          {isRTL ? "منصة نظامي للذكاء الاصطناعي" : "Nezamy AI Hub"}
        </h1>
        <p className={`text-sm max-w-lg mx-auto ${isDark ? "text-gray-400" : "text-slate-500"}`}>
          {isRTL
            ? "مجموعة أدواتك الذكية المخصصة لإنجاز مهامك القانونية بدقة وسرعة فائقة."
            : "Your tailored suite of AI tools to accomplish legal tasks with precision and speed."}
        </p>
      </div>

      {allowedTools.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 dark:bg-white/5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
          <p className="text-slate-500 dark:text-gray-400">{isRTL ? "عفواً، لا توجد أدوات متاحة في باقتك الحالية." : "No tools available in your current plan."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {allowedTools.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={tool.href}
                  className={`block h-full border rounded-2xl p-6 transition-all group ${
                    isDark
                      ? "border-white/10 bg-dark-card hover:border-[#C8A762]/40 hover:bg-white/5"
                      : "border-slate-200 bg-white hover:border-[#0B3D2E]/20 hover:shadow-lg"
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#0B3D2E]/5 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762] group-hover:scale-110 transition-transform">
                      <Icon size={24} weight="duotone" />
                    </div>
                    {(tool.badge || tool.badgeAr || tool.badgeEn) && (
                      <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-[#C8A762] text-white">
                        {isRTL ? tool.badgeAr ?? tool.badge : tool.badgeEn ?? tool.badge}
                      </span>
                    )}
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                    {isRTL ? tool.titleAr : tool.titleEn}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                    {isRTL ? tool.descAr : tool.descEn}
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function AiPage() {
  const user = useUser();
  if (user.isLoggedIn) return <AiHubDashboard />;
  return <AiLandingPage />;
}
