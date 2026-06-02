export type PlatformContentStatus = "published" | "review" | "draft" | "archived";
export type PlatformContentSource = "static-mock" | "backend-ready";

export interface PlatformBlogCategory {
  id: string;
  label: string;
  labelEn: string;
}

export interface PlatformBlogArticle {
  id: string;
  slug: string;
  category: string;
  tag: string;
  tagEn: string;
  title: string;
  titleEn: string;
  excerpt: string;
  excerptEn: string;
  author: {
    name: string;
    nameEn: string;
    slug: string;
    specialty: string;
    specialtyEn: string;
    rating: number;
    reviewCount: number;
  };
  date: string;
  dateEn: string;
  publishedDate: string;
  readTime: string;
  readTimeEn: string;
  views: number;
  likes: number;
  featured: boolean;
  status: PlatformContentStatus;
  seoScore: number;
  source: PlatformContentSource;
  content: string;
}

export const PLATFORM_BLOG_CATEGORIES: PlatformBlogCategory[] = [
  { id: "all", label: "الكل", labelEn: "All" },
  { id: "labor", label: "عمالي", labelEn: "Labor" },
  { id: "commercial", label: "تجاري", labelEn: "Commercial" },
  { id: "civil", label: "مدني", labelEn: "Civil" },
  { id: "family", label: "أحوال", labelEn: "Family" },
  { id: "news", label: "أخبار قانونية", labelEn: "Legal News" },
];

