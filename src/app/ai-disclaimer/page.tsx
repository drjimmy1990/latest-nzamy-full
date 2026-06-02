"use client";

import { motion } from "framer-motion";
import {
  Brain,
  Warning,
  ShieldCheck,
  Info,
  Scales,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Lock,
  ChatCircle,
  FileText,
  Question,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Data ────────────────────────────────────────────────────────────────────

const canDo = {
  ar: [
    "الإجابة على أسئلة قانونية عامة تتعلق بالأنظمة والتشريعات السعودية",
    "شرح المفاهيم القانونية وتبسيطها بلغة واضحة",
    "مراجعة العقود وتحديد البنود غير المعتادة أو المجحفة",
    "استخراج النصوص القانونية ذات الصلة من الأنظمة السعودية",
    "تحليل مستندات وتلخيص أبرز النقاط القانونية",
    "اقتراح الأسئلة التي ينبغي طرحها على المحامي المختص",
    "تقدير إمكانية تصعيد القضية لمحامٍ متخصص",
  ],
  en: [
    "Answer general legal questions related to Saudi laws and regulations",
    "Explain and simplify legal concepts in clear language",
    "Review contracts and identify unusual or unfair clauses",
    "Extract relevant legal texts from Saudi regulations",
    "Analyze documents and summarize key legal points",
    "Suggest questions to ask a qualified lawyer",
    "Assess whether a matter should be escalated to a specialist lawyer",
  ],
};

const cannotDo = {
  ar: [
    "تقديم رأي قانوني ملزم قابل للاحتجاج به أمام المحاكم",
    "الاستعاضة عن استشارة محامٍ مرخص للقضايا الفعلية",
    "ضمان دقة المعلومات في ضوء التعديلات التشريعية الجديدة",
    "اتخاذ أي إجراء قانوني نيابةً عن المستخدم",
    "الوصول لمعلوماتك المحفوظة في جهات خارجية أو قواعد بيانات حكومية",
    "تمثيلك أمام المحاكم أو الجهات القضائية",
    "تحل محل الاستشارة القانونية المتخصصة في قضايا الجنايات",
  ],
  en: [
    "Provide a binding legal opinion admissible before courts",
    "Replace a licensed lawyer's consultation for actual cases",
    "Guarantee accuracy of information in light of new legislative amendments",
    "Take any legal action on behalf of the user",
    "Access your personal data stored at third parties or government databases",
    "Represent you before courts or judicial authorities",
    "Replace specialized legal counsel in criminal cases",
  ],
};

const sections = {
  ar: [
    {
      icon: Info,
      title: "طبيعة نظامي AI",
      color: "bg-royal/5 text-royal",
      body: "نظامي AI هو مساعد قانوني ذكي مدرَّب على الأنظمة والتشريعات السعودية. هو أداة إرشادية تعليمية مصممة لمساعدتك على فهم حقوقك والخيارات المتاحة أمامك — وليس مصدراً لقرارات قانونية ملزمة.",
    },
    {
      icon: Lock,
      title: "خصوصية محادثاتك",
      color: "bg-emerald-50 text-emerald-700",
      body: "جميع المحادثات مع نظامي AI مشفّرة ولا تُشارَك مع أطراف خارجية دون موافقتك. لا يُحتفظ بسجل محادثاتك بعد انتهاء الجلسة إلا إذا اخترت تفعيل حفظ السجل في إعداداتك.",
    },
    {
      icon: Warning,
      title: "حدود الموثوقية",
      color: "bg-amber-50 text-amber-700",
      body: "رغم أن نظامي AI يسعى لتقديم معلومات دقيقة، فإن التشريعات تتغير باستمرار. تحقق دائماً من المصادر الرسمية (هيئة الزكاة والضريبة، وزارة العدل، هيئة السوق المالية...) أو استشر محامياً مرخصاً قبل اتخاذ أي قرار قانوني مهم.",
    },
    {
      icon: Scales,
      title: "مسؤولية الاستخدام",
      color: "bg-slate-50 text-slate-700",
      body: "لا تتحمل منصة نظامي أي مسؤولية قانونية أو مدنية تجاه أي ضرر ينشأ عن الاعتماد على مخرجات نظامي AI باعتبارها استشارة قانونية قاطعة. المستخدم يتحمل المسؤولية الكاملة عن قراراته المبنية على هذه المعلومات.",
    },
    {
      icon: ChatCircle,
      title: "التصعيد لمحامٍ متخصص",
      color: "bg-gold/5 text-gold-dark",
      body: "في أي لحظة يمكنك طلب التصعيد الفوري لمحامٍ متخصص معتمد عبر المنصة. نوصي بذلك في حالات: القضايا الجنائية، النزاعات العمالية المعقدة، قضايا الأحوال الشخصية، والعقارات ذات القيمة العالية.",
    },
    {
      icon: FileText,
      title: "الاستخدامات المقبولة",
      color: "bg-purple-50 text-purple-700",
      body: "يُحظر استخدام نظامي AI لأغراض احتيالية أو لانتهاك حقوق الآخرين أو لأي غرض مخالف للأنظمة السعودية. المنصة محمية بأنظمة رصد للكشف عن محاولات إساءة الاستخدام.",
    },
  ],
  en: [
    {
      icon: Info,
      title: "Nature of Nezamy AI",
      color: "bg-royal/5 text-royal",
      body: "Nezamy AI is an intelligent legal assistant trained on Saudi laws and regulations. It is an educational and guidance tool designed to help you understand your rights and available options — not a source of binding legal decisions.",
    },
    {
      icon: Lock,
      title: "Privacy of Your Conversations",
      color: "bg-emerald-50 text-emerald-700",
      body: "All conversations with Nezamy AI are encrypted and not shared with external parties without your consent. Your chat history is not retained after the session ends unless you enable chat history saving in your settings.",
    },
    {
      icon: Warning,
      title: "Reliability Limits",
      color: "bg-amber-50 text-amber-700",
      body: "While Nezamy AI strives for accuracy, legislation changes constantly. Always verify through official sources (ZATCA, Ministry of Justice, CMA...) or consult a licensed lawyer before making any significant legal decision.",
    },
    {
      icon: Scales,
      title: "Usage Responsibility",
      color: "bg-slate-50 text-slate-700",
      body: "Nezamy platform bears no legal or civil liability for any harm arising from relying on Nezamy AI outputs as definitive legal advice. Users bear full responsibility for decisions made based on this information.",
    },
    {
      icon: ChatCircle,
      title: "Escalation to a Specialist Lawyer",
      color: "bg-gold/5 text-gold-dark",
      body: "At any moment you can request immediate escalation to a certified specialist lawyer through the platform. We recommend this for: criminal cases, complex labor disputes, personal status matters, and high-value real estate.",
    },
    {
      icon: FileText,
      title: "Acceptable Use",
      color: "bg-purple-50 text-purple-700",
      body: "It is prohibited to use Nezamy AI for fraudulent purposes, to violate others' rights, or for any purpose contrary to Saudi regulations. The platform is protected by monitoring systems to detect misuse attempts.",
    },
  ],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiDisclaimerPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";

  const canDoList = isAr ? canDo.ar : canDo.en;
  const cannotDoList = isAr ? cannotDo.ar : cannotDo.en;
  const sectionList = isAr ? sections.ar : sections.en;

  return (
    <>
      <Navbar />
      <main className="bg-surface dark:bg-dark-bg transition-colors duration-300">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pb-20 pt-32 md:pt-40">
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute -top-20 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-10"
              style={{ background: "radial-gradient(ellipse, rgba(11,61,46,0.5) 0%, transparent 70%)" }}
            />
          </div>

          <div className="relative mx-auto max-w-[860px] px-4 text-center">
            {/* Breadcrumb */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-center justify-center gap-2 text-xs text-ink-faint dark:text-gray-500"
            >
              <a href="/" className="hover:text-royal dark:hover:text-gold transition-colors">{isAr ? "الرئيسية" : "Home"}</a>
              <span>/</span>
              <span className="text-ink-muted dark:text-gray-400">{isAr ? "إخلاء مسؤولية AI" : "AI Disclaimer"}</span>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <Warning size={14} weight="fill" />
                {isAr ? "إخلاء مسؤولية قانونية — يُرجى القراءة بعناية" : "Legal Disclaimer — Please Read Carefully"}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-brand mx-auto mt-5 text-4xl font-extrabold tracking-tight text-royal dark:text-white md:text-5xl"
            >
              {isAr ? "نظامي AI — ماذا يستطيع وماذا لا يستطيع؟" : "Nezamy AI — What It Can & Cannot Do"}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mx-auto mt-5 max-w-[54ch] text-base leading-relaxed text-ink-muted dark:text-gray-400 md:text-lg"
            >
              {isAr
                ? "نظامي AI مساعد قانوني ذكي — وليس محامياً. اقرأ هذه الصفحة لتفهم حدود استخدامه وحقوقك."
                : "Nezamy AI is a smart legal assistant — not a lawyer. Read this page to understand its limits and your rights."}
            </motion.p>

            {/* Warning banner */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-start dark:border-amber-500/20 dark:bg-amber-500/10"
            >
              <div className="flex items-start gap-3">
                <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                  {isAr
                    ? "المعلومات المقدمة من نظامي AI هي لأغراض إعلامية وتعليمية فقط، ولا تُعدّ استشارةً قانونيةً ملزمة. للقضايا الفعلية، يُرجى الاستعانة بمحامٍ مرخص."
                    : "Information provided by Nezamy AI is for informational and educational purposes only, and does not constitute binding legal advice. For actual cases, please consult a licensed lawyer."}
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Can / Cannot ─────────────────────────────────────────────────── */}
        <section className="pb-16 md:pb-24">
          <div className="mx-auto max-w-[1200px] px-4">
            <div className="grid gap-6 md:grid-cols-2">

              {/* Can Do */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 80, damping: 20 }}
                className="rounded-[2rem] border border-emerald-100 bg-white p-8 dark:border-emerald-500/20 dark:bg-dark-card"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                    <CheckCircle size={22} weight="duotone" className="text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <h2 className="font-brand text-lg font-bold text-ink dark:text-gray-100">
                    {isAr ? "ما يستطيع نظامي AI فعله" : "What Nezamy AI Can Do"}
                  </h2>
                </div>
                <ul className="space-y-3">
                  {canDoList.map((item, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: isAr ? 12 : -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3 text-sm text-ink-muted dark:text-gray-400"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
                        <CheckCircle size={12} weight="fill" className="text-emerald-500" />
                      </span>
                      {item}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>

              {/* Cannot Do */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.1 }}
                className="rounded-[2rem] border border-red-100 bg-white p-8 dark:border-red-500/20 dark:bg-dark-card"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10">
                    <XCircle size={22} weight="duotone" className="text-red-500 dark:text-red-400" />
                  </span>
                  <h2 className="font-brand text-lg font-bold text-ink dark:text-gray-100">
                    {isAr ? "ما لا يستطيع نظامي AI فعله" : "What Nezamy AI Cannot Do"}
                  </h2>
                </div>
                <ul className="space-y-3">
                  {cannotDoList.map((item, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: isAr ? 12 : -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3 text-sm text-ink-muted dark:text-gray-400"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
                        <XCircle size={12} weight="fill" className="text-red-400" />
                      </span>
                      {item}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Sections ─────────────────────────────────────────────────────── */}
        <section className="pb-16 md:pb-24">
          <div className="mx-auto max-w-[860px] px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-10 text-center"
            >
              <span className="text-sm font-medium text-gold-dark">{isAr ? "سياسات الاستخدام" : "Usage Policies"}</span>
              <h2 className="font-brand mt-2 text-3xl font-bold text-royal dark:text-white">
                {isAr ? "اعرف حقوقك وحدود المسؤولية" : "Know Your Rights & Liability Limits"}
              </h2>
            </motion.div>

            <div className="space-y-4">
              {sectionList.map((sec, i) => {
                const Icon = sec.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className="rounded-[1.75rem] border border-slate-200/50 bg-white p-6 dark:border-white/10 dark:bg-dark-card"
                  >
                    <div className="flex items-start gap-4">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${sec.color.split(" ")[0]} dark:bg-white/10`}>
                        <Icon size={20} weight="duotone" className={sec.color.split(" ")[1]} />
                      </span>
                      <div>
                        <h3 className="font-brand text-base font-bold text-ink dark:text-gray-100">{sec.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-ink-muted dark:text-gray-400">{sec.body}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Version note ─────────────────────────────────────────────────── */}
        <section className="pb-10">
          <div className="mx-auto max-w-[860px] px-4">
            <div className="rounded-2xl border border-slate-200/50 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-dark-card">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint dark:text-gray-500">
                <span>
                  {isAr
                    ? "آخر تحديث لهذه السياسة: مارس ٢٠٢٦ — تخضع للتعديل دون إشعار مسبق."
                    : "Last updated: March 2026 — Subject to change without prior notice."}
                </span>
                <a
                  href="/contact"
                  className="text-royal underline underline-offset-2 hover:text-royal/70 dark:text-gold dark:hover:text-gold/70 transition-colors"
                >
                  {isAr ? "تواصل معنا بأي استفسار" : "Contact us with any questions"}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="pb-24">
          <div className="mx-auto max-w-[860px] px-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-[2.5rem] bg-royal p-10 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-14"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-gold">
                <Brain size={28} weight="duotone" />
              </div>
              <h2 className="font-brand text-2xl font-bold text-white md:text-3xl">
                {isAr ? "هل تريد استشارة محامٍ متخصص؟" : "Want a Specialist Lawyer Consultation?"}
              </h2>
              <p className="mx-auto mt-3 max-w-[44ch] text-sm leading-relaxed text-white/70">
                {isAr
                  ? "تواصل مع أحد محامينا المعتمدين مباشرة — استشارة أولى خلال ١٥–٢٠ دقيقة."
                  : "Connect directly with one of our certified lawyers — first consultation within 15–20 minutes."}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <motion.a
                  href="/services/consultations"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-sm font-bold text-royal shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]"
                >
                  {isAr ? "احجز استشارة" : "Book a Consultation"}
                  <ArrowLeft size={15} weight="bold" />
                </motion.a>
                <a
                  href="/faq"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-7 py-3.5 text-sm font-medium text-white/80 hover:border-white/40 hover:text-white transition-all"
                >
                  <Question size={15} />
                  {isAr ? "الأسئلة الشائعة" : "FAQ"}
                </a>
              </div>
            </motion.div>
          </div>
        </section>

      </main>
      <Footer />
      <FloatingButtons />
    </>
  );
}
