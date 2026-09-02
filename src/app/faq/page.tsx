"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass,
  CaretDown,
  ChatCircle,
  Phone,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

type Category = "all" | "clients" | "providers" | "payment" | "tech";

interface FAQItem {
  id: number;
  category: Category;
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
}

const faqData: FAQItem[] = [
  // General
  {
    id: 1,
    category: "all",
    questionAr: "ما هو نظامي؟",
    questionEn: "What is Nezamy?",
    answerAr:
      "نظامي هي منصة قانونية رقمية سعودية تربط الأفراد والشركات بمحترفين قانونيين معتمدين. تتيح المنصة الحصول على استشارات قانونية، توثيق العقود، ومتابعة القضايا بشكل آمن وسهل.",
    answerEn:
      "Nezamy is a Saudi digital legal platform that connects individuals and companies with accredited legal professionals. The platform enables legal consultations, contract notarization, and case tracking in a secure and easy manner.",
  },
  {
    id: 2,
    category: "all",
    questionAr: "كيف أبدأ استخدام نظامي؟",
    questionEn: "How do I start using Nezamy?",
    answerAr:
      "سجّل حساباً مجانياً عبر الموقع أو التطبيق، وأكمل التحقق من هويتك، ثم ابدأ بتصفح مزودي الخدمة واختيار المناسب لاحتياجاتك.",
    answerEn:
      "Register a free account via the website or app, complete identity verification, then start browsing service providers and choose the one that suits your needs.",
  },
  {
    id: 3,
    category: "all",
    questionAr: "هل المنصة موثوقة ومرخّصة؟",
    questionEn: "Is the platform reliable and licensed?",
    answerAr:
      "نعم، نظامي منصة مرخّصة تعمل وفق أنظمة المملكة العربية السعودية وتحت إشراف الجهات التنظيمية المختصة. جميع مزودي الخدمة يخضعون لعملية تحقق صارمة قبل القبول.",
    answerEn:
      "Yes, Nezamy is a licensed platform operating in accordance with Saudi Arabian regulations under the supervision of relevant regulatory authorities. All service providers undergo a strict verification process before acceptance.",
  },
  {
    id: 4,
    category: "all",
    questionAr: "ما المدن المتاحة حالياً على نظامي؟",
    questionEn: "Which cities are currently available on Nezamy?",
    answerAr:
      "تغطي المنصة حالياً الرياض وجدة والدمام والمدينة المنورة ومكة المكرمة. ونعمل على توسيع التغطية لتشمل جميع مناطق المملكة خلال ٢٠٢٥.",
    answerEn:
      "The platform currently covers Riyadh, Jeddah, Dammam, Medina, and Makkah. We are working on expanding coverage to include all regions of the Kingdom during 2025.",
  },
  {
    id: 5,
    category: "all",
    questionAr: "هل يوجد تطبيق للجوال؟",
    questionEn: "Is there a mobile app?",
    answerAr:
      "نعم، تطبيق نظامي متاح على متجر App Store وGoogle Play. يتيح التطبيق جميع ميزات المنصة مع إشعارات فورية ومتابعة حالة الطلبات.",
    answerEn:
      "Yes, the Nezamy app is available on the App Store and Google Play. The app provides all platform features with instant notifications and order status tracking.",
  },
  // Clients
  {
    id: 6,
    category: "clients",
    questionAr: "كيف أختار المحامي المناسب؟",
    questionEn: "How do I choose the right lawyer?",
    answerAr:
      "يمكنك تصفية المحامين حسب التخصص والمنطقة والتقييمات وسنوات الخبرة. كما يمكنك الاطلاع على الملف الكامل لكل محامٍ ومراجعات العملاء السابقين قبل اتخاذ قرارك.",
    answerEn:
      "You can filter lawyers by specialization, region, ratings, and years of experience. You can also view each lawyer's full profile and previous client reviews before making your decision.",
  },
  {
    id: 7,
    category: "clients",
    questionAr: "هل يمكن الحصول على الاستشارة باللغة العربية؟",
    questionEn: "Can I get consultation in Arabic?",
    answerAr:
      "بالتأكيد. نظامي منصة سعودية بالدرجة الأولى وجميع مزودي الخدمة يقدمون خدماتهم باللغة العربية. كما يتوفر بعض المزودين الذين يتحدثون الإنجليزية لخدمة العملاء الدوليين.",
    answerEn:
      "Absolutely. Nezamy is a Saudi platform first, and all service providers offer their services in Arabic. Some providers also speak English to serve international clients.",
  },
  {
    id: 8,
    category: "clients",
    questionAr: "ماذا لو لم أرضَ عن الخدمة المقدّمة؟",
    questionEn: "What if I am not satisfied with the service?",
    answerAr:
      "تواصل مع فريق دعم نظامي مباشرةً عبر البريد support@nezamy.sa أو رقم الدعم الموضّح في هذه الصفحة، مع ذكر تفاصيل الخدمة وما لم يكن مطابقاً لما اتُّفق عليه. يراجع الفريق الحالة يدوياً ويتابعها معك ومع مزود الخدمة.",
    answerEn:
      "Contact the Nezamy support team directly at support@nezamy.sa or via the support number shown on this page, describing the service and what did not match what was agreed. The team reviews the case manually and follows it up with you and the service provider.",
  },
  {
    id: 9,
    category: "clients",
    questionAr: "كم يستغرق الرد على طلبي؟",
    questionEn: "How long does it take to respond to my request?",
    answerAr:
      "يرد معظم مزودي الخدمة خلال ساعتين. في حالات الاستعجال يمكنك تفعيل خاصية 'طلب عاجل' للحصول على رد خلال ٣٠ دقيقة مقابل رسوم إضافية بسيطة.",
    answerEn:
      "Most service providers respond within 2 hours. For urgent cases, you can activate the 'Urgent Request' feature to get a response within 30 minutes for a small additional fee.",
  },
  // Providers
  {
    id: 10,
    category: "providers",
    questionAr: "كيف أسجّل كمحامٍ أو مزود خدمة؟",
    questionEn: "How do I register as a lawyer or service provider?",
    answerAr:
      "انتقل إلى صفحة 'انضم كمزود خدمة' واملأ نموذج التسجيل. ارفع المستندات المطلوبة كرخصة المزاولة وبطاقة الهوية. يراجع الفريق طلبك خلال ٢٤-٤٨ ساعة.",
    answerEn:
      "Navigate to the 'Join as a Service Provider' page and fill in the registration form. Upload required documents such as the practice license and ID card. The team reviews your application within 24-48 hours.",
  },
  {
    id: 11,
    category: "providers",
    questionAr: "كيف تُحدَّد أتعابي؟",
    questionEn: "How are my fees determined?",
    answerAr:
      "أنت تحدد أسعارك بالكامل. يمكنك تعيين سعر بالساعة أو سعر ثابت لكل نوع خدمة. تنصح المنصة بمعدلات السوق لمساعدتك على التسعير التنافسي.",
    answerEn:
      "You set your prices entirely. You can set an hourly rate or a fixed price per service type. The platform advises on market rates to help you price competitively.",
  },
  {
    id: 12,
    category: "providers",
    questionAr: "متى يتم تحويل المدفوعات إليّ؟",
    questionEn: "When are payments transferred to me?",
    answerAr:
      "لا يوجد تحويل مدفوعات عبر المنصة حالياً، إذ لم تُفعَّل بوابة الدفع الإلكتروني بعد. يتم الاتفاق على الأتعاب وترتيب تحصيلها مباشرة مع فريق نظامي.",
    answerEn:
      "There are no payment transfers through the platform at the moment, as the electronic payment gateway is not enabled yet. Fees are agreed upon and collected directly in coordination with the Nezamy team.",
  },
  // Payment
  {
    id: 14,
    category: "payment",
    questionAr: "ما طرق الدفع المتاحة؟",
    questionEn: "What payment methods are available?",
    answerAr:
      "لم يُفعَّل الدفع الإلكتروني على المنصة حتى الآن، ولا نستقبل أي مدفوعات عبر الموقع. بعد تأكيد طلبك يتواصل معك فريق نظامي لترتيب الدفع مباشرة.",
    answerEn:
      "Electronic payment is not enabled on the platform yet, and we do not accept any payments through the site. After your request is confirmed, the Nezamy team contacts you to arrange payment directly.",
  },
  {
    id: 17,
    category: "payment",
    questionAr: "هل تطلب المنصة بيانات بطاقتي؟",
    questionEn: "Does the platform ask for my card details?",
    answerAr:
      "لا. لا يتوفر الدفع الإلكتروني على المنصة حالياً، لذا لا نطلب بيانات بطاقتك ولا نخزّنها. تصفّحك للموقع يتم عبر اتصال مشفّر (HTTPS)، وترتيب الأتعاب يتم مباشرةً مع فريق نظامي.",
    answerEn:
      "No. Electronic payment is not available on the platform at the moment, so we neither ask for nor store your card details. The site is served over an encrypted connection (HTTPS), and fees are arranged directly with the Nezamy team.",
  },
  // Tech / Security
  {
    id: 18,
    category: "tech",
    questionAr: "كيف تُحمى بياناتي الشخصية؟",
    questionEn: "How is my personal data protected?",
    answerAr:
      "تُنقَل بياناتك عبر اتصال مشفّر (TLS)، وتُخزَّن على بنية تحتية سحابية يوفّر مزوّدها تشفيراً على مستوى الأقراص، مع عزل سجلات كل حساب عن غيره عبر سياسات RLS. نلتزم بنظام حماية البيانات الشخصية السعودي (PDPL) ولا نشارك بياناتك مع أطراف ثالثة دون إذنك.",
    answerEn:
      "Your data travels over an encrypted TLS connection and is stored on cloud infrastructure whose provider encrypts the underlying disks, with each account's records isolated by row-level security (RLS) policies. We comply with the Saudi Personal Data Protection Law (PDPL) and do not share your data with third parties without your consent.",
  },
  {
    id: 19,
    category: "tech",
    questionAr: "هل يُستخدم الذكاء الاصطناعي في اتخاذ القرارات القانونية؟",
    questionEn: "Is AI used in legal decision-making?",
    answerAr:
      "الذكاء الاصطناعي في نظامي أداة مساعدة فقط لإدارة المهام وتلخيص الوثائق، ومخرجاته ليست رأياً قانونياً ولا قراراً نهائياً. القرار القانوني النهائي يبقى لمحامٍ مرخص يراجع ملفك — سواء عبر المنصة أو خارجها.",
    answerEn:
      "AI in Nezamy is only a supporting tool for task management and document summarization. Its output is not a legal opinion or a final decision. A final legal decision remains with a licensed lawyer who reviews your file — whether through the platform or outside it.",
  },
  {
    id: 20,
    category: "tech",
    questionAr: "ما الأنظمة التي تلتزم بها المنصة؟",
    questionEn: "Which regulations does the platform comply with?",
    answerAr:
      "نخضع لإشراف وزارة العدل للخدمات القانونية، ونلتزم بنظام حماية البيانات الشخصية السعودي (PDPL). ولا تُستقبل أي مدفوعات إلكترونية عبر المنصة حالياً.",
    answerEn:
      "We are subject to the Ministry of Justice's oversight for legal services and comply with the Saudi Personal Data Protection Law (PDPL). No electronic payments are received through the platform at this time.",
  },
];

