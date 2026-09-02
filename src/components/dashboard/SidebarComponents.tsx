"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  CaretDown,
  SquaresFour, ClockCounterClockwise, Gavel, CalendarCheck,
  FileText, FolderOpen, AddressBook, ChatDots, Money,
  PencilSimple, Sword, ChartLine, Lightbulb, MagnifyingGlass,
  ChatCircle, Compass, Calculator, CheckSquare, Scan, Bell,
  Robot, ArrowsSplit, CopySimple, Globe, Key, Users, Student,
  CalendarBlank, Receipt, ChartBar, FileArrowUp, Buildings,
  ShieldCheck, GitBranch, BookOpen, GearSix, Wallet,
  Tray, UserCircle, Star, Note, Gift, Percent, ShieldStar,
  Briefcase, Stamp, ArrowLeft, Kanban, Scales, Storefront, ArrowFatUp,
  Ticket, Megaphone, Coins, Terminal, Database, Tag, UserCirclePlus, CreditCard,
  Broom, Microphone, Article, Target, MapTrifold, Translate,
  Trophy, Brain, Plus, ListChecks, PencilLine, Crown, Vault,
  ArrowsLeftRight, Package, Palette, ShieldWarning, Envelope,
  ChartLineUp, ClipboardText, ChatsCircle, Gear,
  TreeStructure, Fingerprint, Timer, HandHeart, Files, UsersFour,
  Warning, LockKey, PlayCircle, UsersThree,
  QrCode,
} from "@phosphor-icons/react";

import { useTheme } from "@/components/ThemeProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { type SidebarGroup, type SidebarItem } from "@/constants/navigation";
import { type UserType } from "@/hooks/useUser";

// ─── Icon resolver ─────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  SquaresFour, ClockCounterClockwise, Gavel, CalendarCheck,
  FileText, FolderOpen, AddressBook, ChatDots, Money,
  PencilSimple, Sword, ChartLine, Lightbulb, MagnifyingGlass,
  ChatCircle, Compass, Calculator, CheckSquare, Scan, Bell,
  Robot, ArrowsSplit, CopySimple, Globe, Key, Users, Student,
  CalendarBlank, Receipt, ChartBar, FileArrowUp, Buildings,
  ShieldCheck, GitBranch, BookOpen, GearSix, Wallet,
  Tray, UserCircle, Star, Note, Gift, Percent, ShieldStar,
  Briefcase, Stamp, ArrowLeft, Kanban, Scales, Storefront, ArrowFatUp,
  Ticket, Megaphone, Coins, Terminal, Database, Tag, UserCirclePlus, CreditCard,
  Broom, Microphone, Article, Target, MapTrifold, Translate,
  Trophy, Brain, Plus, ListChecks, PencilLine, Crown, Vault,
  ArrowsLeftRight, Package, Palette, ShieldWarning, Envelope,
  ChartLineUp, ClipboardText, ChatsCircle, Gear,
  TreeStructure, Fingerprint, Timer, HandHeart, Files, UsersFour,
  Warning, LockKey, PlayCircle, UsersThree,
  QrCode,
  FileWarning: Warning,
  HandCuffs: LockKey,
  ClipboardList: ClipboardText,
  GraduationCap: BookOpen,  // fallback: Academy
};

export function SidebarIcon_({ name, size = 17 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} weight="duotone" />;
}

// ─── URL → UserType resolver ──────────────────────────────────────────────────
/**
 * Infers the correct dashboard user type from the current pathname.
 * FIX: ensures /dashboard/client always shows the client sidebar regardless
 * of which account is stored in session/localStorage.
 */
export function inferUserTypeFromPath(pathname: string): UserType {
  if (pathname.startsWith("/dashboard/client"))     return "individual";
  if (pathname.startsWith("/dashboard/lawyer"))     return "lawyer";
  if (pathname.startsWith("/dashboard/firm"))       return "firm";
  if (pathname.startsWith("/dashboard/business"))   return "corporate";
  if (pathname.startsWith("/dashboard/micro"))      return "micro";
  if (pathname.startsWith("/dashboard/provider"))   return "provider";
  if (pathname.startsWith("/dashboard/admin"))      return "admin";
  if (pathname.startsWith("/dashboard/government")) return "government";
  if (pathname.startsWith("/dashboard/ngo"))        return "ngo";
  return null;
}

