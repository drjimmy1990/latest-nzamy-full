"use client";

import { motion } from "framer-motion";
import { Receipt, ArrowUp } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";

// ─── Sections ────────────────────────────────────────────────────────────────

const sections = {
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
      id: "escrow",
      title: "٢. نظام الضمان المالي (Escrow) وأثره على الاسترداد",
      content: [
        "تُحتجز جميع الأتعاب في حساب Escrow لدى المنصة فور الدفع، ولا تُصرف لمقدم الخدمة إلا بعد إتمام كل مرحلة متفق عليها.",
        "هذا النظام هو ما يتيح استرداد الأتعاب بسهولة وأمان قبل إنجاز الخدمة، لأن الأموال تبقى تحت ضمان المنصة لا في حساب مقدم الخدمة مباشرة.",
        "عمولة المنصة (٥٪–١٥٪ حسب نوع الخدمة) تُقتطع فقط عند صرف المبلغ لمقدم الخدمة، وبالتالي لا تُقتطع من أي مبلغ يُسترد قبل بدء الخدمة.",
      ],
    },
    {
      id: "subscriptions",
      title: "٣. استرداد اشتراكات الباقات",
      content: [
        "**ضمان ١٤ يوماً**: يحق لأي مشترك جديد طلب استرداد كامل لقيمة الاشتراك خلال ١٤ يوماً من تاريخ أول عملية دفع، دون شروط معقّدة، بما لا يتعارض مع الاستخدام العادل للخدمة.",
        "بعد مرور ١٤ يوماً: يمكن إلغاء التجديد التلقائي في أي وقت من إعدادات الحساب، ويستمر الوصول للخدمة حتى نهاية الفترة المدفوعة بالفعل دون استرداد جزئي عن الفترة المتبقية.",
        "الترقية بين الباقات لا تستوجب رسوم استرداد؛ يُحتسب فرق السعر تناسبياً على الفاتورة التالية.",
      ],
    },
    {
      id: "individual-services",
      title: "٤. استرداد أتعاب الخدمات الفردية",
      content: [
        "**قبل بدء الخدمة**: استرداد كامل ١٠٠٪ إذا لم يبدأ مقدم الخدمة العمل على الطلب بعد (لم تُجدول جلسة، لم تبدأ الصياغة، لم يُفتح الملف).",
        "**أثناء الخدمة**: استرداد جزئي يتناسب مع الجزء غير المُنجز، إذا ثبت إخلال مقدم الخدمة بالاتفاق أو تأخّره دون عذر مقبول.",
        "**بعد إتمام الخدمة وتسليمها وقبولها من طالب الخدمة**: لا يحق الاسترداد، لكن يحق تقديم شكوى جودة تُحال لفريق ضمان الجودة للمراجعة.",
        "عند إلغاء طالب الخدمة للطلب مباشرة بعد قبول مقدم الخدمة له وقبل أي عمل فعلي، تُرد الأتعاب كاملة خصماً على أي رسوم تحويل بنكي فعلية إن وُجدت.",
      ],
    },
    {
      id: "exclusions",
      title: "٥. حالات مستثناة من الاسترداد",
      content: [
        "الخدمات المكتملة والمقبولة كتابياً من طالب الخدمة.",
        "الرسوم الحكومية أو القضائية أو رسوم التوثيق المدفوعة لجهات خارج المنصة.",
        "الاشتراكات بعد انتهاء مهلة ضمان الـ١٤ يوماً (يُطبَّق عليها إلغاء التجديد فقط، لا الاسترداد الفوري).",
        "حالات إساءة استخدام الضمان، كتكرار طلب الاسترداد بعد استهلاك كامل حصة الخدمة أكثر من مرة.",
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
        "العنوان: شركة نظامي للمحاماة، مكة المكرمة — بطحاء قريش، المملكة العربية السعودية.",
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
      id: "escrow",
      title: "2. The Escrow System and Its Effect on Refunds",
      content: [
        "All fees are held in an Escrow account with the platform immediately upon payment and are not released to the service provider until each agreed milestone is completed.",
        "This system is what makes refunding fees easy and secure before the service is completed, since the funds remain under the platform's guarantee rather than directly in the provider's account.",
        "The platform's commission (5%–15% depending on the service) is deducted only when funds are released to the service provider, so it is never deducted from any amount refunded before the service begins.",
      ],
    },
    {
      id: "subscriptions",
      title: "3. Subscription Plan Refunds",
      content: [
        "**14-day guarantee**: Any new subscriber may request a full refund of their subscription value within 14 days of the first payment date, with no complicated conditions, provided fair use of the service.",
        "After the 14 days: automatic renewal can be cancelled at any time from account settings, and access continues until the end of the period already paid for, with no partial refund for the remaining period.",
        "Upgrading between plans does not require a refund; the price difference is pro-rated on the next invoice.",
      ],
    },
    {
      id: "individual-services",
      title: "4. Refunds for Individual Services",
      content: [
        "**Before the service starts**: 100% full refund if the service provider has not yet begun work on the request (no session scheduled, no drafting started, no file opened).",
        "**During the service**: A partial refund proportional to the uncompleted portion, if the service provider is proven to have breached the agreement or delayed without acceptable excuse.",
        "**After the service is completed, delivered, and accepted** by the service seeker: no refund is due, but a quality complaint may be filed and referred to the quality assurance team for review.",
        "If the service seeker cancels the request immediately after the provider accepts it and before any actual work, fees are refunded in full, less any actual bank transfer fees incurred, if any.",
      ],
    },
    {
      id: "exclusions",
      title: "5. Exclusions from Refunds",
      content: [
        "Services that have been completed and accepted in writing by the service seeker.",
        "Government fees, court fees, or notarization fees paid to entities outside the platform.",
        "Subscriptions after the 14-day guarantee period has ended (only renewal cancellation applies, not an immediate refund).",
        "Cases of guarantee abuse, such as repeatedly requesting refunds after fully consuming the service quota more than once.",
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
        "Address: Nezamy Law Firm Company, Makkah — Batha Quraish, Kingdom of Saudi Arabia.",
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
              {isRTL ? "آخر تحديث: ١ يناير ٢٠٢٥" : "Last updated: January 1, 2025"}
            </p>
            <div className={`mx-auto mt-4 max-w-lg rounded-xl border px-4 py-3 text-sm ${isDark ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {isRTL
                ? "ضمان استرداد كامل خلال ١٤ يوماً على جميع الاشتراكات، واسترداد كامل أو جزئي لأتعاب الخدمات الفردية وفق الشروط أدناه."
                : "Full refund guarantee within 14 days on all subscriptions, and full or partial refunds for individual service fees per the terms below."}
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
