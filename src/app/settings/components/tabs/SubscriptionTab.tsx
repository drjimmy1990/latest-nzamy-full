"use client";

import { CrownSimple, Receipt } from "@phosphor-icons/react";
import Link from "next/link";
import { EmptyPanel, SectionTitle } from "./_shared";
import { useUser } from "@/hooks/useUser";
import { useSubscription, TIER_LABELS_AR } from "@/hooks/useSubscription";

// ── Tab: Subscription ────────────────────────────────────────────────
// This tab used to build a whole billing history out of literals: a plan card
// per user type (name, price, «يتجدد ١ أغسطس ٢٠٢٦»), up to four usage meters,
// an auto-renew toggle that promised a charge on that date, and three invoices
// stamped «مدفوع». Nothing here was ever read from `subscriptions`, and no
// money has ever moved through this platform — an invoice marked paid for a
// payment nobody made is the most dangerous row a finance or bank reviewer can
// be shown, and it survived into production because the demo banner above it
// was compiled out of the production build.
//
// Nothing client-readable reports this account's plan today for MOST roles.
// Deliberately NOT used as a substitute for them: useUser().tier defaults to
// `meta.tier ?? "free"`, which cannot tell "no subscription granted" apart
// from "granted the free tier" — a corporate account under contract would be
// labelled «مجاني». Plans are granted by an administrator
// (src/lib/entitlements.ts), so absence stays the honest answer for those
// roles until a client endpoint exposes the real `subscriptions` row.
//
// The one exception is the "individual" account type (2026-09-04): the owner
// asked for this tab to show an individual's real plan, and `meta.tier` IS
// the same field every access gate in the app already stakes real feature
// access on (SidebarComponents' UpgradeBadge/SubscriptionGuard/useSubscription
// .can) — kept in sync with the `subscriptions` table by grantEntitlement()'s
// admin_grant write. Showing it here is not a new, unverifiable claim; it is
// the one claim this account is already living under everywhere else in the
// product. What is still NOT shown, for anyone: a renewal date, a price, or
// an invoice — `subscriptions.current_period_end` exists server-side but has
// no client-readable route, and inventing one is out of scope here.
export function SubscriptionTab() {
  const { userType } = useUser();

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>باقتك الحالية</SectionTitle>
        {userType === "individual" ? (
          <IndividualPlanPanel />
        ) : (
          <EmptyPanel
            icon={<CrownSimple size={28} />}
            title="لا تُعرض بيانات الاشتراك هنا"
            description="لا يقرأ هذا القسم أي سجل اشتراك، فلا يعرض باقة أو تاريخ تجديد أو حدود استخدام. لمعرفة باقتك أو تعديلها، تواصل مع إدارة المنصة."
          />
        )}
      </div>

      <div>
        <SectionTitle>الفواتير</SectionTitle>
        <EmptyPanel
          icon={<Receipt size={28} />}
          title="لا توجد فواتير"
          description="لا تُعرض أي فاتورة في هذا الحساب، ولا يوجد مصدر فواتير مرتبط بهذه الصفحة."
        />
      </div>
    </div>
  );
}

// ── Individual accounts only: real tier, sourced from useSubscription() ──
function IndividualPlanPanel() {
  const { loading } = useUser();
  const { tier } = useSubscription();

  // Still resolving the session — say nothing about the plan yet. Same rule
  // SidebarComponents.tsx's `gateReady` exists to enforce: `meta.tier` reads
  // as the guest/free tier before the session loads, so painting "no plan"
  // here first would flash a wrong answer for every paying individual before
  // flipping to the truth a moment later.
  if (loading) {
    return (
      <div
        aria-hidden="true"
        className="h-[92px] rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] bg-slate-100/60 dark:bg-white/[0.03] animate-pulse"
      />
    );
  }

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
          href="/pricing"
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
          href="/pricing"
          className="text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline"
        >
          الباقات المتاحة
        </Link>
      </div>
    </div>
  );
}
