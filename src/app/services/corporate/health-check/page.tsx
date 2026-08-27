"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, FileText, ShieldCheck,
  ArrowLeft, Check, Warning, Buildings,
  Scales, TrendUp, Clipboard, Phone, Lock,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
// The free legal-needs assessment, imported whole from the page that already
// owns it. It POSTs to /api/v1/leads/business-assessment — a public endpoint
// that writes a real `service_requests` row on `receiver: "ai_workspace"`, the
// one value the admin fulfilment queue reads — and shows the reference the
// server actually returned. See the note over the CTAs for why every button on
// this page now opens THIS and not a dashboard.
import { AssessmentModal } from "@/app/services/business/_components";

/**
 * /services/corporate/health-check — the public page selling «الفحص القانوني
 * الشامل ٣٦٠°».
 *
 * WHAT WAS WRONG WITH IT
 * Every call to action on the page — the hero button, three pricing buttons and
 * the closing CTA — pointed at /dashboard/business/health-check. That route is
 * a hidden business section (`isVisibleBusinessRoute` refuses it; see
 * navigation.sidebars.business.test.ts), hidden on 26 August precisely because
 * the screen behind it rendered MOCK_FILES and MOCK_FINDINGS. So a prospective
 * client read a price of ٦,٩٩٩ ر.س/سنة, clicked, and hit a wall. Around those
 * dead buttons the page advertised a product that does not exist anywhere in
 * this codebase: AI document classification, a live dashboard, WhatsApp expiry
 * alerts, automatic conflict checking against a company database, ERP
 * integration and a direct API. It also printed a «لقطة من الداشبورد» whose
 * ٧٢/١٠٠ score and five progress bars were invented, four hero statistics with
 * no source (٨٢ نقطة، ٩٣٪ دقة، ٢٤ ساعة، ٥ دقائق) and a market statistic
 * («٧٢٪ من الشركات السعودية») that came from nowhere.
 *
 * WHAT IT DOES NOW
 * The service is presented as what the office can actually perform today: a
 * legal review carried out by the نظامي team by hand. Every CTA opens the free
 * assessment form, which really reaches the office. What the client receives
 * and when is deferred to the written quote rather than described here, because
 * nothing in the codebase decides it. The automated features, the fabricated
 * dashboard, the invented statistics and the annual monitoring subscription
 * (whose entire feature list was alerts and dashboards that do not exist) are
 * gone rather than restyled.
 *
 * WHAT WAS KEPT AND WHY
 * The document-volume price table: those figures are the office's own, and the
 * defect was never the price — it was the dead button underneath it. It is now
 * labelled indicative and sits above a CTA that works. The absence of any way
 * to pay inside the platform is stated rather than implied.
 */

// What the team looks through. This is the SCOPE of the review — a restatement
// of what the page already claimed — and deliberately not a list of what the
// client gets back. The «~٣٨ وثيقة» badges that used to sit on these cards were
// counts of a company nobody had looked at yet.
const AUDIT_CATEGORIES = [
  { icon: FileText, label: "العقود التجارية", example: "توريد، خدمات، شراكة" },
  { icon: Scales,   label: "العقود العمالية", example: "عقود عمل، مخالصات" },
  { icon: Buildings,label: "التراخيص والرخص", example: "سجل تجاري، بلدي، دفاع مدني" },
  { icon: TrendUp,  label: "المستندات المالية", example: "ميزانية، إقرارات زكوية" },
  { icon: ShieldCheck, label: "المستندات الحكومية", example: "خطابات، قرارات، إشعارات" },
  { icon: Lock,     label: "الملكية الفكرية", example: "علامات تجارية، سجلات صناعية" },
];

// The engagement as it really runs: a form that reaches the office, an
// agreement on scope, then lawyers reading documents. The six steps that stood
// here («AI يقرأ كل وثيقة ويصنّفها»، «الداشبورد الحي»، «تنبيهات واتساب»،
// «فحص التعارض التلقائي») described software that was never built.
const STEPS = [
  {
    icon: Clipboard,
    title: "تقييم مجاني",
    desc: "تعبّئ نموذجاً قصيراً بحجم شركتك واحتياجاتها، فيصل مباشرة إلى فريق نظامي — والفحص الشامل ٣٦٠° مُحدَّد فيه سلفاً. مجاناً وبلا التزام.",
  },
  {
    icon: FileText,
    title: "تحديد النطاق وعرض السعر",
    desc: "يتواصل معك الفريق ليتفق على الوثائق المشمولة بالمراجعة، ثم يرسل عرض سعر مكتوب يثبّت النطاق والمقابل.",
  },
  {
    icon: ShieldCheck,
    title: "تسليم الوثائق",
    desc: "بعد قبولك للعرض تُسلَّم الوثائق بالطريقة التي يتفق عليها الفريق معك. لا يوجد في المنصة اليوم رفع تلقائي لوثائق الفحص.",
  },
  {
    icon: Scales,
    title: "المراجعة",
    desc: "يراجع محامو المكتب الوثائق بأنفسهم — لا تصنيف آلي ولا تحليل تلقائي. ما تستلمه ومواعيده مثبّتان في عرض السعر.",
  },
];