export const PLATFORM_BLOG_ARTICLES: PlatformBlogArticle[] = [
  {
    id: "A001",
    slug: "wrongful-termination-rights",
    category: "labor",
    tag: "عمالي",
    tagEn: "Labor",
    title: "حقوق العمال في حالة الفصل التعسفي - دليلك الشامل",
    titleEn: "Workers' Rights in Wrongful Termination - Complete Guide",
    excerpt: "استعراض مبسط لما يكفله نظام العمل السعودي عند الفصل التعسفي، وكيف يبدأ العامل في حفظ حقوقه وإثبات الضرر.",
    excerptEn: "A practical overview of Saudi labor protections in wrongful termination cases and the first steps to preserve rights.",
    author: { name: "أ. أحمد محمد الغامدي", nameEn: "Ahmed Al-Ghamdi", slug: "ahmed-alghamdi", specialty: "قانون عمالي", specialtyEn: "Labor Law", rating: 4.9, reviewCount: 234 },
    date: "١٥ فبراير ٢٠٢٦",
    dateEn: "Feb 15, 2026",
    publishedDate: "2026-02-15",
    readTime: "٧ دقائق",
    readTimeEn: "7 min",
    views: 4231,
    likes: 312,
    featured: true,
    status: "published",
    seoScore: 94,
    source: "static-mock",
    content: `
## ما هو الفصل التعسفي؟

الفصل التعسفي هو إنهاء عقد العمل دون سبب مشروع كاف، أو دون اتباع الإجراءات النظامية المقررة. في هذه الحالة لا تنحصر حقوق العامل في الراتب المتأخر فقط، بل تمتد إلى التعويض ومكافأة نهاية الخدمة وما يرتبط بفترة الإشعار.

## ما الحقوق الأساسية؟

1. **مكافأة نهاية الخدمة** بحسب مدة العلاقة ونوع العقد.
2. **تعويض عادل** عند ثبوت عدم مشروعية الإنهاء.
3. **أجر فترة الإشعار** إذا لم يلتزم صاحب العمل بها.
4. **توثيق المخاطبات** ورسائل البريد والقرارات الداخلية لإثبات التسلسل الزمني.

## ماذا تفعل أولاً؟

ابدأ بطلب نسخة مكتوبة من قرار الإنهاء وسبب الفصل، ثم راجع عقدك ومسير الرواتب والمخاطبات. إذا لم يتم الحل ودياً، فالمسار الطبيعي يبدأ بتسوية عمالية ثم دعوى أمام المحكمة العمالية عند الحاجة.
`,
  },
  {
    id: "A002",
    slug: "commercial-disputes",
    category: "commercial",
    tag: "تجاري",
    tagEn: "Commercial",
    title: "كيف تحمي شركتك من النزاعات التجارية قبل فوات الأوان؟",
    titleEn: "How to Protect Your Business from Commercial Disputes Before It Is Too Late",
    excerpt: "إجراءات وقائية في العقود والمراسلات وإدارة المخاطر تقلل تكلفة النزاع قبل أن يتحول إلى مطالبة قضائية.",
    excerptEn: "Preventive steps in contracts, correspondence, and risk management before disputes become litigation.",
    author: { name: "أ. خالد المطيري", nameEn: "Khalid Al-Mutairi", slug: "khalid-almutairi", specialty: "قانون تجاري", specialtyEn: "Commercial Law", rating: 4.7, reviewCount: 188 },
    date: "٢٠ يناير ٢٠٢٦",
    dateEn: "Jan 20, 2026",
    publishedDate: "2026-01-20",
    readTime: "٩ دقائق",
    readTimeEn: "9 min",
    views: 3178,
    likes: 221,
    featured: true,
    status: "published",
    seoScore: 91,
    source: "static-mock",
    content: `
## الوقاية تبدأ قبل التوقيع

أغلب النزاعات التجارية تبدأ من بند غامض أو مراسلة غير موثقة. لذلك يجب أن يكون نطاق العمل، آلية التسليم، الجزاءات، الاختصاص، وحالات القوة القاهرة مكتوبة بوضوح.

## إدارة المراسلات

اجعل كل تعديل جوهري في العقد موثقاً كتابة، وتجنب الاعتماد على الاتفاقات الشفهية. البريد الرسمي وسجل المحاضر الداخلية قد يحسمان النزاع قبل المحكمة.

## متى تستشير محامياً؟

استشر مبكراً عند ظهور تأخير متكرر أو رفض دفع أو تغيير نطاق العمل. التدخل المبكر غالباً أقل تكلفة من معالجة نزاع مكتمل.
`,
  },
  {
    id: "A003",
    slug: "lease-contracts-guide",
    category: "civil",
    tag: "عقاري",
    tagEn: "Real Estate",
    title: "دليلك الكامل لعقود الإيجار في السعودية ٢٠٢٦",
    titleEn: "Complete Guide to Lease Contracts in KSA 2026",
    excerpt: "أهم البنود التي يجب مراجعتها في عقد الإيجار قبل التوقيع، من مدة العقد إلى الصيانة والإخلاء والتعويض.",
    excerptEn: "Key lease clauses to review before signing, from term and maintenance to eviction and compensation.",
    author: { name: "أ. سارة العتيبي", nameEn: "Sara Al-Otaibi", slug: "sara-alotaibi", specialty: "قانون مدني وعقاري", specialtyEn: "Civil and Real Estate Law", rating: 4.8, reviewCount: 156 },
    date: "١٢ ديسمبر ٢٠٢٥",
    dateEn: "Dec 12, 2025",
    publishedDate: "2025-12-12",
    readTime: "٦ دقائق",
    readTimeEn: "6 min",
    views: 2943,
    likes: 176,
    featured: false,
    status: "published",
    seoScore: 88,
    source: "static-mock",
    content: `
## عقد الإيجار ليس نموذجاً واحداً

تختلف المخاطر بحسب نوع العين المؤجرة والغرض من الانتفاع. راجع مدة العقد، التمديد، الصيانة، الالتزامات المالية، وحالات الإخلاء قبل التوقيع.

## نقطة عملية

لا تترك بند الصيانة عاماً. حدد من يتحمل الصيانة الدورية، ومن يتحمل الإصلاحات الجوهرية، وكيف يتم الإخطار والمهلة.
`,
  },
  {
    id: "A004",
    slug: "end-of-service-calculator",
    category: "labor",
    tag: "عمالي",
    tagEn: "Labor",
    title: "كيف تحسب مكافأة نهاية الخدمة بدقة؟",
    titleEn: "How to Calculate End-of-Service Accurately",
    excerpt: "شرح مبسط لعوامل حساب مكافأة نهاية الخدمة، وما الذي يغير النتيجة بين الاستقالة والإنهاء.",
    excerptEn: "A clear explanation of end-of-service calculation factors and what changes between resignation and termination.",
    author: { name: "أ. أحمد محمد الغامدي", nameEn: "Ahmed Al-Ghamdi", slug: "ahmed-alghamdi", specialty: "قانون عمالي", specialtyEn: "Labor Law", rating: 4.9, reviewCount: 234 },
    date: "١٨ نوفمبر ٢٠٢٥",
    dateEn: "Nov 18, 2025",
    publishedDate: "2025-11-18",
    readTime: "٥ دقائق",
    readTimeEn: "5 min",
    views: 5670,
    likes: 401,
    featured: false,
    status: "published",
    seoScore: 96,
    source: "static-mock",
    content: `
## عوامل الحساب

يعتمد الحساب على الأجر الأخير، مدة الخدمة، سبب انتهاء العلاقة، ونوع العقد. لذلك لا يصح حساب المكافأة بمعزل عن ملف العلاقة العمالية كاملاً.
`,
  },
  {
    id: "A005",
    slug: "custody-procedures",
    category: "family",
    tag: "أحوال",
    tagEn: "Family",
    title: "إجراءات الحضانة في المملكة - ما تحتاج معرفته",
    titleEn: "Custody Procedures in Saudi Arabia - What You Need to Know",
    excerpt: "نظرة عملية على معايير الحضانة، ومتى تكون مصلحة المحضون هي محور القرار.",
    excerptEn: "A practical look at custody standards and how the child’s best interest guides the decision.",
    author: { name: "أ. سارة العتيبي", nameEn: "Sara Al-Otaibi", slug: "sara-alotaibi", specialty: "أحوال شخصية", specialtyEn: "Family Law", rating: 4.8, reviewCount: 156 },
    date: "٢٢ أكتوبر ٢٠٢٥",
    dateEn: "Oct 22, 2025",
    publishedDate: "2025-10-22",
    readTime: "٨ دقائق",
    readTimeEn: "8 min",
    views: 3421,
    likes: 244,
    featured: false,
    status: "published",
    seoScore: 87,
    source: "static-mock",
    content: `
## معيار المصلحة

قضايا الحضانة لا تدور حول رغبة أحد الطرفين فقط، بل حول مصلحة المحضون واستقرار رعايته وسلامته.
`,
  },
  {
    id: "A006",
    slug: "company-data-protection",
    category: "commercial",
    tag: "تجاري",
    tagEn: "Commercial",
    title: "حماية البيانات للشركات في ضوء الأنظمة السعودية",
    titleEn: "Data Protection for Companies Under Saudi Regulations",
    excerpt: "التزامات عملية على الشركات عند جمع البيانات الشخصية ومعالجتها ومشاركتها.",
    excerptEn: "Operational duties for companies collecting, processing, and sharing personal data.",
    author: { name: "أ. خالد المطيري", nameEn: "Khalid Al-Mutairi", slug: "khalid-almutairi", specialty: "امتثال وحوكمة", specialtyEn: "Compliance and Governance", rating: 4.7, reviewCount: 188 },
    date: "٩ سبتمبر ٢٠٢٥",
    dateEn: "Sep 9, 2025",
    publishedDate: "2025-09-09",
    readTime: "١٠ دقائق",
    readTimeEn: "10 min",
    views: 2187,
    likes: 133,
    featured: false,
    status: "published",
    seoScore: 84,
    source: "static-mock",
    content: `
## الامتثال ليس سياسة ورقية

حماية البيانات تبدأ من تحديد الأساس النظامي للمعالجة، ثم تنظيم الموافقات، الحفظ، صلاحيات الوصول، وآلية الاستجابة للطلبات.
`,
  },
];

export function getPlatformBlogArticle(slug: string): PlatformBlogArticle | undefined {
  return PLATFORM_BLOG_ARTICLES.find((article) => article.slug === slug);
}

export function getRelatedPlatformBlogArticles(slug: string, limit = 3): PlatformBlogArticle[] {
  const current = getPlatformBlogArticle(slug);
  return PLATFORM_BLOG_ARTICLES
    .filter((article) => article.slug !== slug)
    .filter((article) => !current || article.category === current.category || article.featured)
    .slice(0, limit);
}
