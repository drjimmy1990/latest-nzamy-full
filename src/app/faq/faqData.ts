/**
 * faqData.ts — the questions and answers of /faq (17 items) and its category
 * tabs, moved out of page.tsx so the server can print them twice from one
 * source (owner 18 Nov, item 4.4; SEO audit ع1): every answer in the page's
 * HTML (page.tsx keeps a closed answer in the DOM, hidden) and the same words
 * in the FAQPage JSON-LD (layout.tsx, src/lib/publicSeo/structuredData.ts).
 *
 * The text is unchanged from page.tsx. Pure (relative imports only), so
 * `node --test` loads it.
 */
import {
  LEGAL_IDENTITY_AR,
  LEGAL_IDENTITY_EN,
  NO_DIRECT_CONSULTATION_AR,
  NO_DIRECT_CONSULTATION_EN,
} from "../../constants/legalIdentity.ts";

type Category = "all" | "clients" | "providers" | "payment" | "tech";

export type FaqCategory = Category;

export interface FAQItem {
  id: number;
  category: Category;
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
}

export const faqData: readonly FAQItem[] = [
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
      "لا يوجد تطبيق لنظامي في App Store أو Google Play حالياً. تعمل المنصة من متصفح الجوال.",
    answerEn:
      "There is no Nezamy app in the App Store or Google Play yet. The platform works in your phone's browser.",
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
      "تُنقَل بياناتك عبر اتصال مشفّر (TLS)، مع عزل سجلات كل حساب عن غيره عبر سياسات RLS. نلتزم بنظام حماية البيانات الشخصية السعودي (PDPL) ولا نشارك بياناتك مع أطراف ثالثة دون إذنك.",
    answerEn:
      "Your data travels over an encrypted TLS connection, with each account's records isolated by row-level security (RLS) policies. We comply with the Saudi Personal Data Protection Law (PDPL) and do not share your data with third parties without your consent.",
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
      `${LEGAL_IDENTITY_AR} ${NO_DIRECT_CONSULTATION_AR} ونلتزم بنظام حماية البيانات الشخصية السعودي (PDPL). ولا تُستقبل أي مدفوعات إلكترونية عبر المنصة حالياً.`,
    answerEn:
      `${LEGAL_IDENTITY_EN} ${NO_DIRECT_CONSULTATION_EN} We comply with the Saudi Personal Data Protection Law (PDPL). No electronic payments are received through the platform at this time.`,
  },
];

export const categories: { id: string; labelAr: string; labelEn: string }[] = [
  { id: "all", labelAr: "الجميع", labelEn: "All" },
  { id: "clients", labelAr: "طالبو الخدمة", labelEn: "Clients" },
  { id: "providers", labelAr: "مزودو الخدمة", labelEn: "Providers" },
  { id: "payment", labelAr: "الدفع والأسعار", labelEn: "Payment & Pricing" },
  { id: "tech", labelAr: "التقنية والأمان", labelEn: "Tech & Security" },
];
