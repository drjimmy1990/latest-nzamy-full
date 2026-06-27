import type { SidebarGroup } from "./navigation.types";

export * from "./navigation.sidebars.legal";
export * from "./navigation.sidebars.business";

// ── Individual Sidebar (عميل فرد) ─────────────────────────────────────────────
// UX DECISION (2026-05-19): Action-First — sidebar links only to high-level entry points.
// Sub-services (representation, notarization, etc.) live inside /services page only.
export const INDIVIDUAL_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "لوحة التحكم", labelEn: "Dashboard", href: "/dashboard/client", icon: "SquaresFour" },
    ],
  },

  // ① الخدمات — أهم شيء يحتاجه العميل
  {
    title: "الخدمات القانونية", titleEn: "Legal Services",
    collapsible: false,
    items: [
      { label: "اطلب خدمة جديدة", labelEn: "Request a Service", href: "/dashboard/client/services", icon: "Plus", badge: "ابدأ هنا" },
      { label: "طلباتي",           labelEn: "My Requests",        href: "/dashboard/client/requests", icon: "ListChecks" },
      { label: "ابحث عن محامٍ",    labelEn: "Find a Lawyer",       href: "/dashboard/client/find-lawyer", icon: "MagnifyingGlass" },
    ],
  },

  // ② ملفاتي — متابعة ما لدى العميل
  {
    title: "ملفاتي", titleEn: "My Files",
    items: [
      { label: "قضاياي",      labelEn: "My Cases",      href: "/dashboard/client/cases",        icon: "Gavel" },
      { label: "استشاراتي",   labelEn: "Consultations", href: "/dashboard/client/consultation",  icon: "ChatDots" },
      { label: "عقودي",       labelEn: "My Contracts",  href: "/dashboard/client/contracts",     icon: "FileText" },
      { label: "مستنداتي",    labelEn: "My Documents",  href: "/dashboard/client/documents",     icon: "FolderOpen" },
      { label: "رسائلي",      labelEn: "Messages",      href: "/dashboard/client/messages",      icon: "ChatCircle", badge: "2" },
    ],
  },

  // ③ نظامي AI — أدوات ذكية (قابلة للطي)
  {
    title: "نظامي AI", titleEn: "Nzamy AI",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "المستشار الذكي",       labelEn: "AI Consultant",      href: "/ai/consult",               icon: "Brain" },
      { label: "محترف العقود لايت",   labelEn: "Contract Drafter",   href: "/ai/contract-drafter",     icon: "FileText" },
      { label: "الفاحص الذكي",        labelEn: "Doc Analyzer",       href: "/ai/analyze",              icon: "Scan" },
      { label: "صائغ الخطابات",       labelEn: "Letter Drafter",     href: "/dashboard/client/letters", icon: "PencilLine" },
    ],
  },

  // ④ Celebrity Layer — يظهر فقط للمشاهير المُرقّين
  {
    title: "سفير نظامي ⭐", titleEn: "Nzamy Ambassador",
    collapsible: true,
    defaultOpen: true,
    gateKey: "celebrity",
    items: [
      { label: "لوحة الإحصائيات",  labelEn: "Analytics",     href: "/dashboard/client/celebrity/status",    icon: "ChartLine", badge: "جديد" },
      { label: "إحالاتي وعمولاتي", labelEn: "Referrals",     href: "/dashboard/client/celebrity/referrals", icon: "Gift" },
      { label: "رمز الإحالة",       labelEn: "Referral Code", href: "/dashboard/client/celebrity/code",      icon: "QrCode" },
    ],
  },

  // ⑤ الذيل — باقة + مجتمع + إعدادات
  {
    items: [
      { label: "باقتي",            labelEn: "My Plan",         href: "/dashboard/client/wallet",   icon: "Crown",      divider: true },
      { label: "ربعي",             labelEn: "My Group",        href: "/dashboard/client/my-group", icon: "UsersThree", badge: "نشط", requiresClientGroup: true },
      { label: "المجتمع القانوني", labelEn: "Legal Community", href: "/community",                 icon: "Users" },
      { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws",                     icon: "BookOpen" },
      { label: "برنامج الإحالة",   labelEn: "Referral",        href: "/dashboard/client/referral", icon: "Gift" },
      { label: "ميديا نظامي",      labelEn: "Nzamy Media",     href: "/media",                     icon: "PlayCircle",  badge: "جديد" },
      { label: "الإشعارات",        labelEn: "Notifications",   href: "/notifications",             icon: "Bell" },
      { label: "الإعدادات",        labelEn: "Settings",        href: "/settings",                  icon: "GearSix" },
    ],
  },
];

