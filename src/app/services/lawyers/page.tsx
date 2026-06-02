"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Gavel, Buildings, Stamp, IdentificationCard,
  PencilSimple, Sword, ChartLine, Robot,
  FileText, MagnifyingGlass, Headset, ArrowLeft,
  Check, CheckCircle, Lightning, Brain,
  Lock, Clock, ShieldCheck, Users,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Data ─────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    id: "lawyer",
    icon: Gavel,
    labelAr: "محامي مستقل",
    descAr: "اعمل بذكاء أكبر. دع الذكاء الاصطناعي يتولى الصياغة الروتينية لتركز على بناء دفوعك وكسب القضايا.",
    color: "text-royal",
    bg: "bg-royal/8 dark:bg-royal/15",
    border: "border-royal/25",
    badgeAr: "الأكثر استخداماً",
    stats: [
      { val: "٥+ ساعات", label: "توفير يومي في المهام" },
      { val: "٩٤٪", label: "رضا عن دقة المسودات" },
      { val: "٠٪", label: "مواعيد أو جلسات فائتة" },
    ],
    tools: [
      {
        href: "/ai/draft",
        icon: PencilSimple,
        labelAr: "الصائغ القانوني",
        descAr: "اكتب مذكرات جوابية ولوائح اعتراضية متوافقة تماماً مع الأنظمة السعودية في ثوانٍ بدلاً من ساعات.",
        badge: "يوفّر وقتك",
        hot: true,
        features: ["بناء الحجج آلياً", "لوائح استئناف", "لغة قانونية رصينة"],
      },
      {
        href: "/ai/wargaming",
        icon: Sword,
        labelAr: "محاكي الخصم",
        descAr: "لا تتفاجأ في الجلسة. اختبر دفاعك ضد ذكاء اصطناعي يحلل ثغراتك ويتوقع حجج خصمك مقدماً.",
        badge: "حصري",
        hot: false,
        features: ["استكشاف الثغرات", "توقع أسئلة القاضي", "استراتيجية الاستباق"],
      },
      {
        href: "/ai/analyze-strength",
        icon: ChartLine,
        labelAr: "محلل فرص النجاح",
        descAr: "ارفع وقائع القضية قبل الاستلام ليخبرك النظام بفرص فوزك بناءً على السوابق والأدلة المتاحة.",
        badge: null,
        hot: false,
        features: ["تقييم الأدلة", "السوابق المطابقة", "قرار استلام موثق"],
      },
      {
        href: "/ai/legal-opinion",
        icon: MagnifyingGlass,
        labelAr: "المستشار ماكس",
        descAr: "محرك بحثك الفوري. اسأل أي سؤال قانوني معقد ليجيبك بتأصيل موثق بالمواد والتعاميم الحديثة.",
        badge: null,
        hot: false,
        features: ["مرجعية الأنظمة", "اجتهادات فورية", "تحديث يومي"],
      },
      {
        href: "/ai/contracts",
        icon: FileText,
        labelAr: "فاحص ومصمم العقود",
        descAr: "احمِ عملاءك. يكتشف النظام فوراً البنود المجحفة ويصيغ عقوداً سدّت فيها كل الثغرات القانونية.",
        badge: null,
        hot: false,
        features: ["كشف المخاطر", "مقارنة النسخ", "قوالب معتمدة"],
      },
      {
        href: "/ai/secretary",
        icon: Headset,
        labelAr: "منظم الجلسات الآلي",
        descAr: "سكرتيرك الذي لا ينام. يتابع جدول محكمتك، يذكرك بالمواعيد، ويرتب مستندات كل جلسة تلقائياً.",
        badge: "يحميك من الغياب",
        hot: false,
        features: ["تنبيهات استباقية", "أجندة ذكية", "تقارير يومية"],
      },
    ],
    cta: { href: "/join", labelAr: "انضم الآن لمضاعفة إنتاجيتك" },
  },
  {
    id: "firm",
    icon: Buildings,
    labelAr: "شركة أو مكتب محاماة",
    descAr: "حوّل مكتبك لكيان رقمي. تابع أداء فريقك، أدر إيراداتك، وامنح عملاءك شفافية تامة من منصة واحدة.",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/8 dark:bg-blue-500/12",
    border: "border-blue-400/30",
    badgeAr: "مؤسسي",
    stats: [
      { val: "١ شاشة", label: "للتحكم بكامل أعمال المكتب" },
      { val: "+٤٠٪", label: "ارتفاع في القدرة الاستيعابية" },
      { val: "٢٤/٧", label: "تحديث للعملاء عبر بوابتهم" },
    ],
    tools: [
      {
        href: "/erp",
        icon: Buildings,
        labelAr: "نظامي المتكامل (ERP للمكتب)",
        descAr: "إدارة القضايا، توزيع المهام، تتبع الجلسات للفريق، وتسجيل ساعات العمل لضمان عدم ضياع أي أتعاب.",
        badge: "روح المكتب",
        hot: true,
        features: ["التوزيع الآلي للقضايا", "ضبط الفواتير", "تقارير إيرادات وأداء"],
      },
      {
        href: "/dashboard/firm/client-portal",
        icon: Users,
        labelAr: "بوابة العملاء الذكية",
        descAr: "تخلص من المكالمات المتكررة. امنح موكليك واجهة خاصة يتابعون منها مستجدات قضاياهم ومستنداتهم.",
        badge: "يبني الثقة الفورية",
        hot: true,
        features: ["تحديث القضية لحظياً", "مشاركة آمنة للملفات", "تقليل العبء الهاتفي"],
      },
      {
        href: "/ai/contracts",
        icon: FileText,
        labelAr: "أرشيف العقود (CLM)",
        descAr: "قلب المكتب النابض لإدارة التزامات الشركات الموكلة. تنبيهات انتهاء العقود ومساحات عمل مشتركة للفريق.",
        badge: null,
        hot: false,
        features: ["حفظ سحابي مشفر", "تنبيهات التجديد", "مراجعة جماعية"],
      },
      {
        href: "/ai/secretary",
        icon: Headset,
        labelAr: "رادار مواعيد المكتب",
        descAr: "لوحة موحدة لجميع جلسات ومواعيد الفريق. يحلل التضاربات ويحذّرك قبل وقوع الغيابات لتعيين بديل.",
        badge: null,
        hot: false,
        features: ["كشف تعارض الجلسات", "إعادة توزيع المهام", "إشعار الطوارئ"],
      },
      {
        href: "/ai/draft",
        icon: PencilSimple,
        labelAr: "مكتبة صياغة المكتب",
        descAr: "حافظ على قوة واسم مكتبك من خلال مكتبة قوالب معتمدة يلتزم بها كافة فريق الصياغة والمتدربين لديك.",
        badge: null,
        hot: false,
        features: ["توحيد الهوية القانونية", "اعتماد المسودات", "قوالب مخصصة"],
      },
      {
        href: "/ai/legal-opinion",
        icon: Robot,
        labelAr: "المرجع المعرفي للفريق",
        descAr: "قاعدة بحث مخصصة لمكتبك تسرّع من وتيرة عمل المحامين المتدربين عبر توفير المرجعيات النظامية الموثقة.",
        badge: null,
        hot: false,
        features: ["تسريع بحث الفريق", "أحكام وسوابق سعودية", "تأصيل شرعي ونظامي"],
      },
    ],
    cta: { href: "/erp", labelAr: "اكتشف حلول التحول الرقمي لمكتبك" },
  },
  {
    id: "notary",
    icon: Stamp,
    labelAr: "موثق / كاتب عدل",
    descAr: "ضاعف من أعداد عمليات التوثيق يومياً بصياغة سريعة دقيقة لا ترفضها المنظومات العدلية.",
    color: "text-amber-600",
    bg: "bg-amber-500/8",
    border: "border-amber-400/30",
    badgeAr: "توثيق",
    stats: [
      { val: "٩٩٪", label: "دقة الصياغة النظامية" },
      { val: "دقيقتان", label: "لإنجاز الوكالات المخصصة" },
      { val: "+١٢", label: "نموذج توثيق جاهز" },
    ],
    tools: [
      {
        href: "/ai/contracts",
        icon: FileText,
        labelAr: "الصياغة التوثيقية الآلية",
        descAr: "نظام ينتج الإفراغات وعقود الشركات والوكالات الخاصة بدقة توافق اشتراطات وزارة العدل بدقائق.",
        badge: "الأكثر إنجازاً",
        hot: true,
        features: ["عقود نقل ملكية", "وكالات الورثة", "عقود التأسيس"],
      },
      {
        href: "/ai/secretary",
        icon: Headset,
        labelAr: "منسق المراجعين",
        descAr: "أرسل تنبيهات آلية للموكلين بالطلبات والمستندات الناقصة قبل الموعد لتجنب إضاعة وقتك.",
        badge: null,
        hot: false,
        features: ["تأكيد الموعد للمراجع", "قوائم الطلبات المسبقة", "رسائل التذكير"],
      },
      {
        href: "/ai/legal-opinion",
        icon: MagnifyingGlass,
        labelAr: "دليل التوثيق والتعاميم",
        descAr: "لا تبحث طويلاً، اسأل النظام وسيوافيك بتعاميم الوزارة الحديثة واشتراطات كل إجراء توثيقي فوراً.",
        badge: null,
        hot: false,
        features: ["تعاميم وأنظمة العدل", "نظام الشركات", "اشتراطات الإفراغ"],
      },
    ],
    cta: { href: "/join", labelAr: "ارفع كفاءة التوثيق لديك الآن" },
  },
  {
    id: "courts",
    icon: IdentificationCard,
    labelAr: "معقّب / مراجع دوائر",
    descAr: "تتبع المعاملات وحافظ على المواعيد الحرجة للعملاء بدون أخطاء بشرية مكلفة.",
    color: "text-emerald-600",
    bg: "bg-emerald-500/8",
    border: "border-emerald-400/30",
    badgeAr: "مراجعة",
    stats: [
      { val: "٠", label: "مهل الاستئناف المفقودة" },
      { val: "٢٤/٧", label: "تتبع للمواعيد الحرجة" },
      { val: "+٣٥٪", label: "سرعة في تجهيز متطلبات الرد" },
    ],
    tools: [
      {
        href: "/ai/secretary",
        icon: Headset,
        labelAr: "حارس المهل النظامية",
        descAr: "النظام ينذرك بشدة قبل انتهاء مدد الاعتراض والاستئناف. حماية حقيقية لك من الوقوع في الخطأ.",
        badge: "حصن وقائي",
        hot: true,
        features: ["عداد المهل القانونية", "إنذار الشطب", "تنبيه قبل الإغلاق"],
      },
      {
        href: "/ai/draft",
        icon: PencilSimple,
        labelAr: "مولد المعاريض والطلبات",
        descAr: "جهّز طلبات التأجيل، الاعتراض، أو الالتماسات الإجرائية بسرعة ليتم تقديمها للدائرة في نفس اليوم.",
        badge: null,
        hot: false,
        features: ["مذكرات عارضة", "طلبات الإمهال", "مخاطبات تنظيمية"],
      },
      {
        href: "/ai/legal-opinion",
        icon: MagnifyingGlass,
        labelAr: "كشاف الإجراءات",
        descAr: "تأكد من استيفاء كافة الشروط الورقية والنظامية قبل التوجه للدوائر أو التقدم عبر ناجز لضمان القبول.",
        badge: null,
        hot: false,
        features: ["دليل الإجراءات العدلية", "متطلبات التنفيذ", "اشتراطات المحاكم"],
      },
    ],
    cta: { href: "/join", labelAr: "نظّم مراجعاتك واحفظ المهل" },
  },
];

