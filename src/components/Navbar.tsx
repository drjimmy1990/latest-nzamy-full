"use client";

import type { ElementType, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import {
  List, X, CaretDown, Scales, Moon, Sun, Globe, Flag,
  User, ChartBar, Layout, SignOut, GearSix, Bell,
  Buildings,
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import Image from "next/image";
import { useTheme } from "./ThemeProvider";
import { useUser, logout } from "@/hooks/useUser";
import { getNavByUserType, getDashboardRoute, getRoleLabel, type NavItem } from "@/constants/navigation";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/lib/services/notificationService";

// ─── Icon resolver (phosphor icon names → components) ─────────────────────────
const ICON_MAP = PhosphorIcons as unknown as Record<string, ElementType>;


function NavIcon({ name, size = 18 }: { name?: string; size?: number }) {
  if (!name) return null;
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} weight="duotone" />;
}

// ─── Magnetic CTA button ──────────────────────────────────────────────────────
function MagneticButton({ children, className, href }: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const handleMouse = (e: ReactMouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set((e.clientX - r.left - r.width / 2) * 0.15);
    y.set((e.clientY - r.top - r.height / 2) * 0.15);
  };
  const reset = () => { x.set(0); y.set(0); };
  return (
    <motion.a
      ref={ref} href={href} style={{ x, y }}
      onMouseMove={handleMouse} onMouseLeave={reset}
      className={className}
      transition={{ type: "spring", stiffness: 150, damping: 15 }}
    >
      {children}
    </motion.a>
  );
}

// ─── Notifications Bell ───────────────────────────────────────────────────────
function NotificationsBell({ isAr }: { isAr: boolean }) {
  const [open, setOpen] = useState(false);
  const { notifications: allNotifs, unreadCount: unread, markRead, markAllRead } = useNotifications(5);
  const notifs = allNotifs.slice(0, 5);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const SEVERITY_DOT: Record<string, string> = {
    info: "bg-sky-400", warning: "bg-amber-400",
    success: "bg-emerald-400", error: "bg-red-400",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); }}
        aria-label={isAr ? "الإشعارات" : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/50 text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:border-white/10 dark:text-zinc-400 dark:hover:text-white"
      >
        <Bell size={18} weight={unread > 0 ? "fill" : "duotone"} />
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-black px-1"
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`absolute top-full mt-2 w-80 rounded-2xl border border-slate-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.12)] z-50 overflow-hidden dark:border-white/10 dark:bg-zinc-900 ${isAr ? "left-0" : "right-0"}`}
            dir={isAr ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/10">
              <span className="text-sm font-bold text-ink dark:text-white">
                {isAr ? "الإشعارات" : "Notifications"}
                {unread > 0 && (
                  <span className="ms-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500">{unread}</span>
                )}
              </span>
              {unread > 0 && (
                <button
                  onClick={() => { markAllRead(); }}
                  className="text-[11px] font-semibold text-royal dark:text-[#C8A762] hover:underline"
                >
                  {isAr ? "تحديد الكل" : "Mark all read"}
                </button>
              )}
            </div>

            {/* List */}
            <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-[320px] overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell size={28} weight="duotone" className="mx-auto mb-2 text-slate-300 dark:text-zinc-600" />
                  <p className="text-xs text-slate-400 dark:text-zinc-500">
                    {isAr ? "لا توجد إشعارات" : "No notifications"}
                  </p>
                </div>
              ) : (
                notifs.map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      window.location.href = n.href;
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-start transition-colors ${
                      !n.read
                        ? "bg-royal/[0.03] dark:bg-white/[0.03] hover:bg-royal/[0.06]"
                        : "hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {n.avatar ? (
                        <div className="w-8 h-8 rounded-full bg-royal flex items-center justify-center text-white text-xs font-bold">
                          {n.avatar}
                        </div>
                      ) : (
                        <div className={`w-2 h-2 rounded-full mt-1 ${SEVERITY_DOT[n.severity] ?? "bg-slate-400"}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-semibold leading-snug ${
                        n.read ? "text-slate-500 dark:text-zinc-500" : "text-ink dark:text-white"
                      }`}>{n.title}</p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5 line-clamp-2 leading-snug">{n.body}</p>
                      <p className="text-[10px] text-slate-300 dark:text-zinc-600 mt-1 font-mono">{n.time}</p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-royal dark:bg-[#C8A762] flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 dark:border-white/10 px-4 py-2.5">
              <Link href="/notifications" onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1 text-[11px] font-semibold text-royal dark:text-[#C8A762] hover:underline"
              >
                {isAr ? "عرض جميع الإشعارات" : "View all notifications"}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Avatar Dropdown ──────────────────────────────────────────────────────────
function AvatarDropdown({
  name, userType, dashboardHref, onClose, isAr, affiliationEntity,
}: {
  name: string;
  userType: ReturnType<typeof useUser>["userType"];
  dashboardHref: string;
  onClose: () => void;
  isAr: boolean;
  affiliationEntity?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`absolute top-full mt-2 w-56 rounded-2xl border border-slate-200/60 bg-white p-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.12)] z-50 dark:border-white/10 dark:bg-zinc-900 ${isAr ? "left-0" : "right-0"}`}
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* User info */}
      <div className="px-3 py-2.5 mb-1 border-b border-slate-100 dark:border-white/10">
        <p className="text-sm font-bold text-ink dark:text-white truncate">{name}</p>
        <p className="text-[11px] text-ink-muted dark:text-zinc-400 mt-0.5">
          {getRoleLabel(userType)}
        </p>
        {affiliationEntity && (
          <p className="text-[10px] text-royal/70 dark:text-gold/70 mt-0.5 flex items-center gap-1">
            <Buildings size={11} />
            {affiliationEntity}
          </p>
        )}
      </div>

      {/* Links */}
      {[
        { href: dashboardHref,  icon: Layout,   label: isAr ? "لوحة التحكم"     : "Dashboard" },
        { href: "/settings",    icon: GearSix,  label: isAr ? "الملف الشخصي"   : "My Account" },
        { href: "/pricing",     icon: ChartBar, label: isAr ? "الاشتراك والباقة" : "Plan & Billing" },
        { href: "/notifications", icon: Bell,   label: isAr ? "الإشعارات"       : "Notifications" },
      ].map(({ href, icon: Icon, label }) => (
        <Link
          key={href} href={href} onClick={onClose}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink-muted hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
        >
          <Icon size={16} weight="duotone" />
          {label}
        </Link>
      ))}



      {/* Sign out */}
      <div className="border-t border-slate-100 dark:border-white/10 mt-1 pt-1">
        <button
          onClick={() => { onClose(); logout(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <SignOut size={16} />
          {isAr ? "تسجيل الخروج" : "Sign Out"}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Drop-down menu for nav items with children ───────────────────────────────
function NavDropdown({ items, isAr }: { items: NavItem[]; isAr: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`absolute top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200/50 bg-white p-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:border-white/10 dark:bg-zinc-900 ${isAr ? "right-0" : "left-0"}`}
      dir={isAr ? "rtl" : "ltr"}
    >
      {items.map((child, i) => (
        <motion.a
          key={child.href}
          href={child.href}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-ink-muted transition-all hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
        >
          {child.icon && (
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-royal/5 text-royal dark:bg-white/5 dark:text-zinc-300">
              <NavIcon name={child.icon} size={17} />
            </span>
          )}
          <span className="flex-1">{isAr ? child.label : child.labelEn}</span>
          {child.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30">
              {child.badge}
            </span>
          )}
        </motion.a>
      ))}
    </motion.div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const { theme, lang, toggleTheme, toggleLang } = useTheme();
  const { isLoggedIn, userType, name, credits, creditsMax, affiliation } = useUser();
  const isAr = lang === "ar";

  // ── Select proper nav based on userType ──
  const ACTIVE_NAV = getNavByUserType(isLoggedIn ? userType : null);
  const dashboardHref = getDashboardRoute(userType);

  // ── Keyboard + click-away handlers ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setActiveDropdown(null);
        setAvatarOpen(false);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!avatarOpen) return;
    const h = () => setAvatarOpen(false);
    setTimeout(() => document.addEventListener("click", h), 0);
    return () => document.removeEventListener("click", h);
  }, [avatarOpen]);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 80, damping: 20 }}
      className="fixed top-0 right-0 left-0 z-50"
    >
      <div className="mx-auto max-w-[1400px] px-4 pt-4">
        <div className="rounded-[1.25rem] border border-white/60 bg-white/80 px-6 py-3 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-dark-card/90">
          <div className="flex items-center justify-between">

            {/* ── Logo ── */}
            <motion.a href="/?noredirect=true" className="flex items-center gap-3" whileHover={{ scale: 1.02 }}>
              <motion.div
                animate={{ rotateY: [0, 360] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
                style={{ transformStyle: "preserve-3d", perspective: 400 }}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl"
              >
                <Image
                  src="/logo.png" alt="نظامي" width={40} height={40}
                  className="h-10 w-10 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    (e.currentTarget.nextElementSibling as HTMLElement)?.removeAttribute("hidden");
                  }}
                />
                <div hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal text-white">
                  <Scales weight="bold" size={22} />
                </div>
              </motion.div>
              <span className="font-brand text-xl font-bold tracking-tight text-royal dark:text-white">
                {isAr ? "نظامي" : "Nezamy"}
              </span>
            </motion.a>

            {/* ── Desktop Links ── */}
            <div className="hidden items-center gap-1 xl:flex">
              {ACTIVE_NAV.map((link) => (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => link.children && setActiveDropdown(link.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <a
                    href={link.href}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
                  >
                    {isAr ? link.label : link.labelEn}
                    {link.children && (
                      <motion.span
                        animate={{ rotate: activeDropdown === link.label ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CaretDown size={13} />
                      </motion.span>
                    )}
                  </a>

                  <AnimatePresence>
                    {link.children && activeDropdown === link.label && (
                      <NavDropdown items={link.children} isAr={isAr} />
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* ── Right Controls ── */}
            <div className="hidden items-center gap-2 xl:flex">

              {/* Region badge */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/50 px-2.5 py-1.5 dark:border-white/10">
                <Flag size={14} weight="fill" className="text-emerald-600" />
                <span className="text-xs font-medium text-ink-muted dark:text-zinc-400">SA</span>
              </div>

              {/* Lang toggle */}
              <button
                onClick={toggleLang}
                aria-label={isAr ? "تغيير اللغة" : "Toggle language"}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/50 text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:border-white/10"
              >
                <Globe size={18} weight="duotone" />
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                aria-label={isAr ? "تغيير المظهر" : "Toggle theme"}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/50 text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:border-white/10"
              >
                {theme === "light" ? <Moon size={18} weight="duotone" /> : <Sun size={18} weight="duotone" />}
              </button>

              <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/10" />

              {/* ── Auth-aware section ── */}
              {isLoggedIn ? (
                <>
                  {/* Notifications Bell */}
                  <NotificationsBell isAr={isAr} />

                  {/* Avatar + dropdown */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setAvatarOpen((o) => !o)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/60 hover:border-royal/30 hover:bg-royal/5 dark:border-white/10 dark:hover:border-white/30 dark:hover:bg-white/5 transition-all"
                    >
                      <div className="w-7 h-7 rounded-lg bg-royal flex items-center justify-center text-white text-xs font-bold">
                        {name?.charAt(0) ?? "م"}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-ink dark:text-white max-w-[140px] truncate leading-tight">
                          {isAr ? `أهلاً، ${name}` : `Hi, ${name}`}
                        </span>
                        {affiliation?.entityName && (
                          <span className="text-[9px] text-royal/60 dark:text-gold/60 leading-tight truncate max-w-[140px]">
                            {affiliation.entityName}
                          </span>
                        )}
                      </div>
                      <CaretDown size={13} className="text-ink-muted dark:text-zinc-400" />
                    </button>

                    <AnimatePresence>
                      {avatarOpen && (
                        <AvatarDropdown
                          name={name}
                          userType={userType}
                          dashboardHref={dashboardHref}
                          onClose={() => setAvatarOpen(false)}
                          isAr={isAr}
                          affiliationEntity={affiliation?.entityName}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <>
                  <a
                    href="/login"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-royal dark:text-zinc-400 dark:hover:text-white"
                  >
                    {isAr ? "دخول" : "Login"}
                  </a>
                  <MagneticButton
                    href="/register"
                    className="inline-flex rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] transition-all hover:bg-royal-light hover:shadow-[0_8px_24px_-4px_rgba(11,61,46,0.5)]"
                  >
                    {isAr ? "سجّل مجاناً" : "Sign Up Free"}
                  </MagneticButton>
                </>
              )}
            </div>

            {/* ── Mobile controls ── */}
            <div className="flex items-center gap-2 xl:hidden">
              <button onClick={toggleTheme} aria-label={isAr ? "تغيير المظهر" : "Toggle theme"} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted dark:text-zinc-400">
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button onClick={toggleLang} aria-label={isAr ? "تغيير اللغة" : "Toggle language"} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted dark:text-zinc-400">
                <Globe size={18} />
              </button>
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label={isAr ? (mobileOpen ? "إغلاق القائمة" : "فتح القائمة") : (mobileOpen ? "Close menu" : "Open menu")}
                aria-expanded={mobileOpen}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-400"
              >
                {mobileOpen ? <X size={22} /> : <List size={22} />}
              </button>
            </div>
          </div>

          {/* ── Mobile Menu ── */}
          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                className="overflow-hidden lg:hidden"
              >
                <div className="border-t border-slate-100 pt-4 pb-2 dark:border-white/10">
                  {ACTIVE_NAV.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="block rounded-xl px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white"
                    >
                      {isAr ? link.label : link.labelEn}
                    </a>
                  ))}

                  <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
                    {isLoggedIn ? (
                      <>
                        <a
                          href={dashboardHref}
                          className="rounded-xl border border-slate-200 dark:border-white/10 px-4 py-3 text-center text-sm font-medium text-royal dark:text-white"
                        >
                          {isAr ? "لوحة التحكم" : "Dashboard"}
                        </a>
                      <button
                          onClick={() => { logout(); }}
                          className="rounded-xl border border-red-200 dark:border-red-500/20 px-4 py-3 text-center text-sm font-medium text-red-500 w-full"
                        >
                          {isAr ? "تسجيل الخروج" : "Sign Out"}
                        </button>
                      </>
                    ) : (
                      <>
                        <a href="/login" className="rounded-xl px-4 py-3 text-center text-sm font-medium text-ink-muted dark:text-zinc-400">
                          {isAr ? "دخول" : "Login"}
                        </a>
                        <a href="/register" className="rounded-xl bg-royal px-4 py-3 text-center text-sm font-semibold text-white">
                          {isAr ? "سجّل مجاناً" : "Sign Up Free"}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.nav>
  );
}