const categories: { id: string; labelAr: string; labelEn: string }[] = [
  { id: "all", labelAr: "الجميع", labelEn: "All" },
  { id: "clients", labelAr: "طالبو الخدمة", labelEn: "Clients" },
  { id: "providers", labelAr: "مزودو الخدمة", labelEn: "Providers" },
  { id: "payment", labelAr: "الدفع والأسعار", labelEn: "Payment & Pricing" },
  { id: "tech", labelAr: "التقنية والأمان", labelEn: "Tech & Security" },
];

export default function FAQPage() {
  const { isRTL, isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return faqData.filter((item) => {
      const matchCat = activeCategory === "all" || item.category === activeCategory;
      const q = isRTL ? item.questionAr : item.questionEn;
      const a = isRTL ? item.answerAr : item.answerEn;
      const matchSearch =
        search.trim() === "" ||
        q.toLowerCase().includes(search.toLowerCase()) ||
        a.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [search, activeCategory, isRTL]);

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-gray-900"}`}
    >
      <Navbar />

      {/* Header */}
      <section className="bg-royal pt-28 sm:pt-32 pb-14 sm:pb-20 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_bottom,_#C8A762_0%,_transparent_60%)]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-2xl mx-auto"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <ChatCircle size={32} className="text-gold" weight="duotone" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-3">
            {isRTL ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
          </h1>
          <p className="text-white/70 text-base sm:text-lg mb-6 sm:mb-8">
            {isRTL
              ? "كل ما تحتاج معرفته عن نظامي في مكان واحد"
              : "Everything you need to know about Nezamy in one place"}
          </p>

          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <MagnifyingGlass
              size={20}
              className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${isRTL ? "right-4" : "left-4"}`}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRTL ? "ابحث في الأسئلة الشائعة..." : "Search FAQs..."}
              className={`w-full py-3.5 ${isRTL ? "pr-12 pl-4" : "pl-12 pr-4"} rounded-xl bg-white text-gray-900 placeholder-gray-400 outline-none shadow-lg text-sm`}
            />
          </div>
        </motion.div>
      </section>

      {/* Category Tabs */}
      <section className={`sticky top-0 z-30 border-b shadow-sm ${isDark ? "bg-dark-card border-white/10" : "bg-white border-gray-100"}`}>
        <div className="max-w-4xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 py-3 whitespace-nowrap">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setOpenId(null); }}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all ${
                  activeCategory === cat.id
                    ? "bg-royal text-white"
                    : isDark
                    ? "text-gray-400 hover:bg-white/10 hover:text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {isRTL ? cat.labelAr : cat.labelEn}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ List */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <ChatCircle size={48} className="text-gray-300 mx-auto mb-4" />
              <p className={`text-lg ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isRTL ? "لا توجد نتائج مطابقة" : "No matching results found"}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className={`rounded-xl border overflow-hidden ${
                    isDark ? "bg-dark-card border-white/10" : "bg-white border-gray-100 shadow-sm"
                  }`}
                >
                  <button
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-start gap-4"
                    aria-expanded={openId === item.id}
                  >
                    <span className={`font-semibold text-base leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                      {isRTL ? item.questionAr : item.questionEn}
                    </span>
                    <motion.span
                      animate={{ rotate: openId === item.id ? 180 : 0 }}
                      transition={{ duration: 0.22 }}
                      className="shrink-0"
                    >
                      <CaretDown
                        size={18}
                        className={isDark ? "text-gray-400" : "text-gray-400"}
                      />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {openId === item.id && (
                      <motion.div
                        key="answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className={`px-5 pb-5 pt-1 border-t ${isDark ? "border-white/10" : "border-gray-50"}`}>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                            {isRTL ? item.answerAr : item.answerEn}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}

          {/* Still have questions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`mt-14 rounded-2xl border p-8 text-center ${
              isDark ? "bg-dark-card border-white/10" : "bg-gray-50 border-gray-100"
            }`}
          >
            <ChatCircle size={40} className="text-royal mx-auto mb-4" weight="duotone" />
            <h3 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "لا تزال لديك أسئلة؟" : "Still have questions?"}
            </h3>
            <p className={`text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {/* Was «متاح على مدار الساعة» / "available 24/7". Nothing supports
                  round-the-clock staffing; the contact page states the real
                  hours (src/app/contact/page.tsx:152). Those hours are used
                  here instead. */}
              {isRTL
                ? "فريق الدعم متاح أحد – خميس ٨ص – ١٠م، والجمعة والسبت ٩ص – ٥م"
                : "Our support team is available Sun – Thu 8am – 10pm, and Fri – Sat 9am – 5pm"}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="tel:+966555979607"
                className="inline-flex items-center justify-center gap-2 bg-royal text-white px-6 py-3 rounded-xl font-medium text-sm hover:bg-[#0a3328] transition-colors"
              >
                <Phone size={18} />
                {isRTL ? "اتصل بنا" : "Call Us"}
              </a>
              <a
                href="mailto:support@nezamy.sa"
                className={`inline-flex items-center justify-center gap-2 border px-6 py-3 rounded-xl font-medium text-sm transition-colors ${
                  isDark
                    ? "border-white/20 text-white hover:bg-white/10"
                    : "border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <EnvelopeSimple size={18} />
                {isRTL ? "راسلنا" : "Email Us"}
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
          </div>
  );
}
