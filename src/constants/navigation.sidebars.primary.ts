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
      // ── لماذا اختفى «ابحث عن محامٍ» من هنا ─────────────────────────────────
      // Until 2026-08-27 this slot was
      //   { label: "ابحث عن محامٍ", href: "/dashboard/client/find-lawyer" }
      // and it promised a directory the beta cannot deliver.
      //
      // THE REASON THAT STANDS ON ITS OWN, and a fact about this code:
      // BETA_MONOPOLY_MODE (src/lib/betaConfig.ts) is true. نظامي is the sole
      // provider for the whole beta, so there is no second lawyer to search
      // for — and the item directly below, «احجز استشارة مع المكتب», is the
      // route to the ones there are. A permanent entry to a directory of
      // nobody is a dead end dressed as a feature.
      //
      // THE SUPPORTING FACT IS ABOUT DATA, ON A DATE, AND WAS NOT CHECKED FROM
      // HERE. GET /api/v1/lawyers filters on verification_status = 'verified'
      // AND marketplace_visible = true. On 2026-08-27 the controller of this
      // work read lawyer_profiles directly — a REST call with the service key,
      // not an inference drawn from this file — and reported all five rows
      // still `pending` / `false`, so the directory returned zero rows that day:
      // however the client searched, the page could only render empty. That is
      // a statement about DATA at a moment, not about code, and it expires the
      // first time an admin verifies a lawyer and flips marketplace_visible.
      // When it does, the paragraph above is what still holds.
      //
      // WHY THE ITEM IS DELETED HERE RATHER THAN FILTERED AT RUNTIME: the other
      // candidate was the BETA_MONOPOLY_MODE `hiddenHrefs` list
      // (navigation.sidebars.ts:455), which strips hrefs from every sidebar
      // when the flag is on. Two costs decided it: that file is not part of
      // this change, and a runtime filter puts the removal a file away from the
      // restore instructions below, which are the thing most likely to be
      // needed and missed. Deleting the item where it is declared keeps the
      // decision and its expiry date in one place. The trade is that the
      // removal does not lift itself when the flag flips — hence the note.
      //
      // THE COST TODAY: /dashboard/client/find-lawyer is now reachable only by
      // typing the URL. It renders empty for everyone while the flag is on, so
      // nothing is lost; the page was left in the tree untouched on purpose.
      //
      // WHEN BETA_MONOPOLY_MODE GOES false: put «ابحث عن محامٍ» back ALONGSIDE
      // «احجز استشارة مع المكتب», not in place of it — booking the office
      // directly stays useful in a multi-vendor world.
      { label: "احجز استشارة مع المكتب", labelEn: "Book with Our Office", href: "/dashboard/client/consultation/new", icon: "CalendarCheck" },
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
      // NO BADGE. It was a hardcoded `badge: "2"`, painted on every client's
      // sidebar on every visit — including a client whose inbox was empty and
      // one who had just read everything. Nothing in the app counts unread
      // messages: /api/v1/dashboard/summary returns `unreadNotifications`
      // (notifications, a different table), and the sidebar never reads even
      // that. A number that is not a count is worse than no number, because a
      // permanent "2" also teaches the client to ignore the badge on the day it
      // finally means something. Put it back when a real unread count reaches
      // this component — chat_participants.last_read_at against
      // chat_messages.created_at is the query it needs.
      { label: "رسائلي",      labelEn: "Messages",      href: "/dashboard/client/messages",      icon: "ChatCircle" },
    ],
  },

  // ③ نظامي AI — أدوات ذكية (قابلة للطي)
  {
    title: "نظامي AI", titleEn: "Nzamy AI",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "المستشار الذكي",       labelEn: "AI Consultant",      href: "/ai/consult",               icon: "Brain" },
      { label: "محترف العقود المختصر",   labelEn: "Contract Drafter",   href: "/ai/contract-drafter",     icon: "FileText" },
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
      // ── قريباً, because the PAGE says قريباً ──────────────────────────────
      // Six nav rows pointed at a page rendering DashboardComingSoon while
      // promising something else in the badge slot. Two were actively wrong
      // rather than merely silent:
      //
      //   «ربعي»            badged «نشط»  — ACTIVE, over a coming-soon page
      //   «لوحة الإحصائيات» badged «جديد» — NEW, over a coming-soon page
      //
      // …and four carried no badge at all, so the nav read as a working feature
      // until you clicked it. The matrix already ordered exactly this for two
      // other unfinished pages (rows 126 and 134); these are the ones that fix
      // did not reach. A nav entry is a promise about the page under it.
      { label: "لوحة الإحصائيات",  labelEn: "Analytics",     href: "/dashboard/client/celebrity/status",    icon: "ChartLine", badge: "قريباً" },
      { label: "إحالاتي وعمولاتي", labelEn: "Referrals",     href: "/dashboard/client/celebrity/referrals", icon: "Gift", badge: "قريباً" },
      { label: "رمز الإحالة",       labelEn: "Referral Code", href: "/dashboard/client/celebrity/code",      icon: "QrCode", badge: "قريباً" },
    ],
  },

  // ⑤ الذيل — محفظة + مجتمع + إعدادات
  {
    items: [
      // «محفظتي», not «باقتي» — and Wallet, not Crown.
      // src/app/dashboard/client/wallet/page.tsx is a wallet: a balance, the
      // coupon list, referral rewards and a transaction log. It holds no plan,
      // no subscription and no upgrade flow; the word «باقة» does not occur
      // anywhere in the file. Labelling it «باقتي» promised a plan page that
      // does not exist behind this link. The plans are public, at /pricing,
      // and the client dashboard links there from its plan card.
      { label: "محفظتي",           labelEn: "My Wallet",       href: "/dashboard/client/wallet",   icon: "Wallet",     divider: true },
      { label: "ربعي",             labelEn: "My Group",        href: "/dashboard/client/my-group", icon: "UsersThree", badge: "قريباً", requiresClientGroup: true },
      { label: "المجتمع القانوني", labelEn: "Legal Community", href: "/community",                 icon: "Users" },
      // «المكتبة القانونية» → /laws stood here (owner item ٥٢). Removed from the
      // INDIVIDUAL sidebar only. The library itself is untouched and stays
      // linked for lawyers and firms (navigation.sidebars.legal.ts) and on the
      // public site; /laws is not redirected and does not 404. What this
      // removes is the claim that a raw statute browser is part of an
      // individual client’s own workspace.
      { label: "برنامج الإحالة",   labelEn: "Referral",        href: "/dashboard/client/referral", icon: "Gift", badge: "قريباً" },
      { label: "ميديا نظامي",      labelEn: "Nzamy Media",     href: "/media",                     icon: "PlayCircle",  badge: "قريباً" },
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
      { label: "شركات المحاماة",     labelEn: "Law Firm Providers", href: "/dashboard/admin/provider-verification/firms", icon: "Scales", badge: "تجريبي" },
      { label: "بروفيلات القطاعات",  labelEn: "Sector Profiles", href: "/dashboard/admin/sector-profiles",        icon: "Globe", badge: "تجريبي" },
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
      { label: "مركز تحكم المنصة",      labelEn: "Platform Control", href: "/dashboard/admin/platform",             icon: "Globe" },
      { label: "إعدادات المنصة",        labelEn: "Platform Settings", href: "/dashboard/admin/settings",            icon: "Gear",                   badge: "جديد" },
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
      { label: "المكتبة القانونية",  labelEn: "Library",         href: "/dashboard/admin/content/laws",            icon: "BookOpen" },
      { label: "المقالات",           labelEn: "Articles",        href: "/dashboard/admin/content/articles",        icon: "Article" },
    ],
  },
  {
    title: "فريق نظامي", titleEn: "Nzamy Team",
    items: [
      { label: "إدارة الفريق",       labelEn: "Team",            href: "/dashboard/admin/team",                    icon: "UsersFour" },
      { label: "الميزات (Flags)",    labelEn: "Feature Flags",   href: "/dashboard/admin/features",                icon: "ToggleRight" },
    ],
  },
  {
    items: [
      { label: "إعدادات النظام",       labelEn: "System Settings", href: "/settings",                              icon: "GearSix", divider: true },
    ],
  },
];
