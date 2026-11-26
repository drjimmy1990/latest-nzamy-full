/**
 * adminNavItems.ts — the ONE list of admin console pages (file 15 row 54,
 * batch l9). Before it there were two lists that disagreed:
 *   - the console's own sidebar (components/admin/adminNavByRole.ts → NAV,
 *     rendered by AdminSidebar.tsx) had «بروفيلات الشركات» but not the roles,
 *     pricing or payments pages;
 *   - ADMIN_SIDEBAR (navigation.sidebars.primary.ts, drawn by SharedSidebar
 *     and searched by GlobalSearch when an admin is on /ai or /settings)
 *     lacked the companies list and linked the mock «طلبات السحب» and
 *     «النزاعات» pages with a «جديد» badge.
 * Both are now built from this list, so an item added here shows in both.
 *
 * l16 (owner package 25 Nov, main report §٨-2): the six sections of the new
 * admin map, in his order. A data-only regroup: every page kept its own href,
 * label and staff action (src/lib/auth/adminNavAccess.ts).
 *
 * Left out on purpose (the pages stay reachable by URL; none holds real data):
 *   /dashboard/admin/payouts, /dashboard/admin/disputes (mock, «قريباً»
 *   pages since l9 row 27), /dashboard/admin/system, /dashboard/admin/system/backup,
 *   /dashboard/admin/reports, /dashboard/admin/ai-usage/credits,
 *   /dashboard/admin/ai-usage/reports (DashboardComingSoon, owner ١١٥);
 *   l16 (§٣.١ / §٣.٤): /dashboard/admin/reviews,
 *   /dashboard/admin/provider-verification/firms and
 *   /dashboard/admin/sector-profiles (they showed invented entries; each says
 *   «قيد التفعيل» now), and /dashboard/admin/library-invitations (new codes are
 *   closed, owner q93; the page still lists the codes already issued).
 *
 * `icon` is a SharedSidebar icon name (components/dashboard/SidebarComponents.tsx
 * ICON_MAP); adminNavByRole.ts maps the same names to its own components.
 * Every href must be classified in src/lib/auth/adminNavAccess.ts.
 *
 * Pure (no imports), so `node --test` loads it.
 */

export interface AdminNavEntry {
  href: string;
  label: string;
  labelEn: string;
  icon: string;
  /** Active only on this exact path (the overview). */
  exact?: boolean;
}

export interface AdminNavSection {
  section: string;
  sectionEn: string;
  items: readonly AdminNavEntry[];
}

