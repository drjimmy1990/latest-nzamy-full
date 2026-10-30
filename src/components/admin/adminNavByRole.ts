/**
 * The admin console's sidebar (rendered by ./AdminSidebar.tsx) and its role
 * filter (owner answer ٢١٠, Task 3.4): each staff role is shown only its own
 * tools. Which page needs which action is src/lib/auth/adminNavAccess.ts.
 *
 * Plain .ts (no JSX, relative imports only) so `node --test` can load it
 * (./adminNavByRole.test.ts).
 */
import {
  ChartBar, Users, CreditCard, Robot, Ticket,
  Gear, Buildings,
  Scales, ShieldCheck, Database, ClipboardText,
  Money, Megaphone, Star, Globe, BookOpen, Article,
  Storefront, ToggleRight, Flag, Tag, UsersFour, Crown, Tray, Files,
  Lightbulb,
} from "@phosphor-icons/react";
import type { StaffRole } from "../../lib/auth/staffRoles.ts";
import { filterNavGroupsByRole } from "../../lib/auth/adminNavAccess.ts";

export const NAV = [
  {
    section: "الرئيسية",
    items: [
      { href: "/dashboard/admin",         icon: ChartBar,      label: "نظرة عامة", exact: true },
      { href: "/dashboard/admin/revenue", icon: Money,          label: "الإيرادات" },
    ],
  },
  {
    section: "المستخدمون",
    items: [
      { href: "/dashboard/admin/users",         icon: Users,     label: "جميع المستخدمين" },
      { href: "/dashboard/admin/business",      icon: Buildings, label: "بروفيلات الشركات" },
      { href: "/dashboard/admin/provider-verification", icon: ShieldCheck, label: "تحقق المزودين" },
      { href: "/dashboard/admin/provider-verification/firms", icon: Scales, label: "شركات المحاماة" },
      { href: "/dashboard/admin/sector-profiles", icon: Globe, label: "بروفيلات القطاعات" },
      { href: "/dashboard/admin/subscriptions", icon: CreditCard, label: "الاشتراكات" },
      { href: "/dashboard/admin/subscriptions/orders", icon: CreditCard, label: "عمليات الدفع والاسترداد" },
      { href: "/dashboard/admin/subscriptions/coupons", icon: Tag, label: "الكوبونات" },
      { href: "/dashboard/admin/entitlements", icon: Crown, label: "منح الصلاحيات" },
      { href: "/dashboard/admin/entitlements/requests", icon: Tray, label: "طلبات الترقية" },
      { href: "/dashboard/admin/team", icon: UsersFour, label: "فريق نظامي" },
    ],
  },
  {
    section: "النظام",
    items: [
      { href: "/dashboard/admin/ai-usage",   icon: Robot,   label: "استخدام الذكاء الاصطناعي" },
      { href: "/dashboard/admin/service-orders", icon: Files, label: "طلبات الخدمات" },
      { href: "/dashboard/admin/tickets",    icon: Ticket,  label: "تذاكر الدعم" },
      { href: "/dashboard/admin/feature-requests", icon: Lightbulb, label: "طلبات الميزات" },
      { href: "/dashboard/admin/broadcasts", icon: Megaphone, label: "البث والإشعارات" },
      { href: "/dashboard/admin/reviews",    icon: Star,    label: "التقييمات" },
    ],
  },
  {
    section: "المنصة والمحتوى",
    items: [
      { href: "/dashboard/admin/platform",          icon: Globe,      label: "مركز تحكم المنصة" },
      { href: "/dashboard/admin/content/laws",      icon: BookOpen,   label: "المكتبة القانونية" },
      { href: "/dashboard/admin/library-issue-reports", icon: Flag,   label: "بلاغات المكتبة" },
      { href: "/dashboard/admin/content/articles",  icon: Article,    label: "المدونة القانونية" },
      { href: "/dashboard/admin/community/moderation", icon: Flag, label: "إشراف المجتمع" },
      { href: "/dashboard/admin/community/reports", icon: Flag, label: "بلاغات المجتمع" },
      { href: "/dashboard/admin/marketplace/orders",icon: Storefront, label: "طلبات السوق" },
      { href: "/dashboard/admin/features",          icon: ToggleRight,label: "Feature Flags" },
    ],
  },
  {
    section: "الإعدادات",
    items: [
      { href: "/dashboard/admin/settings", icon: Gear,          label: "إعدادات المنصة" },
      { href: "/dashboard/admin/audit-log", icon: ClipboardText, label: "سجل التدقيق" },
      { href: "/dashboard/admin/security",  icon: ShieldCheck,   label: "الأمان" },
      { href: "/dashboard/admin/system",    icon: Database,      label: "إعدادات النظام" },
      { href: "/dashboard/admin/library-invitations", icon: Ticket, label: "أكواد دعوة المكتبة" },
      { href: "/dashboard/admin/library-subscriptions", icon: BookOpen, label: "اشتراكات المكتبة" },
    ],
  },
];

/**
 * The console sidebar for one staff role. super_admin, and a null role (not
 * readable in the browser — the server still enforces), get every item;
 * operations and auditor get only the pages their matrix row allows, and a
 * section left empty is dropped.
 */
export function adminNavForRole(role: StaffRole | null): typeof NAV {
  return filterNavGroupsByRole(NAV, role);
}
