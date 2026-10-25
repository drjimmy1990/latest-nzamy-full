"use client";

import { motion } from "framer-motion";
import { Receipt, ArrowUp } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import {
  arNumber,
  INSTANT_CANCEL_MINUTES,
  PROMO_POINTS_VALIDITY_DAYS,
  RENEWAL_REMINDER_DAYS,
  renewalRemindersAr,
  topupValidityAr,
  topupValidityEn,
  WITHDRAWAL_DAYS,
} from "@/lib/payments/refundPolicy";

// The policy's numbers live in src/lib/payments/refundPolicy.ts. The new
// sentences (P7: the 90-minute instant cancel, the points validity, the
// renewal reminders) are built from those constants here. The owner's two
// clauses of ١٨٠ stay word for word as he wrote them (pricingHonesty.test.ts
// pins the text); refundPolicy.test.ts pins their 14 days / 5 % / 24 hours to
// the same constants and to the refund code (refundDecision.ts).
const AR = {
  minutes: arNumber(INSTANT_CANCEL_MINUTES),
  days: arNumber(WITHDRAWAL_DAYS),
  promoDays: arNumber(PROMO_POINTS_VALIDITY_DAYS),
};

// ─── Sections ────────────────────────────────────────────────────────────────

const sections = {
  // Owner answer ١٨٠ (2026-10-16): sections ٢ and ٣ carry his two clauses
  // verbatim. Professional fees are a direct contract between the client and
  // the licensed law office through a SAMA-licensed gateway; the platform
  // holds no funds, so there is no intermediary account, no commission
  // deducted on payout and no platform refund of those fees (section ٤ says
  // so). Owner ٢٨٩: no «Escrow / حساب الضمان» wording anywhere.
  // P7 (owner answers of 25–26 Oct, pricing doc §13ج): section ٣ adds the
  // 90-minute instant cancel, the points validity and the renewal reminders.
  ar: [
    {
      id: "scope",
      title: "١. نطاق السياسة",
      content: [
        "تنطبق هذه السياسة على جميع المدفوعات عبر منصة نظامي، سواء اشتراكات الباقات الشهرية والسنوية، أو أتعاب الخدمات الفردية (الاستشارات، صياغة العقود، التمثيل القضائي، التوثيق، التحكيم، التعقيب).",
        "تُقرأ هذه السياسة مع **الشروط والأحكام** (القسم ٦: السياسة المالية) وتُعدّ جزءاً مكمّلاً لها لا بديلاً عنها.",
        "لا تغطي هذه السياسة الرسوم الحكومية أو رسوم الجهات الخارجية (كرسوم التوثيق النظامي أو الرسوم القضائية) التي تُدفع لجهات غير المنصة.",
      ],
    },
    {
      id: "collection",
      title: "٢. أتعاب الاستشارات والخدمات المهنية",
      content: [
        "**أتعاب الاستشارات والخدمات المهنية**: تمثل علاقة تعاقدية مباشرة بين العميل ومكتب المحاماة المستقل المرخص عبر بوابة دفع معتمدة ومرخصة من البنك المركزي (SAMA)، ولا تحتفظ المنصة بأي أموال في حساب وسيط، وتخضع لسياسة الإلغاء الكامل قبل ٢٤ ساعة من موعد الجلسة الاستشارية.",
      ],
    },
    {
      id: "subscriptions",
      title: "٣. استرداد الاشتراكات والنقاط",
      content: [
        // Pricing doc §13ج.1 — the instant cancel of a purchase made by mistake.
        `**الإلغاء الفوري عند الشراء بالخطأ**: خلال (${AR.minutes}) دقيقة من السداد يحق لك إلغاء الشراء واسترداد كامل المبلغ، بشرط عدم استخدام أي نقطة (٠ نقطة) وعدم تصدير أي ملف.`,
        // Owner answer ١٨٠ — the rule for digital plans, in his words.
        "**الاشتراكات والوحدات الرقمية**: يحق للمشترك ممارسة حق العدول واسترداد كامل قيمة الاشتراك الرقمي خلال (١٤) يوماً من تاريخ السداد وفق نظام التجارة الإلكترونية ولائحته، بشرط عدم استهلاك أكثر من ٥٪ من رصيد وحدات الاستخدام (النقاط) أو تصدير مذكرات مدفوعة.",
        "يُرد المبلغ إلى وسيلة الدفع الأصلية، وبما لا يتجاوز المدد المبيّنة في القسم ٧ أدناه.",
        "بعد انقضاء مدة العدول: يمكن إلغاء التجديد التلقائي في أي وقت من إعدادات الحساب، ويستمر الوصول للخدمة حتى نهاية الفترة المدفوعة بالفعل دون استرداد جزئي عن الفترة المتبقية.",
        // Owner ٢٨٨ (C): two reminders before an automatic renewal.
        `**تذكير التجديد**: قبل أي تجديد تلقائي لاشتراك نرسل لك ${renewalRemindersAr()}، لتتمكن من إلغائه قبل الخصم.`,
        "الترقية بين الباقات لا تستوجب رسوم استرداد؛ يُحتسب فرق السعر تناسبياً على الفاتورة التالية.",
        // Pricing doc §13ج.4 and the owner's 26-Oct pack validity.
        `**صلاحية النقاط الترويجية**: النقاط الترحيبية والترويجية المجانية صالحة (${AR.promoDays}) يوماً من تاريخ منحها.`,
        `**صلاحية نقاط الشحن المدفوعة**: بحسب الحزمة — ${topupValidityAr()}، من تاريخ الشراء.`,
      ],
    },
    {
      id: "individual-services",
      title: "٤. استرداد أتعاب الخدمات الفردية",
      content: [
        "تُدفع أتعاب الخدمات المهنية لمكتب المحاماة المرخّص مباشرة (القسم ٢)، ولا تحتفظ بها المنصة.",
        "**الإلغاء قبل ٢٤ ساعة** من موعد الجلسة الاستشارية: إلغاء كامل.",
        "وما عدا ذلك يخضع لاتفاق العميل ومكتب المحاماة، ويحق للعميل تقديم شكوى جودة تُحال إلى فريق نظامي للمراجعة.",
      ],
    },
    {
      id: "exclusions",
      title: "٥. حالات مستثناة من الاسترداد",
      content: [
        "الخدمات المكتملة والمقبولة كتابياً من طالب الخدمة.",
        "الرسوم الحكومية أو القضائية أو رسوم التوثيق المدفوعة لجهات خارج المنصة.",
        "الاشتراكات بعد انقضاء مدة العدول المقررة نظاماً (يُطبَّق عليها إلغاء التجديد فقط، لا الاسترداد الفوري).",
        "حالات إساءة استخدام حق العدول، كتكرار طلب الاسترداد بعد استهلاك كامل حصة الخدمة أكثر من مرة.",
      ],
    },
    {
      id: "how-to-request",
      title: "٦. كيفية تقديم طلب الاسترداد",
      content: [
        "من داخل الحساب: لوحة التحكم ← الفواتير والمدفوعات ← طلب استرداد، مع تحديد السبب.",
        "أو بالتواصل المباشر عبر legal@nezamy.sa أو واتساب المنصة، مع ذكر رقم الطلب أو الفاتورة.",
        "قد يُطلب توضيح إضافي أو مستندات داعمة (لقطة شاشة، مراسلات) في حالات الإخلال المُدّعى به فقط.",
      ],
    },
    {
      id: "processing-time",
      title: "٧. مدة المعالجة وطريقة الإرجاع",
      content: [
        "**الإقرار باستلام الطلب**: خلال ٢٤ ساعة عمل من تقديمه.",
        "**قرار الموافقة أو الرفض**: خلال ٣ أيام عمل من اكتمال المستندات المطلوبة.",
        "**إرجاع المبلغ**: خلال ٥–١٠ أيام عمل من الموافقة، إلى نفس وسيلة الدفع الأصلية — لا يُرد المبلغ نقداً أو إلى وسيلة دفع مختلفة.",
        "تخضع مدة ظهور المبلغ في الحساب البنكي لسياسات البنك المُصدر للبطاقة، وقد تختلف عن المدة المذكورة أعلاه.",
      ],
    },
    {
      id: "disputes",
      title: "٨. تسوية النزاعات",
      content: [
        "أي خلاف حول قرار استرداد يمكن تصعيده إلى نظام التحكيم الإلكتروني الداخلي المتاح في المنصة قبل اللجوء لجهات خارجية.",
        "يحق لطالب الخدمة أيضاً تقديم شكوى لدى وزارة التجارة أو مركز حماية المستهلك إذا رأى أن حقوقه لم تُراعَ.",
      ],
    },
    {
      id: "contact",
      title: "٩. التواصل",
      content: [
        "لأي استفسار عن الاسترداد: legal@nezamy.sa أو عبر صفحة تواصل معنا.",
        "العنوان: نظامي، مكة المكرمة — بطحاء قريش، المملكة العربية السعودية.",
      ],
    },
  ],
  en: [
    {
      id: "scope",
      title: "1. Scope of This Policy",
      content: [
        "This policy applies to all payments made through the Nezamy platform, whether monthly/annual subscription plans or fees for individual services (consultations, contract drafting, legal representation, notarization, arbitration, tracking).",
        "This policy is read together with the **Terms & Conditions** (Section 6: Financial Policy) and complements it rather than replacing it.",
        "This policy does not cover government fees or third-party fees (such as official notarization or court fees) paid to entities other than the platform.",
      ],
    },
    {
      id: "collection",
      title: "2. Consultation and Professional Service Fees",
      content: [
        "**Consultation and professional service fees** are a direct contract between the client and the licensed independent law office, paid through a payment gateway licensed by the Saudi Central Bank (SAMA). The platform holds no funds in an intermediary account. They follow a full-cancellation policy up to 24 hours before the consultation session.",
      ],
    },
    {
      id: "subscriptions",
      title: "3. Refunds of Subscriptions and Points",
      content: [
        `**Instant cancellation of a purchase made by mistake**: within (${INSTANT_CANCEL_MINUTES}) minutes of payment you may cancel the purchase for a full refund, provided no point has been used (0 points) and no file has been exported.`,
        "**Subscriptions and digital units**: the subscriber may exercise the right of withdrawal and recover the full value of the digital subscription within (14) days of payment under the E-Commerce Law and its Regulation, provided no more than 5% of the usage units (points) has been consumed and no paid memos have been exported.",
        "Refunds go to the original payment method, within the periods set out in Section 7 below.",
        "After the withdrawal period ends: automatic renewal can be cancelled at any time from account settings, and access continues until the end of the period already paid for, with no partial refund for the remaining period.",
        `**Renewal reminders**: before any automatic renewal of a subscription we send you a first reminder ${RENEWAL_REMINDER_DAYS[0]} days and a second reminder ${RENEWAL_REMINDER_DAYS[1]} days before the renewal date, so you can cancel it before you are charged.`,
        "Upgrading between plans does not require a refund; the price difference is pro-rated on the next invoice.",
        `**Promotional points**: welcome and promotional points granted free of charge are valid for (${PROMO_POINTS_VALIDITY_DAYS}) days from the day they are granted.`,
        `**Paid top-up points**: valid according to the pack — ${topupValidityEn()} — from the date of purchase.`,
      ],
    },
    {
      id: "individual-services",
      title: "4. Refunds for Individual Services",
      content: [
        "Professional service fees are paid directly to the licensed law office (Section 2); the platform does not hold them.",
        "**Cancelling up to 24 hours** before the consultation session: full cancellation.",
        "Anything else follows the agreement between the client and the law office; the client may file a quality complaint for the Nezamy team to review.",
      ],
    },
    {
      id: "exclusions",
      title: "5. Exclusions from Refunds",
      content: [
        "Services that have been completed and accepted in writing by the service seeker.",
        "Government fees, court fees, or notarization fees paid to entities outside the platform.",
        "Subscriptions after the statutory withdrawal period has ended (only renewal cancellation applies, not an immediate refund).",
        "Cases of abuse of the right of withdrawal, such as repeatedly requesting refunds after fully consuming the service quota more than once.",
      ],
    },
    {
      id: "how-to-request",
      title: "6. How to Submit a Refund Request",
      content: [
        "From within your account: Dashboard → Billing & Payments → Request Refund, stating the reason.",
        "Or by contacting us directly via legal@nezamy.sa or the platform's WhatsApp, citing the request or invoice number.",
        "Additional clarification or supporting documents (screenshots, correspondence) may be requested only in cases of alleged breach.",
      ],
    },
    {
      id: "processing-time",
      title: "7. Processing Time and Method of Return",
      content: [
        "**Acknowledgment of request**: within 24 business hours of submission.",
        "**Approval or rejection decision**: within 3 business days of completing the required documentation.",
        "**Refund of the amount**: within 5–10 business days of approval, to the original payment method — refunds are not issued in cash or to a different payment method.",
        "The time for the amount to appear in your bank account is subject to the card-issuing bank's policies and may differ from the timeframe stated above.",
      ],
    },
    {
      id: "disputes",
      title: "8. Dispute Resolution",
      content: [
        "Any disagreement over a refund decision may be escalated to the platform's internal electronic arbitration system before resorting to external parties.",
        "The service seeker also has the right to file a complaint with the Ministry of Commerce or the Consumer Protection Center if they believe their rights were not respected.",
      ],
    },
    {
      id: "contact",
      title: "9. Contact",
      content: [
        "For any refund inquiries: legal@nezamy.sa or via the Contact Us page.",
        "Address: Nezamy, Makkah — Batha Quraish, Kingdom of Saudi Arabia.",
      ],
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RefundPolicyPage() {
  const { isRTL, isDark } = useTheme();
  const currentSections = isRTL ? sections.ar : sections.en;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Header ── */}
      <section className={`pt-32 pb-12 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/10">
              <Receipt size={28} weight="bold" className="text-royal" />
            </div>
            <h1 className={`text-4xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "سياسة الاسترجاع والاستبدال" : "Refund & Exchange Policy"}
            </h1>
            <p className={`mt-3 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "آخر تحديث: ٢٦ أكتوبر ٢٠٢٦" : "Last updated: October 26, 2026"}
            </p>
            <div className={`mx-auto mt-4 max-w-lg rounded-xl border px-4 py-3 text-sm ${isDark ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {isRTL
                ? `إلغاء فوري خلال ${AR.minutes} دقيقة من الشراء بالخطأ، وحق العدول عن الاشتراكات خلال ${AR.days} يوماً وفق نظام التجارة الإلكترونية، واسترداد أتعاب الخدمات الفردية وفق الشروط أدناه.`
                : `An instant cancel within ${INSTANT_CANCEL_MINUTES} minutes of a purchase made by mistake, a ${WITHDRAWAL_DAYS}-day right of withdrawal on subscriptions under the Saudi E-Commerce Law, and refunds for individual service fees per the terms below.`}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className={`py-16 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-10 lg:grid-cols-4">

            {/* Table of contents */}
            <aside className="hidden lg:block">
              <div className={`sticky top-24 rounded-2xl border p-5 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-slate-400"}`}>
                  {isRTL ? "المحتويات" : "Contents"}
                </p>
                <nav className="space-y-1">
                  {currentSections.map((sec) => (
                    <a key={sec.id} href={`#${sec.id}`} className={`block rounded-lg px-3 py-2 text-xs transition hover:bg-royal/10 hover:text-royal ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      {sec.title}
                    </a>
                  ))}
                </nav>
                <a href="#top" className={`mt-4 flex items-center gap-1.5 text-xs ${isDark ? "text-gray-500 hover:text-gray-300" : "text-slate-400 hover:text-slate-600"}`}>
                  <ArrowUp size={12} />
                  {isRTL ? "أعلى الصفحة" : "Back to top"}
                </a>
              </div>
            </aside>

            {/* Sections */}
            <div className="space-y-10 lg:col-span-3">
              {currentSections.map((sec, i) => (
                <motion.section
                  key={sec.id}
                  id={sec.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03 }}
                >
                  <h2 className={`mb-4 text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{sec.title}</h2>
                  <ul className="space-y-3">
                    {sec.content.map((item, j) => (
                      <li key={j} className={`flex gap-3 text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-royal/50" />
                        <span dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(item) }} />
                      </li>
                    ))}
                  </ul>
                  {i < currentSections.length - 1 && <hr className={`mt-8 ${isDark ? "border-white/10" : "border-slate-200"}`} />}
                </motion.section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={`py-12 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
            {isRTL ? "هل لديك سؤال حول استرداد مبلغ؟" : "Have a question about a refund?"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal/90">
              {isRTL ? "تواصل معنا" : "Contact Us"}
            </Link>
            <Link href="/terms" className={`rounded-xl border px-6 py-2.5 text-sm font-semibold transition ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
              {isRTL ? "الشروط والأحكام" : "Terms & Conditions"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