// ── Admin Sidebar (مدير النظام) ───────────────────────────────────────────────
export const ADMIN_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "لوحة التحكم",      labelEn: "Dashboard",      href: "/dashboard/admin",               icon: "SquaresFour" },
    ],
  },
  {
    title: "إدارة المستخدمين", titleEn: "User Management",
    items: [
      { label: "كل المستخدمين",     labelEn: "All Users",       href: "/dashboard/admin/users",                  icon: "Users" },
      { label: "إضافة مستخدم",      labelEn: "Add User",        href: "/dashboard/admin/users/new",              icon: "UserCirclePlus" },
      { label: "الأدوار والصلاحيات",labelEn: "Roles & Perms",   href: "/dashboard/admin/users/roles",            icon: "Key" },
      { label: "تحقق المزودين",     labelEn: "Provider KYC",    href: "/dashboard/admin/provider-verification",  icon: "SealCheck",          badge: "جديد" },
      { label: "شركات المحاماة",     labelEn: "Law Firm Providers", href: "/dashboard/admin/provider-verification/firms", icon: "Scales", badge: "Beta" },
      { label: "بروفيلات القطاعات",  labelEn: "Sector Profiles", href: "/dashboard/admin/sector-profiles",        icon: "Globe", badge: "Beta" },
    ],
  },
  {
    title: "الاشتراكات والإيرادات", titleEn: "Subscriptions & Revenue",
    items: [
      { label: "الاشتراكات النشطة",  labelEn: "Active Subs",     href: "/dashboard/admin/subscriptions",          icon: "CreditCard" },
      { label: "الكوبونات والخصومات",labelEn: "Coupons",         href: "/dashboard/admin/subscriptions/coupons",  icon: "Tag" },
      { label: "سجل المدفوعات",      labelEn: "Payment History", href: "/dashboard/admin/subscriptions/payments",  icon: "Money" },
      { label: "تقارير الإيرادات",   labelEn: "Revenue Reports", href: "/dashboard/admin/revenue",                icon: "ChartLine" },
      { label: "إدارة الأسعار",      labelEn: "Pricing Manager", href: "/dashboard/admin/pricing",                icon: "CurrencyCircleDollar", badge: "جديد" },
    ],
  },
  {
    title: "العمليات المالية", titleEn: "Financial Operations",
    items: [
      { label: "إدارة الضمان",       labelEn: "Escrow",          href: "/dashboard/admin/escrow",                 icon: "Vault",              badge: "جديد" },
      { label: "طلبات السحب",        labelEn: "Payouts",         href: "/dashboard/admin/payouts",                icon: "ArrowSquareOut",     badge: "جديد" },
      { label: "النزاعات",           labelEn: "Disputes",        href: "/dashboard/admin/disputes",               icon: "Scales",             badge: "جديد" },
    ],
  },
  {
    title: "سوق المهنيين", titleEn: "Marketplace",
    items: [
      { label: "طلبات السوق",        labelEn: "Orders",          href: "/dashboard/admin/marketplace/orders",     icon: "Storefront",         badge: "جديد" },
    ],
  },
  {
    title: "استخدام الذكاء الاصطناعي", titleEn: "AI Usage",
    items: [
      { label: "إحصائيات AI",         labelEn: "AI Analytics",    href: "/dashboard/admin/ai-usage",              icon: "Robot" },
      { label: "استهلاك الذكاء الاصطناعي",labelEn: "AI Usage",      href: "/dashboard/admin/ai-usage/credits",       icon: "Coins" },
      { label: "تقارير الجودة",       labelEn: "Quality",           href: "/dashboard/admin/ai-usage/reports",       icon: "ChartLineUp" },
    ],
  },
  {
    title: "الدعم والتواصل", titleEn: "Support & Comms",
    items: [
      { label: "تذاكر الدعم",          labelEn: "Support Tickets", href: "/dashboard/admin/tickets",                icon: "Ticket" },
      { label: "رسائل البث",           labelEn: "Broadcasts",      href: "/dashboard/admin/broadcasts",             icon: "Megaphone" },
      { label: "تقييمات المستخدمين",   labelEn: "Reviews",         href: "/dashboard/admin/reviews",                icon: "Star" },
    ],
  },
  {
    title: "النظام والأمان", titleEn: "System & Security",
    items: [
      { label: "مركز تحكم المنصة",      labelEn: "Platform Control", href: "/dashboard/admin/platform",             icon: "Globe",                 badge: "S101" },
      { label: "سجل التدقيق",          labelEn: "Audit Log",       href: "/dashboard/admin/audit-log",             icon: "ClockCounterClockwise", badge: "مُطوَّر" },
      { label: "الأمان والحماية",      labelEn: "Security",        href: "/dashboard/admin/security",              icon: "ShieldCheck",            badge: "مُطوَّر" },
      { label: "سجل النظام",           labelEn: "System Log",      href: "/dashboard/admin/system",                icon: "Terminal" },
      { label: "النسخ الاحتياطي",      labelEn: "Backup",          href: "/dashboard/admin/system/backup",          icon: "Database" },
      { label: "مركز التقارير",        labelEn: "Reports Center",  href: "/dashboard/admin/reports",                icon: "ChartBar",               badge: "جديد" },
    ],
  },
  {
    title: "سفراء نظامي", titleEn: "Ambassadors",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "كل السفراء",        labelEn: "All Ambassadors",  href: "/dashboard/admin/celebrities",             icon: "Star" },
      { label: "ترقية مستخدم",      labelEn: "Upgrade User",     href: "/dashboard/admin/celebrities/upgrade",     icon: "UserCirclePlus", badge: "جديد" },
      { label: "تقرير الإحالات",    labelEn: "Referrals Report", href: "/dashboard/admin/celebrities/referrals",   icon: "ChartBar" },
    ],
  },
  {
    title: "المحتوى", titleEn: "Content",
    items: [
      { label: "المكتبة القانونية",  labelEn: "Library",         href: "/dashboard/admin/content/laws",            icon: "BookOpen", badge: "Phase 2" },
      { label: "المقالات",           labelEn: "Articles",        href: "/dashboard/admin/content/articles",        icon: "Article",  badge: "Phase 2" },
    ],
  },
  {
    title: "فريق نظامي", titleEn: "Nzamy Team",
    items: [
      { label: "إدارة الفريق",       labelEn: "Team",            href: "/dashboard/admin/team",                    icon: "UsersFour", badge: "Phase 2" },
      { label: "الميزات (Flags)",    labelEn: "Feature Flags",   href: "/dashboard/admin/features",                icon: "ToggleRight", badge: "Phase 2" },
    ],
  },
  {
    items: [
      { label: "إعدادات النظام",       labelEn: "System Settings", href: "/settings",                              icon: "GearSix", divider: true },
    ],
  },
];
