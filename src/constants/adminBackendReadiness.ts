import type { AdminReadinessStatus } from "@/types/adminBackendReady";

/**
 * The admin platform page's readiness list (/dashboard/admin/platform).
 *
 * S5-4 (batch l11-misc, owner rule «لا مصطلحات تقنية في الواجهة»): `title` and
 * `note` are shown to the admin, so they are plain Arabic — no route, API,
 * type or library names. `status` is an internal key the page turns into
 * Arabic (ADMIN_READINESS_LABEL_AR), and `contract` is a code reference the page no
 * longer prints. Statuses were re-checked against the pages on 20 Nov 2026:
 * articles, community moderation and the audit log now save and read on the
 * server.
 */
/** The Arabic label of each readiness key, wherever an admin page shows one. */
export const ADMIN_READINESS_LABEL_AR: Readonly<Record<AdminReadinessStatus, string>> = Object.freeze({
  working: "يعمل",
  no_save: "واجهة دون حفظ",
  no_ui: "بلا واجهة",
  risk: "خطر",
});

export interface AdminBackendReadinessSurface {
  id: string;
  title: string;
  route: string;
  status: AdminReadinessStatus;
  /** A code reference for developers; not rendered. */
  contract: string;
  note: string;
}

export const ADMIN_BACKEND_READINESS: AdminBackendReadinessSurface[] = [
  {
    id: "coupons",
    title: "الكوبونات والخصومات",
    route: "/dashboard/admin/subscriptions/coupons",
    status: "working",
    contract: "AdminCoupon",
    note: "إضافة الكوبونات وتعديلها وإيقافها تُحفظ فعلاً، ولكل كوبون سجلّ استخدام.",
  },
  {
    id: "team",
    title: "فريق نظامي والمشرفون",
    route: "/dashboard/admin/team",
    status: "working",
    contract: "AdminTeamMember",
    // Owner answer ٢١٠ (Task 3.4): three staff roles in platform_staff
    // (20261019_30), enforced on every admin write by requireStaff.
    note: "الدعوات وتعيين الأدوار (مشرف رئيسي / عمليات / مراجع) تُحفظ فعلاً، ويُتحقَّق من دور الموظف في كل إجراء إداري.",
  },
  {
    id: "business-profiles",
    title: "ملفات الشركات التجارية",
    route: "/dashboard/admin/business",
    status: "no_save",
    contract: "BusinessProfileContract",
    note: "قائمة الشركات تُقرأ من حسابات المنصة، أما حجم الشركة وهيكلها القانوني وخدماتها فتُعرض هنا ولا تُعدَّل منها بعد.",
  },
  {
    id: "firm-provider-profiles",
    title: "ملفات شركات المحاماة",
    route: "/dashboard/admin/provider-verification/firms",
    status: "no_save",
    contract: "FirmProfileContract + FirmPlanContract + FirmPointsWallet",
    note: "الاشتراك السنوي والمقاعد والنقاط والأدوار تُعرض هنا ولا تُعدَّل من هذه الصفحة بعد.",
  },
  {
    id: "sector-profiles",
    title: "ملفات الجهات الحكومية والجمعيات والمنشآت الصغيرة",
    route: "/dashboard/admin/sector-profiles",
    status: "no_save",
    contract: "GovernmentProfileContract + NgoProfileContract + MicroProfileContract + SectorPlanContract",
    note: "تُعرض هنا للاطلاع فقط؛ لم تُفعَّل لهذه الجهات بعد الفوترة ولا الصلاحيات ولا الدخول الموحَّد.",
  },
  {
    id: "articles",
    title: "مقالات المدونة",
    route: "/dashboard/admin/content/articles",
    status: "working",
    contract: "PlatformContentItem",
    note: "إنشاء المقالات وتعديلها وأرشفتها وحذفها تُحفظ فعلاً وتظهر في المدونة.",
  },
  {
    id: "laws",
    title: "المكتبة القانونية",
    route: "/dashboard/admin/content/laws",
    status: "no_save",
    contract: "LegalLibrarySystem",
    note: "تعديل الأنظمة والمواد من هذه الصفحة لم يُربط بعد؛ المكتبة تُحمَّل بأداة التحميل المعتمدة بعد مراجعة المصادر.",
  },
  {
    id: "pricing",
    title: "التسعير ورسوم المنصة",
    route: "/dashboard/admin/pricing",
    status: "no_save",
    contract: "AdminPricingCatalogRow",
    // S6-T7/T8: the client services' prices go through
    // /api/v1/admin/pricing-catalog (requireStaff settings.write, audited);
    // commission rates in src/lib/pricing/commission.ts (owner ٤٢١).
    note: "أسعار خدمات العملاء تُحفظ على الخادم لمن يملك صلاحية تعديل الإعدادات، وكل تعديل يُسجَّل في سجل الإدارة. الباقات والشحن من جدول الأسعار المعتمد وتتغيّر مع تحديث المنصة، والسوق قريباً؛ نسب عمولته: ٥٪ للمؤسسين وشركات المحاماة المتكاملة، و٧٪ للمشتركين، و١٥٪ للحسابات المجانية (قرار المالك ٤٢١).",
  },
  {
    id: "feature-flags",
    title: "مفاتيح الميزات",
    route: "/dashboard/admin/features",
    status: "working",
    contract: "FeatureFlags (platform_settings.feature_flags)",
    // O22 (batch l11-misc): src/lib/featureFlags/*.
    note: "مفتاح «مساعد نظامي» يُحفظ على الخادم ويسري على الموقع خلال دقيقة، وكل تغيير يُسجَّل في سجل الإدارة. مفتاحا المرحلة التجريبية ثابتان ويتغيّران مع الإطلاق الكامل فقط.",
  },
  {
    id: "community-moderation",
    title: "إشراف المجتمع",
    route: "/dashboard/admin/community/moderation",
    status: "working",
    contract: "CommunityModerationItem",
    note: "قرارات الاعتماد والرفض والتصعيد تُحفظ فعلاً، وإعدادات الإشراف تُعدَّل من الصفحة نفسها.",
  },
  {
    id: "pricing",
    title: "التسعير والباقات ورسوم المنصة",
    route: "/dashboard/admin/pricing",
    status: "no_save",
    contract: "AdminPricingCatalogRow",
    note: "أسعار خدمات العملاء تُحفظ على الخادم وتظهر للعملاء فور الحفظ؛ الباقات والشحن للقراءة فقط من جدول الأسعار المعتمد، ورسوم المنصة قريباً.",
  },
  {
    id: "audit-log",
    title: "سجل التدقيق",
    route: "/dashboard/admin/audit-log",
    status: "working",
    contract: "AdminAuditEvent",
    note: "يعرض العمليات الإدارية الحساسة كما حُفظت، ومعها القيمة قبل التعديل وبعده حيث تتوفر.",
  },
  {
    id: "admin-access",
    title: "حماية لوحة الإدارة",
    route: "/dashboard/admin",
    status: "working",
    contract: "UserTypeGuard",
    note: "لوحة الإدارة محمية في المتصفح وعلى الخادم، وكل إجراء إداري يتحقق من دور الموظف قبل تنفيذه.",
  },
];
