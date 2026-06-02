import type { AdminReadinessStatus } from "@/types/adminBackendReady";

export interface AdminBackendReadinessSurface {
  id: string;
  title: string;
  route: string;
  status: AdminReadinessStatus;
  contract: string;
  note: string;
}

export const ADMIN_BACKEND_READINESS: AdminBackendReadinessSurface[] = [
  {
    id: "coupons",
    title: "الكوبونات والخصومات",
    route: "/dashboard/admin/subscriptions/coupons",
    status: "Backend-ready",
    contract: "AdminCoupon",
    note: "إضافة وتعديل وتعطيل تعمل محلياً، والحفظ الحقيقي ينتظر API الكوبونات.",
  },
  {
    id: "team",
    title: "فريق نظامي والمشرفون",
    route: "/dashboard/admin/team",
    status: "Backend-ready",
    contract: "AdminTeamMember",
    note: "إدارة RBAC مرئية ومحلية، والدعوات/التعليق تنتظر Auth/RBAC backend.",
  },
  {
    id: "business-profiles",
    title: "بروفيلات الشركات التجارية",
    route: "/dashboard/admin/business",
    status: "Backend-ready",
    contract: "BusinessProfileContract",
    note: "حجم الشركة، الهيكل القانوني، الخدمات، والـ Feature Flags تعمل محلياً فقط؛ مصدر الحقيقة ينتظر CompanyProfile/ServiceEntitlement API.",
  },
  {
    id: "firm-provider-profiles",
    title: "بروفيلات شركات المحاماة داخل المزودين",
    route: "/dashboard/admin/provider-verification/firms",
    status: "Backend-ready",
    contract: "FirmProfileContract + FirmPlanContract + FirmPointsWallet",
    note: "الاشتراك السنوي والمقاعد والنقاط والأدوار والمميزات تعمل محلياً فقط؛ مصدر الحقيقة ينتظر Firm/Profile وBilling وWallet وRBAC APIs.",
  },
  {
    id: "sector-profiles",
    title: "بروفيلات الحكومة والجمعيات والمنشآت الصغيرة",
    route: "/dashboard/admin/sector-profiles",
    status: "Backend-ready",
    contract: "GovernmentProfileContract + NgoProfileContract + MicroProfileContract + SectorPlanContract",
    note: "تجهيز قطاعات B2G وNGO/Awqaf وMicro محلياً فقط؛ لا SSO أو Billing أو Entitlements أو RBAC خادمي.",
  },
  {
    id: "articles",
    title: "مقالات المدونة",
    route: "/dashboard/admin/content/articles",
    status: "Backend-ready",
    contract: "PlatformContentItem",
    note: "إنشاء وتعديل وأرشفة وحذف محلي مع مصدر محتوى موحد حتى وصول CMS.",
  },
  {
    id: "laws",
    title: "المكتبة القانونية",
    route: "/dashboard/admin/content/laws",
    status: "Backend-ready",
    contract: "LegalLibrarySystem",
    note: "إدارة الأنظمة والمواد جاهزة للربط، والمصادر الرسمية تحتاج خدمة نشر ومراجعة.",
  },
  {
    id: "pricing",
    title: "التسعير ورسوم المنصة",
    route: "/dashboard/admin/pricing",
    status: "Backend-ready",
    contract: "AdminPricingItem",
    note: "تعديل أسعار الخدمات والباقات والعمولات وحالة البيتا يعمل محلياً، والحفظ الحقيقي ينتظر pricing API.",
  },
  {
    id: "feature-flags",
    title: "Feature Flags والبيتا",
    route: "/dashboard/admin/features",
    status: "Backend-ready",
    contract: "AdminFeatureFlag",
    note: "التوجلز وإضافة المفاتيح تعمل محلياً فقط؛ runtime الحقيقي ينتظر feature-flags backend أو تحديث betaConfig.",
  },
  {
    id: "community-moderation",
    title: "إشراف المجتمع",
    route: "/dashboard/admin/community/moderation",
    status: "Backend-ready",
    contract: "CommunityModerationItem",
    note: "قرارات الاعتماد والرفض والتصعيد محلية، وتحتاج queue وaudit خادميين.",
  },
  {
    id: "pricing",
    title: "التسعير والباقات ورسوم المنصة",
    route: "/dashboard/admin/pricing",
    status: "Backend-ready",
    contract: "AdminPricingItem",
    note: "تعديل الأسعار والباقات وBeta locks ورسوم المنصة يعمل محلياً، ومصدر الإنتاج ينتظر Pricing API.",
  },
  {
    id: "audit-log",
    title: "سجل التدقيق",
    route: "/dashboard/admin/audit-log",
    status: "Risk",
    contract: "AdminAuditEvent",
    note: "الواجهة موجودة، لكن سجل before/after الحقيقي لا يعمل بدون مصدر خادمي.",
  },
  {
    id: "admin-access",
    title: "حماية لوحة الأدمن",
    route: "/dashboard/admin",
    status: "UI Working",
    contract: "UserTypeGuard",
    note: "حماية الواجهة موجودة، أما enforcement الخادمي فيأتي مع طبقة المصادقة.",
  },
];