export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  {
    section: "لوحة القيادة والتحليلات",
    sectionEn: "Dashboard & Analytics",
    items: [
      { href: "/dashboard/admin", label: "نظرة عامة", labelEn: "Overview", icon: "ChartBar", exact: true },
      { href: "/dashboard/admin/revenue", label: "الإيرادات", labelEn: "Revenue", icon: "Money" },
      { href: "/dashboard/admin/audit-log", label: "سجل التدقيق", labelEn: "Audit Log", icon: "ClipboardText" },
    ],
  },
  {
    section: "العملاء والمنشآت",
    sectionEn: "Customers & Entities",
    items: [
      { href: "/dashboard/admin/users", label: "جميع المستخدمين", labelEn: "All Users", icon: "Users" },
      // «إضافة مستخدم» (/dashboard/admin/users/new) is not listed: no route creates an
      // account from the console yet, and the page said «تم إنشاء الحساب» without
      // sending anything (live check of 13 Nov, row 30). The page is «قيد التفعيل».
      { href: "/dashboard/admin/provider-verification", label: "تحقق المزودين", labelEn: "Provider KYC", icon: "ShieldCheck" },
      { href: "/dashboard/admin/business", label: "بروفيلات الشركات", labelEn: "Company Profiles", icon: "Buildings" },
    ],
  },
  {
    section: "الاشتراكات والفوترة والأسعار",
    sectionEn: "Subscriptions, Billing & Pricing",
    items: [
      { href: "/dashboard/admin/subscriptions", label: "الاشتراكات", labelEn: "Subscriptions", icon: "CreditCard" },
      { href: "/dashboard/admin/subscriptions/orders", label: "عمليات الدفع والاسترداد", labelEn: "Payments and Refunds", icon: "CreditCard" },
      { href: "/dashboard/admin/subscriptions/payments", label: "سجل المدفوعات", labelEn: "Payment History", icon: "Money" },
      { href: "/dashboard/admin/pricing", label: "إدارة الأسعار", labelEn: "Pricing Manager", icon: "Coins" },
      { href: "/dashboard/admin/subscriptions/coupons", label: "الكوبونات", labelEn: "Coupons", icon: "Tag" },
      { href: "/dashboard/admin/offers", label: "العروض", labelEn: "Offers", icon: "Gift" },
      { href: "/dashboard/admin/founder", label: "حملة المؤسس", labelEn: "Founder Campaign", icon: "Crown" },
      { href: "/dashboard/admin/entitlements", label: "منح الصلاحيات", labelEn: "Entitlements", icon: "Crown" },
      { href: "/dashboard/admin/entitlements/requests", label: "طلبات الترقية", labelEn: "Upgrade Requests", icon: "Tray" },
      { href: "/dashboard/admin/library-subscriptions", label: "اشتراكات المكتبة", labelEn: "Library Subscriptions", icon: "BookOpen" },
      { href: "/dashboard/admin/library-access", label: "المكتبة حسب نوع الحساب", labelEn: "Library by Account Type", icon: "BookOpen" },
    ],
  },
  {
    section: "العمليات والدعم والسوق",
    sectionEn: "Operations, Support & Market",
    items: [
      { href: "/dashboard/admin/service-orders", label: "طلبات الخدمات", labelEn: "Service Orders", icon: "Files" },
      { href: "/dashboard/admin/marketplace/orders", label: "طلبات السوق", labelEn: "Marketplace Orders", icon: "Storefront" },
      { href: "/dashboard/admin/tickets", label: "تذاكر الدعم", labelEn: "Support Tickets", icon: "Ticket" },
      { href: "/dashboard/admin/library-issue-reports", label: "بلاغات المكتبة", labelEn: "Library Reports", icon: "Flag" },
      { href: "/dashboard/admin/feature-requests", label: "طلبات الميزات", labelEn: "Feature Requests", icon: "Lightbulb" },
      { href: "/dashboard/admin/broadcasts", label: "البث والإشعارات", labelEn: "Broadcasts", icon: "Megaphone" },
    ],
  },
  {
    section: "المعرفة والمحتوى والذكاء",
    sectionEn: "Knowledge, Content & AI",
    items: [
      { href: "/dashboard/admin/content/laws", label: "المكتبة القانونية", labelEn: "Library", icon: "BookOpen" },
      // l14 (owner file 07 §2, approved 23 Nov): where the library's links are poor
      { href: "/dashboard/admin/library-links-coverage", label: "تغطية الإحالات", labelEn: "Links Coverage", icon: "TreeStructure" },
      { href: "/dashboard/admin/graph-explorer", label: "مستكشف الجراف القانوني", labelEn: "Legal Graph Explorer", icon: "TreeStructure" },
      // l13 (owner Q190–Q195): «المجلة التشريعية» — entries, approval, the monthly issue
      { href: "/dashboard/admin/journal", label: "المجلة التشريعية", labelEn: "Legislative Journal", icon: "Article" },
      { href: "/dashboard/admin/content/articles", label: "المدونة القانونية", labelEn: "Articles", icon: "Article" },
      { href: "/dashboard/admin/community/moderation", label: "إشراف المجتمع", labelEn: "Community Moderation", icon: "Flag" },
      { href: "/dashboard/admin/community/reports", label: "بلاغات المجتمع", labelEn: "Community Reports", icon: "Flag" },
      { href: "/dashboard/admin/ai-usage", label: "استخدام الذكاء الاصطناعي", labelEn: "AI Usage", icon: "Robot" },
    ],
  },
  {
    section: "الحوكمة والأمان والنظام",
    sectionEn: "Governance, Security & System",
    items: [
      { href: "/dashboard/admin/team", label: "فريق نظامي", labelEn: "Nezamy Team", icon: "UsersFour" },
      { href: "/dashboard/admin/users/roles", label: "الأدوار والصلاحيات", labelEn: "Roles & Permissions", icon: "Key" },
      { href: "/dashboard/admin/security", label: "الأمان", labelEn: "Security", icon: "ShieldCheck" },
      { href: "/dashboard/admin/settings", label: "إعدادات المنصة", labelEn: "Platform Settings", icon: "Gear" },
      { href: "/dashboard/admin/features", label: "مفاتيح الميزات", labelEn: "Feature switches", icon: "ToggleRight" },
      { href: "/dashboard/admin/platform", label: "مركز تحكم المنصة", labelEn: "Platform Control", icon: "Globe" },
      // l9 testinfra (owner file 19 §1ج): tags, «مسح دفعة الاختبار», the test mail sink
      { href: "/dashboard/admin/test-batches", label: "دفعات الاختبار", labelEn: "Test Batches", icon: "ClipboardText" },
    ],
  },
];
