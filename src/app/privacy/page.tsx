"use client";

import { motion } from "framer-motion";
import { Lock, ShieldCheck, Eye, Trash, ArrowUp, Database, Globe, Cookie, Bell, UserCircle } from "@phosphor-icons/react";
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
      id: "data-collected",
      title: "١. البيانات التي نجمعها",
      content: [
        "**بيانات الهوية**: الاسم، رقم الهوية الوطنية / الإقامة، رقم الجوال، البريد الإلكتروني، الصورة الشخصية.",
        "**بيانات الاستخدام**: سجلات الدخول، الصفحات المزارة، المدة الزمنية، الإجراءات المنفذة داخل المنصة.",
        "**بيانات المعاملات**: تفاصيل الخدمات المطلوبة والمُنجزة، الأتعاب، وسجل المدفوعات.",
        "**بيانات التواصل**: محادثات الدعم الفني، التقييمات، والرسائل بين المستخدمين.",
        "**البيانات التقنية**: عنوان IP، نوع الجهاز والمتصفح، نظام التشغيل، ومعرّفات الجهاز.",
      ],
    },
    {
      id: "data-use",
      title: "٢. كيف نستخدم بياناتك",
      content: [
        "تقديم الخدمات المطلوبة والتحقق من هوية الأطراف لضمان سلامة المعاملات.",
        "تحسين أداء المنصة وتخصيص تجربة المستخدم بناءً على الاستخدام الفعلي.",
        "إرسال إشعارات الخدمة (مواعيد، جلسات، مدفوعات) والرسائل التسويقية المأذون بها.",
        "الامتثال للالتزامات القانونية والتنظيمية المفروضة بموجب الأنظمة السعودية.",
        "تدريب نماذج الذكاء الاصطناعي على بيانات مُجهَّلة لتحسين جودة الخدمات.",
      ],
    },
    {
      id: "data-sharing",
      title: "٣. مشاركة البيانات مع الأطراف الثالثة",
      content: [
        "**لا نبيع** بياناتك الشخصية لأي طرف ثالث تحت أي ظرف.",
        "نشارك البيانات مع مقدمي الخدمة المسجلين بالقدر اللازم فقط لتنفيذ الخدمة المطلوبة.",
        "قد نشارك البيانات مع جهات تقنية موثوقة (مثل مزودي البنية التحتية السحابية) وفق اتفاقيات حماية صارمة.",
        "قد تُطلب البيانات من الجهات القضائية أو الرقابية السعودية المختصة وفق الأنظمة النافذة.",
        "في حال الاندماج أو الاستحواذ، يُخطر المستخدمون مسبقاً وتنتقل البيانات وفق نفس مستوى الحماية.",
      ],
    },
    {
      id: "data-retention",
      title: "٤. الاحتفاظ بالبيانات",
      content: [
        "نحتفظ ببياناتك طالما حسابك نشط أو بالقدر اللازم لتقديم الخدمات.",
        "بعد إغلاق الحساب، تُحتفظ ببيانات المعاملات لمدة ٧ سنوات وفق متطلبات الأنظمة المالية والقضائية السعودية.",
        "بيانات سجلات النظام والتحليلات تُحتفظ بها لمدة ٢ سنة كحد أقصى.",
        "يمكنك طلب حذف بياناتك التي لا يوجد التزام قانوني بالاحتفاظ بها عبر نموذج طلب الحذف.",
      ],
    },
    {
      id: "user-rights",
      title: "٥. حقوق صاحب البيانات (نظام PDPL)",
      content: [
        "**حق الاطلاع**: يحق لك طلب نسخة من بياناتك الشخصية المحتجزة لدينا.",
        "**حق التصحيح**: يحق لك تصحيح أي بيانات غير دقيقة أو ناقصة.",
        "**حق الحذف**: يحق لك طلب حذف بياناتك في حدود ما يسمح به القانون.",
        "**حق الاعتراض**: يحق لك الاعتراض على معالجة بياناتك لأغراض التسويق في أي وقت.",
        "**حق النقل**: يحق لك طلب الحصول على بياناتك في صيغة إلكترونية قابلة للنقل.",
        "لممارسة أي من هذه الحقوق، تواصل معنا عبر: privacy@nezamy.sa",
      ],
    },
    {
      id: "cookies",
      title: "٦. ملفات تعريف الارتباط (Cookies)",
      content: [
        "نستخدم ملفات تعريف الارتباط الضرورية لتشغيل المنصة (مثل جلسات تسجيل الدخول وإعدادات اللغة).",
        "ملفات تعريف الارتباط التحليلية تساعدنا على فهم كيفية استخدام المنصة لتحسينها (يمكن إيقافها).",
        "لا نستخدم ملفات تعريف الارتباط للإعلانات المستهدفة من أطراف ثالثة.",
        "يمكنك إدارة تفضيلات ملفات تعريف الارتباط من إعدادات متصفحك أو من لوحة إعدادات الحساب.",
      ],
    },
    {
      id: "security",
      title: "٧. أمان البيانات",
      content: [
        "تُشفَّر جميع البيانات أثناء النقل باستخدام TLS 1.3 وفي حالة التخزين باستخدام AES-256.",
        "نُجري اختبارات اختراق دورية ونراجع سياسات الأمان بشكل ربعي.",
        "في حال حدوث اختراق يؤثر على بياناتك، سنُخطرك خلال ٧٢ ساعة وفق متطلبات نظام PDPL.",
        "الوصول للبيانات محدود بمبدأ الحد الأدنى من الصلاحيات — لا يصل أي موظف للبيانات إلا بالقدر اللازم لعمله.",
      ],
    },
    {
      id: "transfer",
      title: "٨. نقل البيانات خارج المملكة",
      content: [
        "نبذل جهداً لتخزين بيانات المستخدمين السعوديين داخل المملكة وفق متطلبات السيادة الرقمية.",
        "في حال الضرورة التقنية لنقل بيانات خارج المملكة، يتم ذلك وفق اتفاقيات تعاقدية تضمن نفس مستوى الحماية.",
        "لا تُنقل البيانات الحساسة (مستندات الهوية، التفاصيل القانونية) خارج نطاق المملكة.",
      ],
    },
    {
      id: "contact-privacy",
      title: "٩. تواصل معنا بشأن الخصوصية",
      content: [
        "لأي استفسارات أو طلبات تتعلق بخصوصيتك، تواصل مع مسؤول حماية البيانات: privacy@nezamy.sa",
        "يمكنك أيضاً تقديم شكوى لدى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا) إذا رأيت أن حقوقك لم تُراعَ.",
        "نلتزم بالرد على جميع طلبات حماية البيانات خلال ١٥ يوم عمل.",
      ],
    },
  ],
  en: [
    {
      id: "data-collected",
      title: "1. Data We Collect",
      content: [
        "**Identity Data**: Name, national/residence ID number, phone number, email address, profile photo.",
        "**Usage Data**: Login records, visited pages, time spent, actions taken within the platform.",
        "**Transaction Data**: Details of requested and completed services, fees, and payment history.",
        "**Communication Data**: Support chat conversations, ratings, and messages between users.",
        "**Technical Data**: IP address, device and browser type, operating system, and device identifiers.",
      ],
    },
    {
      id: "data-use",
      title: "2. How We Use Your Data",
      content: [
        "Delivering requested services and verifying parties' identities to ensure transaction safety.",
        "Improving platform performance and personalizing user experience based on actual usage.",
        "Sending service notifications (appointments, hearings, payments) and authorized marketing messages.",
        "Complying with legal and regulatory obligations imposed under Saudi regulations.",
        "Training AI models on anonymized data to improve service quality.",
      ],
    },
    {
      id: "data-sharing",
      title: "3. Sharing Data with Third Parties",
      content: [
        "**We never sell** your personal data to any third party under any circumstances.",
        "We share data with registered service providers only to the extent necessary to fulfill the requested service.",
        "We may share data with trusted technology providers (such as cloud infrastructure providers) under strict protection agreements.",
        "Data may be requested by competent Saudi judicial or regulatory authorities under applicable regulations.",
        "In case of merger or acquisition, users are notified in advance and data transfers maintain the same protection level.",
      ],
    },
    {
      id: "data-retention",
      title: "4. Data Retention",
      content: [
        "We retain your data as long as your account is active or as needed to provide services.",
        "After account closure, transaction data is retained for 7 years per Saudi financial and judicial regulations.",
        "System log and analytics data is retained for a maximum of 2 years.",
        "You can request deletion of data with no legal retention obligation through the deletion request form.",
      ],
    },
    {
      id: "user-rights",
      title: "5. Data Subject Rights (PDPL)",
      content: [
        "**Right of Access**: You have the right to request a copy of your personal data held by us.",
        "**Right of Correction**: You have the right to correct any inaccurate or incomplete data.",
        "**Right of Deletion**: You have the right to request deletion of your data within the limits permitted by law.",
        "**Right to Object**: You have the right to object to processing your data for marketing purposes at any time.",
        "**Right of Portability**: You have the right to request your data in a portable electronic format.",
        "To exercise any of these rights, contact us at: privacy@nezamy.sa",
      ],
    },
    {
      id: "cookies",
      title: "6. Cookies",
      content: [
        "We use necessary cookies to operate the platform (such as login sessions and language settings).",
        "Analytical cookies help us understand platform usage to improve it (can be disabled).",
        "We do not use cookies for third-party targeted advertising.",
        "You can manage cookie preferences from your browser settings or account settings panel.",
      ],
    },
    {
      id: "security",
      title: "7. Data Security",
      content: [
        "All data is encrypted in transit using TLS 1.3 and at rest using AES-256.",
        "We conduct regular penetration tests and review security policies quarterly.",
        "In case of a breach affecting your data, we will notify you within 72 hours per PDPL requirements.",
        "Data access is limited by the principle of least privilege — no employee accesses data beyond what's needed for their role.",
      ],
    },
    {
      id: "transfer",
      title: "8. Data Transfer Outside the Kingdom",
      content: [
        "We make every effort to store Saudi users' data within the Kingdom per digital sovereignty requirements.",
        "If technical necessity requires data transfer outside the Kingdom, it occurs under contractual agreements ensuring the same protection level.",
        "Sensitive data (identity documents, legal details) is never transferred outside the Kingdom.",
      ],
    },
    {
      id: "contact-privacy",
      title: "9. Privacy Contact",
      content: [
        "For any privacy inquiries or requests, contact our Data Protection Officer: privacy@nezamy.sa",
        "You may also file a complaint with the Saudi Data and Artificial Intelligence Authority (SDAIA) if you feel your rights were not respected.",
        "We are committed to responding to all data protection requests within 15 business days.",
      ],
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const { isRTL, isDark } = useTheme();
  const currentSections = isRTL ? sections.ar : sections.en;

  const highlights = [
    { icon: UserCircle, title: isRTL ? "نجمع بإذنك فقط" : "We Collect With Consent Only", color: "bg-royal/10 text-royal" },
    { icon: Lock, title: isRTL ? "لا نبيع بياناتك أبداً" : "We Never Sell Your Data", color: "bg-red-500/10 text-red-500" },
    { icon: ShieldCheck, title: isRTL ? "تشفير كامل AES-256" : "Full AES-256 Encryption", color: "bg-emerald-500/10 text-emerald-500" },
    { icon: Trash, title: isRTL ? "حق الحذف محمي" : "Right to Delete Protected", color: "bg-amber-500/10 text-amber-500" },
  ];

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Header ── */}
      <section className={`pt-32 pb-12 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/10">
              <Lock size={28} weight="bold" className="text-royal" />
            </div>
            <h1 className={`text-4xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "سياسة الخصوصية" : "Privacy Policy"}
            </h1>
            <p className={`mt-3 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "آخر تحديث: ١ يناير ٢٠٢٥" : "Last updated: January 1, 2025"}
            </p>
            <div className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              <ShieldCheck size={14} weight="fill" />
              {isRTL ? "متوافق مع نظام حماية البيانات الشخصية (PDPL)" : "Compliant with Personal Data Protection Law (PDPL)"}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Key highlights ── */}
      <section className={`py-10 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {highlights.map((h, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-2xl border p-4 text-center ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}
              >
                <div className={`mx-auto mb-2 inline-flex rounded-xl p-3 ${h.color}`}>
                  <h.icon size={20} weight="bold" />
                </div>
                <p className={`text-xs font-medium leading-snug ${isDark ? "text-gray-300" : "text-slate-700"}`}>{h.title}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className={`py-12 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
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
            {isRTL ? "هل لديك سؤال حول خصوصيتك؟" : "Have a question about your privacy?"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <a href="mailto:privacy@nezamy.sa" className="rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal/90">
              privacy@nezamy.sa
            </a>
            <Link href="/terms" className={`rounded-xl border px-6 py-2.5 text-sm font-semibold transition ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
              {isRTL ? "الشروط والأحكام" : "Terms & Conditions"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