// Indicative pricing by document volume. Kept as the office wrote it; what
// changed is that the button under it now leads somewhere.
const TIERS = [
  { docs: "حتى ٥٠ وثيقة", standalone: "٤,٩٩٩", subscriber: "٢,٩٩٩", tag: "شركات صغيرة" },
  { docs: "٥١ — ٢٠٠ وثيقة", standalone: "٩,٩٩٩", subscriber: "٥,٩٩٩", tag: "شركات متوسطة" },
  { docs: "٢٠١ — ١,٠٠٠ وثيقة", standalone: "١٩,٩٩٩", subscriber: "١١,٩٩٩", tag: "شركات كبرى" },
  { docs: "١,٠٠١+ وثيقة", standalone: "تواصل معنا", subscriber: "تواصل معنا", tag: "مؤسسات" },
];

export default function HealthCheckPage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const [showAssessment, setShowAssessment] = useState(false);

  const tp = isDark ? "text-white" : "text-slate-900";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200/70";
  const cardBg = isDark ? "bg-zinc-900" : "bg-white";

  return (
    <>
      <Navbar />
      <div className={`min-h-screen ${isDark ? "bg-[#080808]" : "bg-white"}`}>

        {/* Hero */}
        <section className="relative overflow-hidden pt-32 pb-20">
          <div className="pointer-events-none absolute inset-0">
            <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.12, 0.22, 0.12] }}
              transition={{ duration: 10, repeat: Infinity }}
              className="absolute -top-40 -left-40 w-[800px] h-[800px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(11,61,46,0.18) 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-[1200px] mx-auto px-6 text-center">
            {/* Was «خدمة حصرية — لا يوجد مثيل لها في السوق السعودي». Replaced by
                the one thing about the service that is checkable. */}
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/5 mb-6">
              <MagnifyingGlass size={14} className="text-[#C8A762]" weight="duotone" />
              <span className="text-[12px] font-semibold text-[#C8A762]">مراجعة يقوم بها فريق نظامي القانوني</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-5 ${tp}`}>
              الفحص القانوني الشامل
              <span className="block text-royal mt-2">٣٦٠°</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`text-lg leading-relaxed max-w-2xl mx-auto mb-8 ${ts}`}>
              مراجعة قانونية لملف شركتك: عقودها، تراخيصها، ملفات عامليها والتزاماتها النظامية.
              يتفق معك الفريق على نطاق المراجعة ومقابلها في عرض سعر مكتوب قبل أن تلتزم بشيء.
            </motion.p>

            <div className="flex flex-wrap justify-center gap-4">
              <motion.button type="button" onClick={() => setShowAssessment(true)}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#0B3D2E] text-white font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.5)]">
                اطلب تقييماً مجانياً <ArrowLeft size={16} weight="bold" />
              </motion.button>
              <a href="#how" className={`inline-flex items-center gap-2 px-6 py-4 rounded-2xl border font-medium text-sm ${border} ${ts}`}>
                كيف تسير الخدمة؟
              </a>
            </div>

            {/* The instruction that stood here — «اذكر في خانة الملاحظات أنك
                تطلب الفحص الشامل ٣٦٠°» — is gone because the intent now travels
                on its own. `legal_audit` («فحص قانوني شامل للمنشأة») was added
                to LEGAL_NEEDS in the endpoint's own module and this page
                pre-ticks it, so the team sees what was asked for whether or not
                the visitor writes anything.
                Telling them to type it was never reliable: the notes field is
                optional AND on a later step, and the modal's backdrop covers
                this very sentence the moment the button is pressed. */}
            <p className={`mt-4 text-[12px] ${ts}`}>
              النموذج قصير — بيانات المنشأة وطريقة التواصل، ويصل مباشرة إلى فريق نظامي.
            </p>

            {/* The four statistics that stood here — «٨٢ نقطة يتم فحصها
                تلقائياً»، «٩٣٪ دقة التصنيف الذكي»، «٥ دقائق وقت الرفع»،
                «٢٤ ساعة لتسليم التقرير» — measured a system that does not
                exist. What replaces them is the fact a company actually needs
                before it reads a price: how this is delivered. */}
            <div className={`mt-12 mx-auto max-w-2xl rounded-2xl border p-5 text-start ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start gap-3">
                <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
                <p className="text-[13px] leading-relaxed text-amber-700 dark:text-amber-300">
                  هذه خدمة يؤدّيها الفريق يدوياً. لا يوجد داخل المنصة اليوم رفع تلقائي لوثائق الفحص،
                  ولا تصنيف آلي، ولا لوحة تحكم حية لنتائج الفحص، ولا تنبيهات تلقائية لانتهاء العقود أو الرخص.
                  تبدأ الخدمة بتقييم مجاني يصل إلى الفريق، وينتهي الاتفاق بعرض سعر مكتوب.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What gets reviewed */}
        <section className="py-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">ماذا يُراجَع؟</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>ملفات شركتك القانونية</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>نطاق المراجعة النهائي — أي هذه الملفات ومداها — يُتفق عليه معك ويُثبَّت في عرض السعر.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {AUDIT_CATEGORIES.map((c, i) => {
                const Icon = c.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                    <div className="mb-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
                        <Icon size={22} weight="duotone" className="text-royal" />
                      </div>
                    </div>
                    <h3 className={`font-bold text-[15px] mb-1 ${tp}`}>{c.label}</h3>
                    <p className={`text-[12px] ${ts}`}>{c.example}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works — the anchor the hero's second button points at */}
        <section id="how" className="py-16 md:py-24">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-14">
              <span className="text-sm font-medium text-[#C8A762]">كيف تسير الخدمة؟</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>أربع خطوات — من التقييم إلى المراجعة</h2>
            </div>
            <div className="grid gap-6">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    className={`flex items-start gap-5 p-6 rounded-[1.5rem] border ${border} ${cardBg}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                      i === 0 ? "bg-royal text-white" : isDark ? "bg-white/[0.06]" : "bg-slate-100"
                    }`}>
                      <Icon size={24} weight="duotone" className={i === 0 ? "text-white" : "text-royal"} />
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>الخطوة {i + 1}</p>
                      <h3 className={`text-[16px] font-bold mb-1 ${tp}`}>{step.title}</h3>
                      <p className={`text-[13px] leading-relaxed ${ts}`}>{step.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <motion.button type="button" onClick={() => setShowAssessment(true)}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#0B3D2E] text-white font-bold text-sm">
                ابدأ بالخطوة الأولى — تقييم مجاني <ArrowLeft size={16} weight="bold" />
              </motion.button>
            </div>
          </div>
        </section>

        {/* Pricing — indicative, by document volume.
            The «هكذا يبدو وضعك القانوني» section that stood before this one
            showed a ٧٢/١٠٠ score, five progress bars and three alert counters,
            captioned as a screenshot of the health-check dashboard. Every
            number in it was written by hand and the dashboard it claimed to
            show is a hidden route rendering MOCK_FINDINGS. It is deleted, not
            relabelled: captioning invented data «مثال توضيحي» still promises
            the screen exists. */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">التسعير</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>أسعار استرشادية حسب حجم الوثائق</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>المشتركون في باقات نظامي للشركات يحصلون على خصم — يُطبَّق في عرض السعر.</p>
            </div>

            <div className="max-w-3xl mx-auto">
              <div className={`rounded-[1.5rem] border overflow-hidden ${border} ${cardBg}`}>
                <div className={`grid grid-cols-4 gap-0 text-[12px] font-bold p-4 border-b ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-100 text-slate-400"}`}>
                  <span>عدد الوثائق</span>
                  <span className="text-center">بدون باقة</span>
                  <span className="text-center text-[#C8A762]">مشترك في باقة ⭐</span>
                  <span className="text-center">الفئة</span>
                </div>
                {TIERS.map((t, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className={`grid grid-cols-4 gap-0 items-center p-4 border-b last:border-0 ${isDark ? "border-white/[0.04]" : "border-slate-50"}`}>
                    <span className={`text-[13px] font-medium ${tp}`}>{t.docs}</span>
                    <span className={`text-center text-[14px] font-bold font-mono ${tp}`}>{t.standalone} <span className={`text-[10px] font-normal ${ts}`}>﷼</span></span>
                    <span className="text-center text-[14px] font-bold font-mono text-[#C8A762]">{t.subscriber} <span className="text-[10px] font-normal text-[#C8A762]/60">﷼</span></span>
                    <span className={`text-center text-[10px] px-2 py-0.5 rounded-full mx-auto ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{t.tag}</span>
                  </motion.div>
                ))}
              </div>
              {/* The footnote here used to itemise a deliverable nobody has
                  committed to («تصنيف ذكي + تقرير مخاطر + جرد تراخيص + ملخص
                  مالي + تقرير PDF»), the first item of which was the automated
                  classification that does not exist. */}
              <p className={`text-[11px] mt-3 text-center leading-relaxed ${ts}`}>
                * أرقام استرشادية للفحص الأولي. السعر النهائي ونطاق العمل والمخرجات تُثبَّت في عرض سعر مكتوب بعد جرد وثائقك.
                <br />
                لا يمكن السداد داخل المنصة حالياً — يتفق الفريق معك على طريقة السداد بعد قبولك للعرض.
              </p>
            </div>

            {/* Was three subscription cards: «مراقبة سنوية ٦,٩٩٩ ر.س/سنة»،
                «إضافة وثائق» و«مؤسسي», selling WhatsApp expiry alerts,
                automatic quarterly updates, new-contract conflict checking, a
                live dashboard, ERP integration, a direct API and a dedicated
                SLA. None of that exists in this codebase, so the price is
                removed with the promise rather than left attached to it. */}
            <div className="max-w-3xl mx-auto mt-14">
              <div className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                <h3 className={`text-[17px] font-bold mb-2 ${tp}`}>المتابعة بعد الفحص</h3>
                <p className={`text-[13px] leading-relaxed ${ts}`}>
                  لا توجد في المنصة اليوم مراقبة تلقائية للعقود والتراخيص، ولا تنبيهات آلية قبل انتهائها.
                  إن رغبت في متابعة دورية بعد الفحص الأولي، فهي ترتيب يُتفق عليه مع الفريق ويُدرَج في عرض السعر —
                  ولا نبيعها كاشتراك جاهز ما دام النظام الذي يشغّلها غير موجود.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 pb-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-[2.5rem] bg-[#0B3D2E] p-10 md:p-16 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.5)]">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">لا تعرف وضع شركتك القانوني؟</h2>
              {/* «٧٢٪ من الشركات السعودية تكتشف مخالفات... عند التفتيش» was a
                  statistic with no source anywhere. */}
              <p className="text-white/60 text-sm max-w-md mx-auto mb-8">
                ابدأ بتقييم مجاني لاحتياجات شركتك. يصل إلى فريق نظامي مباشرة، ولا يترتب عليه أي التزام ولا أي مبلغ.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <motion.button type="button" onClick={() => setShowAssessment(true)}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#C8A762] text-[#0B3D2E] font-bold text-sm">
                  اطلب تقييماً مجانياً <ArrowLeft size={16} weight="bold" />
                </motion.button>
                <a href="/contact" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl border border-white/30 text-white/80 font-medium text-sm">
                  <Phone size={15} /> تواصل مع الفريق
                </a>
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-white/50 text-[12px]">
                <Check size={13} weight="bold" />
                التقييم مجاني ولا يتطلب تسجيل حساب
              </div>
            </motion.div>
          </div>
        </section>
      </div>
      <Footer />

      {/* The same modal /services/business opens, so there is ONE free-assessment
          form and one endpoint behind it rather than a second copy that drifts. */}
      <AnimatePresence>
        {/* sourcePath: without it every lead filed from this page recorded
            «/services/business» as where the visitor came from — a false
            provenance on a stored column an admin reads.
            presetNeeds: the modal's needs picker is a required gate and there
            was no option meaning «the audit I just read about», so the page
            used to tell the visitor to type it into an OPTIONAL notes field on
            a later step — behind the modal's own backdrop, which covers that
            instruction the moment the button is pressed. It is pre-ticked now,
            and a visitor who wants something else can untick it. */}
        {showAssessment && (
          <AssessmentModal
            onClose={() => setShowAssessment(false)}
            isAr={isAr}
            sourcePath="/services/corporate/health-check"
            presetNeeds={["legal_audit"]}
          />
        )}
      </AnimatePresence>
    </>
  );
}
