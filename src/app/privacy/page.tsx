"use client";

import { motion } from "framer-motion";
import { Lock, ShieldCheck, Eye, Trash, ArrowUp, Database, Globe, Cookie, Bell, UserCircle } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import { AnalyticsChoiceControl } from "@/components/analytics/AnalyticsConsent";

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
        "**حظر تدريب النماذج على بياناتك**: لا نستخدم ملفات القضايا أو الضبوط أو المستندات القانونية الخاصة بمستخدمينا لتدريب أي نماذج ذكاء اصطناعي تحت أي ظرف.",
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
        "سجلات النظام لدينا تُحتفظ بها ٩٠ يوماً كحد أقصى.",
        // l12 (L11-log): the admin setting ai_runs_retention (default 12 months,
        // public.ai_runs_retention). Raising it above 12 needs this line changed.
        "أسئلتك إلى أدوات الذكاء الاصطناعي وأجوبتها تُحفظ في «سجلّي» مدة أقصاها ١٢ شهراً، ولك حذف أي منها قبل ذلك، ثم يُمسح نصها ولا يبقى إلا قيد العملية وتاريخها ونقاطها.",
        "بيانات أداتي قياس الزيارات (إن فُعّلتا ووافقت عليهما) تُحفظ لدى مزوّديهما: تحفظ Google Analytics بيانات الأحداث التفصيلية شهرين، وتحفظ Microsoft Clarity تسجيلات التصفح ٣٠ يوماً وقد تُبقي عيّنة منها حتى ٩ أشهر، وتبقى لديهما تقارير إحصائية مجمّعة لا تحدد هويتك.",
        "يمكنك طلب حذف بياناتك التي لا يوجد التزام قانوني بالاحتفاظ بها عبر نموذج طلب الحذف.",
      ],
    },
    {
      id: "user-rights",
      title: "٥. حقوقك وفق نظام حماية البيانات الشخصية",
      content: [
        "**حق الاطلاع**: يحق لك طلب نسخة من بياناتك الشخصية المحتجزة لدينا.",
        "**حق التصحيح**: يحق لك تصحيح أي بيانات غير دقيقة أو ناقصة.",
        "**حق الحذف**: يحق لك طلب حذف بياناتك في حدود ما يسمح به القانون.",
        "**حق الاعتراض**: يحق لك الاعتراض على معالجة بياناتك لأغراض التسويق في أي وقت.",
        "**حق النقل**: يحق لك طلب الحصول على بياناتك في صيغة إلكترونية قابلة للنقل.",
        "**حق الرجوع عن الموافقة**: يحق لك الرجوع عن موافقتك على معالجة بياناتك متى كانت الموافقة هي أساس المعالجة.",
        "**كيف تقدّم طلبك**: أرسل طلبك إلى privacy@nezamy.sa من البريد المسجّل في حسابك، مع تحديد الحق الذي تطلبه، وقد نطلب ما يثبت هويتك قبل تنفيذه.",
      ],
    },
    {
      id: "cookies",
      title: "٦. ملفات تعريف الارتباط (Cookies)",
      content: [
        "نستخدم ملفات تعريف الارتباط الضرورية لتشغيل المنصة (مثل جلسات تسجيل الدخول وإعدادات اللغة).",
        "**أدوات قياس الزيارات**: قد نستخدم Google Analytics 4 وMicrosoft Clarity لنفهم كيف تُستخدم صفحاتنا العامة ونحسّنها. لا يُحمَّل أيٌّ منهما إلا بعد ضغطك «أوافق» في شريط ملفات الارتباط، و«لا أوافق» بالسهولة نفسها، ويُحفظ اختيارك في ملف الارتباط «nz_consent» مدة ستة أشهر.",
        "تعمل Google Analytics فقط في الصفحة الرئيسية وصفحة عضوية المؤسس وصفحة الأسعار وصفحات التسجيل والدفع، وتعمل Microsoft Clarity في الصفحة الرئيسية وصفحة عضوية المؤسس وصفحة الأسعار فقط، لا في صفحات التسجيل والدفع. ولا تعملان أبداً داخل لوحات المحامين والمكاتب والعملاء ولا في الصائغ ولا في لوحة الإدارة.",
        "تُخفي Clarity كل ما تكتبه في حقول الإدخال (بيانات البطاقة ورقم الرخصة والبريد الإلكتروني)، ولا تُحمَّل أصلاً في صفحات التسجيل والتوثيق والدفع، ولا نرسل إلى أيٍّ من الأداتين اسمك أو بريدك أو رقم رخصتك.",
        "ما نقيسه: زيارة الصفحة، والنقر على «احجز مقعدك»، وبدء التسجيل، ومطابقة الرخصة في سجل المحامين، وتأشير الموافقة على شروط باقة المؤسس، وبدء الدفع، وإتمام الشراء. يرسل خادمُنا حدث الشراء إلى Google Analytics بعد نجاح الدفع، ومعه رقم الطلب والمبلغ والباقة فقط، ولا يُرسَل إلا إن كنت وافقت قبل الدفع.",
        "مصدر الزيارة: إذا وصلت عبر رابط حملة (utm) نحفظ اسم الحملة ومصدرها وأول صفحة زرتها في ملف ارتباط من طرفنا («nz_attr») مدة ٣٠ يوماً، ونربطها بطلب الدفع لنعرف أي حملة جاء منها المشترك.",
        "لا نستخدم ملفات تعريف الارتباط للإعلانات المستهدفة من أطراف ثالثة.",
        "يمكنك تغيير اختيارك في أي وقت من الزرّين أسفل هذا القسم، وعند الرفض نحذف ملفات القياس من متصفحك، كما يمكنك حذفها من إعدادات متصفحك.",
      ],
    },
    {
      id: "security",
      title: "٧. أمان البيانات",
      content: [
        "تُنقَل جميع البيانات بينك وبين المنصة عبر اتصال مشفّر (TLS).",
        "تعزل سياسات الأمان على مستوى الصف (RLS) داخل قاعدة البيانات سجلات كل حساب عن غيره، فلا يقرأ حساب بيانات حساب آخر.",
        "إذا وقع تسرّب يمس بياناتك الشخصية، نُبلغ الجهة المختصة ونُخطرك وفق ما يقتضيه نظام حماية البيانات الشخصية ولوائحه.",
        "الوصول للبيانات محدود بمبدأ الحد الأدنى من الصلاحيات — لا يصل أي موظف للبيانات إلا بالقدر اللازم لعمله.",
      ],
    },
    {
      id: "transfer",
      title: "٨. نقل البيانات خارج المملكة",
      content: [
        "قد تُعالَج بعض البيانات لدى مزوّدي خدمات تقنية، ومنها خدمات معالجة طلبات الذكاء الاصطناعي، وقد تقع خوادمهم خارج المملكة.",
        "أي نقل لبيانات شخصية إلى خارج المملكة يتم وفق الضوابط التي يحددها نظام حماية البيانات الشخصية ولوائحه.",
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
        "**Zero AI Training on Your Case Files**: We never use your case files, hearing minutes, or legal documents to train any AI models under any circumstances.",
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
        "Our own system logs are retained for 90 days at most.",
        "Your questions to the AI tools and their answers are kept in «My history» for 12 months at most, and you may delete any of them sooner; after that their text is erased and only the record of the run, its date and its points remain.",
        "Visitor analytics data (only if those tools are switched on and you agreed) is kept by the providers: Google Analytics keeps detailed event data for 2 months, Microsoft Clarity keeps session recordings for 30 days and may keep a sample for up to 9 months, and both keep aggregated statistics that do not identify you.",
        "You can request deletion of data with no legal retention obligation through the deletion request form.",
      ],
    },
    {
      id: "user-rights",
      title: "5. Your Rights under the Personal Data Protection Law",
      content: [
        "**Right of Access**: You have the right to request a copy of your personal data held by us.",
        "**Right of Correction**: You have the right to correct any inaccurate or incomplete data.",
        "**Right of Deletion**: You have the right to request deletion of your data within the limits permitted by law.",
        "**Right to Object**: You have the right to object to processing your data for marketing purposes at any time.",
        "**Right of Portability**: You have the right to request your data in a portable electronic format.",
        "**Right to Withdraw Consent**: You may withdraw your consent to the processing of your data wherever consent is its basis.",
        "**How to Make a Request**: Email privacy@nezamy.sa from the address registered on your account, naming the right you are exercising; we may ask for proof of identity before acting on it.",
      ],
    },
    {
      id: "cookies",
      title: "6. Cookies",
      content: [
        "We use necessary cookies to operate the platform (such as login sessions and language settings).",
        "**Visitor analytics**: we may use Google Analytics 4 and Microsoft Clarity to understand and improve how our public pages are used. Neither loads until you press «أوافق» (I agree) on the cookie banner; «لا أوافق» (I refuse) is just as easy, and your choice is kept in the «nz_consent» cookie for six months.",
        "Google Analytics runs only on the home page, the founder membership page, the pricing page and the sign-up and payment pages; Microsoft Clarity runs only on the home page, the founder membership page and the pricing page, never on the sign-up or payment pages. Neither ever runs inside the lawyer, firm or client dashboards, the drafter or the admin console.",
        "Clarity masks everything typed into input fields (card details, licence number, e-mail) and is not loaded at all on the sign-up, verification and payment pages, and neither tool is sent your name, e-mail or licence number.",
        "What we measure: page views, clicks on «Reserve your seat», sign-up start, a licence match in the lawyers' registry, ticking the founder-terms consent box, checkout start and purchase. Our server sends the purchase event to Google Analytics after a successful payment, with only the order id, amount and package, and only if you had agreed before paying.",
        "Traffic source: if you arrive through a campaign link (utm), we keep the campaign, source and first page in our own cookie («nz_attr») for 30 days and attach them to the payment order, to know which campaign brought the subscriber.",
        "We do not use cookies for third-party targeted advertising.",
        "You can change your choice at any time with the two buttons below this section; refusing deletes the analytics cookies from your browser, and you can also delete them in your browser settings.",
      ],
    },
    {
      id: "security",
      title: "7. Data Security",
      content: [
        "All data between you and the platform travels over an encrypted connection (TLS).",
        "Row-level security (RLS) policies inside the database isolate each account's records, so no account can read another account's data.",
        "If a breach affects your personal data, we report it to the competent authority and notify you as the Personal Data Protection Law and its regulations require.",
        "Data access is limited by the principle of least privilege — no employee accesses data beyond what's needed for their role.",
      ],
    },
    {
      id: "transfer",
      title: "8. Data Transfer Outside the Kingdom",
      content: [
        "Some data may be processed by technical service providers, including the services that process AI requests, whose servers may be located outside the Kingdom.",
        "Any transfer of personal data outside the Kingdom follows the controls set by the Personal Data Protection Law and its implementing regulations.",
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
    { icon: ShieldCheck, title: isRTL ? "اتصال مشفّر (TLS)" : "Encrypted Connection (TLS)", color: "bg-emerald-500/10 text-emerald-500" },
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
              {isRTL ? "آخر تحديث: ٢٢ نوفمبر ٢٠٢٦" : "Last updated: November 22, 2026"}
            </p>
            <div className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              <ShieldCheck size={14} weight="fill" />
              {isRTL ? "نلتزم بأحكام نظام حماية البيانات الشخصية" : "We abide by the Personal Data Protection Law (PDPL)"}
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
                  {sec.id === "cookies" && (
                    <div className={`mt-5 rounded-2xl border p-4 ${isDark ? "border-white/10 bg-dark-card text-gray-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      <AnalyticsChoiceControl isAr={isRTL} />
                    </div>
                  )}
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
          </div>
  );
}
