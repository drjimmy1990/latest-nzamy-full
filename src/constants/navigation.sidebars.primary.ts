import type { SidebarGroup } from "./navigation.types";
// Relative with `.ts` so `node --test` can load this chain (see navigation.sidebars.ts).
import type { StaffRole } from "../lib/auth/staffRoles.ts";
import { filterNavGroupsByRole } from "../lib/auth/adminNavAccess.ts";
import { ADMIN_NAV_SECTIONS } from "./adminNavItems.ts";

export * from "./navigation.sidebars.legal.ts";
export * from "./navigation.sidebars.business.ts";

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
    title: "ذكاء نظامي", titleEn: "Nezamy AI",
    collapsible: true,
    defaultOpen: false,
    items: [
      { label: "المستشار الذكي",       labelEn: "AI Consultant",      href: "/ai/consult",               icon: "Brain", badge: "قريباً" },
      // Owner ٤١٧ / ٤٤٣ (8 Nov 2026): «محترف العقود المختصر» (/ai/contract-drafter) is a lawyer and firm tool — no row here.
      { label: "الفاحص الذكي",        labelEn: "Doc Analyzer",       href: "/ai/analyze",              icon: "Scan", badge: "قريباً" },
      { label: "صائغ الخطابات",       labelEn: "Letter Drafter",     href: "/dashboard/client/letters", icon: "PencilLine" },
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
      { label: "ميديا نظامي",      labelEn: "Nezamy Media",     href: "/media",                     icon: "PlayCircle",  badge: "قريباً" },
      { label: "الإشعارات",        labelEn: "Notifications",   href: "/notifications",             icon: "Bell" },
      { label: "الإعدادات",        labelEn: "Settings",        href: "/settings",                  icon: "GearSix" },
    ],
  },
];

// ── Admin Sidebar (مدير النظام) ───────────────────────────────────────────────
// File 15 row 54 (batch l9): built from the ONE admin list
// (./adminNavItems.ts) that the console's own sidebar (AdminSidebar → NAV)
// is built from too. The mock «طلبات السحب» / «النزاعات» links and the
// «قريباً» pages are no longer offered; «بروفيلات الشركات» is.
export const ADMIN_SIDEBAR: SidebarGroup[] = [
  ...ADMIN_NAV_SECTIONS.map((s): SidebarGroup => ({
    title: s.section,
    titleEn: s.sectionEn,
    items: s.items.map((i) => ({ label: i.label, labelEn: i.labelEn, href: i.href, icon: i.icon })),
  })),
  {
    items: [
      { label: "إعدادات النظام",       labelEn: "System Settings", href: "/settings",                              icon: "GearSix", divider: true },
    ],
  },
];

/**
 * ADMIN_SIDEBAR for one staff role (owner answer ٢١٠, Task 3.4): the admin
 * sees only the tools their role may use (src/lib/auth/adminNavAccess.ts).
 * super_admin, and a null role (not readable in the browser — the server
 * still enforces), get every item; the personal /settings is never hidden.
 */
export function adminSidebarForRole(role: StaffRole | null | undefined): SidebarGroup[] {
  return filterNavGroupsByRole(ADMIN_SIDEBAR, role);
}
