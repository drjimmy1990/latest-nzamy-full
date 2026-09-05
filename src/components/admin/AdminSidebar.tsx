"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartBar, Users, CreditCard, Robot, Ticket,
  Gear, SignOut, Bell, ChartLine, Buildings,
  Scales, ShieldCheck, Database, CaretDown, ClipboardText,
  Money, Megaphone, Star, Globe, BookOpen, Article,
  Storefront, ToggleRight, Flag, Tag, UsersFour, Crown, Tray, Files,
  Lightbulb,
} from "@phosphor-icons/react";
import { useNotifications } from "@/hooks/useNotifications";
import { createClient } from "@/lib/supabase/client";
import { toArabicDigits } from "@/lib/services/arabicCount";

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
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  // Owner item ٧٣ — the bell's "3" was a hardcoded string with no dropdown
  // behind it. `useNotifications` is the same hook Navbar.tsx already reads
  // through for every other dashboard's bell, so an admin's own rows in
  // `notifications` drive this one too — no new endpoint, no fabricated
  // count.
  // `state` — not just `notifications.length` — is why this hook exists
  // (its own header: "Never confuse 'unreadable' with 'empty'"). Reading only
  // the array would print «لا توجد إشعارات» over a failed fetch, the exact
  // false "nothing new" claim the hook was built to stop Navbar's bell from
  // making; this bell does not repeat it.
  const { notifications, state: notifState, unreadCount, unreadCountKnown, markRead, markAllRead } = useNotifications(5);

  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen]);

  // Owner item ٧٤ — "admin@nzamy.sa" was a literal string, not the signed-in
  // admin's actual address, and it did not match the real nezamy.sa domain
  // used everywhere else (layout.tsx, lib/seo.ts). Read the real session
  // instead of hardcoding either email: `null` while unknown renders nothing
  // rather than a fabricated address.
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    // `createClient()` throws SYNCHRONOUSLY when the Supabase env vars are
    // missing (non-null assertions in lib/supabase/client.ts) — a plain
    // `.catch()` only catches the promise, not that throw. Wrapped for the
    // same reason notificationService.ts wraps its own `createClient()` call.
    try {
      createClient().auth.getUser()
        .then(({ data }) => { if (active) setAdminEmail(data.user?.email ?? null); })
        .catch(() => { if (active) setAdminEmail(null); });
    } catch {
      setAdminEmail(null);
    }
    return () => { active = false; };
  }, []);

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
        {/* Notif bell — wired to the same `notifications` table every other
            dashboard's bell reads (owner item ٧٣). No badge at all while the
            unread count is unreadable, and none once the platform genuinely
            has zero: a rendered ٠ here would be exactly the false "up to
            date" claim useNotifications.ts warns against. */}
        <div ref={notifRef} className="mr-auto relative">
          <button onClick={() => setNotifOpen(p => !p)}
            className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
            <Bell size={14} className="text-zinc-400" />
            {unreadCountKnown && unreadCount > 0 && (
              <span className="absolute -top-0.5 -left-0.5 h-4 min-w-[16px] px-0.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
                {unreadCount > 9 ? "٩+" : toArabicDigits(unreadCount)}
              </span>
            )}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="absolute left-0 top-10 z-20 w-72 rounded-2xl border border-white/[0.08] bg-[#14141f] shadow-2xl overflow-hidden"
                dir="rtl">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                  <span className="text-[12px] font-bold text-white">
                    الإشعارات
                    {unreadCountKnown && unreadCount > 0 && (
                      <span className="me-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500">{toArabicDigits(unreadCount)}</span>
                    )}
                  </span>
                  {unreadCountKnown && unreadCount > 0 && (
                    <button onClick={() => markAllRead()} className="text-[10px] font-semibold text-[#C8A762] hover:underline">
                      تحديد الكل كمقروء
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.05]">
                  {notifState === "unreadable" ? (
                    <div className="px-3 py-6 text-center">
                      <Bell size={22} weight="duotone" className="mx-auto mb-1.5 text-zinc-700" />
                      <p className="text-[11px] text-red-400">تعذّر تحميل الإشعارات — أعد المحاولة</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                      <Bell size={22} weight="duotone" className="mx-auto mb-1.5 text-zinc-700" />
                      <p className="text-[11px] text-zinc-500">لا توجد إشعارات</p>
                    </div>
                  ) : (
                    notifications.slice(0, 5).map(n => (
                      <Link key={n.id} href={n.href} onClick={() => { markRead(n.id); setNotifOpen(false); }}
                        className={`flex w-full items-start gap-2 px-3 py-2.5 text-start transition-colors hover:bg-white/[0.04] ${!n.read ? "bg-white/[0.02]" : ""}`}>
                        <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${n.read ? "bg-zinc-700" : "bg-[#C8A762]"}`} />
                        <span className="min-w-0 flex-1">
                          <p className={`text-[11px] font-semibold leading-snug truncate ${n.read ? "text-zinc-500" : "text-zinc-200"}`}>{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-600">{n.body}</p>
                        </span>
                      </Link>
                    ))
                  )}
                </div>
                <div className="border-t border-white/[0.06] px-3 py-2">
                  <Link href="/notifications" onClick={() => setNotifOpen(false)}
                    className="block text-center text-[10px] font-semibold text-[#C8A762] hover:underline">
                    عرض جميع الإشعارات
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Admin badge */}
      <div className="mx-4 mt-3 mb-1 flex items-center gap-2 rounded-xl bg-[#C8A762]/10 border border-[#C8A762]/20 px-3 py-2">
        <div className="h-6 w-6 rounded-lg bg-[#C8A762]/20 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={12} weight="fill" className="text-[#C8A762]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#C8A762]">مدير النظام</p>
          {/* Owner item ٧٤ — "admin@nzamy.sa" was a literal string, not this
              admin's actual address, on a wrong domain besides. The real
              signed-in email or nothing — never a second fabricated one. */}
          {adminEmail && <p className="truncate text-[9px] text-zinc-600">{adminEmail}</p>}
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