// AI section items shown by default in lawyer sidebar; rest are "المزيد"
const AI_SECTION_DEFAULT_VISIBLE = 9;

// ─── Upgrade nudge badge ──────────────────────────────────────────────────────
/**
 * «🔒 <plan>» — a claim about the caller's subscription, so only ever render it
 * with a plan the caller has PROVEN is the one blocking this item.
 *
 * `useSubscription().requiredTier()` is not that proof on its own: it returns
 * the feature's minimum tier whenever `can()` said no, including when `can()`
 * said no because an admin switched the feature off for this entity. Its only
 * caller (SidebarLink) filters that case out before it gets here; anything new
 * that calls this must do the same.
 *
 * The `tier` it prints is the raw English key — `shield`, `pro`, `corp` — in an
 * otherwise Arabic RTL sidebar. The Arabic names for those exist, but only as a
 * local literal inside SubscriptionGuard.tsx; wiring them up means exporting
 * one labels map from useSubscription.ts and is reported rather than duplicated
 * here, because a second copy of that map is a second thing to drift.
 */
export function UpgradeBadge({ tier }: { tier: string }) {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 flex-shrink-0 flex items-center gap-1">
      <span>🔒</span>
      {tier}
    </span>
  );
}

// ─── Placeholder for the badge slot while the gate is still resolving ────────
/**
 * Holds the width of an UpgradeBadge without asserting a tier. Rendered for a
 * gated item whose subscription state has not settled yet — the alternative is
 * to print whatever `can()` says about a session that has not loaded, which is
 * a claim about the user's plan made before the plan is known.
 */
export function GateBadgeSkeleton() {
  const { isDark } = useTheme();
  return (
    <span
      aria-hidden="true"
      className={`h-[15px] w-9 rounded-full animate-pulse flex-shrink-0 ${
        isDark ? "bg-white/10" : "bg-slate-200"
      }`}
    />
  );
}