// ─── Tool Card ────────────────────────────────────────────────────────────────

function ToolCard({
  tool, index, isAr, isSelected, onSelect,
}: {
  tool: typeof ROLES[0]["tools"][0];
  index: number;
  isAr: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = tool.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07, type: "spring", stiffness: 100, damping: 20 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`group relative w-full overflow-hidden rounded-[2rem] border p-6 text-start transition-all md:p-8 ${
        isSelected
          ? "border-royal/30 bg-royal text-white shadow-[0_20px_40px_-10px_rgba(11,61,46,0.3)]"
          : "border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)] hover:border-slate-300 dark:hover:border-white/20"
      }`}
    >
      {isSelected && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(200,167,98,0.15),transparent_60%)]" />
      )}
      <div className="relative">
        {/* Badge */}
        {tool.badge && (
          <span className={`absolute -top-1 -left-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
            tool.hot ? "bg-[#C8A762] text-white" : "bg-amber-100 text-amber-700 border border-amber-300/50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/30"
          }`}>
            {tool.badge}
          </span>
        )}

        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? "bg-white/15" : "bg-royal/8 dark:bg-royal/15"}`}>
          <Icon size={24} weight="duotone" className={isSelected ? "text-white" : "text-royal"} />
        </span>

        <h3 className={`font-brand mt-4 text-lg font-bold ${isSelected ? "text-white" : "text-ink dark:text-gray-100"}`}>
          {tool.labelAr}
        </h3>

        <p className={`mt-2 text-sm leading-relaxed ${isSelected ? "text-white/80" : "text-ink-muted dark:text-gray-400"}`}>
          {tool.descAr}
        </p>

        {/* Features */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tool.features.map((f) => (
            <span
              key={f}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                isSelected
                  ? "border-white/20 bg-white/10 text-white/80"
                  : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LawyersPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const [activeRole, setActiveRole] = useState(ROLES[0]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  return (
    <>
      <Navbar />
      <main className="bg-surface dark:bg-dark-bg transition-colors duration-300">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pb-24 pt-32 md:pt-40">
          <div className="pointer-events-none absolute inset-0">
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 9, repeat: Infinity }}
              className="absolute -top-24 right-0 h-[600px] w-[600px] rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, rgba(11,61,46,0.6) 0%, transparent 70%)" }}
            />
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 11, repeat: Infinity, delay: 2 }}
              className="absolute -bottom-12 left-12 h-[400px] w-[400px] rounded-full opacity-8"
              style={{ background: "radial-gradient(circle, rgba(200,167,98,0.4) 0%, transparent 70%)" }}
            />
          </div>

          <div className="relative mx-auto max-w-[1400px] px-4">
            {/* Breadcrumb */}
            <div className="mb-8 flex items-center gap-2 text-xs text-ink-faint dark:text-gray-500">
              <a href="/" className="transition-colors hover:text-royal dark:hover:text-gold">الرئيسية</a>
              <span>/</span>
              <span className="text-ink-muted dark:text-gray-400">خدمات المحامين</span>
            </div>

            <div className="text-center max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-2"
              >
                <Gavel size={14} weight="fill" className="text-gold-dark" />
                <span className="text-xs font-medium text-gold-dark">مصمّم خصيصاً للمهنيين القانونيين</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="font-brand text-4xl font-extrabold leading-none tracking-tighter text-royal dark:text-white md:text-5xl lg:text-5xl"
              >
                <span className="block">ضاعف إنتاجيتك القانونية</span>
                <span className="block text-gold mt-1">وركّز على كسب الدعاوي</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 text-base leading-relaxed text-ink-muted dark:text-gray-400 md:text-lg"
              >
                توقف عن هدر ساعاتك في الصياغة الروتينية ومتابعة المواعيد. 
                منصة نظامي تسلّحك بذكاء اصطناعي يحوّل أياماً من العمل الإداري إلى ثوانٍ، لتتفرغ لما يهم حقاً: عملائك واستراتيجيتك.
              </motion.p>

              {/* Role selector strip */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-10 flex flex-wrap items-center justify-center gap-3"
              >
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const isActive = activeRole.id === role.id;
                  return (
                    <button
                      key={role.id}
                      onClick={() => { setActiveRole(role); setSelectedTool(null); }}
                      className={`flex items-center gap-2.5 rounded-2xl border px-5 py-3 text-sm font-semibold transition-all ${
                        isActive
                          ? `${role.bg} ${role.border} text-slate-800 dark:text-white shadow-sm`
                          : "border-slate-200 bg-white dark:border-white/10 dark:bg-dark-card text-ink-muted dark:text-zinc-400 hover:border-slate-300"
                      }`}
                    >
                      <Icon size={18} weight="duotone" className={isActive ? role.color : "text-slate-400"} />
                      {role.labelAr}
                      {isActive && (
                        <motion.span
                          layoutId="role-badge"
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-royal text-white`}
                        >
                          محدّد
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Active Role Profile ─────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeRole.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >

            {/* ── Stats strip ── */}
            <section className="pb-12">
              <div className="mx-auto max-w-[1400px] px-4">
                <div className="rounded-[2.5rem] border border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card p-8 md:p-10">
                  <div className="grid gap-8 md:grid-cols-2 items-center">
                    <div>
                      <span className={`inline-flex items-center gap-2 text-sm font-medium ${activeRole.color}`}>
                        {(() => { const Icon = activeRole.icon; return <Icon size={16} weight="duotone" />; })()}
                        {activeRole.labelAr}
                      </span>
                      <h2 className="font-brand mt-2 text-2xl font-bold text-ink dark:text-white md:text-3xl">
                        {activeRole.descAr}
                      </h2>
                      <a
                        href={activeRole.cta.href}
                        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-royal px-6 py-3 text-sm font-bold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]"
                      >
                        {activeRole.cta.labelAr}
                        <ArrowLeft size={15} weight="bold" />
                      </a>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {activeRole.stats.map((stat, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="rounded-2xl border border-slate-100 dark:border-white/10 bg-surface dark:bg-dark-bg p-4 text-center"
                        >
                          <div className="font-brand text-2xl font-extrabold text-royal dark:text-gold">{stat.val}</div>
                          <div className="mt-1 text-xs text-ink-muted dark:text-gray-400">{stat.label}</div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Tools grid ── */}
            <section className="py-12 md:py-16">
              <div className="mx-auto max-w-[1400px] px-4">
                <div className="mb-10">
                  <span className="text-sm font-medium text-gold-dark">أبرز الأدوات لك</span>
                  <h2 className="font-brand mt-2 text-3xl font-bold tracking-tight text-royal dark:text-white md:text-4xl">
                    كل ما تحتاجه في مكان واحد
                  </h2>
                  <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
                    اضغط على أي أداة لمعرفة المزيد
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                  {activeRole.tools.map((tool, i) => (
                    <ToolCard
                      key={tool.href}
                      tool={tool}
                      index={i}
                      isAr={isAr}
                      isSelected={selectedTool === tool.href}
                      onSelect={() => setSelectedTool(selectedTool === tool.href ? null : tool.href)}
                    />
                  ))}
                </div>

                {/* Detail panel */}
                <AnimatePresence>
                  {selectedTool && (() => {
                    const tool = activeRole.tools.find((t) => t.href === selectedTool);
                    if (!tool) return null;
                    const Icon = tool.icon;
                    return (
                      <motion.div
                        key={selectedTool}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-6 rounded-[2rem] border border-royal/15 bg-white p-8 dark:border-white/10 dark:bg-dark-card md:p-10">
                          <div className="grid gap-8 md:grid-cols-2">
                            <div>
                              <div className="flex items-center gap-3 mb-3">
                                <span className="w-10 h-10 rounded-xl bg-royal/8 flex items-center justify-center">
                                  <Icon size={20} weight="duotone" className="text-royal" />
                                </span>
                                <h3 className="font-brand text-xl font-bold text-ink dark:text-gray-100">{tool.labelAr}</h3>
                              </div>
                              <p className="text-sm leading-relaxed text-ink-muted dark:text-gray-400">{tool.descAr}</p>
                              <ul className="mt-6 space-y-2.5">
                                {tool.features.map((f) => (
                                  <li key={f} className="flex items-center gap-3 text-sm text-ink-muted dark:text-gray-400">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal/5">
                                      <Check size={12} weight="bold" className="text-royal" />
                                    </span>
                                    {f}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex flex-col gap-3">
                              <motion.a
                                href={tool.href}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="flex items-center justify-center gap-2 rounded-2xl bg-royal px-6 py-4 text-sm font-bold text-white"
                              >
                                جرّب الأداة الآن
                                <ArrowLeft size={15} weight="bold" />
                              </motion.a>
                              <a
                                href={activeRole.cta.href}
                                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-white/10 py-3.5 text-sm font-medium text-ink-muted dark:text-gray-300"
                              >
                                {activeRole.cta.labelAr}
                              </a>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            </section>



          </motion.div>
        </AnimatePresence>

        {/* ── Why Nezamy ──────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[1400px] px-4">
            <div className="rounded-[2.5rem] bg-royal p-10 md:p-16">
              <div className="grid gap-12 md:grid-cols-2 md:items-center">
                <div>
                  <span className="text-sm font-medium text-gold">لماذا نظامي للمهنيين القانونيين؟</span>
                  <h2 className="font-brand mt-3 text-3xl font-bold text-white md:text-4xl">
                    مبني على الأنظمة السعودية
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-white/70">
                    نظامي ليس مجرد أداة AI عامة — بل نظام متخصص مدرّب على التشريعات
                    واللوائح السعودية الحديثة ومحدّث باستمرار.
                  </p>
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    {[
                      { icon: Lock, labelAr: "سرية تامة" },
                      { icon: Clock, labelAr: "تحديث مستمر" },
                      { icon: ShieldCheck, labelAr: "معتمد قانونياً" },
                      { icon: Brain, labelAr: "AI متخصص" },
                    ].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-gold">
                            <Icon size={18} weight="duotone" />
                          </span>
                          <span className="text-sm text-white/80">{item.labelAr}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: "٢,٠٠٠+", label: "محامٍ على المنصة" },
                    { value: "٩٤٪", label: "رضا المحامين" },
                    { value: "٥٠٠+", label: "شركة محاماة" },
                    { value: "٤٧٪", label: "توفير في الوقت" },
                  ].map((stat, i) => (
                    <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                      <div className="font-brand text-2xl font-extrabold text-gold">{stat.value}</div>
                      <div className="mt-1 text-xs text-white/60">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section className="pb-24">
          <div className="mx-auto max-w-[1400px] px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-brand text-3xl font-bold text-royal dark:text-white md:text-4xl">
                جاهز لرفع مستوى ممارستك القانونية؟
              </h2>
              <p className="mx-auto mt-4 max-w-[45ch] text-sm text-ink-muted dark:text-gray-400">
                انضم لآلاف المحامين الذين يثقون بنظامي لمضاعفة إنتاجيتهم.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <motion.a
                  href="/join"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-royal px-8 py-4 text-sm font-bold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]"
                >
                  ابدأ مجاناً الآن
                  <ArrowLeft size={16} weight="bold" />
                </motion.a>
                <a
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-7 py-4 text-sm font-medium text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-300"
                >
                  تحدّث مع فريقنا
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
