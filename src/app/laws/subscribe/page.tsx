"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  BookOpen, Check, ArrowLeft, ArrowRight, MagnifyingGlass,
  Bell, Lock, Scales, Gavel, Buildings, ShieldCheck,
  Lightning, Star, FileText, Users, Gift,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import InvitationModal from "@/components/InvitationModal";
import { useUser } from "@/hooks/useUser";
import { isSupabaseMode } from "@/lib/services/api";
import { requestEntitlement } from "@/lib/services/entitlementService";
import { planFromParam } from "@/lib/pricing/planRequest";
import { LIBRARY_STAT_KEYS, LIBRARY_STAT_LABELS, formatLibraryCount } from "@/lib/library/libraryStats";
import { useLibraryStats } from "@/lib/library/useLibraryStats";
import { useLibraryFullAccess } from "@/lib/library/useLibraryFullAccess";
import { VAT_NOTICE } from "@/lib/pricing/vatNotice";

// ─── Bilingual ──────────────────────────────────────────────────────────────

const txt = {
  ar: {
    heroTag: "المكتبة القانونية",
    heroTitle: "كل نظام ولائحة في المملكة — في مكان واحد",
    heroSub: "بحث بالنص الكامل في الأنظمة واللوائح السعودية والسوابق والمبادئ القضائية.",
    // The hero tiles are the library's live counts (useLibraryStats), never
    // literals. «27 قسم قانوني» (no such division exists), «يومي — تحديث
    // الأنظمة» (nothing watches for new legislation; the library is loaded by
    // hand) and «AI — بحث ذكي» (search is Postgres full-text) were removed.
    plansTitle: "اختر خطتك",
    plansSub: "اختر الخطة المناسبة — يُراجع طلبك ويُفعَّل الاشتراك بعد الموافقة.",
    monthly: "شهري",
    // No «(وفّر ١٦٪)»: every plan below has price === priceYearly, so the
    // toggle saves nothing.
    yearly: "سنوي",
    subscribe: "اشترك الآن",
    exploreFree: "تصفح المجاني",
    perMonth: "/شهر",
    perYear: "/سنة",
    // Owner ٢٤٨: the library's VAT depends on the buyer (catalog.ts, vat "buyer").
    vatNote: VAT_NOTICE.library.ar,
    plans: [
      {
        id: "free",
        name: "مجاني",
        price: "0 ر.س",
        priceYearly: "0 ر.س",
        desc: "تصفح محدود للأنظمة الأساسية",
        icon: BookOpen,
        color: "from-zinc-600 to-zinc-500",
        features: [
          "تصفح عناوين الأنظمة فقط",
          "بحث محدود — 5 عمليات/يوم",
          "بدون نصوص كاملة",
          "بدون سوابق قضائية",
        ],
        cta: "ابدأ مجاناً",
        featured: false,
      },
      {
        id: "lib-q1",
        name: "ربع سنوي (٣ أشهر)",
        price: "١٬٥٠٠ ر.س / ٣ أشهر",
        priceYearly: "١٬٥٠٠ ر.س / ٣ أشهر",
        desc: "وصول كامل للمكتبة والبحث بالنص الكامل",
        icon: MagnifyingGlass,
        color: "from-[#0B3D2E] to-emerald-600",
        features: [
          "نصوص الأنظمة واللوائح كاملة",
          "بحث غير محدود بالنص الكامل",
          "دعم البريد الإلكتروني",
        ],
        cta: "اشترك الآن",
        featured: false,
      },
      {
        id: "lib-q2",
        name: "نصف سنوي (٦ أشهر)",
        price: "٢٬٧٥٠ ر.س / ٦ أشهر",
        priceYearly: "٢٬٧٥٠ ر.س / ٦ أشهر",
        desc: "يضيف السوابق والمبادئ القضائية والبحث بالمواد والبنود",
        icon: Scales,
        color: "from-[#C8A762] to-amber-600",
        features: [
          "كل مزايا الربع سنوي",
          "السوابق والمبادئ القضائية",
          "بحث بالمواد والبنود",
          "دعم عبر واتساب",
        ],
        cta: "اشترك الآن",
        featured: true,
      },
      {
        id: "lib-annual",
        name: "سنوي (١٢ شهر)",
        price: "٥٬٠٠٠ ر.س / سنة",
        priceYearly: "٥٬٠٠٠ ر.س / سنة",
        desc: "اشتراك لمدة ١٢ شهراً للاستخدام المستمر",
        icon: Buildings,
        color: "from-purple-700 to-purple-500",
        features: [
          "كل مزايا النصف سنوي",
          "مقارنة التعديلات (diff)",
          "تصدير نصوص الأنظمة بصيغة PDF",
        ],
        cta: "اشترك الآن",
        featured: false,
      },
    ],
    faqTitle: "أسئلة شائعة",
    faqs: [
      { q: "كيف يتم تفعيل الاشتراك؟", a: "عند الضغط على «اشترك الآن» يُرسَل طلبك للمراجعة، ويقوم فريقنا بتفعيل خطتك بعد الموافقة عليه. إن كان لديك كود دعوة، فإنه يفتح المكتبة القانونية كاملة لمدة ٣٠ يوماً فور تفعيله، دون انتظار." },
      { q: "ما الفرق بين البحث المحدود والبحث الكامل؟", a: "البحث المحدود يسمح بـ 5 عمليات يومية في عناوين الأنظمة فقط. البحث الكامل يتيح بحثاً غير محدود في النصوص الكاملة." },
      { q: "هل يمكنني ترقية أو تنزيل خطتي في أي وقت؟", a: "يمكنك طلب الترقية أو التغيير في أي وقت؛ يراجع الفريق الطلب ويفعّله يدوياً." },
      { q: "هل المكتبة تشمل الأنظمة الملغاة؟", a: "نعم. نحتفظ بجميع الأنظمة بما فيها الملغاة والمعدلة مع إشارة واضحة لحالة كل نظام وتاريخ التعديل." },
    ],
    backToLibrary: "العودة للمكتبة",
  },
  en: {
    heroTag: "Legal Library",
    heroTitle: "Every Saudi Law & Regulation — In One Place",
    heroSub: "Full-text search across Saudi laws, regulations, judicial precedents and legal principles.",
    plansTitle: "Choose Your Plan",
    plansSub: "Choose the plan that fits — your request is reviewed and activated once approved.",
    monthly: "Monthly",
    yearly: "Yearly",
    subscribe: "Subscribe Now",
    exploreFree: "Browse Free",
    perMonth: "/mo",
    perYear: "/yr",
    vatNote: VAT_NOTICE.library.en,
    plans: [
      {
        id: "free",
        name: "Free",
        price: "0 SAR",
        priceYearly: "0 SAR",
        desc: "Limited browsing of core laws",
        icon: BookOpen,
        color: "from-zinc-600 to-zinc-500",
        features: [
          "Browse law titles only",
          "Limited search — 5/day",
          "No full texts",
          "No judicial precedents",
        ],
        cta: "Start Free",
        featured: false,
      },
      {
        id: "lib-q1",
        name: "Quarterly (3 Months)",
        price: "SAR 1,500 / 3 Months",
        priceYearly: "SAR 1,500 / 3 Months",
        desc: "Full library access with full-text search",
        icon: MagnifyingGlass,
        color: "from-[#0B3D2E] to-emerald-600",
        features: [
          "Full law & regulation texts",
          "Unlimited full-text search",
          "Email support",
        ],
        cta: "Subscribe Now",
        featured: false,
      },
      {
        id: "lib-q2",
        name: "Semi-Annual (6 Months)",
        price: "SAR 2,750 / 6 Months",
        priceYearly: "SAR 2,750 / 6 Months",
        desc: "Adds judicial precedents, principles and article-level search",
        icon: Scales,
        color: "from-[#C8A762] to-amber-600",
        features: [
          "All Quarterly features",
          "Judicial precedents & principles",
          "Article & clause level search",
          "WhatsApp support",
        ],
        cta: "Subscribe Now",
        featured: true,
      },
      {
        id: "lib-annual",
        name: "Annual (12 Months)",
        price: "SAR 5,000 / Year",
        priceYearly: "SAR 5,000 / Year",
        desc: "A 12-month subscription for ongoing use",
        icon: Buildings,
        color: "from-purple-700 to-purple-500",
        features: [
          "All Semi-Annual features",
          "Amendment diff comparison",
          "Export laws to PDF",
        ],
        cta: "Subscribe Now",
        featured: false,
      },
    ],
    faqTitle: "Frequently Asked Questions",
    faqs: [
      { q: "How does activation work?", a: "Clicking \"Subscribe Now\" sends your request for review, and our team activates your plan once it's approved. If you have an invitation code, it opens the full legal library for 30 days as soon as you redeem it — no waiting." },
      { q: "What's the difference between limited and full search?", a: "Limited search allows 5 daily queries on titles only. Full search is unlimited across the full texts." },
      { q: "Can I upgrade or downgrade anytime?", a: "You can request an upgrade or a change at any time; the team reviews the request and activates it manually." },
      { q: "Does the library include repealed laws?", a: "Yes. We maintain all laws including repealed and amended ones with clear status indicators and modification dates." },
    ],
    backToLibrary: "Back to Library",
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function LawsSubscribePage() {
  const { isDark, lang } = useTheme();
  const { isLoggedIn } = useUser();
  const libraryAccess = useLibraryFullAccess();
  const isAr = lang === "ar";
  const t = isAr ? txt.ar : txt.en;
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const [yearly, setYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  // `?plan=` from the paywall or a /pricing CTA (lib-q1 / lib-annual): the plan
  // the visitor chose is marked and scrolled into view. Nothing is requested on
  // arrival — the request still waits for «اشترك الآن». Read in an effect, not
  // with useSearchParams (that needs a Suspense boundary for `next build`).
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);
  useEffect(() => {
    const chosen = planFromParam(
      new URLSearchParams(window.location.search).get("plan"),
      txt.ar.plans.map((p) => p.id).filter((id) => id !== "free"),
    );
    setChosenPlanId(chosen);
    if (chosen) document.getElementById(`plan-${chosen}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  // The four tiles are the live floors of the library's tables (GET
  // /api/library/stats), as on /login. «5,000+ نظام ولائحة» was a literal and
  // the wrong noun: the table holds every instrument type («وثيقة نظامية»).
  // Loading → placeholders; a failed count → no tiles at all, never a number;
  // a count too small to floor (formatLibraryCount → null) → no tile.
  const library = useLibraryStats();
  const statTiles: { val: string | null; label: string }[] =
    library.status === "error"
      ? []
      : LIBRARY_STAT_KEYS.map((key) => ({
          val: library.status === "ready" ? formatLibraryCount(library.stats[key], isAr ? "ar" : "en") : null,
          label: isAr ? LIBRARY_STAT_LABELS[key].ar : LIBRARY_STAT_LABELS[key].en,
        })).filter((tile) => library.status === "loading" || tile.val !== null);

  // The full library is the server's answer (GET /api/v1/library/access): a
  // Pro+ tier, an active library grant, or an admin. The client's tier-only
  // gate told a library subscriber to redeem a code.
  // The code-redeem CTA can only ever succeed for a signed-in user in
  // Supabase mode (redeemLibraryInvitation throws in demo mode), and it waits
  // for the answer so it never flashes for a subscriber.
  const canRedeemCode = isLoggedIn && isSupabaseMode && !libraryAccess.loading && !libraryAccess.hasFullAccess;

  function handleSubscribe(planId: string) {
    if (planId === "free") {
      window.location.href = "/laws";
      return;
    }
    // Logged-in users: send an entitlement request instead of the local
    // subscription mock (no gateway yet). Admin approves it later.
    if (isLoggedIn) {
      void requestEntitlement({ kind: "library", requested_ref: planId }).then((res) => {
        setToast(
          res.ok
            ? { ok: true, msg: "تم إرسال طلبك للمراجعة" }
            : { ok: false, msg: res.error ?? "تعذّر إرسال الطلب" },
        );
        window.setTimeout(() => setToast(null), 4000);
      });
      return;
    }
    // Guests: no gateway and no entitlement request without a session — the
    // old fallback here created a fake local "subscription" and handed out
    // 3 fabricated referral links (src/lib/invitationStore.ts). The honest
    // action is to send them to sign in first — and back here, with the plan
    // they chose (`next`, read by /login through postLoginPath).
    setToast({ ok: false, msg: "يلزم تسجيل الدخول للاشتراك في المكتبة" });
    window.setTimeout(() => {
      window.location.href = `/login?next=${encodeURIComponent(`/laws/subscribe?plan=${planId}`)}`;
    }, 1400);
  }

  const card = isDark
    ? "bg-zinc-900/80 border border-white/[0.06]"
    : "bg-white border border-zinc-100 shadow-sm";

  const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as const },
    }),
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className={`min-h-[100dvh] ${isDark ? "bg-[#0c0f12] text-zinc-100" : "bg-zinc-50 text-zinc-900"}`}
    >
      <div className="max-w-[1200px] mx-auto px-4 py-8 md:py-16 space-y-16">

        {/* ── Back Link ──────────────────────────────────────────────── */}
        <Link
          href="/laws"
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"}`}
        >
          <Arrow size={14} className={isAr ? "" : "rotate-180"} />
          {t.backToLibrary}
        </Link>

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <div className="flex flex-col lg:flex-row items-start gap-8">
            <div className="flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold mb-4 ${
                isDark ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20" : "bg-indigo-100 text-indigo-700"
              }`}>
                <BookOpen size={12} weight="fill" /> {t.heroTag}
              </span>
              <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>
                {t.heroTitle}
              </h1>
              <p className={`text-base leading-relaxed max-w-[60ch] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {t.heroSub}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[280px]">
              {statTiles.map((s, i) => (
                <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                  className={`rounded-2xl p-4 text-center ${card}`}
                >
                  <p className={`text-xl font-bold font-mono mb-0.5 ${isDark ? "text-indigo-400" : "text-indigo-700"}`}>
                    {s.val ?? <span aria-hidden className="inline-block h-[0.8em] w-14 rounded-md align-middle animate-pulse bg-zinc-400/20" />}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── Toggle ──────────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5} className="text-center space-y-3">
          <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{t.plansTitle}</h2>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{t.plansSub}</p>

          <div className={`inline-flex items-center gap-1 p-1 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            {[false, true].map(isY => (
              <button
                key={String(isY)}
                onClick={() => setYearly(isY)}
                className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${
                  yearly === isY
                    ? isDark ? "bg-[#0B3D2E] text-[#C8A762] shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                {isY ? t.yearly : t.monthly}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Plans Grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {t.plans.map((plan, i) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.name}
                id={`plan-${plan.id}`}
                variants={fadeUp} initial="hidden" animate="show" custom={i + 6}
                whileHover={{ y: -4, transition: { type: "spring", stiffness: 200, damping: 20 } }}
                className={`relative rounded-2xl border p-6 transition-all ${
                  chosenPlanId === plan.id ? "outline outline-2 outline-offset-2 outline-[#C8A762] " : ""
                }${
                  plan.featured
                    ? isDark
                      ? "bg-gradient-to-b from-[#C8A762]/10 to-zinc-900/80 border-[#C8A762]/30 ring-1 ring-[#C8A762]/20"
                      : "bg-gradient-to-b from-amber-50/80 to-white border-[#C8A762]/40 ring-1 ring-[#C8A762]/20 shadow-lg"
                    : isDark
                      ? "bg-zinc-900/80 border-white/[0.06] hover:border-white/[0.12]"
                      : "bg-white border-zinc-100 hover:border-zinc-200 shadow-sm"
                }`}
              >
                {/* No «الأكثر طلباً» badge (owner, Q164, 2026-10-03): no
                    subscription data supports a popularity claim. The card
                    keeps its `featured` emphasis styling. The struck-through
                    "was" prices it used to show (٦٠٠ / ٢,٤٠٠ ﷼) are gone too:
                    no real price list ever carried them. */}

                {chosenPlanId === plan.id && (
                  <span className="absolute top-4 end-4 rounded-full border border-[#C8A762]/40 bg-[#C8A762]/10 px-2.5 py-1 text-[11px] font-bold text-[#9b6f12] dark:text-[#C8A762]">
                    الخطة التي اخترتها
                  </span>
                )}

                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4 shadow`}>
                  <Icon size={20} weight="fill" className="text-white" />
                </div>

                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>{plan.name}</h3>
                <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{plan.desc}</p>

                <div className="flex items-baseline gap-1.5 mb-5 flex-wrap">
                  <span className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {yearly ? plan.priceYearly : plan.price}
                  </span>
                  {!(yearly ? plan.priceYearly : plan.price).includes("/") && (
                    <span className="text-[11px] text-zinc-400">
                      {yearly ? t.perYear : t.perMonth}
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 mb-6">
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex items-start gap-2">
                      <Check size={13} weight="bold" className={`mt-0.5 shrink-0 ${plan.featured ? "text-[#C8A762]" : isDark ? "text-emerald-500" : "text-emerald-600"}`} />
                      <span className={`text-[12px] leading-snug ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{f}</span>
                    </div>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handleSubscribe(plan.id)}
                  className={`w-full py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                    plan.featured
                      ? "bg-[#0B3D2E] text-[#C8A762] shadow-md hover:bg-[#155e41]"
                      : isDark
                        ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] border border-white/[0.06]"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200"
                  }`}
                >
                  {plan.cta}
                </motion.button>
              </motion.div>
            );
          })}
        </div>
        <p className={`-mt-10 text-center text-[12px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          {t.vatNote}
        </p>

        {/* ── Redeem an invitation code ──────────────────────────────────
            Only for a signed-in user without the full library (canRedeemCode
            above) — the code grants the legal library for 30 days (a library
            grant, not a plan; owner ٢٠١–٢٠٣) via
            POST /api/v1/library/invitations/redeem (admin-issued,
            src/lib/services/libraryInvitationsService.ts). Nothing here is
            offered to a guest or to a user who already has the library. */}
        {canRedeemCode && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={9} className="text-center">
            <button
              onClick={() => setModalOpen(true)}
              className={`inline-flex items-center gap-2 text-[13px] font-bold px-4 py-2.5 rounded-xl border transition-colors ${
                isDark
                  ? "border-[#C8A762]/30 bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/15"
                  : "border-[#0B3D2E]/20 bg-[#0B3D2E]/5 text-[#0B3D2E] hover:bg-[#0B3D2E]/10"
              }`}
            >
              <Gift size={16} weight="fill" />
              لديك كود دعوة؟ فعّله هنا
            </button>
          </motion.div>
        )}

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" custom={10}>
          <h2 className={`text-xl font-bold mb-6 text-center ${isDark ? "text-white" : "text-zinc-900"}`}>
            {t.faqTitle}
          </h2>
          <div className="max-w-2xl mx-auto space-y-3">
            {t.faqs.map((faq, i) => (
              <div key={i} className={`rounded-xl border overflow-hidden transition-all ${
                isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-zinc-100 bg-white shadow-sm"
              }`}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className={`w-full flex items-center justify-between px-5 py-4 text-start text-[14px] font-semibold transition-colors ${
                    isDark ? "text-zinc-200 hover:bg-white/[0.02]" : "text-zinc-800 hover:bg-zinc-50"
                  }`}
                >
                  {faq.q}
                  <motion.span
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    className="shrink-0"
                  >
                    <Arrow size={14} className="rotate-90" />
                  </motion.span>
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className={`px-5 pb-4 text-[13px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </motion.section>

      </div>

      {/* Entitlement-request toast (logged-in subscribe) */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4"
        >
          <div
            className={`flex items-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-xl ${
              toast.ok ? "bg-[#0B3D2E]" : "bg-rose-600"
            }`}
          >
            <Check size={18} weight="bold" className={toast.ok ? "text-[#C8A762]" : "text-white"} />
            {toast.msg}
          </div>
        </motion.div>
      )}

      <InvitationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
