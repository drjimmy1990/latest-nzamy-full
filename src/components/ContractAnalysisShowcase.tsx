"use client";

import { useState, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  ShieldWarning, CheckCircle, ArrowLeft, Warning,
  SealCheck, ArrowRight, MagnifyingGlass, ThumbsUp,
  ArrowsInLineHorizontal, CaretDown, ArrowSquareIn,
  Scan, Sparkle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClauseCategory = "favorable" | "neutral" | "harmful";
type RiskLevel = "critical" | "high" | "medium" | "low";
type HarmType = "explicit" | "ambiguous" | "asymmetric" | "missing";

interface ContractClause {
  id: number;
  article: string;
  title: string;
  text: string;
  category: ClauseCategory;
  riskLevel?: RiskLevel;
  harmType?: HarmType;
  analysis: string;
  scenario?: string;
  benefit?: string;
  suggestionA?: string;
  suggestionB?: string;
}

// ─── Mock Contract Clauses ────────────────────────────────────────────────────

const contractClauses: ContractClause[] = [
  {
    id: 1,
    article: "م.٣",
    title: "حق فحص البضاعة — لصالحك",
    text: "يحق للمشتري فحص البضاعة خلال ٣٠ يوماً من تاريخ الاستلام، وله حق الرجوع الكامل عند اكتشاف أي عيب ظاهر أو خفي.",
    category: "favorable",
    analysis: "بند ممتاز: مدة ٣٠ يوماً كافية للكشف عن العيوب الخفية، ويشمل الضمان العيوب الخفية صراحةً — أقوى من المعيار السوقي المعتاد الذي يقتصر على العيوب الظاهرة فقط.",
    benefit: "حق الرجوع الكامل + تغطية العيوب الخفية — يتجاوز المعيار السوقي لصالحك",
  },
  {
    id: 2,
    article: "م.٨",
    title: "اختصاص المحاكم التجارية — محايد",
    text: "تختص المحاكم التجارية في مدينة الرياض بالفصل في النزاعات الناشئة عن هذا العقد وفق أحكام نظام التجارة السعودي.",
    category: "neutral",
    analysis: "بند إجرائي متوازن: اختيار المحاكم السعودية مناسب لعقد محلي، والرياض جغرافياً محايدة. النظام الحاكم (نظام التجارة السعودي) غير متحيز.",
  },
  {
    id: 3,
    article: "م.٥",
    title: "غرامة تأخير مفرطة",
    text: "تلتزم الجهة المنفذة بدفع غرامة تأخير تساوي ٣٪ من إجمالي قيمة العقد عن كل يوم تأخير، وتُحتسب الغرامة تلقائياً دون الحاجة إلى إشعار مسبق.",
    category: "harmful",
    riskLevel: "critical",
    harmType: "explicit",
    analysis: "ثلاث مشاكل مركّبة: (١) ٣٪ يومياً = ١٠٠٪ من قيمة العقد كل ٣٣ يوماً فقط. (٢) \"دون إشعار مسبق\" = لا فرصة لتصحيح التأخير. (٣) لا حد أقصى للغرامة الإجمالية. نظام المعاملات المدنية السعودي يجيز للمحكمة تخفيضه لكن الأفضل إصلاحه أصلاً.",
    scenario: "تأخرت ٢٠ يوماً بسبب ظرف خارجي — الغرامة تصبح ٦٠٪ من قيمة العقد كاملاً، أي أكثر من صافي ربحك بأضعاف.",
    suggestionA: "تُحتسب الغرامة على قيمة البنود المتأخرة فقط لا إجمالي العقد، بنسبة ٠.٥٪ / يوم بعد إخطار كتابي وإعطاء ٧ أيام للتصحيح. الحد الأقصى الإجمالي ١٠٪ فقط.",
    suggestionB: "غرامة أسبوعية لا يومية بحد ١٪/أسبوع وسقف ١٥٪ إجمالاً. تُعلّق عند القوة القاهرة أو إخلال الطرف الآخر.",
  },
  {
    id: 4,
    article: "م.٧",
    title: "تعديل الأسعار بصلاحية مطلقة",
    text: "يحق للطرف الأول تعديل أسعار الخدمات حسب تقلبات السوق وبما يراه مناسباً، ويُخطر الطرف الثاني بذلك في أقرب وقت ممكن.",
    category: "harmful",
    riskLevel: "high",
    harmType: "ambiguous",
    analysis: "أربعة ثغرات لغوية: (١) \"تقلبات السوق\" غير محدد — من يقرر؟ الطرف الأول. (٢) \"ما يراه مناسباً\" = سلطة مطلقة بلا ضوابط. (٣) \"أقرب وقت ممكن\" = لا حد للإخطار. (٤) لا حد أقصى للزيادة ولا حق الرفض.",
    scenario: "رُفع السعر ٤٠٪ مع إشعار ٢٤ ساعة — أنت مجبر على القبول أو تُعتبر مخلاً بالعقد.",
    suggestionA: "الأسعار ثابتة طوال مدة العقد كما في الملحق (أ). لا تعديل إلا بموافقة كتابية صريحة.",
    suggestionB: "تعديل مرة واحدة سنوياً فقط، بإشعار ٦٠ يوماً ومستندات تثبت ارتفاع تكاليف المدخلات، بحد أقصى ٥٪ أو نسبة التضخم الرسمي أيهما أقل. لك حق إنهاء العقد بلا غرامات إن رفضت الزيادة.",
  },
  {
    id: 5,
    article: "م.١١",
    title: "فجوة الإنهاء: ٧ مقابل ٩٠ يوماً",
    text: "يحق للطرف الأول إنهاء العقد بإخطار ٧ أيام. يحق للطرف الثاني إنهاء العقد بإخطار ٩٠ يوماً فقط، مع إلزامية دفع رسوم الإنهاء المبكر.",
    category: "harmful",
    riskLevel: "high",
    harmType: "asymmetric",
    analysis: "عدم تماثل صارخ بلا أي مبرر موضوعي: الطرف الأول يغادر خلال أسبوع أما أنت فمحبوس ٩٠ يوماً + رسوم إضافية.",
    scenario: "الطرف الأول يجد عميلاً بسعر أعلى — يغادر في ٧ أيام. أنت إن أردت الخروج دفعت غرامات + انتظرت ٣ أشهر إضافية.",
    suggestionA: "إخطار كتابي ٣٠ يوماً لكلا الطرفين بالتساوي، بلا رسوم إنهاء. إنهاء فوري لكليهما عند الإخلال الجوهري.",
    suggestionB: "إخطار ٣٠ يوماً لكلا الطرفين. تعويض متساوٍ شهر واحد فقط إن أنهى أي طرف بلا سبب.",
  },
  {
    id: 6,
    article: "—",
    title: "غياب بند السرية",
    text: "[بند غير موجود في العقد]",
    category: "harmful",
    riskLevel: "medium",
    harmType: "missing",
    analysis: "العقد يتضمن تبادل بيانات حساسة (عملاء، أسعار، استراتيجيات) دون أي حماية قانونية للسرية. غياب هذا البند يعني أن الطرف الآخر يستطيع مشاركة معلوماتك مع المنافسين دون مساءلة.",
    scenario: "قائمة عملائك تُشارَك مع منافس مباشر — لا سند قانوني للمطالبة بالتعويض.",
    suggestionA: "التزام سرية متبادل لمدة ٥ سنوات يشمل: بيانات العملاء، الأسعار، الاستراتيجيات. مخالفة الالتزام تستوجب تعويضاً لا يقل عن [X] ريال.",
    suggestionB: "عدم إفصاح للثالث لمدة ٣ سنوات إلا بموافقة كتابية أو حكم قانوني ملزم.",
  },
];

// ─── Design tokens aligned with project palette ───────────────────────────────

const categoryStyle: Record<ClauseCategory, {
  pill: string; dot: string; activeBg: string;
  cardLight: string; cardDark: string;
  borderLight: string; borderDark: string;
  quoteBar: string; textLight: string; textDark: string;
  icon: React.ReactNode;
}> = {
  favorable: {
    pill: "bg-emerald-500/90 text-white",
    dot: "bg-emerald-400",
    activeBg: "bg-emerald-600",
    cardLight: "bg-emerald-50/80",
    cardDark: "dark:bg-emerald-950/50",
    borderLight: "border-emerald-200",
    borderDark: "dark:border-emerald-700/40",
    quoteBar: "border-emerald-400",
    textLight: "text-emerald-900",
    textDark: "dark:text-emerald-200",
    icon: <SealCheck size={12} weight="fill" />,
  },
  neutral: {
    pill: "bg-slate-500/80 text-white",
    dot: "bg-slate-400",
    activeBg: "bg-slate-500",
    cardLight: "bg-slate-50/80",
    cardDark: "dark:bg-slate-800/50",
    borderLight: "border-slate-200",
    borderDark: "dark:border-slate-600/40",
    quoteBar: "border-slate-400",
    textLight: "text-slate-800",
    textDark: "dark:text-slate-200",
    icon: <ArrowsInLineHorizontal size={12} weight="fill" />,
  },
  harmful: {
    pill: "bg-red-500/90 text-white",
    dot: "bg-red-400",
    activeBg: "bg-red-600",
    cardLight: "bg-red-50/70",
    cardDark: "dark:bg-red-950/50",
    borderLight: "border-red-200",
    borderDark: "dark:border-red-700/50",
    quoteBar: "border-red-400",
    textLight: "text-red-900",
    textDark: "dark:text-red-200",
    icon: <Warning size={12} weight="fill" />,
  },
};

const riskLabel: Record<RiskLevel, { icon: string; text: string; color: string }> = {
  critical: { icon: "●", text: "حرج", color: "text-red-500 dark:text-red-400" },
  high: { icon: "●", text: "مرتفع", color: "text-orange-500 dark:text-orange-400" },
  medium: { icon: "●", text: "متوسط", color: "text-amber-500 dark:text-amber-400" },
  low: { icon: "●", text: "منخفض", color: "text-emerald-500 dark:text-emerald-400" },
};

const harmTypeName: Record<HarmType, string> = {
  explicit: "ضرر صريح",
  ambiguous: "غموض خطر",
  asymmetric: "عدم تماثل",
  missing: "حماية ناقصة",
};

// ─── Isolated scanning dot (perpetual micro-interact) ────────────────────────
const ScanDot = memo(function ScanDot() {
  return (
    <motion.span
      className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
      animate={{ opacity: [1, 0.2, 1], scale: [1, 0.7, 1] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ContractAnalysisShowcase() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";

  const [visible, setVisible] = useState(0);
  const [selected, setSelected] = useState<ContractClause | null>(null);
  const [amendTab, setAmendTab] = useState<"a" | "b">("a");
  const [filterTab, setFilterTab] = useState<"all" | ClauseCategory>("all");
  const [scanning, setScanning] = useState(true);

  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-80px" });

  // Sequential clause reveal
  useEffect(() => {
    if (!inView) return;
    setVisible(0); setScanning(true);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setVisible(i);
      if (i >= contractClauses.length) { clearInterval(t); setScanning(false); }
    }, 480);
    return () => clearInterval(t);
  }, [inView]);

  // Stats
  const favorable = contractClauses.filter(c => c.category === "favorable").length;
  const neutral = contractClauses.filter(c => c.category === "neutral").length;
  const harmful = contractClauses.filter(c => c.category === "harmful").length;
  const critical = contractClauses.filter(c => c.riskLevel === "critical").length;

  // Risk score per prompt methodology
  const score = contractClauses.reduce((acc, c) => {
    if (c.category === "favorable") return acc - 2;
    if (c.riskLevel === "critical") return acc + 10;
    if (c.riskLevel === "high") return acc + 5;
    if (c.riskLevel === "medium") return acc + 3;
    return acc + 1;
  }, 0);

  const overallRisk = score < 10 ? "low" : score < 26 ? "medium" : score < 51 ? "high" : "critical";
  const riskMeta = {
    low: { label: isAr ? "منخفض" : "Low Risk", dot: "bg-emerald-400", badge: "text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700/50" },
    medium: { label: isAr ? "متوسط" : "Moderate", dot: "bg-amber-400", badge: "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700/50" },
    high: { label: isAr ? "مرتفع" : "High Risk", dot: "bg-orange-400", badge: "text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/60 border-orange-300 dark:border-orange-700/50" },
    critical: { label: isAr ? "حرج" : "Critical", dot: "bg-red-400", badge: "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60 border-red-400 dark:border-red-700/50" },
  }[overallRisk];

  const displayed = filterTab === "all"
    ? contractClauses
    : contractClauses.filter(c => c.category === filterTab);

  const tabs = [
    { val: "all" as const, label: isAr ? "الكل" : "All", count: contractClauses.length },
    { val: "harmful" as const, label: isAr ? "تهدد مصالحك" : "Harmful", count: harmful },
    { val: "neutral" as const, label: isAr ? "محايدة" : "Neutral", count: neutral },
    { val: "favorable" as const, label: isAr ? "لصالحك" : "Favorable", count: favorable },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden py-24 md:py-32 bg-white dark:bg-zinc-950 border-y border-slate-100 dark:border-white/[0.06]"
    >
      {/* Subtle dot-grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle, #0B3D2E 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Ambient glow — light desaturated, dark deep green */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full opacity-20 dark:opacity-10 blur-3xl"
        style={{ background: "radial-gradient(ellipse, rgba(11,61,46,0.35) 0%, transparent 70%)" }} />

      <div className="relative mx-auto max-w-[1400px] px-4 md:px-8">
        {/* ── Section Header (left-aligned, VARIANCE:8) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-16 max-w-[42ch]"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-1.5">
            <ShieldWarning size={13} weight="fill" className="text-rose-500 dark:text-rose-400" />
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              {isAr ? "احمِ نفسك قبل التوقيع" : "Protect yourself before signing"}
            </span>
          </div>
          <h2 className="font-brand text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
            {isAr ? "اكتشف الثغرات المخفية" : "Discover hidden flaws"}
            <br />
            <span className="text-[#B89A52] dark:text-[#C8A762]">
              {isAr ? "في عقودك بثوانٍ." : "in your contracts instantly."}
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-[52ch]">
            {isAr
              ? "ذكاؤنا الاصطناعي يقرأ عقدك كاملاً ويُصنّف كل بند — لصالحك أم ضدك أم محايد — مع اقتراح تعديلين لكل بند خطر."
              : "Our AI reads your full contract and classifies every clause — favorable, harmful, or neutral — with two amendment options per risk."}
          </p>
        </motion.div>

        {/* ── Split Layout: 45 / 55 (VARIANCE: 8) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.22fr] gap-10 xl:gap-16 items-start">

          {/* Left: Legend + CTA */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="order-2 lg:order-1 lg:sticky lg:top-24 space-y-6"
          >
            {/* Legend cards — minimal, no 3-col */}
            <div className="space-y-3">
              {([
                {
                  cat: "favorable" as ClauseCategory,
                  headline: isAr ? "لصالحك" : "Favorable",
                  desc: isAr ? "بنود تمنحك حقوقاً واضحة أو حماية فعلية" : "Clauses granting you clear rights or real protection",
                },
                {
                  cat: "neutral" as ClauseCategory,
                  headline: isAr ? "محايدة" : "Neutral",
                  desc: isAr ? "بنود إجرائية متوازنة لا تميل لأي طرف" : "Balanced procedural clauses with no bias",
                },
                {
                  cat: "harmful" as ClauseCategory,
                  headline: isAr ? "تهدد مصالحك" : "Harmful",
                  desc: isAr ? "بنود صريحة أو غامضة أو ناقصة تضرّ بموقفك القانوني" : "Explicit, vague, or missing clauses that threaten your position",
                },
              ]).map(({ cat, headline, desc }) => {
                const s = categoryStyle[cat];
                return (
                  <div key={cat} className="flex items-start gap-3.5">
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                    <div>
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{headline} — </span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">{desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Harm subtypes — clean list, no card box */}
            <div className="border-t border-slate-100 dark:border-white/[0.07] pt-5">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {isAr ? "أنواع الضرر" : "Harm Types"}
              </p>
              <div className="space-y-2">
                {(Object.entries(harmTypeName) as [HarmType, string][]).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <code className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                      {key}
                    </code>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA — magnetic feel via spring scale */}
            <Link href="/ai">
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="flex items-center gap-3 rounded-2xl bg-[#0B3D2E] dark:bg-[#C8A762] px-7 py-4 text-sm font-bold text-white dark:text-zinc-900 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.35)] dark:shadow-[0_8px_32px_-8px_rgba(200,167,98,0.35)] w-fit"
              >
                <MagnifyingGlass size={16} weight="fill" />
                {isAr ? "جرّب تحليل عقدك مجاناً" : "Analyze your contract free"}
                {isAr ? <ArrowLeft size={15} weight="bold" /> : <ArrowRight size={15} weight="bold" />}
              </motion.div>
            </Link>
          </motion.div>

          {/* Right: Contract Viewer */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="order-1 lg:order-2"
          >
            {/* Chrome bar */}
            <div className={`flex items-center justify-between rounded-t-[1.75rem] border border-b-0 px-5 py-3 ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-400/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                </div>
                <span className={`text-[11px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {isAr ? "عقد_بيع_تجارية.pdf" : "commercial_sale_contract.pdf"}
                </span>
              </div>
              {scanning ? (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500 dark:text-amber-400">
                  <ScanDot />
                  {isAr ? "جارٍ التحليل..." : "Analyzing..."}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 dark:text-emerald-400">
                  <CheckCircle size={12} weight="fill" />
                  {isAr ? "اكتمل التحليل" : "Analysis complete"}
                </span>
              )}
            </div>

            {/* Executive summary (slides in after scan) */}
            <AnimatePresence>
              {!scanning && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35 }}
                  className={`overflow-hidden border-x border-b ${isDark ? "border-white/[0.08] bg-zinc-900/80" : "border-slate-200 bg-white"}`}
                >
                  <div className="px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-2 text-[11px] font-bold rounded-full border px-3 py-1 ${riskMeta.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${riskMeta.dot}`} />
                      {isAr ? "مستوى الخطر:" : "Risk:"} {riskMeta.label}
                    </span>
                    <div className="flex items-center gap-3 text-[11px] font-medium">
                      <span className="text-emerald-600 dark:text-emerald-400">{favorable} {isAr ? "لصالحك" : "favorable"}</span>
                      <span className="text-zinc-400 dark:text-zinc-500">{neutral} {isAr ? "محايدة" : "neutral"}</span>
                      <span className="text-red-500 dark:text-red-400">{harmful} {isAr ? "ضد مصالحك" : "harmful"}</span>
                    </div>
                    {critical > 0 && (
                      <span className="text-[11px] font-semibold text-red-500 dark:text-red-400">
                        — {critical} {isAr ? "بنود حرجة تستوجب التفاوض الفوري" : "critical clause(s) — negotiate immediately"}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Filter tabs */}
            <div className={`flex flex-wrap gap-1 border-x border-b px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-slate-200 bg-slate-50/60"}`}>
              {tabs.map(({ val, label, count }) => {
                const active = filterTab === val;
                const s = val !== "all" ? categoryStyle[val as ClauseCategory] : null;
                return (
                  <button
                    key={val}
                    onClick={() => setFilterTab(val)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                      active
                        ? s ? `${s.activeBg} text-white` : "bg-zinc-800 dark:bg-white text-white dark:text-zinc-900"
                        : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-white/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Clause list */}
            <div className={`rounded-b-[1.75rem] border border-t-0 divide-y overflow-y-auto max-h-[540px] ${
              isDark
                ? "border-white/[0.08] bg-zinc-900 divide-white/[0.05]"
                : "border-slate-200 bg-white divide-slate-100"
            }`}>
              <AnimatePresence>
                {displayed.map((clause, idx) => {
                  if (clause.id > visible) return null;
                  const isOpen = selected?.id === clause.id;
                  const s = categoryStyle[clause.category];
                  const r = clause.riskLevel ? riskLabel[clause.riskLevel] : null;

                  return (
                    <motion.div
                      key={clause.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 120, damping: 22, delay: idx * 0.03 }}
                    >
                      {/* Clause header — always visible */}
                      <button
                        onClick={() => { setSelected(isOpen ? null : clause); setAmendTab("a"); }}
                        className={`w-full text-start px-4 py-3.5 transition-colors duration-150 ${
                          isOpen
                            ? isDark ? "bg-white/[0.04]" : "bg-slate-50"
                            : "hover:bg-slate-50/50 dark:hover:bg-white/[0.025]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Meta badges */}
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.pill}`}>
                                {s.icon}
                                {
                                  clause.category === "favorable"
                                    ? (isAr ? "لصالحك" : "Favorable")
                                    : clause.category === "neutral"
                                    ? (isAr ? "محايد" : "Neutral")
                                    : (isAr ? "تهدد مصالحك" : "Harmful")
                                }
                              </span>
                              {r && (
                                <span className={`text-[10px] font-bold ${r.color}`}>
                                  {r.icon} {r.text}
                                </span>
                              )}
                              {clause.harmType && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                                  {harmTypeName[clause.harmType]}
                                </span>
                              )}
                            </div>
                            {/* Title + preview */}
                            <p className={`text-sm font-semibold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
                              {clause.title}
                            </p>
                            {clause.category !== "harmful" || clause.harmType !== "missing" ? (
                              <p className={`text-xs leading-relaxed line-clamp-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                                {clause.text}
                              </p>
                            ) : (
                              <p className={`text-xs italic ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>[بند مفقود من العقد]</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{clause.article}</span>
                            <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                              <CaretDown size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                            </motion.span>
                          </div>
                        </div>
                      </button>

                      {/* Expanded detail panel */}
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className={`px-4 pb-4 pt-1 space-y-4 ${isDark ? "bg-zinc-950/60" : "bg-slate-50/70"}`}>

                              {/* Full quote */}
                              {clause.harmType !== "missing" && (
                                <blockquote className={`border-s-2 ps-3 text-xs leading-relaxed italic ${s.quoteBar} ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                                  {clause.text}
                                </blockquote>
                              )}

                              {/* Analysis */}
                              <div>
                                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                                  {isAr ? "التحليل" : "Analysis"}
                                </p>
                                <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{clause.analysis}</p>
                              </div>

                              {/* Benefit badge */}
                              {clause.benefit && (
                                <div className="flex items-start gap-2">
                                  <ThumbsUp size={13} weight="fill" className="mt-0.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                                  <p className={`text-xs font-medium leading-relaxed text-emerald-700 dark:text-emerald-300`}>{clause.benefit}</p>
                                </div>
                              )}

                              {/* Negative scenario */}
                              {clause.scenario && (
                                <div className={`rounded-xl border px-3 py-2.5 ${isDark ? "border-orange-900/50 bg-orange-950/40" : "border-orange-200 bg-orange-50"}`}>
                                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                                    {isAr ? "السيناريو السلبي المحتمل" : "Negative Scenario"}
                                  </p>
                                  <p className={`text-xs leading-relaxed ${isDark ? "text-orange-200" : "text-orange-700"}`}>{clause.scenario}</p>
                                </div>
                              )}

                              {/* Amendments A / B */}
                              {(clause.suggestionA || clause.suggestionB) && (
                                <div>
                                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                                    {isAr ? "التعديلات المقترحة" : "Proposed Amendments"}
                                  </p>
                                  {/* Tab switcher */}
                                  <div className={`flex mb-0 border rounded-xl overflow-hidden text-[11px] font-bold ${isDark ? "border-white/[0.08]" : "border-slate-200"}`}>
                                    {([["a", isAr ? "الخيار (أ) — الحماية القصوى" : "Option A — Max Protection"], ["b", isAr ? "الخيار (ب) — المتوازن" : "Option B — Balanced"]] as const).map(([t, label]) => (
                                      <button key={t} onClick={e => { e.stopPropagation(); setAmendTab(t); }}
                                        className={`flex-1 py-2 px-3 transition-colors text-center ${
                                          amendTab === t
                                            ? t === "a"
                                              ? isDark ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-600 text-white"
                                              : isDark ? "bg-blue-900/60 text-blue-300" : "bg-blue-600 text-white"
                                            : isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-zinc-500"
                                        }`}>
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  <div className={`rounded-b-xl border border-t-0 px-3.5 py-3 text-xs leading-relaxed ${
                                    isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200" : "border-slate-200 bg-white text-zinc-700"
                                  }`}>
                                    {amendTab === "a" ? clause.suggestionA : clause.suggestionB}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Scanning skeleton */}
              {scanning && visible < contractClauses.length && (
                <div className={`px-4 py-4 flex items-center gap-3 ${isDark ? "bg-zinc-900" : "bg-white"}`}>
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    className={`h-8 flex-1 rounded-lg ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}
                  />
                </div>
              )}
            </div>

            {!scanning && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className={`mt-3 text-center text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}
              >
                {isAr ? "اضغط على أي بند لعرض التحليل الكامل والتعديلات" : "Click any clause for full analysis and amendments"}
              </motion.p>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