// ─── Single sidebar link ──────────────────────────────────────────────────────
export function SidebarLink({
  item, isActive, isAr, compact, gateReady, onLockedClick,
}: {
  item: SidebarItem;
  isActive: boolean;
  isAr: boolean;
  compact?: boolean;
  /**
   * False until everything `can()` reads has loaded — the session tier and the
   * stored per-entity feature flags. Before that a gated item must say nothing
   * about the user's plan: no lock, no dimming, no upgrade badge, no upgrade
   * modal. A skeleton stands in the badge slot until the answer is real.
   */
  gateReady: boolean;
  onLockedClick?: (feature: string) => void;
}) {
  const { isDark } = useTheme();
  const { can, requiredTier } = useSubscription();

  // Tier gating — if item has a gateKey, check subscription.
  // `gatePending` is the third state this used to collapse into "locked": the
  // gate has an answer, has no answer yet, or does not apply. Reading `can()`
  // before the session loads reports every gated item as locked, because an
  // unloaded session carries the guest tier — which is how a paying user got a
  // free-tier lock badge, a dead `#` link and an upgrade modal on click.
  const gateKey = item.gateKey ?? null;
  const gatePending = gateKey !== null && !gateReady;
  const isLocked = gateKey !== null && gateReady ? !can(gateKey) : false;

  // WHY «free» IS THROWN AWAY, AND WHY THE ITEM STAYS LOCKED ANYWAY.
  //
  // `requiredTier(key)` (useSubscription.ts:213) answers with
  // FEATURE_GATES[key] whenever `can(key)` said no — it never asks WHY it said
  // no. `can()` has two reasons: the tier line (`tierRank >= TIER_RANK[minTier]`)
  // and, before it, some forty admin feature-flag checks that block a feature
  // the entity's own settings switched off.
  //
  // `TIER_RANK.free === 0` and every user's `tierRank >= 0`, so the tier line
  // can NEVER fail for a `free`-gated feature. A `requiredTier()` answer of
  // "free" is therefore proof — not a guess — that this lock is an admin flag,
  // not a plan problem. Thirty-odd gate keys in FEATURE_GATES are "free"
  // (wallet, reviews, every firm-*, gov-*, ngo-* and micro-* key), so this was
  // most of the sidebar's locks: the user was shown «🔒 free» and, on click,
  // an upgrade modal reading «ترقية باقتك إلى المجانية» — upgrade your plan to
  // the free one. Gating this on `gateReady` made it worse rather than better,
  // because the badge now waits for real state and then states the nonsense as
  // settled fact.
  //
  // The lock itself is real and stays: the feature IS switched off, so the
  // dimming and the dead `#` href are correct. What is dropped is the claim
  // about the user's plan, which the app cannot prove — a null `lockTier`
  // renders no badge at all (see the render below), and `isLocked` is
  // untouched, so nothing is unlocked by this.
  const requiredForItem = gateKey !== null && gateReady ? requiredTier(gateKey) : null;
  const lockTier = requiredForItem === "free" ? null : requiredForItem;

  return (
    <>
      {item.divider && <div className={`my-1.5 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />}
      <Link
        href={isLocked || gatePending ? "#" : item.href}
        aria-disabled={gatePending || undefined}
        aria-busy={gatePending || undefined}
        onClick={(e) => {
          // While the gate is pending the item is inert: it is not known to be
          // locked (so no upgrade modal — that would be a claim about the plan)
          // and it is not known to be open either, so it must not let a gated
          // destination through on a guess.
          if (gatePending) {
            e.preventDefault();
            return;
          }
          if (isLocked) {
            e.preventDefault();
            // THE SAME CLAIM THE BADGE STOPPED MAKING, ON CLICK.
            //
            // `onLockedClick` opens UpgradeModal (SharedSidebar.tsx:153-155),
            // whose header is «ترقية الباقة» and whose body reads
            // `"<الميزة>" متاحة في باقة أعلى` (UpgradeModal.tsx:150-153). For a
            // lock that came from an admin feature flag rather than from the
            // plan, that sentence is false twice over: the feature is not in a
            // higher باقة, and no upgrade the user buys will unlock it — only
            // their own organisation's settings will. Suppressing the badge
            // while still opening this modal would have moved the lie one click
            // away rather than removed it.
            //
            // `lockTier` is non-null for every genuine tier lock, so the real
            // upgrade path is untouched. What is left for an admin-flag lock is
            // an item that is dimmed and inert and says nothing — honest, but
            // not yet helpful; the copy it deserves («هذه الميزة موقوفة من
            // إعدادات جهتك») has no component to live in and is reported
            // upstream rather than invented here.
            if (onLockedClick && lockTier) onLockedClick(isAr ? item.label : item.labelEn);
          }
        }}
        className={`
          group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all duration-150
          ${isActive && !isLocked
            ? isDark
              ? "bg-white/[0.07] text-white font-medium"
              : "bg-royal/8 text-royal font-medium"
            : isDark
              ? "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }
          ${isLocked ? "opacity-60" : ""}
        `}
      >
        {/* Active indicator */}
        {isActive && !isLocked && (
          <span className={`absolute right-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-l-full ${isDark ? "bg-[#C8A762]" : "bg-royal"}`} />
        )}

        {/* Icon */}
        <span className={`flex-shrink-0 transition-colors ${isActive && !isLocked ? "text-royal dark:text-[#C8A762]" : ""}`}>
          <SidebarIcon_ name={item.icon} />
        </span>

        {/* Label */}
        {!compact && (
          <span className="flex-1 truncate">{isAr ? item.label : item.labelEn}</span>
        )}

        {/* Gate still resolving — hold the slot, claim no tier */}
        {!compact && gatePending && !item.badge && <GateBadgeSkeleton />}

        {/* Tier gate badge — overrides regular badge.
            `lockTier` is null whenever the lock is not provably a plan problem
            (see its derivation above), and then NO badge is drawn: the item is
            still dimmed and still inert, it simply stops naming a plan the app
            cannot stand behind. Do not restore a fallback here — a badge that
            has to guess its own text is the defect this replaced. */}
        {!compact && isLocked && lockTier && (
          <UpgradeBadge tier={lockTier} />
        )}

        {/* Regular badge */}
        {!compact && !isLocked && item.badge && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30 flex-shrink-0">
            {item.badge}
          </span>
        )}
      </Link>
    </>
  );
}

// ─── Section group ─────────────────────────────────────────────────────────────
export function SidebarSection({
  group, pathname, isAr, groupIndex, hasClientGroup, gateReady, onLockedClick
}: {
  group: SidebarGroup;
  pathname: string;
  isAr: boolean;
  groupIndex: number;
  hasClientGroup: boolean;
  /** See SidebarLink — false until the subscription gate has real inputs. */
  gateReady: boolean;
  onLockedClick?: (feature: string) => void;
}) {
  const { isDark } = useTheme();
  const { can } = useSubscription();
  // Deliberately NOT gated on `gateReady`, unlike the per-item lock above.
  // An unresolved gate reads as locked here, which hides the whole group until
  // the session loads — the group then appears for a user who has it. Holding
  // it open instead would show a user a section they may not have and take it
  // away a moment later, which is the failure worth avoiding.
  const isGroupLocked = Boolean(group.gateKey && !can(group.gateKey));

  // FIX: include group title in key to prevent stale localStorage state
  const titleSlug = group.title ? group.title.replace(/\s+/g, "_") : `_${groupIndex}`;
  const storageKey = `nzamy_sidebar_open_${titleSlug}`;

  // Hydration Fix: SSR-safe default
  const [open, setOpen] = useState<boolean>(group.defaultOpen ?? true);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === "true");
  }, [storageKey]);

  // For AI section "show more" toggle
  const [showAll, setShowAll] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  // Determine which items to show in AI section
  const membershipVisibleItems = group.items.filter((item) => !item.requiresClientGroup || hasClientGroup);
  const isAiSection = group.title === "نظامي AI" || group.title === "AI";
  const visibleItems =
    isAiSection && !showAll
      ? membershipVisibleItems.slice(0, AI_SECTION_DEFAULT_VISIBLE)
      : membershipVisibleItems;

  const hasMore = isAiSection && membershipVisibleItems.length > AI_SECTION_DEFAULT_VISIBLE;

  if (isGroupLocked || visibleItems.length === 0) return null;

  return (
    <div className="mb-1">
      {/* Section header */}
      {group.title && (
        group.title === "سفير نظامي ⭐" ? (
          <button
            onClick={group.collapsible ? toggle : undefined}
            className={`
              relative w-full flex items-center justify-between px-4 py-2.5 mb-1.5 mt-2 rounded-xl overflow-hidden cursor-pointer
              ${isDark ? "bg-[#141414] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/5" : "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,1)]"}
            `}
          >
            {/* Animated Shimmer / Liquid glass effect */}
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 pointer-events-none"
            />
            <div className="flex items-center gap-2">
              <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ duration: 3, repeat: Infinity }} className="text-[13px]">⭐</motion.div>
              <span className={`text-[11px] font-black tracking-wide ${isDark ? "bg-clip-text text-transparent bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB]" : "text-amber-800"}`}>
                {isAr ? "سفير نظامي" : "Nzamy Ambassador"}
              </span>
            </div>
            {group.collapsible && (
              <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2, type: "spring", stiffness: 200 }} className={isDark ? "text-amber-500/50" : "text-amber-600/50"}>
                <CaretDown size={12} weight="bold" />
              </motion.span>
            )}
          </button>
        ) : (
          <button
            onClick={group.collapsible ? toggle : undefined}
            className={`
              w-full flex items-center justify-between px-3 py-1.5 mb-0.5
              text-[10px] font-bold uppercase tracking-wider
              ${isDark ? "text-zinc-600" : "text-slate-400"}
              ${group.collapsible ? "hover:text-royal dark:hover:text-zinc-400 cursor-pointer transition-colors" : "cursor-default"}
            `}
          >
            <span>{isAr ? group.title : (group.titleEn ?? group.title)}</span>
            {group.collapsible && (
              <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}>
                <CaretDown size={11} />
              </motion.span>
            )}
          </button>
        )
      )}

      {/* Items */}
      <AnimatePresence initial={false}>
        {(!group.collapsible || open) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const itemPath = item.href.split("?")[0];
                const exactMatch = pathname === itemPath;
                const ROOT_EXACT_PATHS = [
                  "/dashboard/business",
                  "/dashboard/client",
                  "/dashboard/lawyer",
                  "/dashboard/firm",
                  "/dashboard/provider",
                  "/dashboard/micro",
                  "/dashboard/admin",
                  "/dashboard/government",
                  "/dashboard/ngo",
                  "/ai",
                ];
                const requiresExactMatch = ROOT_EXACT_PATHS.includes(itemPath);
                const startsWithMatch = (
                  !requiresExactMatch &&
                  itemPath !== "/" &&
                  itemPath !== "#recent" &&
                  pathname.startsWith(itemPath + "/")
                ) || pathname === itemPath;

                const isActive = exactMatch || (!requiresExactMatch && !exactMatch && startsWithMatch);

                return (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    isActive={isActive}
                    isAr={isAr}
                    gateReady={gateReady}
                    onLockedClick={onLockedClick}
                  />
                );
              })}

              {/* Show more / less for AI section */}
              {hasMore && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className={`
                    w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors
                    ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}
                  `}
                >
                  <motion.span animate={{ rotate: showAll ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={12} />
                  </motion.span>
                  {showAll
                    ? (isAr ? "عرض أقل" : "Show less")
                    : (isAr ? `المزيد (${membershipVisibleItems.length - AI_SECTION_DEFAULT_VISIBLE})` : `More (${membershipVisibleItems.length - AI_SECTION_DEFAULT_VISIBLE})`)}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Credits bar ───────────────────────────────────────────────────────────────
export function CreditsBar({ credits, creditsMax, isAr }: { credits: number; creditsMax: number; isAr: boolean }) {
  const { isDark } = useTheme();
  const pct = creditsMax > 0 ? Math.min((credits / creditsMax) * 100, 100) : 0;
  const color = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className={`mx-3 mb-3 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
      <div className="flex items-center justify-between mb-1.5 text-[11px]">
        <span className={isDark ? "text-zinc-500" : "text-slate-400"}>
          {isAr ? "الاستخدام المتبقي" : "Usage"}
        </span>
        <span className={`font-mono font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          {credits} / {creditsMax}
        </span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
        />
      </div>
    </div>
  );
}

// ─── Dashboard display mode toggle (lawyer / firm) ───────────────────────────
export function DashboardModeToggle({
  isAr, mode, onModeChange
}: {
  isAr: boolean;
  mode: "light" | "full";
  onModeChange: (m: "light" | "full") => void;
}) {
  const { isDark } = useTheme();

  return (
    <div className="mx-3 mb-1">
      <div className={`flex rounded-xl overflow-hidden border text-xs font-semibold ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
        {(["light", "full"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`flex-1 py-2 transition-all ${
              mode === m
                ? isDark ? "bg-white/[0.08] text-white" : "bg-royal text-white"
                : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {m === "light"
              ? (isAr ? "لايت" : "Lite")
              : (isAr ? "كاملة" : "Full")}
          </button>
        ))}
      </div>
      {mode === "light" && (
        <p className={`text-[10px] text-center mt-1 mb-1 ${
          isDark ? "text-zinc-600" : "text-slate-400"
        }`}>
          {isAr
            ? "لايت يعرض أدوات الاستخدام اليومي فقط — كاملة تعرض كل القوائم المتاحة."
            : "Lite shows daily tools only — Full shows every available menu."}
        </p>
      )}
    </div>
  );
}
