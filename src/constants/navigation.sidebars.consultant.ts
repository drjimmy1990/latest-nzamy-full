import type { SidebarGroup } from "./navigation.types";

/**
 * The independent legal consultant's sidebar (owner decision, 22–23 Nov 2026):
 * the library and what hangs off it, nothing of the lawyer's workspace.
 * Every href here must be on the consultant allowlist (consultantScope.ts);
 * navigation.consultant.test.ts fails on one that is not.
 *
 * «السوق» stays because the consultant is a client there, like an individual:
 * he may browse and ask for a service; the provider side is never opened.
 * «الاستشارات» is not here: giving legal consultations without a licence to
 * practise is the very thing the restriction exists to prevent.
 */
export const CONSULTANT_SIDEBAR: SidebarGroup[] = [
  {
    items: [
      { label: "نظرة عامة", labelEn: "Overview", href: "/dashboard/lawyer", icon: "SquaresFour" },
    ],
  },
  {
    title: "المكتبة", titleEn: "Library",
    items: [
      { label: "المكتبة القانونية", labelEn: "Legal Library", href: "/laws", icon: "BookOpen" },
      { label: "مكتبتي", labelEn: "My Library", href: "/laws/my", icon: "Star" },
    ],
  },
  {
    title: "السوق", titleEn: "Marketplace",
    items: [
      { label: "تصفح السوق", labelEn: "Browse", href: "/marketplace", icon: "MagnifyingGlass" },
      { label: "انشر طلباً جديداً", labelEn: "Post Request", href: "/marketplace/post", icon: "PencilSimple" },
    ],
  },
  {
    title: "حسابي", titleEn: "Account",
    items: [
      { label: "انضم إلى مكتب أو محامٍ", labelEn: "Join a firm or lawyer", href: "/dashboard/lawyer/join-office", icon: "Handshake" },
      { label: "الملف المهني", labelEn: "My Profile", href: "/dashboard/lawyer/profile", icon: "UserCircle" },
      { label: "الإشعارات", labelEn: "Notifications", href: "/notifications", icon: "Bell" },
      { label: "الإعدادات", labelEn: "Settings", href: "/settings", icon: "GearSix" },
    ],
  },
];
