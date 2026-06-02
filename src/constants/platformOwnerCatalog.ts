export type PlatformSurfaceStatus = "live" | "beta" | "mock" | "backend-ready";
export type PlatformSurfaceArea =
  | "marketing"
  | "legal-library"
  | "content"
  | "learning"
  | "media"
  | "community"
  | "marketplace"
  | "pricing"
  | "trust"
  | "seo";

export interface PlatformOwnerSurface {
  id: string;
  area: PlatformSurfaceArea;
  title: string;
  titleEn: string;
  publicRoutes: string[];
  adminRoutes: string[];
  sourceOfTruth: string;
  status: PlatformSurfaceStatus;
  ownerControl: "admin-live" | "admin-mock" | "static-only" | "backend-ready";
  betaNotes: string;
  backendBoundary: string;
}

export const PLATFORM_OWNER_SURFACES: PlatformOwnerSurface[] = [
  {
    id: "public-site",
    area: "marketing",
    title: "الموقع العام والهوية",
    titleEn: "Public Site and Brand",
    publicRoutes: ["/", "/about", "/services", "/services/individuals", "/services/business", "/services/lawyers"],
    adminRoutes: ["/dashboard/admin/platform", "/dashboard/admin/features"],
    sourceOfTruth: "src/app public pages + navigation.navbar.ts",
    status: "live",
    ownerControl: "static-only",
    betaNotes: "مفتوح للزائر، ولا يدخل في بروفايلات المستخدمين.",
    backendBoundary: "يحتاج CMS لاحقاً للنسخ التسويقية والـ hero/CTA.",
  },
  {
    id: "legal-library",
    area: "legal-library",
    title: "المكتبة القانونية",
    titleEn: "Legal Library",
    publicRoutes: ["/laws", "/laws/companies-law", "/laws/civil-procedure", "/precedents"],
    adminRoutes: ["/dashboard/admin/content/laws", "/dashboard/admin/platform"],
    sourceOfTruth: "src/app/laws/data.ts + src/app/laws/demo-data.ts",
    status: "backend-ready",
    ownerControl: "admin-mock",
    betaNotes: "بيانات الأنظمة والمبادئ تعمل Static/Mock، وتظهر في الأدمن كمصدر متابعة لا كـ CMS حي.",
    backendBoundary: "المطلوب لاحقاً جدول laws/articles/amendments/principles مع publish workflow.",
  },
  {
    id: "legal-blog",
    area: "content",
    title: "المدونة القانونية",
    titleEn: "Legal Blog",
    publicRoutes: ["/blog", "/blog/wrongful-termination-rights"],
    adminRoutes: ["/dashboard/admin/content/articles", "/dashboard/admin/platform"],
    sourceOfTruth: "src/constants/platformContent.ts",
    status: "backend-ready",
    ownerControl: "admin-mock",
    betaNotes: "القائمة والتفاصيل والأدمن يقرأون من كتالوج واحد؛ النشر الحقيقي مؤجل للباك اند.",
    backendBoundary: "المطلوب لاحقاً CMS articles/authors/tags/seo/revisions.",
  },
  {
    id: "academy",
    area: "learning",
    title: "أكاديمية نظامي",
    titleEn: "Nezamy Academy",
    publicRoutes: ["/academy", "/academy/my-courses", "/academy/certificates", "/academy/quiz"],
    adminRoutes: ["/dashboard/admin/platform", "/dashboard/admin/features"],
    sourceOfTruth: "src/app/academy/*",
    status: "mock",
    ownerControl: "static-only",
    betaNotes: "مكتملة كواجهة تعليمية، لكن إدارة الدورات والتقدم والشهادات Mock.",
    backendBoundary: "courses/lessons/enrollments/certificates تحتاج مخطط Backend.",
  },
  {
    id: "media",
    area: "media",
    title: "ميديا نظامي",
    titleEn: "Nezamy Media",
    publicRoutes: ["/media"],
    adminRoutes: ["/dashboard/admin/platform", "/dashboard/admin/features"],
    sourceOfTruth: "src/app/media/data.ts",
    status: "mock",
    ownerControl: "static-only",
    betaNotes: "المحتوى مقسوم مجاني/مدفوع؛ الاشتراك الإعلامي غير مربوط ببيلنغ حقيقي.",
    backendBoundary: "media catalog/subscription entitlement/watch progress لاحقاً.",
  },
  {
    id: "community",
    area: "community",
    title: "المجتمع القانوني",
    titleEn: "Legal Community",
    publicRoutes: ["/community", "/community/ask", "/community/public", "/community/lawyers"],
    adminRoutes: ["/dashboard/admin/community/moderation", "/dashboard/admin/platform", "/dashboard/admin"],
    sourceOfTruth: "src/lib/communityStore.ts + community pages",
    status: "backend-ready",
    ownerControl: "admin-mock",
    betaNotes: "الواجهة موجودة ومرتبطة بتخزين محلي، ومعها طابور إشراف أدمن Backend-ready بلا moderation backend.",
    backendBoundary: "posts/comments/reports/moderation queue تحتاج API وRBAC خادمي.",
  },
  {
    id: "marketplace",
    area: "marketplace",
    title: "سوق المهنيين والتعاون",
    titleEn: "Marketplace and Collaboration",
    publicRoutes: ["/marketplace", "/marketplace/post", "/marketplace/collaborate"],
    adminRoutes: ["/dashboard/admin/marketplace/orders", "/dashboard/admin/disputes", "/dashboard/admin/platform"],
    sourceOfTruth: "src/app/marketplace/* + src/types/lawyerWorkflow.ts",
    status: "backend-ready",
    ownerControl: "admin-mock",
    betaNotes: "التعاون والعمولة 15% موثقان، والتنفيذ المالي/الضمان Mock.",
    backendBoundary: "orders/offers/escrow/commission/disputes تحتاج باك اند ومعالج دفع.",
  },
  {
    id: "pricing",
    area: "pricing",
    title: "التسعير والاشتراكات",
    titleEn: "Pricing and Subscriptions",
    publicRoutes: ["/pricing"],
    adminRoutes: ["/dashboard/admin/pricing", "/dashboard/admin/subscriptions", "/dashboard/admin/platform"],
    sourceOfTruth: "src/constants/pricing/* + src/lib/pricingRepository.ts",
    status: "backend-ready",
    ownerControl: "admin-mock",
    betaNotes: "الكتالوجات موحدة جزئياً، وصفحة الأدمن تعرض مصادر الأسعار الرسمية وقيود البيتا.",
    backendBoundary: "pricing plans/discounts/entitlements/payment ledger تحتاج مصدر خادمي.",
  },
  {
    id: "trust-legal",
    area: "trust",
    title: "الثقة والامتثال",
    titleEn: "Trust and Compliance",
    publicRoutes: ["/terms", "/privacy", "/security", "/contact", "/faq"],
    adminRoutes: ["/dashboard/admin/security", "/dashboard/admin/audit-log", "/dashboard/admin/platform"],
    sourceOfTruth: "static trust pages + admin security/audit screens",
    status: "live",
    ownerControl: "static-only",
    betaNotes: "صفحات الثقة موجودة، لكن إدارة الإصدارات القانونية ليست CMS.",
    backendBoundary: "policy versions, consent log, and audit export need backend tables.",
  },
  {
    id: "seo-discovery",
    area: "seo",
    title: "الاكتشاف والفهرسة",
    titleEn: "SEO and Discovery",
    publicRoutes: ["/robots.txt", "/sitemap.xml"],
    adminRoutes: ["/dashboard/admin/platform"],
    sourceOfTruth: "src/app/sitemap.ts + src/app/robots.ts + metadata",
    status: "live",
    ownerControl: "backend-ready",
    betaNotes: "الفهرسة تمنع الداشبورد والـ API، وتغطي أهم الصفحات العامة.",
    backendBoundary: "dynamic sitemap for CMS content when backend lands.",
  },
];

export const PLATFORM_OWNER_SURFACE_BY_ID = Object.fromEntries(
  PLATFORM_OWNER_SURFACES.map((surface) => [surface.id, surface]),
) as Record<string, PlatformOwnerSurface>;
