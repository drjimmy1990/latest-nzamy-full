"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartBar, Users, CreditCard, Robot, Ticket,
  Gear, SignOut, Bell, ChartLine, Buildings,
  Scales, ShieldCheck, Database, CaretDown, ClipboardText,
  Money, Megaphone, Star, Globe, BookOpen, Article,
  Storefront, ToggleRight, Flag, Tag, UsersFour,
} from "@phosphor-icons/react";

const NAV = [
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
      { href: "/dashboard/admin/subscriptions/coupons", icon: Tag, label: "الكوبونات" },
      { href: "/dashboard/admin/team", icon: UsersFour, label: "فريق نظامي" },
    ],
  },
  {
    section: "النظام",
    items: [
      { href: "/dashboard/admin/ai-usage",   icon: Robot,   label: "استخدام الذكاء الاصطناعي" },
      { href: "/dashboard/admin/tickets",    icon: Ticket,  label: "تذاكر الدعم" },
      { href: "/dashboard/admin/broadcasts", icon: Megaphone, label: "البث والإشعارات" },
      { href: "/dashboard/admin/reviews",    icon: Star,    label: "التقييمات" },
    ],
  },
  {
    section: "المنصة والمحتوى",
    items: [
      { href: "/dashboard/admin/platform",          icon: Globe,      label: "مركز تحكم المنصة" },
      { href: "/dashboard/admin/content/laws",      icon: BookOpen,   label: "المكتبة القانونية" },
      { href: "/dashboard/admin/content/articles",  icon: Article,    label: "المدونة القانونية" },
      { href: "/dashboard/admin/community/moderation", icon: Flag, label: "إشراف المجتمع" },
      { href: "/dashboard/admin/marketplace/orders",icon: Storefront, label: "طلبات السوق" },
      { href: "/dashboard/admin/features",          icon: ToggleRight,label: "Feature Flags" },
    ],
  },
  {
    section: "الإعدادات",
    items: [
      { href: "/dashboard/admin/audit-log", icon: ClipboardText, label: "سجل التدقيق" },
      { href: "/dashboard/admin/security",  icon: ShieldCheck,   label: "الأمان" },
      { href: "/dashboard/admin/system",    icon: Database,      label: "إعدادات النظام" },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [notifOpen, setNotifOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href) && href !== "/dashboard/admin";
  }

  return (
    <aside className="w-[240px] flex-shrink-0 flex flex-col h-full border-l border-white/[0.05] bg-[#0d0d15]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.05]">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] shadow-lg">
          <Scales size={18} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <p className="text-[14px] font-black text-white tracking-wide">نظـامي</p>
          <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-widest">Admin Panel</p>
        </div>
        {/* Notif bell */}
        <button onClick={() => setNotifOpen(p => !p)}
          className="mr-auto relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
          <Bell size={14} className="text-zinc-400" />
          <span className="absolute -top-0.5 -left-0.5 h-4 w-4 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">3</span>
        </button>
      </div>

      {/* Admin badge */}
      <div className="mx-4 mt-3 mb-1 flex items-center gap-2 rounded-xl bg-[#C8A762]/10 border border-[#C8A762]/20 px-3 py-2">
        <div className="h-6 w-6 rounded-lg bg-[#C8A762]/20 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={12} weight="fill" className="text-[#C8A762]" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-[#C8A762]">مدير النظام</p>
          <p className="text-[9px] text-zinc-600">admin@nzamy.sa</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV.map((group) => {
          const isCollapsed = collapsed[group.section];
          return (
            <div key={group.section}>
              <button
                onClick={() => setCollapsed(p => ({ ...p, [group.section]: !p[group.section] }))}
                className="flex items-center gap-1.5 w-full mb-1"
              >
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 flex-1 text-right">
                  {group.section}
                </p>
                <CaretDown size={9} className={`text-zinc-700 transition-transform ${isCollapsed ? "rotate-90" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-0.5"
                  >
                    {group.items.map((item) => {
                      const active = isActive(item.href, item.exact);
                      return (
                        <Link key={item.href} href={item.href}
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all group ${
                            active
                              ? "bg-[#0B3D2E]/40 text-emerald-400 border border-[#0B3D2E]/60"
                              : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
                          }`}>
                          <item.icon size={14} weight={active ? "fill" : "regular"}
                            className={active ? "text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"} />
                          {item.label}
                          {active && <span className="mr-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.05] p-3">
        <Link href="/" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition-all">
          <SignOut size={13} />
          العودة للموقع
        </Link>
      </div>
    </aside>
  );
}
