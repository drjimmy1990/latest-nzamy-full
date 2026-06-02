"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, ArrowLeft, ArrowRight, ArrowUp } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";

// ─── Sections ────────────────────────────────────────────────────────────────

const sections = {
  ar: [
    {
      id: "definitions",
      title: "١. التعريفات",
      content: [
        "**المنصة**: موقع نظامي الإلكتروني وتطبيقاته المتاحة على عناوين الإنترنت ومتاجر التطبيقات.",
        "**المستخدم**: كل شخص طبيعي أو اعتباري يسجل أو يستخدم المنصة، سواء كان طالب خدمة أو مقدم خدمة.",
        "**طالب الخدمة**: الفرد أو الجهة التي تطلب خدمات قانونية عبر المنصة.",
        "**مقدم الخدمة**: المحامي أو الموثق أو المعقب أو المحكم المرخص الذي يقدم خدماته عبر المنصة.",
        "**نظام Escrow**: نظام الضمان المالي الذي تحتجز بموجبه المنصة الأتعاب ريثما تتم الخدمة وفق الاتفاق.",
      ],
    },
    {
      id: "services",
      title: "٢. الخدمات المقدمة",
      content: [
        "تعمل المنصة بوصفها وسيطاً تقنياً يربط طالبي الخدمات القانونية بمقدميها المرخصين ولا تُعدّ في ذاتها مكتب محاماة.",
        "تشمل الخدمات: الاستشارات القانونية، صياغة العقود ومراجعتها، التمثيل القضائي، التوثيق الرسمي، التحكيم التجاري، وتعقيب المعاملات.",
        "تتيح المنصة أدوات ذكاء اصطناعي للمساعدة في الصياغة والبحث والتحليل وتُعدّ هذه الأدوات داعمة لا بديلاً عن الاستشارة القانونية.",
        "تحتفظ المنصة بحق تغيير أو إضافة أو وقف أي خدمة مع إشعار مسبق.",
      ],
    },
    {
      id: "registration",
      title: "٣. شروط التسجيل",
      content: [
        "يجب أن يكون المستخدم بالغاً (١٨ سنة فأكثر) أو يحمل صفة نظامية مخولة للتعاقد.",
        "تُقدَّم بيانات التسجيل صحيحة وكاملة ومحدَّثة. تتحمل المسؤولية الكاملة عن أي بيانات مضللة.",
        "حساب واحد فقط لكل هوية وطنية أو سجل تجاري. يُحظر نقل الحساب أو مشاركته مع الغير.",
        "بالنسبة لمقدمي الخدمة: يشترط التحقق من الترخيص المهني الساري من الجهة المختصة (هيئة المحامين / وزارة العدل).",
      ],
    },
    {
      id: "user-rights",
      title: "٤. حقوق والتزامات المستخدم",
      content: [
        "للمستخدم الحق في الوصول لخدمات المنصة وفق الخطة المشترك بها وبما لا يتعارض مع هذه الشروط.",
        "يلتزم المستخدم بعدم استخدام المنصة في أغراض مخالفة للأنظمة السعودية أو للنظام العام والآداب.",
        "يُحظر محاولة اختراق المنصة أو التلاعب ببياناتها أو التواصل مع مقدمي الخدمة خارج المنصة لتجاوز نظام الأتعاب.",
        "يوافق المستخدم على تلقي إشعارات الخدمة عبر البريد الإلكتروني والرسائل النصية والإشعارات داخل المنصة.",
      ],
    },
    {
      id: "provider-obligations",
      title: "٥. حقوق والتزامات مقدم الخدمة",
      content: [
        "يلتزم مقدم الخدمة بتقديم خدماته بالمعايير المهنية اللازمة ووفق أحكام الأنظمة المهنية المعمول بها في المملكة.",
        "يُقرّ مقدم الخدمة بأن ترخيصه ساري المفعول ويلتزم بإخطار المنصة فور انتهائه أو تعليقه.",
        "يُحظر على مقدم الخدمة تحويل العملاء لجهات خارجية أو طلب دفع خارج منظومة Escrow.",
        "تحتفظ المنصة بحق تعليق أو إنهاء حساب مقدم الخدمة في حال ثبوت مخالفة مهنية أو تلقي شكاوى موثقة.",
        "يحق لمقدم الخدمة الطعن في أي قرار تعليق وفق إجراءات الاعتراض المنصوص عليها في سياسة الدعم.",
      ],
    },
    {
      id: "financial",
      title: "٦. السياسة المالية",
      content: [
        "تُودَع الأتعاب في حساب Escrow لدى المنصة عند توقيع الاتفاق. يُطلق المبلغ لمقدم الخدمة عند إتمام كل مرحلة متفق عليها.",
        "رسوم المنصة: تُقتطع عمولة الخدمة (تتراوح بين ٥٪ و١٥٪ حسب الخدمة) مباشرة من الأتعاب قبل تحويلها لمقدم الخدمة.",
        "سياسة الاسترداد: يحق لطالب الخدمة طلب الاسترداد الكامل قبل بدء الخدمة أو الجزئي في حال إخلال مقدم الخدمة بالاتفاق.",
        "يخضع نظام الفوترة لمتطلبات الفاتورة الإلكترونية لهيئة الزكاة والضريبة والجمارك (ZATCA المرحلة الثانية).",
      ],
    },
    {
      id: "ip",
      title: "٧. الملكية الفكرية",
      content: [
        "جميع عناصر المنصة (شعار، تصميم، كود، محتوى، نماذج) محمية بموجب نظام حماية حقوق المؤلف السعودي.",
        "لا يُمنح المستخدم سوى ترخيص محدود وغير حصري لاستخدام المنصة لأغراضه الشخصية أو المهنية.",
        "يُحظر نسخ أو توزيع أو إعادة بيع أي محتوى من المنصة دون إذن كتابي مسبق.",
      ],
    },
    {
      id: "liability",
      title: "٨. تحديد المسؤولية",
      content: [
        "لا تتحمل المنصة المسؤولية عن جودة الخدمة القانونية المقدمة من مقدمي الخدمة المستقلين.",
        "الحد الأقصى للمسؤولية في جميع الأحوال لا يتجاوز قيمة الأتعاب المحتجزة في Escrow للمعاملة المتنازع عليها.",
        "لا تتحمل المنصة المسؤولية عن أي خسائر غير مباشرة أو عرضية أو تبعية تنشأ عن استخدام المنصة.",
      ],
    },
    {
      id: "termination",
      title: "٩. الإنهاء والتعليق",
      content: [
        "يحق للمستخدم إنهاء حسابه في أي وقت عبر صفحة الإعدادات. تُنجز المعاملات الجارية قبل الإنهاء.",
        "تحتفظ المنصة بحق تعليق أي حساب فوراً في حال ثبوت انتهاك لهذه الشروط أو الأنظمة النافذة.",
        "عند إنهاء الحساب، تُعاد الأموال المحتجزة في Escrow لأصحابها وفق سياسة الاسترداد.",
      ],
    },
    {
      id: "governing-law",
      title: "١٠. القانون الحاكم والاختصاص القضائي",
      content: [
        "تخضع هذه الشروط لأحكام نظام التجارة الإلكترونية السعودي ونظام حماية المستهلك وسائر الأنظمة ذات الصلة.",
        "تختص المحاكم السعودية بالنظر في أي نزاع ينشأ عن هذه الشروط، وتكون الرياض هي دار القضاء المختصة.",
        "يُشجع على حل النزاعات وداً أو عبر نظام التحكيم الإلكتروني المتاح في المنصة قبل اللجوء للقضاء.",
      ],
    },
    {
      id: "amendments",
      title: "١١. التعديلات",
      content: [
        "تحتفظ المنصة بحق تعديل هذه الشروط في أي وقت مع إشعار المستخدمين المسجلين بالبريد الإلكتروني قبل ١٤ يوماً من نفاذ التعديل.",
        "استمرار استخدام المنصة بعد إشعار التعديل يُعدّ قبولاً ضمنياً للشروط المعدّلة.",
      ],
    },
    {
      id: "contact-legal",
      title: "١٢. التواصل",
      content: [
        "لأي استفسارات قانونية أو شكاوى تتعلق بهذه الشروط، يُرجى التواصل عبر: legal@nezamy.sa",
        "العنوان: شركة نظامي للتقنية القانونية، الرياض — حي العليا، المملكة العربية السعودية.",
      ],
    },
  ],
  en: [
    {
      id: "definitions",
      title: "1. Definitions",
      content: [
        "**Platform**: Nezamy's website and applications available on internet addresses and app stores.",
        "**User**: Any natural or legal person who registers or uses the platform, whether as a service seeker or provider.",
        "**Service Seeker**: The individual or entity requesting legal services through the platform.",
        "**Service Provider**: The licensed lawyer, notary, tracker, or arbitrator providing services through the platform.",
        "**Escrow System**: The financial guarantee system under which the platform holds fees until the service is completed as agreed.",
      ],
    },
    {
      id: "services",
      title: "2. Services Provided",
      content: [
        "The platform acts as a technology intermediary connecting legal service seekers with licensed providers and is not itself a law firm.",
        "Services include: legal consultations, contract drafting and review, legal representation, official notarization, commercial arbitration, and transaction tracking.",
        "The platform provides AI tools for drafting, research, and analysis assistance — these are supportive tools, not a substitute for legal consultation.",
        "The platform reserves the right to change, add, or suspend any service with prior notice.",
      ],
    },
    {
      id: "registration",
      title: "3. Registration Requirements",
      content: [
        "Users must be adults (18+ years) or hold a legally authorized capacity to contract.",
        "Registration data must be accurate, complete, and up-to-date. You bear full responsibility for any misleading data.",
        "Only one account per national ID or commercial registration. Transferring or sharing accounts is prohibited.",
        "For service providers: Valid professional license verification from the competent authority (Bar Association / Ministry of Justice) is required.",
      ],
    },
    {
      id: "user-rights",
      title: "4. User Rights and Obligations",
      content: [
        "Users have the right to access platform services according to their subscription plan without conflicting with these terms.",
        "Users must not use the platform for purposes violating Saudi regulations or public order and morals.",
        "Attempting to breach the platform, manipulate its data, or communicate with service providers outside the platform to bypass the fee system is prohibited.",
        "Users agree to receive service notifications via email, SMS, and in-platform notifications.",
      ],
    },
    {
      id: "provider-obligations",
      title: "5. Service Provider Rights and Obligations",
      content: [
        "Service providers must deliver services to required professional standards and in accordance with applicable professional regulations in the Kingdom.",
        "Service providers acknowledge that their license is valid and must notify the platform immediately upon its expiry or suspension.",
        "Directing clients to external parties or requesting payment outside the Escrow system is prohibited.",
        "The platform reserves the right to suspend or terminate a service provider's account upon proven professional violation or documented complaints.",
        "Service providers have the right to appeal any suspension decision according to the support policy appeal procedures.",
      ],
    },
    {
      id: "financial",
      title: "6. Financial Policy",
      content: [
        "Fees are deposited in the platform's Escrow account upon signing the agreement. Funds are released to the service provider upon completing each agreed milestone.",
        "Platform fees: A service commission (ranging from 5% to 15% depending on the service) is deducted directly from fees before transfer to the service provider.",
        "Refund policy: Service seekers have the right to request a full refund before service commencement or partial refund in case of provider breach.",
        "The billing system complies with ZATCA e-invoicing requirements (Phase 2).",
      ],
    },
    {
      id: "ip",
      title: "7. Intellectual Property",
      content: [
        "All platform elements (logo, design, code, content, templates) are protected under Saudi copyright law.",
        "Users are granted only a limited, non-exclusive license to use the platform for personal or professional purposes.",
        "Copying, distributing, or reselling any content from the platform without prior written permission is prohibited.",
      ],
    },
    {
      id: "liability",
      title: "8. Limitation of Liability",
      content: [
        "The platform bears no responsibility for the quality of legal services provided by independent service providers.",
        "Maximum liability in all cases shall not exceed the value of fees held in Escrow for the disputed transaction.",
        "The platform bears no responsibility for any indirect, incidental, or consequential losses arising from use of the platform.",
      ],
    },
    {
      id: "termination",
      title: "9. Termination and Suspension",
      content: [
        "Users may terminate their account at any time through the settings page. Ongoing transactions are completed before termination.",
        "The platform reserves the right to immediately suspend any account upon proven violation of these terms or applicable regulations.",
        "Upon account termination, funds held in Escrow are returned to their owners according to the refund policy.",
      ],
    },
    {
      id: "governing-law",
      title: "10. Governing Law and Jurisdiction",
      content: [
        "These terms are governed by Saudi e-commerce law, consumer protection regulations, and other relevant laws.",
        "Saudi courts have jurisdiction over any dispute arising from these terms, with Riyadh as the competent court location.",
        "Amicable resolution or the platform's electronic arbitration system is encouraged before resorting to litigation.",
      ],
    },
    {
      id: "amendments",
      title: "11. Amendments",
      content: [
        "The platform reserves the right to amend these terms at any time with 14 days prior notice to registered users by email before the amendment takes effect.",
        "Continued use of the platform after the amendment notice is considered implicit acceptance of the amended terms.",
      ],
    },
    {
      id: "contact-legal",
      title: "12. Contact",
      content: [
        "For any legal inquiries or complaints related to these terms, please contact: legal@nezamy.sa",
        "Address: Nezamy Legal Technology Company, Riyadh — Al Olaya District, Kingdom of Saudi Arabia.",
      ],
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TermsPage() {
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
              <FileText size={28} weight="bold" className="text-royal" />
            </div>
            <h1 className={`text-4xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "الشروط والأحكام" : "Terms & Conditions"}
            </h1>
            <p className={`mt-3 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "آخر تحديث: ١ يناير ٢٠٢٥" : "Last updated: January 1, 2025"}
            </p>
            <div className={`mx-auto mt-4 max-w-lg rounded-xl border px-4 py-3 text-sm ${isDark ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {isRTL
                ? "باستخدام منصة نظامي، أنت توافق على هذه الشروط والأحكام. يُرجى قراءتها بعناية."
                : "By using the Nezamy platform, you agree to these Terms & Conditions. Please read them carefully."}
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
            {isRTL ? "هل لديك سؤال حول شروط الاستخدام؟" : "Have a question about the Terms of Use?"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal/90">
              {isRTL ? "تواصل معنا" : "Contact Us"}
            </Link>
            <Link href="/privacy" className={`rounded-xl border px-6 py-2.5 text-sm font-semibold transition ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
              {isRTL ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
