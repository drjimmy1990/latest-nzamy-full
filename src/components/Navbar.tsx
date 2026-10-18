"use client";

import type { Dispatch, ElementType, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
import { useState, useRef, useEffect, useId, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import {
  List, X, CaretDown, Scales, Moon, Sun, Globe,
  ChartBar, Layout, SignOut, GearSix, Bell,
  Buildings,
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import Image from "next/image";
import { useTheme } from "./ThemeProvider";
import { useUser, logout } from "@/hooks/useUser";
import { getNavByUserType, getDashboardRoute, getRoleLabel, isMegaMenu, type NavItem } from "@/constants/navigation";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";
import { isNavbarTransparent, isPastSolidThreshold } from "./navbarChrome";

// ─── Scroll position as an external store (for the see-through home bar) ─────
function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const subscribeToNothing = () => () => {};

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
            className={`absolute top-full mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.12)] z-50 overflow-hidden dark:border-white/10 dark:bg-zinc-900 ${isAr ? "left-0" : "right-0"}`}
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
        // No «الإشعارات» row: the bell beside this menu is the one entry point,
        // and its own footer links to /notifications.
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

// ─── Services mega menu (owner, 4 Oct item 129) ───────────────────────────────
// A disclosure, not an ARIA menu: Tab walks the links in reading order, which
// is what this panel offers. role="menu" would promise arrow-key navigation
// instead, so it is deliberately absent (as is aria-haspopup="menu").
function MegaMenu({ item, isAr, activeDropdown, setActiveDropdown }: {
  item: NavItem;
  isAr: boolean;
  activeDropdown: string | null;
  setActiveDropdown: Dispatch<SetStateAction<string | null>>;
}) {
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = activeDropdown === item.label;
  const close = () => setActiveDropdown((current) => (current === item.label ? null : current));

  // A click anywhere outside the trigger and its panel closes it.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setActiveDropdown((current) => (current === item.label ? null : current));
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, item.label, setActiveDropdown]);

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => setActiveDropdown(item.label)}
      onMouseLeave={close}
      onKeyDown={(e) => {
        // The page-wide Escape handler closes every menu; this one also hands
        // focus back to the trigger, so the keyboard is not left on a link
        // that has just disappeared.
        if (e.key === "Escape" && open) {
          close();
          triggerRef.current?.focus();
        }
      }}
      onBlur={(e) => {
        // Tabbing past the last link closes the panel behind the focus. A
        // blur with no new target (a click on the panel's own padding) is
        // left to the outside-click and mouseleave handlers.
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        /* Enter and Space on a <button> fire a click with detail 0, so the
           keyboard toggles. A pointer click (detail 1+) only opens: the hover
           has already opened it and a toggle would shut it again, and on a
           touch screen at lg+ (an iPad) the tap is the only way in. */
        onClick={(e) => setActiveDropdown(e.detail === 0 && open ? null : item.label)}
        className="flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 xl:px-3"
      >
        {isAr ? item.label : item.labelEn}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown size={13} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            /* Anchored to the bar (its rounded container is `relative`), not to
               the trigger: four columns hung off a link in the middle of the
               bar would run off a 1024px screen. The box spans the bar's full
               width but takes no clicks itself (pointer-events-none), so a
               click or hover beside the narrower panel reaches the page and
               counts as outside. Only the bridge strip and the panel take the
               pointer. The bridge starts 1rem above the bar's bottom edge, so
               the pointer never crosses a gap on its way from the trigger to a
               link — crossing one fires mouseleave and shuts the menu. */
            className="pointer-events-none absolute inset-x-0 top-[calc(100%_-_1rem)] z-50"
            dir={isAr ? "rtl" : "ltr"}
          >
            <div aria-hidden="true" className="pointer-events-auto h-6" />
            <div className="pointer-events-auto mx-auto grid max-w-5xl grid-cols-4 gap-3 rounded-2xl border border-slate-200/50 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:border-white/10 dark:bg-zinc-900">
              {item.children!.map((group, gi) => (
                <div key={group.href} role="group" aria-labelledby={`${panelId}-group-${gi}`}>
                  <p id={`${panelId}-group-${gi}`} className="px-3 pb-2 text-xs font-bold text-royal dark:text-gold">
                    {isAr ? group.label : group.labelEn}
                  </p>
                  <ul className="space-y-1">
                    {group.children!.map((child) => (
                      <li key={child.href}>
                        <a
                          href={child.href}
                          className="hover-gold flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5"
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
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── One link inside an expanded section of the mobile drawer ────────────────
function MobileChildLink({ item, isAr }: { item: NavItem; isAr: boolean }) {
  return (
    <a
      href={item.href}
      className="flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink-muted/80 transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-300 dark:hover:text-white cursor-pointer"
    >
      <span>{isAr ? item.label : item.labelEn}</span>
      {item.badge && (
        <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">
          {item.badge}
        </span>
      )}
    </a>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Which nav parent is expanded in the mobile drawer. The desktop menu
  // opens on hover, which a touch screen cannot do — see the drawer below.
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const { theme, lang, toggleTheme, toggleLang } = useTheme();
  const { isLoggedIn, userType, name, affiliation } = useUser();
  const isAr = lang === "ar";
  const mobileSectionIds = useId();

  // A client-side route change closes every menu. Adjusting state while
  // rendering when the path changes (React's documented pattern) closes them
  // in the same frame instead of one stale frame later.
  const pathname = usePathname();
  const [menusPath, setMenusPath] = useState(pathname);
  if (pathname !== menusPath) {
    setMenusPath(pathname);
    setActiveDropdown(null);
    setMobileOpen(false);
    setMobileSection(null);
    setAvatarOpen(false);
  }

  // See-through over the home hero only (owner, item 130); solid after 8px of
  // scroll, with the phone menu open, and on every other page. The scroll
  // listener is attached on "/" only. The server snapshot is "not scrolled",
  // and React re-reads the real position right after hydration.
  const scrolled = useSyncExternalStore(
    pathname === "/" ? subscribeToScroll : subscribeToNothing,
    () => isPastSolidThreshold(window.scrollY),
    () => false,
  );
  const transparent = isNavbarTransparent(pathname, scrolled, mobileOpen);

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
      className="fixed top-0 right-0 left-0 z-50 safe-top"
    >
      <div className="mx-auto max-w-[1400px] px-4 pt-4">
        {/* While see-through the bar has no surface of its own and the hero's
            background video shows behind it, so its muted text is lifted to
            full ink. The token is overridden rather than each class, so every
            link and icon in the bar follows. */}
        <div
          className={`relative rounded-[1.25rem] border px-6 py-3 lg:px-4 xl:px-6 transition-[background-color,border-color,box-shadow] duration-300 ${
            transparent
              ? "border-transparent bg-transparent shadow-none [--color-ink-muted:var(--color-ink)]"
              : "border-slate-200/70 bg-white/85 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-dark-card/90"
          }`}
        >
          <div className="flex items-center justify-between">

            {/* ── Logo ── */}
            <motion.a href="/?noredirect=true" className="flex items-center gap-3 cursor-pointer" whileHover={{ scale: 1.02 }}>
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
              <span className="font-brand text-xl font-bold ltr:tracking-tight rtl:tracking-normal text-royal dark:text-white">
                {isAr ? "نظامي" : "Nezamy"}
              </span>
            </motion.a>

            {/* ── Desktop Links ──
                The desktop layout starts at `lg` (1024px); it used to start at
                `xl` (1280px), which gave every laptop the phone menu. Between
                lg and xl the links are tighter (px-2, gap-0.5), never wrap
                (whitespace-nowrap), and the avatar drops its «أهلاً، …» text —
                so seven Arabic links and the controls fit in 1024px even at
                100% display density (the 75% default leaves ~1365 CSS px). */}
            <div className="hidden items-center gap-0.5 lg:flex xl:gap-1">
              {ACTIVE_NAV.map((link) => isMegaMenu(link) ? (
                <MegaMenu
                  key={link.label}
                  item={link}
                  isAr={isAr}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                />
              ) : (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => link.children && setActiveDropdown(link.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <a
                    href={link.href}
                    /* A touch screen at lg+ (an iPad in landscape) never fires
                       mouseenter, and a menu parent's href is a "#…"
                       placeholder — so a tap opens the menu instead of jumping
                       to an anchor that does not exist. Open-only: with a mouse
                       the hover has already opened it, and a toggle here would
                       close it again on click. */
                    onClick={(e) => {
                      if (link.children && link.href.startsWith("#")) {
                        e.preventDefault();
                        setActiveDropdown(link.label);
                      }
                    }}
                    aria-haspopup={link.children ? "menu" : undefined}
                    aria-expanded={link.children ? activeDropdown === link.label : undefined}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 xl:px-3"
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
            <div className="hidden items-center gap-1.5 lg:flex xl:gap-2">

              {/* The static "SA" + flag badge that used to sit here duplicated
                  the language toggle right beside it — both read as locale
                  controls, but the badge did nothing (no menu, no click
                  handler) and its flag was a generic Phosphor glyph, not
                  Saudi's (notes ٢٣٤، ٢٣٥). Removed rather than fixing the icon:
                  the working control (language) already says which market
                  this is for once toggled to Arabic, and a badge that opens
                  nothing had no feature to preserve. */}

              {/* Lang toggle */}
              <button
                onClick={toggleLang}
                aria-label={isAr ? "تغيير اللغة" : "Toggle language"}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/50 text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:border-white/10 dark:hover:text-white dark:hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold"
              >
                <Globe size={18} weight="duotone" />
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                aria-label={isAr ? "تغيير المظهر" : "Toggle theme"}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/50 text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:border-white/10 dark:hover:text-white dark:hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold"
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
                      aria-label={isAr ? "قائمة الحساب" : "Account menu"}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/60 hover:border-royal/30 hover:bg-royal/5 dark:border-white/10 dark:hover:border-white/30 dark:hover:bg-white/5 transition-all"
                    >
                      <div className="w-7 h-7 rounded-lg bg-royal flex items-center justify-center text-white text-xs font-bold">
                        {name?.charAt(0) ?? "م"}
                      </div>
                      {/* Name text from xl up; between lg and xl the initial
                          alone carries the button (the name is in the menu). */}
                      <div className="hidden flex-col xl:flex">
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
                  {/* A light frame matching the icon buttons beside it — it
                      used to be bare text sitting right up against the
                      divider rule, which then read as an orphaned mark rather
                      than a boundary between two groups of controls (note
                      ٢٣٧). */}
                  <a
                    href="/login"
                    className="whitespace-nowrap rounded-lg border border-slate-200/50 px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:border-white/10 dark:text-zinc-400 dark:hover:text-white lg:px-3 xl:px-4"
                  >
                    {isAr ? "دخول" : "Login"}
                  </a>
                  <MagneticButton
                    href="/register"
                    className="inline-flex whitespace-nowrap rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white lg:px-4 xl:px-5 shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] transition-all hover:bg-royal-light hover:shadow-[0_8px_24px_-4px_rgba(11,61,46,0.5)]"
                  >
                    {isAr ? "سجّل مجاناً" : "Sign Up Free"}
                  </MagneticButton>
                </>
              )}
            </div>

            {/* ── Mobile controls ── */}
            <div className="flex items-center gap-2 lg:hidden">
              {isLoggedIn && <NotificationsBell isAr={isAr} />}
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
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold"
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
                  {/* This list used to render `link.href` for EVERY entry and
                      ignore `link.children` entirely. The desktop nav opens a
                      child menu on `onMouseEnter` — an event a touch screen
                      never fires — so on a phone the parent was just a link to
                      its own placeholder href. For «المعرفة القانونية» that
                      href is "#knowledge", an anchor that exists nowhere in the
                      document, which left five real pages — the legal library,
                      the community, the blog, Nzamy Media and the academy —
                      with no route to them from a phone at all.

                      Parents now expand in place. `#`-prefixed hrefs are
                      placeholders for a menu, never destinations. */}
                  {ACTIVE_NAV.map((link, index) => {
                    const hasChildren = !!link.children?.length;
                    const isPlaceholder = link.href.startsWith("#");
                    const expanded = mobileSection === link.label;
                    const sectionId = `${mobileSectionIds}-section-${index}`;

                    if (!hasChildren) {
                      return (
                        <a
                          key={link.label}
                          href={link.href}
                          className="block rounded-xl px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                        >
                          {isAr ? link.label : link.labelEn}
                        </a>
                      );
                    }

                    return (
                      <div key={link.label}>
                        <button
                          type="button"
                          onClick={() => setMobileSection(expanded ? null : link.label)}
                          aria-expanded={expanded}
                          aria-controls={sectionId}
                          /* min-h-[44px] is Apple's minimum touch target; the
                             plain <a> rows above compute to 44px from py-3 plus
                             the text line box, and this keeps parity. */
                          className="flex w-full min-h-[44px] items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-royal/5 hover:text-royal dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                        >
                          <span>{isAr ? link.label : link.labelEn}</span>
                          <CaretDown
                            size={14}
                            weight="bold"
                            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                          />
                        </button>

                        {expanded && (
                          <div id={sectionId} className={`${isAr ? "pr-4" : "pl-4"} pb-1`}>
                            {/* The parent itself is only navigable when it has
                                a real destination of its own. */}
                            {!isPlaceholder && (
                              <a
                                href={link.href}
                                className="block min-h-[44px] rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink-muted/80 hover:bg-royal/5 hover:text-royal dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                              >
                                {isAr ? `عرض الكل — ${link.label}` : `View all — ${link.labelEn}`}
                              </a>
                            )}
                            {link.children!.map((child) =>
                              child.children?.length ? (
                                /* A mega-menu group (item 129) collapses to a
                                   titled list here; the title is a heading,
                                   never a link. */
                                <div key={child.label} role="group" aria-label={isAr ? child.label : child.labelEn}>
                                  <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-royal dark:text-gold">
                                    {isAr ? child.label : child.labelEn}
                                  </p>
                                  {child.children.map((grandchild) => (
                                    <MobileChildLink key={grandchild.label} item={grandchild} isAr={isAr} />
                                  ))}
                                </div>
                              ) : (
                                <MobileChildLink key={child.label} item={child} isAr={isAr} />
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* The static "SA" + flag badge that used to render here is
                      gone for the same reason as its desktop twin (notes ٢٣٤،
                      ٢٣٥): no click handler, and a generic flag glyph rather
                      than Saudi's. The mobile top bar's own language button
                      (outside this drawer) is the real, working control. */}

                  <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
                    {isLoggedIn ? (
                      <div className="flex flex-col">
                        {/* User Identity Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/10 mb-2">
                          <div className="w-9 h-9 rounded-lg bg-royal flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {name?.charAt(0) ?? "م"}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-ink dark:text-white truncate">
                              {name}
                            </span>
                            <span className="text-[11px] text-ink-muted dark:text-zinc-400 truncate mt-0.5">
                              {getRoleLabel(userType)}
                            </span>
                            {affiliation?.entityName && (
                              <span className="text-[10px] text-royal/60 dark:text-gold/60 truncate flex items-center gap-1 mt-0.5">
                                <Buildings size={11} />
                                {affiliation.entityName}
                              </span>
                            )}
                          </div>
                          {/* No second bell here: the top bar above this drawer
                              already carries the one for this layout. */}
                        </div>

                        {/* Navigation Links for parity */}
                        <div className="flex flex-col gap-1 px-2 mb-4">
                          <Link
                            href={dashboardHref}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-muted hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                          >
                            <Layout size={16} weight="duotone" />
                            {isAr ? "لوحة التحكم" : "Dashboard"}
                          </Link>
                          <Link
                            href="/settings"
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-muted hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                          >
                            <GearSix size={16} weight="duotone" />
                            {isAr ? "الملف الشخصي" : "My Account"}
                          </Link>
                          <Link
                            href="/pricing"
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-muted hover:bg-royal/5 hover:text-royal dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                          >
                            <ChartBar size={16} weight="duotone" />
                            {isAr ? "الاشتراك والباقة" : "Plan & Billing"}
                          </Link>
                        </div>

                        {/* Sign Out Button */}
                        <div className="px-4">
                          <button
                            onClick={() => { logout(); }}
                            className="rounded-xl border border-red-200 dark:border-red-500/20 px-4 py-3 text-center text-sm font-medium text-red-500 w-full hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            {isAr ? "تسجيل الخروج" : "Sign Out"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 px-4">
                        <a href="/login" className="rounded-xl px-4 py-3 text-center text-sm font-medium text-ink-muted dark:text-zinc-400 hover:bg-royal/5 hover:text-royal transition-colors">
                          {isAr ? "دخول" : "Login"}
                        </a>
                        <a href="/register" className="rounded-xl bg-royal px-4 py-3 text-center text-sm font-semibold text-white hover:bg-royal-light transition-colors">
                          {isAr ? "سجّل مجاناً" : "Sign Up Free"}
                        </a>
                      </div>
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
