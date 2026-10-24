"use client";

import { useState } from "react";
import { BookOpen, CrownSimple, Receipt } from "@phosphor-icons/react";
import Link from "next/link";
import { SectionTitle } from "./_shared";
import { useUser, type UserTier } from "@/hooks/useUser";
import { TIER_LABELS_AR } from "@/hooks/useSubscription";
import { PricingCards } from "@/components/pricing/PricingCards";
import { audiencesWithBillingToggle, getPlanList } from "@/constants/pricingData";
import type { AudienceTab, Billing } from "@/constants/pricingData";
import { audienceForUserType } from "@/lib/pricing/audienceForUserType";

// ── Tab: Subscription ────────────────────────────────────────────────
// This tab used to build a whole billing history out of literals: a plan card
// per user type (name, price, «يتجدد ١ أغسطس ٢٠٢٦»), up to four usage meters,
// an auto-renew toggle that promised a charge on that date, and three invoices
// stamped «مدفوع». Nothing here was ever read from `subscriptions` — an
// invoice marked paid for a payment nobody made is the most dangerous row a
// finance or bank reviewer can be shown.
//
// «باقتك الحالية» shows the account's tier for EVERY account type (owner,
// 2026-10-24). It used to do so for the "individual" type only (2026-09-04),
// because plans were then granted by an administrator alone and `meta.tier`
// defaults to "free". Since Moyasar B1 went live plans are also bought online,
// and the tier is the same field every access gate in the app already stakes
// real feature access on (SidebarComponents' UpgradeBadge/SubscriptionGuard/
// useSubscription().can — useSubscription's tier is `useUser().tier ?? "free"`),
// kept in sync with the `subscriptions` table by the entitlement writes.
// Showing it here is not a new claim; it is the one this account already lives
// under everywhere else in the product. The tier is read from the SAME
// useUser() call as `loading` (each useUser() call holds its own state), so the
// panel never paints «لا باقة فعّالة» from a session that has not resolved.
//
// What is still NOT shown, for anyone: a renewal date, a price paid, or an
// invoice — `subscriptions.current_period_end` exists server-side but has no
// client-readable route, and inventing one is out of scope here. Receipts live
// under «الفوترة والمدفوعات» (/dashboard/billing).
//
// «الباقات المتاحة لحسابك» lists the plans of the account's own family — the
// same map /pricing locks a member to (src/lib/pricing/audienceForUserType.ts)
// — through the same PricingCards, so a buy button behaves exactly as on
// /pricing: online checkout when the gateway allows it, otherwise the review
// request (owner ٢٤٦). A type with no family of its own (admin) gets a link to
// /pricing instead.
const PLANS_ANCHOR = "account-plans";

export function SubscriptionTab() {
  const { userType, loading, tier } = useUser();
  const audience = loading ? null : audienceForUserType(userType);

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>باقتك الحالية</SectionTitle>
        <CurrentPlanPanel
          loading={loading}
          tier={tier ?? "free"}
          plansHref={audience ? `#${PLANS_ANCHOR}` : "/pricing"}
        />
      </div>

      <div id={PLANS_ANCHOR} className="scroll-mt-24">
        <SectionTitle>الباقات المتاحة لحسابك</SectionTitle>
        {loading ? (
          <PanelSkeleton />
        ) : audience ? (
          <AccountPlans audience={audience} />
        ) : (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-5 py-3 text-sm font-bold text-[#0B3D2E] dark:border-white/10 dark:bg-[#161b22] dark:text-[#C8A762]"
          >
            <CrownSimple size={18} /> عرض جميع الباقات
          </Link>
        )}
      </div>

      <div>
        <SectionTitle>الفوترة والمدفوعات</SectionTitle>
        <Link href="/dashboard/billing" className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-sm font-bold text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]">
          <Receipt size={20} /> عرض المدفوعات والإيصالات والنقاط
        </Link>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[92px] rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] bg-slate-100/60 dark:bg-white/[0.03] animate-pulse"
    />
  );
}

// ── The plans of the account's own family, as on /pricing ──
function AccountPlans({ audience }: { audience: AudienceTab }) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [libraryModeState, setLibraryMode] = useState(false);

  const hasLibrary = audience === "lawyers" || audience === "firms";
  const libraryMode = hasLibrary && libraryModeState;
  // Same rule as /pricing (PricingHero): annual-only families get no toggle
  // and stay on "monthly", which is what /pricing hands their buy buttons.
  const showBillingToggle = audiencesWithBillingToggle.includes(audience);
  const effectiveBilling: Billing = showBillingToggle ? billing : "monthly";
  const planList = getPlanList(audience, true, { libraryMode });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {hasLibrary && (
          <PillGroup
            label="نوع الباقات"
            value={libraryMode ? "library" : "all"}
            onChange={(v) => setLibraryMode(v === "library")}
            options={[
              { id: "all", label: "كافة الخدمات" },
              { id: "library", label: "المكتبة القانونية", icon: <BookOpen size={15} weight={libraryMode ? "fill" : "regular"} /> },
            ]}
          />
        )}
        {showBillingToggle && (
          <PillGroup
            label="مدة الاشتراك"
            value={billing}
            onChange={(v) => setBilling(v === "yearly" ? "yearly" : "monthly")}
            options={[
              { id: "monthly", label: "شهري" },
              { id: "yearly", label: "سنوي" },
            ]}
          />
        )}
      </div>

      <div className="-mx-4 mt-6">
        <PricingCards
          planList={planList}
          billing={effectiveBilling}
          isAr
          audience={audience}
          libraryMode={libraryMode}
        />
      </div>
    </div>
  );
}

function PillGroup({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-2xl border border-slate-200/60 bg-white p-1.5 dark:border-white/10 dark:bg-[#161b22]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            value === o.id
              ? "bg-[#0B3D2E] text-white shadow-sm dark:bg-[#C8A762] dark:text-[#0B3D2E]"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-300"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Every account type: the real tier (useSubscription's field) ──
function CurrentPlanPanel({ loading, tier, plansHref }: { loading: boolean; tier: UserTier; plansHref: string }) {
  // Still resolving the session — say nothing about the plan yet. Same rule
  // SidebarComponents.tsx's `gateReady` exists to enforce: `meta.tier` reads
  // as the guest/free tier before the session loads, so painting "no plan"
  // here first would flash a wrong answer for every paying member before
  // flipping to the truth a moment later.
  if (loading) return <PanelSkeleton />;

  if (tier === "free") {
    return (
      <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] px-6 py-10 text-center shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
        <div className="mb-3 flex justify-center text-zinc-400 dark:text-zinc-500">
          <CrownSimple size={28} />
        </div>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">لا باقة فعّالة</p>
        <p className="mt-1.5 text-xs leading-6 text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
          لا يوجد اشتراك مدفوع مفعّل على حسابك حالياً.
        </p>
        <Link
          href={plansHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0f5a42] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:hover:opacity-90"
        >
          الباقات المتاحة
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] px-6 py-6 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
            <CrownSimple size={22} weight="fill" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{TIER_LABELS_AR[tier]}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">باقتك الحالية</p>
          </div>
        </div>
        <Link
          href={plansHref}
          className="text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline"
        >
          الباقات المتاحة
        </Link>
      </div>
    </div>
  );
}
